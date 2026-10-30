import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const r = createRequire(import.meta.url),
  P = r('../dist/protection.js'),
  handler = (await import('../api/assess.mjs')).default;
const ctx = {
  window: { addEventListener() {} },
  document: { addEventListener() {} },
  ShieldProtection: P,
  Date,
  performance,
  setTimeout,
  clearTimeout,
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('dist/protection-ui.js', 'utf8'), ctx);
const sample = ctx.window.ShieldProtectionSample;
assert.equal(P.catalog.length, 20);
for (const rule of P.catalog) {
  let body = sample(rule.id),
    response = await handler.fetch(
      new Request('http://localhost/api/assess', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
  assert.equal(response.status, 200);
  let data = await response.json();
  assert(
    data.protection.triggered.some((t) => t.id === rule.id),
    'Scenario must trigger its intended rule: ' + rule.id,
  );
  assert.notEqual(data.decision, 'Allow');
  assert.equal(data.settlementPermitted, false);
}
let normal = sample('normal'),
  res = await handler.fetch(
    new Request('http://localhost/api/assess', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(normal),
    }),
  ),
  data = await res.json();
assert.equal(data.protection.triggered.length, 0);
assert.equal(data.decision, 'Allow');
assert.equal(data.protection.checks.find((c) => c.id === 'remote').status, 'Unavailable');
normal.protectionContext = { remoteAccessActive: 'yes' };
res = await handler.fetch(
  new Request('http://localhost/api/assess', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(normal),
  }),
);
assert.equal(res.status, 400);
console.log(
  'Passed 20 automatic scenarios, normal control, missing signal disclosure, settlement restriction and strict context validation. These are policy tests, not measured fraud detection accuracy.',
);

const mixed = ctx.window.ShieldProtectionPlan('mixed');
assert.equal(mixed.length, 40);
assert.equal(mixed.filter((x) => x === 'normal').length, 36);
assert.equal(ctx.window.ShieldProtectionPlan('suite').length, 21);
const amounts = new Set(Array.from({ length: 20 }, () => sample('normal').payment.amount));
assert(amounts.size > 1);
console.log(
  'Passed mixed traffic composition, separate scenario suite and varied normal amounts. Decisions remain engine derived.',
);
