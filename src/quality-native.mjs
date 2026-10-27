import { createHash } from 'node:crypto';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const validDigest = s => typeof s === 'string' && /^[0-9a-f]{64}$/i.test(s);
const validSha = s => typeof s === 'string' && (/^[0-9a-f]{40}$/i.test(s) || /^[0-9a-f]{64}$/i.test(s));
const UNKNOWN = reason => ({ status: 'unknown', reason });
function numericThreshold(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}
export function summarizeCrapkit(doc, { maxOverTarget } = {}) {
  const ceiling = numericThreshold(maxOverTarget);
  if (doc?.schema !== 1 || doc.kind !== 'coverage' ||
      !Number.isInteger(doc.functions) || doc.functions < 1 ||
      !Number.isInteger(doc.over_target) || doc.over_target < 0 ||
      !Number.isInteger(doc.measured) || doc.measured < 1 ||
      (doc.lane_failures && Object.keys(doc.lane_failures).length) ||
      (doc.unmeasured_scopes?.length ?? 0) > 0 || !validSha(doc.commit))
    return UNKNOWN('crapkit measurement incomplete or invalid');
  const metrics = { functions: doc.functions, measured: doc.measured, overTarget: doc.over_target,
    grade: doc.grade, crapLoad: doc.crap_load, sourceCommit: doc.commit };
  if (ceiling === null) return { ...UNKNOWN('crapkit limit not configured'), metrics };
  return { status: doc.over_target <= ceiling ? 'pass' : 'fail', metrics };
}
export function summarizeStryker(doc, { minMutationScore } = {}) {
  const floor = numericThreshold(minMutationScore);
  if (!doc || !String(doc.schemaVersion ?? '').startsWith('1.') || doc.framework?.name !== 'StrykerJS' ||
      typeof doc.files !== 'object' || !doc.files || !Object.keys(doc.files).length) return UNKNOWN('invalid Stryker report');
  const counts = { killed: 0, timedOut: 0, survived: 0, noCoverage: 0, ignored: 0 };
  for (const file of Object.values(doc.files)) {
    if (!Array.isArray(file?.mutants)) return UNKNOWN('invalid Stryker mutant list');
    for (const mutant of file.mutants) {
      const names = { Killed: 'killed', Timeout: 'timedOut', TimedOut: 'timedOut',
        Survived: 'survived', NoCoverage: 'noCoverage', Ignored: 'ignored' };
      const key = names[mutant?.status];
      if (!key) return UNKNOWN('unknown or incomplete mutant status');
      counts[key]++;
    }
  }
  const total = counts.killed + counts.timedOut + counts.survived + counts.noCoverage;
  if (!total || floor === null || floor > 100) return { ...UNKNOWN('missing mutation denominator or threshold'), counts };
  const score = Number((100 * (counts.killed + counts.timedOut) / total).toFixed(2));
  return { status: score >= floor ? 'pass' : 'fail', metrics: { ...counts, total, mutationScore: score } };
}
/** GitHub review records must be fetched from an authenticated host, not a PR-authored JSON file. */
export function summarizeGitHubReviews(reviews, { sourceRevision, implementerId } = {}) {
  if (!Array.isArray(reviews) || !validSha(sourceRevision) || !implementerId)
    return UNKNOWN('authenticated review scope missing');
  const applicable = reviews.filter(r => r.commitId === sourceRevision &&
    typeof r.reviewerId === 'string' && r.reviewerId !== implementerId);
  const latest = new Map();
  for (const r of applicable) {
    if (!['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'].includes(r.state)) continue;
    const previous = latest.get(r.reviewerId);
    if (!previous) { latest.set(r.reviewerId, r); continue; }
    const time = value => Date.parse(value?.submittedAt ?? value?.submitted_at ?? '');
    const a = time(previous), b = time(r);
    const ida = previous.id, idb = r.id;
    if (!Number.isFinite(a) || !Number.isFinite(b)) return UNKNOWN('ambiguous reviewer chronology');
    if (a === b && (!Number.isSafeInteger(ida) || !Number.isSafeInteger(idb) || ida === idb))
      return UNKNOWN('ambiguous reviewer chronology');
    if (b > a || (a === b && idb > ida)) latest.set(r.reviewerId, r);
  }
  const states = [...latest.values()];
  if (states.some(r => r.state === 'CHANGES_REQUESTED'))
    return { status: 'fail', metrics: { reviewCount: applicable.length } };
  if (!states.some(r => r.state === 'APPROVED'))
    return UNKNOWN('no independent approval pinned to current commit');
  return { status: 'pass', metrics: { reviewCount: applicable.length } };
}
/** The pstack methodology asks for separately sourced reviewers; absent a real reviewer, always UNKNOWN. */
export function summarizeInterrogate(doc, { sourceRevision, implementerId } = {}) {
  if (!validSha(sourceRevision) || doc?.sourceRevision !== sourceRevision ||
      !Array.isArray(doc.reviews) || doc.reviews.length < 2) return UNKNOWN('independent interrogate evidence missing');
  const unique = new Set(), models = new Set();
  for (const review of doc.reviews) {
    if (!review || !review.reviewerId || review.reviewerId === implementerId || !review.model ||
        !validDigest(review.reportSha256) || !review.reportUri ||
        !['pass', 'fail'].includes(review.verdict) || unique.has(review.reviewerId)) return UNKNOWN('reviewer provenance incomplete');
    unique.add(review.reviewerId); models.add(review.model);
  }
  if (models.size < 2) return UNKNOWN('multi-model diversity unverified');
  return { status: doc.reviews.some(r => r.verdict === 'fail') ? 'fail' : 'pass',
    metrics: { reviewers: unique.size, models: models.size } };
}
const SUPPORTED = Object.freeze({ crap: summarizeCrapkit, mutation: summarizeStryker,
  pr: summarizeGitHubReviews, interrogate: summarizeInterrogate });
/** Host ports must verify the run at origin. No document-supplied verified flag is trusted. */
export function createNativeQualityReportProvider({ retrieve, verifyOrigin, limits }) {
  if (typeof retrieve !== 'function' || typeof verifyOrigin !== 'function' || !limits)
    throw new Error('trusted native report retrieval and origin verification required');
  return Object.freeze({
    resolve(checkId, { contract, profile, sourceRevision }) {
      if (!SUPPORTED[checkId] || !profile.checks.some(c => c.id === checkId)) return null;
      try {
        const raw = retrieve(checkId, { contract, sourceRevision });
        if (!raw || typeof raw.bytes !== 'string' || !raw.reportUri || !raw.runId ||
            !raw.tool || !raw.toolVersion) return null;
        const origin = verifyOrigin({ runId: raw.runId, reportSha256: hash(raw.bytes),
          reportUri: raw.reportUri, sourceRevision, projectId: contract.projectId });
        if (origin?.trusted !== true || origin.commitSha !== sourceRevision ||
            origin.reportSha256 !== hash(raw.bytes)) return null;
        const json = JSON.parse(raw.bytes);
        if (checkId === 'crap' && json.commit !== sourceRevision) return null;
        let assessed;
        if (checkId === 'pr') assessed = summarizeGitHubReviews(json, { sourceRevision,
          implementerId: origin.implementerId });
        else if (checkId === 'interrogate') assessed = summarizeInterrogate(json, {
          sourceRevision, implementerId: origin.implementerId });
        else assessed = SUPPORTED[checkId](json, limits[checkId] ?? {});
        return { checkId, projectId: contract.projectId, goalId: contract.goalId,
          contractId: contract.contractId, profileId: profile.id, profileVersion: profile.version,
          sourceRevision, tool: raw.tool, toolVersion: raw.toolVersion,
          reportUri: raw.reportUri, reportSha256: hash(raw.bytes),
          verified: true, status: assessed.status,
          metrics: assessed.metrics ?? null, reason: assessed.reason ?? null };
      } catch { return null; }
    },
  });
}
