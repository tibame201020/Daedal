export default {
  mutate: ['src/quality-review.mjs'],
  testRunner: 'command',
  commandRunner: { command: 'node --test test/quality-review.test.mjs' },
  coverageAnalysis: 'off',
  concurrency: 2,
  reporters: ['json', 'clear-text'],
  jsonReporter: { fileName: 'reports/mutation/mutation.json' },
  thresholds: { high: 90, low: 60, break: 0 },
  timeoutMS: 15000,
};
