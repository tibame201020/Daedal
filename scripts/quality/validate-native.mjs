import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { summarizeCrapkit, summarizeStryker } from '../../src/quality-native.mjs';

const [crapPath, mutationPath, policyPath] = process.argv.slice(2);
if (!crapPath || !mutationPath || !policyPath) {
  console.error('usage: node scripts/quality/validate-native.mjs <crapkit-json> <stryker-json> <policy-json>');
  process.exit(2);
}
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const policy = JSON.parse(readFileSync(policyPath, 'utf8'));
const crap = JSON.parse(readFileSync(crapPath, 'utf8'));
const mutation = JSON.parse(readFileSync(mutationPath, 'utf8'));
const summary = { commit: sha, tools: {
  crap: summarizeCrapkit(crap, policy.crap?.limits),
  mutation: summarizeStryker(mutation, policy.mutation?.limits),
}};
if (crap.commit !== sha) throw new Error('crapkit report does not describe this checkout');
for (const [name, state] of Object.entries(summary.tools)) {
  if (state.status === 'unknown') throw new Error(name + ': invalid or incomplete report: ' + state.reason);
  if (state.status === 'fail' && policy[name]?.mode === 'required') throw new Error(name + ': required threshold failed');
}
console.log(JSON.stringify(summary));
