const assert = require('node:assert/strict'),
  fs = require('node:fs');
const E = require('../dist/engine.js'),
  m = JSON.parse(fs.readFileSync('dist/model.json')),
  parity = JSON.parse(fs.readFileSync('tests/parity.json'));
for (const row of parity)
  assert(Math.abs(E.predict(m, row.x) - row.expected) < 1e-12, 'Python / JS inference mismatch');
assert.equal(E.decision(0.1, { verify: 0.2, flag: 0.65 }), 'Allow');
assert.equal(E.decision(0.2, { verify: 0.2, flag: 0.65 }), 'Verify');
assert.equal(E.decision(0.65, { verify: 0.2, flag: 0.65 }), 'Flag');
assert.deepEqual(E.parseCSV('\uFEFFa,b\r\n"hello, world","quoted ""value"""\r\n'), [
  ['a', 'b'],
  ['hello, world', 'quoted "value"'],
]);
assert.throws(() => E.parseCSV('a,b\n"unclosed,c'));
assert.equal(E.csv([['=SUM(A1)', 123]]), '"\'=SUM(A1)","123"');
const normal = {
    amount: 650,
    average: 2000,
    velocity: 1,
    age: 420,
    newRecipient: false,
    newDevice: false,
    night: false,
    fanin: 0,
    rapid: false,
    behavior: 0.3,
  },
  risk = {
    amount: 40000,
    average: 1000,
    velocity: 8,
    age: 3,
    newRecipient: true,
    newDevice: true,
    night: true,
    fanin: 2,
    rapid: false,
    behavior: 2.8,
  };
assert.equal(E.decision(E.score(m, normal).value, { verify: 0.2, flag: 0.65 }), 'Allow');
assert.equal(E.decision(E.score(m, risk).value, { verify: 0.2, flag: 0.65 }), 'Flag');
console.log(
  'Passed: 50 Python/JS inference parity checks, thresholds, CSV quoting/validation, formula export protection, normal and high risk scenarios.',
);
