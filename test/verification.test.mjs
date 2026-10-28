import { decompose, relate } from '../test-support/domain-fixtures.mjs';
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createLabyrinth } from '../src/labyrinth.mjs';

const sha = 'a'.repeat(64);
const seed = { projectId: 'fixture-project', id: 'project', outcome: 'Native integration', acceptance: ['Native E2E'], boundary: { allow: ['adapter.integration'], deny: ['paperclip.lifecycle'] } };
function fixture({ mutateSource, mutateReview, provider, verifier } = {}) {
  const calls = { sources: [], reviews: [] };
  const sources = {
    artifact: { reference: 'artifact', kind: 'artifact', sourceUri: 'fixture://diff', sha256: sha, sourceRevision: 'revision-1', projectId: seed.projectId, goalId: 'feature', implementerId: 'worker', verified: true, passed: true },
    test: { reference: 'test', kind: 'test', sourceUri: 'fixture://test-run', sha256: 'b'.repeat(64), sourceRevision: 'revision-1', projectId: seed.projectId, goalId: 'feature', implementerId: 'worker', verified: true, passed: true },
    parentArtifact: { reference: 'parentArtifact', kind: 'artifact', sourceUri: 'fixture://integration-artifact', sha256: 'c'.repeat(64), sourceRevision: 'revision-1', projectId: seed.projectId, goalId: 'project', implementerId: 'integrator', verified: true, passed: true },
    parentTest: { reference: 'parentTest', kind: 'test', sourceUri: 'fixture://native-e2e', sha256: 'd'.repeat(64), sourceRevision: 'revision-1', projectId: seed.projectId, goalId: 'project', implementerId: 'integrator', verified: true, passed: true },
  };
  const evidenceProvider = provider ?? { resolve(reference, { contract }) {
    calls.sources.push(reference); const value = sources[reference];
    return value ? { contractId: contract.contractId, ...structuredClone(mutateSource ? mutateSource(value) : value) } : null;
  } };
  const independentVerifier = verifier ?? { review(input) {
    calls.reviews.push(structuredClone(input));
    const result = { reviewerId: 'qc', verdict: 'pass', reviewReceipt: 'fixture://independent-review',
      subject: { contractId: input.contract.contractId, goalVersion: input.contract.goalVersion, pins: input.contract.pins, sourceRevision: 'revision-1' },
      criterionResults: input.context.acceptance.map(criterion => ({ criterion, passed: true })), codeReviewed: true, boundaryReviewed: true, findings: [] };
    return mutateReview ? mutateReview(result, input) : result;
  } };
  const map = createLabyrinth(seed, { evidenceProvider, independentVerifier });
  decompose(map, { id: 'feature', parentId: 'project', outcome: 'Connect native issue', acceptance: ['Native issue readback'], boundary: { allow: ['adapter.integration'] } });
  return { map, calls, contract: () => map.issueContract('feature'), verify(contract = map.issueContract('feature'), evidenceRefs = ['artifact', 'test']) { return map.verifyGoal({ contract, evidenceRefs }); } };
}

test('sourced evidence and independent review complete only the verified goal', () => {
  const f = fixture(); const result = f.verify();
  assert.equal(result.verdict, 'pass');
  assert.equal(result.goalState, 'completed');
  assert.deepEqual(f.calls.sources, ['artifact', 'test']);
  assert.deepEqual(f.calls.reviews[0].context.acceptance, ['Native issue readback']);
  assert.equal(f.map.navigate('feature').goal.status, 'completed');
  assert.equal(f.map.navigate('project').goal.status, 'pending');
  assert.equal(f.map.proofs('feature').length, 1);
  assert.equal(f.map.proofs('feature')[0].sources[0].sourceUri, 'fixture://diff');
});

test('no configured provider and verifier means no completion; no public completeGoal escape hatch', () => {
  const map = createLabyrinth(seed);
  const contract = map.issueContract('project');
  assert.throws(() => map.verifyGoal({ contract, evidenceRefs: ['artifact', 'test'] }), /trusted evidence provider and independent verifier required/);
  assert.equal(typeof map.completeGoal, 'undefined');
  assert.equal(map.navigate('project').goal.status, 'pending');
});

test('unknown and forged inline evidence never bypass provider lookup', () => {
  const f = fixture();
  assert.throws(() => f.verify(f.contract(), ['artifact', 'not-found']), /unverifiable evidence/);
  assert.throws(() => f.verify(f.contract(), [{ reference: 'artifact', verified: true }, 'test']), /evidence reference/);
  assert.equal(f.calls.reviews.length, 0);
});

test('unverified, failed and wrong-origin evidence is rejected before review', () => {
  for (const [label, mutate] of [
    ['failed test', x => x.kind === 'test' ? { ...x, passed: false } : x],
    ['unverified', x => x.kind === 'test' ? { ...x, verified: false } : x],
    ['wrong goal', x => x.kind === 'test' ? { ...x, goalId: 'other' } : x],
    ['wrong project', x => x.kind === 'test' ? { ...x, projectId: 'other' } : x],
    ['mismatched revision', x => x.kind === 'test' ? { ...x, sourceRevision: 'revision-2' } : x],
    ['bad digest', x => x.kind === 'test' ? { ...x, sha256: 'invented' } : x],
    ['missing source', x => x.kind === 'test' ? { ...x, sourceUri: '' } : x],
    ['wrong contract', x => x.kind === 'test' ? { ...x, contractId: 'wrong' } : x],
  ]) {
    const f = fixture({ mutateSource: mutate });
    assert.throws(() => f.verify(), /evidence/, label);
    assert.equal(f.map.navigate('feature').goal.status, 'pending', label);
    assert.equal(f.calls.reviews.length, 0, label);
  }
});

test('missing artifact or test and duplicate evidence references do not reach verifier', () => {
  const f = fixture();
  for (const refs of [['artifact'], ['test'], ['artifact', 'artifact'], []]) assert.throws(() => f.verify(f.contract(), refs), /evidence/);
  assert.equal(f.calls.reviews.length, 0);
});

test('caller-created or altered work contracts cannot be substituted for issued snapshots', () => {
  const f = fixture(); const minted = f.contract();
  assert.throws(() => f.verify({ ...minted, goalVersion: minted.goalVersion + 1 }), /issued contract/);
  assert.throws(() => f.verify({ ...minted, contractId: 'invented' }), /issued contract/);
  assert.equal(f.calls.reviews.length, 0);
});

test('self-review, weak verdict, wrong version, or incomplete criterion review fail closed', () => {
  for (const [label, mutate] of [
    ['self-review', r => ({ ...r, reviewerId: 'worker' })],
    ['no receipt', r => ({ ...r, reviewReceipt: '' })],
    ['no code review', r => ({ ...r, codeReviewed: false })],
    ['no boundary review', r => ({ ...r, boundaryReviewed: false })],
    ['wrong revision', r => ({ ...r, subject: { ...r.subject, sourceRevision: 'other' } })],
    ['wrong pins', r => ({ ...r, subject: { ...r.subject, pins: [] } })],
    ['missing criterion', r => ({ ...r, criterionResults: [] })],
    ['wrong criterion', r => ({ ...r, criterionResults: [{ criterion: 'Mock pass', passed: true }] })],
  ]) {
    const f = fixture({ mutateReview: mutate });
    assert.throws(() => f.verify(), /independent/, label);
    assert.equal(f.map.navigate('feature').goal.status, 'pending', label);
  }
});

test('semantic FAIL blocks completion even when all source tests pass', () => {
  const f = fixture({ mutateReview: r => ({ ...r, verdict: 'fail', findings: ['Parallel Paperclip lifecycle detected'] }) });
  assert.equal(f.verify().verdict, 'fail');
  assert.equal(f.map.navigate('feature').goal.status, 'pending');
  assert.equal(f.map.proofs('feature').length, 0);
});

test('stale revision and unknown relationship block proof acceptance', () => {
  const f = fixture(); const contract = f.contract();
  f.map.reviseGoal({ id: 'feature', expectedVersion: 1, actor: 'worker', change: { outcome: 'Updated scope' }, decision: { door: 'two-way', blastRadius: 'local', evidenceConfidence: 'high' } });
  assert.throws(() => f.verify(contract), /stale/);
  const unknown = fixture();
  decompose(unknown.map, { id: 'external', parentId: 'project', outcome: 'Unknown dependency', acceptance: ['Proved'], boundary: { allow: ['adapter.integration'] } });
  relate(unknown.map, { fromId: 'feature', toId: 'external', type: 'unknown' });
  assert.throws(() => unknown.verify(), /unresolved/);
});

test('later relevant revision reclassifies accepted proof as needs-reverification, preserving history', () => {
  const f = fixture(); f.verify();
  f.map.reviseGoal({ id: 'feature', expectedVersion: 1, actor: 'worker', change: { outcome: 'New behavior' }, decision: { door: 'two-way', blastRadius: 'local', evidenceConfidence: 'high' } });
  assert.equal(f.map.navigate('feature').goal.status, 'needs-reverification');
  assert.equal(f.map.proofs('feature').length, 1);
});

test('unrelated sibling revision does not invalidate accepted feature proof', () => {
  const f = fixture(); f.verify();
  decompose(f.map, { id: 'sibling', parentId: 'project', outcome: 'Sibling', acceptance: ['Sibling done'], boundary: { allow: ['adapter.integration'] } });
  f.map.reviseGoal({ id: 'sibling', expectedVersion: 1, actor: 'worker', change: { outcome: 'Sibling v2' }, decision: { door: 'two-way', blastRadius: 'local', evidenceConfidence: 'high' } });
  assert.equal(f.map.navigate('feature').goal.status, 'completed');
  assert.equal(f.map.navigate('project').goal.status, 'pending');
});

test('parent cannot complete before children nor reuse child evidence in place of its own proof', () => {
  const f = fixture(); const parent = f.map.issueContract('project');
  assert.throws(() => f.map.verifyGoal({ contract: parent, evidenceRefs: ['artifact', 'test'] }), /child.*not completed/);
  f.verify();
  assert.equal(f.map.navigate('project').goal.status, 'pending');
  assert.throws(() => f.map.verifyGoal({ contract: parent, evidenceRefs: ['artifact', 'test'] }), /stale|evidence/);
});

test('duplicate verification cannot replay an existing completion', () => {
  const f = fixture(); const contract = f.contract(); f.verify(contract);
  assert.throws(() => f.verify(contract), /already completed/);
  assert.equal(f.map.proofs('feature').length, 1);
});

test('parent separately passes native integration acceptance, and later composition change stales only parent proof', () => {
  const f = fixture(); f.verify();
  assert.equal(f.map.navigate('project').goal.status, 'pending');
  const parent = f.map.issueContract('project');
  const result = f.map.verifyGoal({ contract: parent, evidenceRefs: ['parentArtifact', 'parentTest'] });
  assert.equal(result.verdict, 'pass');
  assert.equal(f.calls.reviews.at(-1).context.acceptance[0], 'Native E2E');
  assert.equal(f.map.navigate('project').goal.status, 'completed');
  decompose(f.map, { id: 'new-child', parentId: 'project', outcome: 'New integration', acceptance: ['Verify new integration'] });
  assert.equal(f.map.navigate('feature').goal.status, 'completed');
  assert.equal(f.map.navigate('project').goal.status, 'needs-reverification');
  assert.equal(f.map.proofs('project').length, 1);
});

test('changing the goal during independent review prevents an old-version completion', () => {
  let map;
  const f = fixture({ mutateReview(r) {
    map.reviseGoal({ id: 'feature', expectedVersion: 1, actor: 'other-worker', change: { outcome: 'New target during review' }, decision: { door: 'two-way', blastRadius: 'local', evidenceConfidence: 'high' } });
    return r;
  } });
  map = f.map;
  assert.throws(() => f.verify(), /stale during review/);
  assert.equal(f.map.proofs('feature').length, 0);
  assert.equal(f.map.navigate('feature').goal.status, 'pending');
});

test('accepted receipts are defensive copies and cannot be altered by consumers', () => {
  const f = fixture(); const accepted = f.verify();
  accepted.receipt.sources[0].sourceUri = 'fixture://altered';
  const readback = f.map.proofs('feature');
  assert.equal(readback[0].sources[0].sourceUri, 'fixture://diff');
  readback[0].verdict = 'fail';
  assert.equal(f.map.proofs('feature')[0].verdict, 'pass');
});
