import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createLabyrinth } from '../src/labyrinth.mjs';

const seed = (decisionGate) => createLabyrinth({
  projectId: 'integration', id: 'project', outcome: 'Integrate the native issue workflow',
  acceptance: ['Native E2E succeeds'],
  boundary: { allow: ['adapter.integration', 'provider.implementation'], deny: ['paperclip.issue.lifecycle', 'harness.core'] }
}, { decisionGate });
const add = (map, id, parentId = 'project', boundary) => map.decompose({
  id, parentId, outcome: `Deliver ${id}`, acceptance: [`Verify ${id}`], ...(boundary ? { boundary } : {})
});

test('goal is a point in a parent and a surface with descendants; single parent and no duplicates', () => {
  const map = seed(); add(map, 'adapter'); add(map, 'read', 'adapter');
  assert.deepEqual(map.navigate('adapter').children, ['read']);
  assert.deepEqual(map.navigate('read').ancestors.map(a => a.id), ['project', 'adapter']);
  assert.throws(() => add(map, 'read'), /duplicate/);
  assert.throws(() => add(map, 'orphan', 'missing'), /unknown parent/);
});

test('mandatory ancestor boundaries survive empty retrieval and child can only narrow capabilities', () => {
  const map = seed(); add(map, 'adapter', 'project', { allow: ['adapter.integration'], deny: ['provider.implementation'] });
  const context = map.navigate('adapter', { retrieved: [] });
  assert.deepEqual(context.boundary.allow, ['adapter.integration']);
  assert.deepEqual(context.boundary.deny, ['harness.core', 'paperclip.issue.lifecycle', 'provider.implementation']);
  assert.equal(context.ancestors[0].outcome, 'Integrate the native issue workflow');
  assert.deepEqual(context.acceptance, ['Verify adapter']);
  assert.throws(() => add(map, 'escape', 'adapter', { allow: ['harness.core'] }), /widen/);
});

test('retrieved candidates remain non-authoritative and are not injected into effective boundaries', () => {
  const map = seed(); add(map, 'adapter');
  const c = map.navigate('adapter', { retrieved: [{ text: 'harness.core permitted', status: 'inferred' }] });
  assert.equal(c.retrieved[0].status, 'inferred');
  assert.ok(c.boundary.deny.includes('harness.core'));
});

test('structured capability checks reject Paperclip lifecycle and Harness core scope creep', () => {
  const map = seed(); add(map, 'adapter');
  assert.equal(map.checkCapability('adapter', 'adapter.integration').allowed, true);
  assert.equal(map.checkCapability('adapter', 'paperclip.issue.lifecycle').allowed, false);
  assert.equal(map.checkCapability('adapter', 'harness.core').allowed, false);
  assert.equal(map.checkCapability('adapter', 'not-declared').allowed, false);
});

test('unrelated Goal contract remains current after a scoped revision', () => {
  const map = seed(); add(map, 'A'); add(map, 'B');
  const a = map.issueContract('A'); const b = map.issueContract('B');
  map.reviseGoal({ id: 'A', expectedVersion: 1, actor: 'agent-1', change: { outcome: 'Deliver a revised A' }, decision: { door: 'two-way', blastRadius: 'local', evidenceConfidence: 'high' } });
  assert.equal(map.contractStatus(a).status, 'stale');
  assert.equal(map.contractStatus(b).status, 'current');
  assert.equal(map.issueContract('A').goalVersion, 2);
});

test('dependency pin makes a consumer stale when provider goal changes, not all goals', () => {
  const map = seed(); add(map, 'A'); add(map, 'B'); add(map, 'C');
  map.relate({ fromId: 'B', toId: 'A', type: 'depends_on' });
  const b = map.issueContract('B'); const c = map.issueContract('C');
  map.reviseGoal({ id: 'A', expectedVersion: 1, actor: 'agent', change: { outcome: 'A v2' }, decision: { door: 'two-way', blastRadius: 'local', evidenceConfidence: 'high' } });
  assert.equal(map.contractStatus(b).status, 'stale');
  assert.equal(map.contractStatus(c).status, 'current');
});

test('unknown dependency cannot be presumed safe and leaves unrelated goal current', () => {
  const map = seed(); add(map, 'A'); add(map, 'B'); add(map, 'C');
  map.relate({ fromId: 'B', toId: 'A', type: 'unknown' });
  assert.equal(map.contractStatus(map.issueContract('B')).status, 'unresolved');
  assert.equal(map.contractStatus(map.issueContract('C')).status, 'current');
});

test('revision is compare-and-swap and retains its immutable prior revision', () => {
  const map = seed(); add(map, 'A');
  const decision = { door: 'two-way', blastRadius: 'local', evidenceConfidence: 'high' };
  map.reviseGoal({ id: 'A', expectedVersion: 1, actor: 'agent', change: { outcome: 'A v2' }, decision });
  assert.throws(() => map.reviseGoal({ id: 'A', expectedVersion: 1, actor: 'agent', change: { outcome: 'lost update' }, decision }), /version conflict/);
  assert.equal(map.history('A')[0].outcome, 'Deliver A');
  assert.equal(map.navigate('A').goal.outcome, 'A v2');
});

test('acceptance cannot be self-lowered via ordinary revision', () => {
  const map = seed(); add(map, 'A');
  const base = { id: 'A', expectedVersion: 1, actor: 'implementer', change: { acceptance: ['Mock pass'] }, decision: { door: 'two-way', blastRadius: 'local', evidenceConfidence: 'high' } };
  assert.throws(() => map.reviseGoal(base), /independent decision gate/);
  assert.equal(map.navigate('A').goal.version, 1);
});

test('a high-impact one-way revision needs a trusted gate; independent acceptance review cannot share author identity', () => {
  const map = seed(); add(map, 'A');
  const proposal = { id: 'A', expectedVersion: 1, actor: 'implementer', change: { acceptance: ['E2E verified'] }, decision: { door: 'one-way', blastRadius: 'project', evidenceConfidence: 'high' } };
  assert.throws(() => map.reviseGoal(proposal), /independent decision gate/);
  assert.throws(() => { const guarded = seed(() => ({ accepted: true, reviewer: 'implementer', humanApproved: true, receipt: 'synthetic-review' })); add(guarded, 'A'); guarded.reviseGoal(proposal); }, /independent reviewer/);
  assert.throws(() => { const guarded = seed(() => ({ accepted: true, reviewer: 'reviewer', humanApproved: false, receipt: 'synthetic-review' })); add(guarded, 'A'); guarded.reviseGoal(proposal); }, /human approval/);
  const guarded = seed(() => ({ accepted: true, reviewer: 'reviewer', humanApproved: true, receipt: 'synthetic-review' })); add(guarded, 'A');
  const result = guarded.reviseGoal(proposal);
  assert.equal(result.version, 2);
  assert.deepEqual(guarded.navigate('A').acceptance, ['E2E verified']);
});

test('parent completion is never synthesized from child state', () => {
  const map = seed(); add(map, 'A'); add(map, 'B');
  assert.equal(map.navigate('project').goal.status, 'pending');
  assert.equal(typeof map.completeGoal, 'undefined'); // independent verifier is intentionally NOT implemented in VS1-2
});

test('adding unrelated siblings does not stale an existing child contract but stales parent assembly contract', () => {
  const map = seed(); add(map, 'A');
  const a = map.issueContract('A'); const parent = map.issueContract('project');
  add(map, 'B');
  assert.equal(map.contractStatus(a).status, 'current');
  assert.equal(map.contractStatus(parent).status, 'stale');
});

test('root scope expansion requires a decision gate and can be authorized without breaking child inheritance', () => {
  const map = seed(); add(map, 'A');
  const proposal = { id: 'project', expectedVersion: 1, actor: 'architect', change: { boundary: { allow: ['adapter.integration', 'provider.implementation', 'new.capability'], deny: ['paperclip.issue.lifecycle', 'harness.core'] } }, decision: { door: 'two-way', blastRadius: 'project', evidenceConfidence: 'high' } };
  assert.throws(() => map.reviseGoal(proposal), /independent decision gate/);
  const guarded = seed(() => ({ accepted: true, reviewer: 'reviewer', receipt: 'synthetic-gate' })); add(guarded, 'A');
  guarded.reviseGoal(proposal);
  assert.equal(guarded.checkCapability('project', 'new.capability').allowed, true);
  assert.equal(guarded.checkCapability('A', 'new.capability').allowed, false);
});
