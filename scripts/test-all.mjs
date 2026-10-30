import { spawnSync } from 'node:child_process';
const tests = [
  'engine.test.cjs',
  'app.test.cjs',
  'api.test.mjs',
  'protection.test.mjs',
  'pay.test.cjs',
  'mobile-pay.test.cjs',
  'payment-bridge.test.cjs',
  'payment-history.test.cjs',
  'payment-cloud.test.cjs',
  'payment-help.test.cjs',
  'intelligence.test.mjs',
  'pipeline.test.cjs',
  'workspace.test.mjs',
  'command-render.test.mjs',
  'record-store.test.mjs',
  'postgres-records.test.mjs',
  'temporal-graph.test.cjs',
  'anomaly.test.cjs',
  'large-data.test.cjs',
  'overview-samples.test.mjs',
];
for (const file of tests) {
  const result = spawnSync(process.execPath, ['tests/' + file], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log('All 20 suites passed.');
