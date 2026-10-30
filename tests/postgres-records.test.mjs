/* Optional integration test: npm install --no-save --package-lock=false @electric-sql/pglite */
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { initialState } from '../lib/store.mjs';
const db = new PGlite(),
  state = initialState();
state.users.owner = { banks: { sbi: { balance: 25000 } } };
state.payments = [
  {
    id: 'old-payment',
    userId: 'owner',
    key: 'old-key',
    status: 'Settled',
    timestamp: '2026-10-30T01:00:00Z',
  },
];
state.history = [{ sender: 'old', receiver: 'new', timestamp: '2026-10-30T00:00:00Z' }];
await db.exec(fs.readFileSync('migrations/001_shared_workspace.sql', 'utf8'));
await db.query('INSERT INTO shield_workspace(id,data) VALUES ($1,$2)', [
  'main',
  JSON.stringify(state),
]);
await db.exec(fs.readFileSync('migrations/002_record_storage.sql', 'utf8'));
const apply = async (p) =>
  (await db.query('SELECT shield_apply_records($1::jsonb) applied', [JSON.stringify(p)])).rows[0]
    .applied;
const patch = (key, previous, next, collection = 'users') => ({ collection, key, previous, next });
assert.equal((await db.query('SELECT count(*)::int n FROM shield_records')).rows[0].n, 3);
assert(await apply([patch('owner', state.users.owner, { banks: { sbi: { balance: 24750 } } })]));
assert.equal(
  await apply([patch('owner', state.users.owner, { banks: { sbi: { balance: 24000 } } })]),
  false,
);
// A conflict rolls back every write in the batch.
assert.equal(
  await apply([
    patch('new-user', null, { banks: {} }),
    patch('owner', state.users.owner, { banks: { sbi: { balance: 23000 } } }),
  ]),
  false,
);
assert.equal(
  (await db.query("SELECT count(*)::int n FROM shield_records WHERE key='new-user'")).rows[0].n,
  0,
);
// Different IDs cannot bypass request-key uniqueness, and preceding writes roll back.
assert.equal(
  await apply([
    patch('new-user', null, { banks: {} }),
    patch('duplicate', null, { id: 'duplicate', userId: 'owner', key: 'old-key' }, 'payments'),
  ]),
  false,
);
assert.equal(
  (await db.query("SELECT count(*)::int n FROM shield_records WHERE key='new-user'")).rows[0].n,
  0,
);
await db.exec(fs.readFileSync('migrations/002_record_storage.sql', 'utf8'));
assert.equal(
  (await db.query("SELECT data FROM shield_records WHERE collection='users' AND key='owner'"))
    .rows[0].data.banks.sbi.balance,
  24750,
);
assert.equal(
  (await db.query("SELECT data FROM shield_workspace WHERE id='main'")).rows[0].data.users.owner
    .banks.sbi.balance,
  25000,
);
console.log(
  'PASS: actual PostgreSQL migration, preserved legacy data, stale-update rejection, atomic rollback, request-key uniqueness and repeat migration safety.',
);
const { recordStore } = await import('../lib/record-store.mjs');
const W = await import('../lib/workspace.mjs');
process.env.INVESTIGATOR_ACCESS_CODE = 'postgres-test-private-code';
const storage = recordStore({
  read: async () => {
    const state = initialState();
    for (const row of (
      await db.query('SELECT collection,key,data FROM shield_records ORDER BY created_at,key')
    ).rows) {
      if (['users', 'sessions', 'loginAttempts'].includes(row.collection))
        state[row.collection][row.key] = row.data;
      else state[row.collection].push(row.data);
    }
    return {
      version: (await db.query("SELECT version FROM shield_revision WHERE id='main'")).rows[0]
        .version,
      data: state,
    };
  },
  apply,
});
const c = await W.bootstrap(storage, '');
await W.command(storage, c.token, {
  action: 'connect',
  bank: 'sbi',
  consent: true,
  code: '123456',
});
const request = {
  key: 'postgres-concurrent-create',
  bank: 'sbi',
  receiver: 'pay-aanya',
  recipientName: 'Aanya',
  amount: 250,
  scenario: 'normal',
};
const creations = await Promise.all([
  W.createPayment(storage, c.token, request),
  W.createPayment(storage, c.token, request),
]);
assert.equal(creations[0].payment.id, creations[1].payment.id);
const id = creations[0].payment.id;
await Promise.all([
  W.command(storage, c.token, { action: 'settle', id, code: '123456' }),
  W.command(storage, c.token, { action: 'settle', id, code: '123456' }),
]);
assert.equal((await W.view(storage, c.token)).account.banks.sbi.balance, 24750);
const held = await W.createPayment(storage, c.token, {
  ...request,
  key: 'postgres-held-request',
  scenario: 'ring',
});
assert.equal(held.payment.status, 'Held for review');
await assert.rejects(() =>
  W.command(storage, c.token, { action: 'settle', id: held.payment.id, code: '123456' }),
);
const admin = await W.login(storage, process.env.INVESTIGATOR_ACCESS_CODE, 'test-ip', '');
await W.command(storage, admin, {
  action: 'review',
  id: held.payment.id,
  outcome: 'cancel',
  note: 'Inspected synthetic network evidence',
});
assert.equal(
  (await W.view(storage, c.token)).payments.find((p) => p.id === held.payment.id).status,
  'Cancelled',
);
console.log(
  'PASS: PostgreSQL-backed application preserves concurrent request idempotency, single debit, held gating and investigator audit propagation.',
);
const seeded = await W.loadOverviewSamples(storage, admin);
assert.equal(seeded.added, 500);
assert.equal(
  (await W.view(storage, admin)).payments.filter((p) => p.source === 'overview-sample').length,
  500,
);
assert.equal((await W.view(storage, c.token)).account.banks.sbi.balance, 24750);
await W.command(storage, admin, { action: 'clearOverviewSamples' });
assert.equal(
  (await W.view(storage, admin)).payments.filter((p) => p.source === 'overview-sample').length,
  0,
);
console.log(
  'PASS: PostgreSQL atomically persists and selectively clears the 500-record overview pack.',
);
await db.close();
