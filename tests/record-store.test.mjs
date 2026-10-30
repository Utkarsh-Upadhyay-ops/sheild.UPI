import assert from 'node:assert/strict';
import { recordStore, changes } from '../lib/record-store.mjs';
import { initialState } from '../lib/store.mjs';
const state = initialState();
state.users.a = { balance: 100 };
state.users.b = { balance: 100 };
let data = structuredClone(state),
  version = 0,
  conflicts = 0;
const read = async () => ({ version, data: structuredClone(data) });
const store = recordStore({
  read,
  apply: async (patch) => {
    const working = structuredClone(data);
    for (const p of patch) {
      if (p.collection !== 'users') throw Error('Unexpected patch');
      const current = working.users[p.key] || null;
      if (JSON.stringify(current) !== JSON.stringify(p.previous)) {
        conflicts++;
        return false;
      }
    }
    for (const p of patch) working.users[p.key] = p.next;
    data = working;
    version++;
    return true;
  },
});
await Promise.all([
  store.mutate((s) => {
    s.users.a.balance -= 30;
  }),
  store.mutate((s) => {
    s.users.b.balance -= 40;
  }),
]);
assert.equal(data.users.a.balance, 70);
assert.equal(data.users.b.balance, 60);
assert.equal(conflicts, 0);
await Promise.all([
  store.mutate((s) => {
    s.users.a.balance -= 20;
  }),
  store.mutate((s) => {
    s.users.a.balance -= 10;
  }),
]);
assert.equal(data.users.a.balance, 40);
assert(conflicts > 0);
const before = initialState();
before.history = [{ _storeId: 'edge-1', sender: 'a', receiver: 'b' }];
before.audit = [{ id: 'audit-1' }];
const after = structuredClone(before);
after.history.push({ sender: 'b', receiver: 'c' });
const delta = changes(before, after);
assert.equal(delta.length, 1);
assert.equal(delta[0].collection, 'history');
assert(delta[0].next._storeId);
console.log(
  'PASS: disjoint records merge without retries, overlapping balance updates retry without loss, appended history writes one durable record.',
);
