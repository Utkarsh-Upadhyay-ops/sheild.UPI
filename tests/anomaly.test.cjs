const assert = require('node:assert/strict');
const I = require('../dist/intelligence.js');
const model = require('../dist/intelligence-model.json');
const fixtures = require('./anomaly-parity.json');
for (const f of fixtures)
  assert(Math.abs(I.anomaly(model.anomaly, f.features) - f.expected) < 1e-10);
assert.equal(model.anomaly.trees.length, 80);
assert(model.anomaly.reviewThreshold > 0 && model.anomaly.reviewThreshold < 1);
const report = require('../reports/anomaly-evaluation.json');
assert(report.test.falsePositiveRate < 0.01);
assert(report.rareTrafficStress.falsePositiveRate < 0.01);
console.log(
  'PASS: 40 sklearn/JavaScript Isolation Forest parity fixtures and held-out false-positive guard.',
);
