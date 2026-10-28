import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createVerifiedGitSourceBinding } from '../../src/quality-source-binding.mjs';
import { summarizeCrapkit, summarizeStryker } from '../../src/quality-native.mjs';

const sha256 = value => createHash('sha256').update(value).digest('hex');
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
/** A checked source tree and original tool report bytes are linked without trusting a caller's SHA field. */
export function buildNativeQualityEvidenceBundle({ workspaceRoot, sourcePath, crapPath, mutationPath,
  policyPath, eventName, expectedCheckoutSha, pullRequestHeadSha = null, repository = null, runId = null }) {
  const source = createVerifiedGitSourceBinding({ workspaceRoot,
    relativePath: sourcePath, expectedCommit: expectedCheckoutSha });
  if (!['push', 'pull_request'].includes(eventName)) throw new Error('unrecognized CI event');
  const parents = git(workspaceRoot, 'rev-list', '--parents', '-n', '1', 'HEAD').split(/\s+/).slice(1);
  if (eventName === 'pull_request') {
    if (!/^[a-f0-9]{40}$/i.test(pullRequestHeadSha ?? '') ||
        parents.length !== 2 || parents[1] !== pullRequestHeadSha)
      throw new Error('PR HEAD is not the checkout merge commit second parent');
  } else if (pullRequestHeadSha !== null && pullRequestHeadSha !== expectedCheckoutSha) {
    throw new Error('push head and checked commit mismatch');
  }
  const reports = {};
  for (const [name, path] of [['crap', crapPath], ['mutation', mutationPath]]) {
    const bytes = readFileSync(resolve(workspaceRoot, path));
    reports[name] = { path, sha256: sha256(bytes), bytes: bytes.length };
  }
  const crap = JSON.parse(readFileSync(resolve(workspaceRoot, crapPath), 'utf8'));
  const mutation = JSON.parse(readFileSync(resolve(workspaceRoot, mutationPath), 'utf8'));
  if (crap.commit !== source.commitSha) throw new Error('crapkit report is not from tested Git commit');
  const policy = JSON.parse(readFileSync(resolve(workspaceRoot, policyPath), 'utf8'));
  const metrics = { crap: summarizeCrapkit(crap, policy.crap?.limits),
    mutation: summarizeStryker(mutation, policy.mutation?.limits) };
  if (Object.values(metrics).some(m => m.status === 'unknown'))
    throw new Error('missing or invalid native quality report');
  return { schemaVersion: 1, kind: 'daedal-native-quality-evidence', repository, runId,
    eventName, testedCommit: source.commitSha,
    ...(eventName === 'pull_request' ? { pullRequestHeadSha } : {}),
    source: { path: source.relativePath, sha256: source.sourceRevision, gitBlobSha: source.gitBlobSha },
    reports, metrics, thresholdsAreAdvisory: true };
}
const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  const [crapPath, mutationPath, policyPath, outputPath, sourcePath = 'src/quality-review.mjs'] = process.argv.slice(2);
  if (![crapPath, mutationPath, policyPath, outputPath].every(Boolean))
    throw new Error('usage: build-evidence-bundle <crap-json> <mutation-json> <policy-json> <output-json> [tracked-source]');
  const root = process.cwd();
  const bundle = buildNativeQualityEvidenceBundle({ workspaceRoot: root,
    sourcePath, crapPath, mutationPath, policyPath,
    eventName: process.env.GITHUB_EVENT_NAME ?? 'push',
    expectedCheckoutSha: process.env.GITHUB_SHA ?? git(root, 'rev-parse', 'HEAD'),
    pullRequestHeadSha: process.env.GITHUB_EVENT_NAME === 'pull_request' ?
      process.env.GITHUB_HEAD_SHA : null,
    repository: process.env.GITHUB_REPOSITORY ?? null, runId: process.env.GITHUB_RUN_ID ?? null });
  mkdirSync(dirname(resolve(root, outputPath)), { recursive: true });
  writeFileSync(resolve(root, outputPath), JSON.stringify(bundle, null, 2) + '\n');
  console.log(JSON.stringify({ bundle: outputPath, testedCommit: bundle.testedCommit,
    sourceSha256: bundle.source.sha256, reports: Object.keys(bundle.reports),
    status: Object.fromEntries(Object.entries(bundle.metrics).map(([name, metric])=>[name, metric.status])) }));
}
