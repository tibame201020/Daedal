import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLabyrinth } from '../src/labyrinth.mjs';
import { createProjectResolver } from '../src/durable.mjs';

const seed = projectId => ({ projectId, id: 'root', outcome: 'Project',
  acceptance: ['Independent integration'], boundary: { allow: ['integration'] } });
function fixture() {
  const source = createLabyrinth(seed('source'));
  source.decompose({ id: 'interface', parentId: 'root', outcome: 'Generic interface', acceptance: ['Contract exists'] });
  const consumer = createLabyrinth(seed('consumer'),
    { referenceResolver: createProjectResolver({ getProject: id => id === 'source' ? source : null }) });
  consumer.decompose({ id: 'feature', parentId: 'root', outcome: 'Consume interface', acceptance: ['Verified'] });
  consumer.attachReference({ fromId: 'feature', sourceProjectId: 'source', sourceGoalId: 'interface',
    expectedVersion: 1, actor: 'worker' });
  return { source, consumer, contract: consumer.issueContract('feature') };
}

test('Q17 unrelated source sibling must not stale pinned interface consumer', () => {
  const { source, consumer, contract } = fixture();
  assert.equal(consumer.contractStatus(contract).status, 'current');
  source.decompose({ id: 'unrelated', parentId: 'root', outcome: 'Another capability', acceptance: ['Exists'] });
  assert.equal(consumer.contractStatus(contract).status, 'current');
});
test('referenced interface child composition change must stale its consumer', () => {
  const { source, consumer, contract } = fixture();
  source.decompose({ id: 'required-child', parentId: 'interface', outcome: 'New interface requirement', acceptance: ['Exists'] });
  assert.equal(consumer.contractStatus(contract).status, 'stale');
});
test('source ancestor goal revision must stale its consumer', () => {
  const { source, consumer, contract } = fixture();
  source.reviseGoal({ id: 'root', expectedVersion: 1, actor: 'architect', change: { outcome: 'Updated Project boundary' },
    decision: { door: 'two-way', blastRadius: 'local', evidenceConfidence: 'high' } });
  assert.equal(consumer.contractStatus(contract).status, 'stale');
});
test('restoring with a different bootstrap acceptance must reject silent Goal Seed mismatch', () => {
  const original = seed('project');
  const snapshot = createLabyrinth(original).exportSnapshot();
  assert.throws(() => createLabyrinth({ ...original, acceptance: ['Mock PASS'] }, { initialSnapshot: snapshot }),
    /seed|snapshot|bootstrap/);
});
test('legitimate root revision persists when rehydrated with the original bootstrap seed', () => {
  const original = seed('project'); const map = createLabyrinth(original);
  map.reviseGoal({ id: 'root', expectedVersion: 1, actor: 'architect',
    change: { outcome: 'Revised after decision' },
    decision: { door: 'two-way', blastRadius: 'local', evidenceConfidence: 'high' } });
  const restored = createLabyrinth(original, { initialSnapshot: map.exportSnapshot() });
  assert.equal(restored.navigate('root').goal.outcome, 'Revised after decision');
});
