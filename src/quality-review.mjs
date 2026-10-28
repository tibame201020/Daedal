import { isDeepStrictEqual } from 'node:util';

const clone = value => structuredClone(value);
const isText = value => typeof value === 'string' && value.trim().length > 0;
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
function tierFor(risk) {
  if (!risk || !['two-way', 'one-way'].includes(risk.door) ||
      !['local', 'project'].includes(risk.blastRadius) ||
      !['high', 'low', 'unknown'].includes(risk.evidenceConfidence)) throw new Error('invalid quality decision risk');
  if (risk.evidenceConfidence === 'unknown' || (risk.door === 'one-way' && risk.blastRadius === 'project')) return 'high';
  if (risk.door === 'two-way' && risk.blastRadius === 'local' && risk.evidenceConfidence === 'high') return 'low';
  return 'medium';
}
export function validateQualityProfile(profile) {
  if (!profile || !isText(profile.id) || !isText(profile.version) ||
      !Array.isArray(profile.checks) || profile.checks.length < 1 ||
      !profile.checks.every(c => c && isText(c.id) && ['required', 'advisory'].includes(c.mode)) ||
      new Set(profile.checks.map(c => c.id)).size !== profile.checks.length ||
      !profile.checks.some(c => c.mode === 'required')) throw new Error('invalid quality review profile');
  return clone(profile);
}
/** Host chooses actual methods and thresholds. Daedal only selects the risk level and verifies required evidence. */
export function createRiskAdaptiveQualityPolicy({ assessRisk, profiles }) {
  if (typeof assessRisk !== 'function' || !profiles ||
      !['low', 'medium', 'high'].every(t => profiles[t] && validateQualityProfile(profiles[t]))) {
    throw new Error('risk assessor and all three review profiles required');
  }
  const catalogue = clone(profiles);
  return Object.freeze({
    select(input) {
      const risk = clone(assessRisk(clone(input)));
      const tier = tierFor(risk);
      const profile = validateQualityProfile(catalogue[tier]);
      return { ...profile, tier, risk };
    },
  });
}
function readCheck(check, { contract, profile, sourceRevision, provider }) {
  let report;
  try {
    report = provider?.resolve(check.id, clone({ contract, profile, sourceRevision }));
  } catch { return { checkId: check.id, status: 'unknown', mode: check.mode }; }
  const valid = report && report.checkId === check.id && report.verified === true &&
    ['pass', 'fail', 'unknown'].includes(report.status) &&
    report.projectId === contract.projectId && report.goalId === contract.goalId &&
    report.contractId === contract.contractId && report.profileId === profile.id &&
    report.profileVersion === profile.version && report.sourceRevision === sourceRevision &&
    isText(report.tool) && isText(report.toolVersion) && isText(report.reportUri) && digest(report.reportSha256);
  if (!valid) return { checkId: check.id, status: 'unknown', mode: check.mode };
  return { checkId: check.id, status: report.status, mode: check.mode,
    tool: report.tool, toolVersion: report.toolVersion,
    reportUri: report.reportUri, reportSha256: report.reportSha256 };
}
/** Provider is a trusted host-owned report resolver, not caller-supplied evidence. */
export function evaluateQualityEvidence({ profile, contract, sourceRevision, provider }) {
  validateQualityProfile(profile);
  if (!contract || !isText(contract.contractId) || !isText(sourceRevision)) throw new Error('quality evidence requires pinned source and contract');
  const receipts = profile.checks.map(check => readCheck(check, { contract, profile, sourceRevision, provider }));
  const required = receipts.filter(c => c.mode === 'required');
  const status = required.some(c => c.status === 'fail') ? 'block' :
    required.some(c => c.status !== 'pass') ? 'unknown' : 'pass';
  return { status, profileId: profile.id, profileVersion: profile.version,
    sourceRevision, receipts, warnings: receipts.filter(c => c.mode === 'advisory' && c.status !== 'pass').map(c => c.checkId) };
}
/** Version comparison is exact: a new rule set needs a new Work Contract and new proof. */
export function selectQualityProfile(policy, input) {
  if (!policy) return null;
  if (typeof policy.select !== 'function') throw new Error('trusted quality policy required');
  return validateQualityProfile(policy.select(clone(input)));
}
export function sameQualityProfile(left, right) {
  return isDeepStrictEqual(left, right);
}
