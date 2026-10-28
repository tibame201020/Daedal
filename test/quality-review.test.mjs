import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLabyrinth } from '../src/labyrinth.mjs';
import { createRiskAdaptiveQualityPolicy, evaluateQualityEvidence } from '../src/quality-review.mjs';
import { decompose } from '../test-support/domain-fixtures.mjs';

const seed = { projectId: 'integration', id: 'root', outcome: 'Do not duplicate native ownership',
  acceptance: ['Native E2E'], boundary: { allow: ['provider'], deny: ['native.lifecycle'] } };
const profiles = {
  low: { id: 'local', version: '1', checks: [
    { id: 'unit', mode: 'required' }, { id: 'spec', mode: 'required' }, { id: 'crap', mode: 'advisory' }] },
  medium: { id: 'module', version: '1', checks: [
    { id: 'unit', mode: 'required' }, { id: 'spec', mode: 'required' }, { id: 'mutation', mode: 'required' }] },
  high: { id: 'irreversible', version: '2', checks: [
    { id: 'unit', mode: 'required' }, { id: 'spec', mode: 'required' },
    { id: 'mutation', mode: 'required' }, { id: 'interrogate', mode: 'required' }] },
};
const risk = { door: 'two-way', blastRadius: 'local', evidenceConfidence: 'high' };
const policy = overrides => createRiskAdaptiveQualityPolicy({
  assessRisk: () => risk, profiles: overrides ?? profiles,
});
function fixture({ selectedPolicy = policy(), reports = {}, useQualityProvider = true, mutateReview } = {}) {
  const observations = [];
  const source = {
    resolve(reference, { contract }) {
      if (!['artifact', 'test'].includes(reference)) return null;
      return { reference, kind: reference, sourceUri: 'fixture://' + reference, sha256: 'a'.repeat(64),
        sourceRevision: 'commit-123', implementerId: 'builder', projectId: contract.projectId,
        goalId: contract.goalId, contractId: contract.contractId, verified: true, passed: true };
    },
  };
  const quality = {
    resolve(checkId, { contract, sourceRevision, profile }) {
      observations.push(checkId);
      const entry = Object.hasOwn(reports, checkId) ? reports[checkId] : { status: 'pass' };
      if (entry === null) return null;
      return { checkId, projectId: contract.projectId, goalId: contract.goalId,
        contractId: contract.contractId, sourceRevision, profileId: profile.id, profileVersion: profile.version,
        verified: true, status: 'pass', tool: 'fixture-tool', toolVersion: '1',
        reportUri: 'fixture://quality/' + checkId, reportSha256: 'b'.repeat(64), ...entry };
    },
  };
  const independentVerifier = {
    review({ context, subject }) {
      const result = { reviewerId: 'reviewer', reviewReceipt: 'fixture://code-review', subject,
        codeReviewed: true, boundaryReviewed: true, verdict: 'pass',
        criterionResults: context.acceptance.map(criterion => ({ criterion, passed: true })) };
      return mutateReview ? mutateReview(result) : result;
    },
  };
  const map = createLabyrinth(seed, { evidenceProvider: source, independentVerifier,
    qualityPolicy: selectedPolicy, ...(useQualityProvider ? { qualityEvidenceProvider: quality } : {}) });
  decompose(map, { id: 'feature', parentId: 'root', outcome: 'Adapter', acceptance: ['Native readback'] });
  const contract = map.issueContract('feature');
  return { map, contract, quality, observations,
    verify: () => map.verifyGoal({ contract, evidenceRefs: ['artifact', 'test'] }) };
}
test('host policy selects risk-adaptive checks without hardcoded numerical thresholds', () => {
  const choose = r => createRiskAdaptiveQualityPolicy({ assessRisk: () => r, profiles }).select({});
  assert.equal(choose(risk).id, 'local');
  assert.equal(choose({ ...risk, blastRadius: 'project' }).id, 'module');
  assert.equal(choose({ ...risk, door: 'one-way', blastRadius: 'project' }).id, 'irreversible');
  assert.equal(choose({ ...risk, evidenceConfidence: 'unknown' }).id, 'irreversible');
  assert.deepEqual(choose(risk).checks.map(x => x.id), ['unit', 'spec', 'crap']);
});
test('quality is bound to issued Work Contract and receipts persist with independent verdict', () => {
  const f = fixture();
  assert.equal(f.contract.qualityProfile.id, 'local');
  assert.deepEqual(f.contract.qualityProfile.risk, risk);
  const outcome = f.verify();
  assert.equal(outcome.verdict, 'pass');
  assert.equal(outcome.quality.status, 'pass');
  assert.equal(f.map.navigate('feature').goal.status, 'completed');
  assert.equal(f.map.proofs('feature')[0].quality.profileId, 'local');
  assert.equal(f.map.proofs('feature')[0].quality.sourceRevision, 'commit-123');
  assert.equal(f.map.proofs('feature')[0].quality.receipts.length, 3);
});
test('missing or untrusted required evidence remains UNKNOWN, not PASS or FAIL', () => {
  for (const report of [null, { verified: false }, { sourceRevision: 'wrong' },
    { contractId: 'forged' }, { reportSha256: 'bad' }, { profileVersion: 'stale' }]) {
    const f = fixture({ reports: { spec: report } });
    const response = f.verify();
    assert.equal(response.verdict, 'unknown');
    assert.equal(response.quality.status, 'unknown');
    assert.equal(f.map.navigate('feature').goal.status, 'pending');
    assert.equal(f.map.proofs('feature').length, 0);
  }
  const missingHost = fixture({ useQualityProvider: false });
  assert.equal(missingHost.map.contractStatus(missingHost.contract).status, 'unresolved');
  assert.throws(() => missingHost.verify(), /unresolved/);
});
test('verified failing CRAP, mutation or spec assessment BLOCKS, including with green tests', () => {
  for (const id of ['spec', 'mutation', 'interrogate']) {
    const config = id === 'spec' ? profiles : { ...profiles, low: { id: 'hardened', version: '3', checks: [
      { id: 'unit', mode: 'required' }, { id, mode: 'required' }] } };
    const f = fixture({ selectedPolicy: policy(config), reports: { [id]: { status: 'fail' } } });
    const result = f.verify();
    assert.equal(result.quality.status, 'block');
    assert.equal(result.verdict, 'block');
    assert.equal(f.map.navigate('feature').goal.status, 'pending');
  }
});
test('advisory mutation/CRAP reports are preserved but cannot independently block Goal completion', () => {
  const f = fixture({ reports: { crap: { status: 'fail' } } });
  const outcome = f.verify();
  assert.equal(outcome.verdict, 'pass');
  assert.equal(outcome.quality.warnings.length, 1);
  assert.equal(outcome.quality.warnings[0], 'crap');
});
test('policy revision makes old contract stale, and missing policy after restore is unresolved', () => {
  let current = policy();
  const delegated = { select: input => current.select(input) };
  const f = fixture({ selectedPolicy: delegated });
  current = policy({ ...profiles, low: { ...profiles.low, version: '2' } });
  assert.equal(f.map.contractStatus(f.contract).status, 'stale');
  const snapshot = f.map.exportSnapshot();
  const restored = createLabyrinth(seed, { initialSnapshot: snapshot });
  assert.equal(restored.contractStatus(f.contract).status, 'unresolved');
});
test('quality result rechecked after independent review, so changed report cannot yield PASS', () => {
  const entries = { spec: { status: 'pass' } };
  const f = fixture({ reports: entries, mutateReview: r => { entries.spec = { status: 'fail' }; return r; } });
  assert.throws(() => f.verify(), /quality.*changed|quality.*stale/);
  assert.equal(f.map.proofs('feature').length, 0);
});
test('direct quality evaluator refuses a forged report despite matching tool-defined PASS', () => {
  const contract = { projectId: 'p', goalId: 'g', contractId: 'issued' };
  const profile = { id: 'p', version: '1', checks: [{ id: 'unit', mode: 'required' }] };
  const result = evaluateQualityEvidence({ profile, contract, sourceRevision: 'abc',
    provider: { resolve() { return { checkId: 'unit', status: 'pass', verified: true, reportUri: 'x',
      reportSha256: 'a'.repeat(64), sourceRevision: 'bad' }; } } });
  assert.equal(result.status, 'unknown');
});

test('a completed Goal becomes needs-reverification when its active risk policy changes', () => {
  let active = policy();
  const delegated = { select: input => active.select(input) };
  const f = fixture({ selectedPolicy: delegated });
  assert.equal(f.verify().verdict, 'pass');
  assert.equal(f.map.navigate('feature').goal.status, 'completed');
  active = policy({ ...profiles, low: { ...profiles.low, version: '3' } });
  assert.equal(f.map.navigate('feature').goal.status, 'needs-reverification');
  assert.equal(f.map.proofs('feature').length, 1);
});
test('a provider exception cannot be promoted into a required PASS', () => {
  const profile = { id: 'strict', version: '1', checks: [{ id: 'spec', mode: 'required' }] };
  const contract = { projectId: 'p', goalId: 'g', contractId: 'issued' };
  const output = evaluateQualityEvidence({ profile, contract, sourceRevision: 'abc',
    provider: { resolve() { throw new Error('downstream offline'); } } });
  assert.equal(output.status, 'unknown');
});

test('even all required quality PASS cannot override independent semantic or boundary FAIL', () => {
  const f = fixture({ mutateReview: review => ({
    ...review, verdict:'fail', findings:['Adapter duplicated native Issue responsibility'],
    criterionResults: review.criterionResults.map(x => ({ ...x, passed: false }))
  }) });
  const result = f.verify();
  assert.equal(result.quality.status, 'pass');
  assert.equal(result.verdict, 'fail');
  assert.equal(f.map.navigate('feature').goal.status, 'pending');
  assert.equal(f.map.proofs('feature').length, 0);
});
