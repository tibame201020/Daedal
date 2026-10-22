import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLabyrinth } from '../src/labyrinth.mjs';
import { createProtectedLocalWriter, createLocalEvidenceProvider, createSourceBoundVerifier } from '../src/protected-local.mjs';

function setup(source) {
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'daedal-lifecycle-'));
  mkdirSync(join(workspaceRoot, 'src', 'provider'), { recursive: true });
  mkdirSync(join(workspaceRoot, 'test'));
  let liveEvidence, liveVerifier;
  const seed = { projectId: 'integration-fixture', id: 'project', outcome: 'Use native Issue',
    acceptance: ['Native E2E'], boundary: { allow: ['provider.implementation'], deny: ['paperclip.issue.lifecycle', 'harness.core'] } };
  const map = createLabyrinth(seed, {
    evidenceProvider: { resolve(...args) { return liveEvidence.resolve(...args); } },
    independentVerifier: { review(input) { return liveVerifier.review(input); } },
  });
  map.decompose({ id: 'feature', parentId: 'project', outcome: 'Implement provider adapter',
    acceptance: ['Native readback'], boundary: { allow: ['provider.implementation'] } });
  const contract = map.issueContract('feature');
  assert.equal(contract.enforcement, 'advisory'); // Contract itself never asserts control over external tools.
  const writer = createProtectedLocalWriter({ labyrinth: map, workspaceRoot,
    routes: [{ prefix: 'src/provider', capability: 'provider.implementation' }] });
  writer.writeNewFile({ contract, relativePath: 'src/provider/feature.mjs', content: source });
  writeFileSync(join(workspaceRoot, 'test', 'feature.test.mjs'),
    "import {test} from 'node:test'; import assert from 'node:assert/strict'; import {nativeIssue} from '../src/provider/feature.mjs'; test('native',()=>assert.equal(nativeIssue(),'ok'));\n");
  liveEvidence = createLocalEvidenceProvider({ workspaceRoot, artifactPath: 'src/provider/feature.mjs',
    testPath: 'test/feature.test.mjs', projectId: 'integration-fixture', goalId: 'feature', implementerId: 'worker' });
  liveVerifier = createSourceBoundVerifier({ workspaceRoot, artifactPath: 'src/provider/feature.mjs',
    reviewerId: 'independent-qc', reviewSource({ content, context }) {
      // Explicit synthetic scope rule; a real deployment must supply an authenticated independent code reviewer.
      const drift = content.includes('parallelIssueLifecycle');
      return { verdict: drift ? 'fail' : 'pass', boundaryReviewed: true,
        findings: drift ? ['duplicate Paperclip native lifecycle'] : [],
        criterionResults: context.acceptance.map(criterion => ({ criterion, passed: !drift })) };
    } });
  return { map, contract, writer, workspaceRoot, cleanup() { rmSync(workspaceRoot, { recursive: true, force: true }); } };
}

test('issued Work Contract -> real scoped file creation -> actual Node test -> source-bound verifier -> Goal completion', () => {
  const f = setup("export const nativeIssue = () => 'ok';\n");
  try {
    const result = f.map.verifyGoal({ contract: f.contract, evidenceRefs: ['artifact', 'test'] });
    assert.equal(result.verdict, 'pass');
    assert.equal(f.map.navigate('feature').goal.status, 'completed');
    assert.equal(f.map.navigate('project').goal.status, 'pending');
    assert.equal(f.map.proofs('feature')[0].sources.length, 2);
    assert.throws(() => f.writer.writeNewFile({ contract: f.contract, relativePath: 'src/provider/feature.mjs', content: 'overwrite' }));
  } finally { f.cleanup(); }
});

test('real green test cannot complete Goal when independent source review identifies responsibility drift', () => {
  const f = setup("export const nativeIssue = () => 'ok'; export const parallelIssueLifecycle = true;\n");
  try {
    const result = f.map.verifyGoal({ contract: f.contract, evidenceRefs: ['artifact', 'test'] });
    assert.equal(result.verdict, 'fail');
    assert.equal(result.findings[0], 'duplicate Paperclip native lifecycle');
    assert.equal(f.map.navigate('feature').goal.status, 'pending');
  } finally { f.cleanup(); }
});
