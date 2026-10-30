import { randomUUID } from 'node:crypto';
const maps = ['users', 'sessions', 'loginAttempts'],
  arrays = ['payments', 'history', 'audit'];
export function flatten(state) {
  const rows = new Map();
  for (const collection of maps)
    for (const [key, data] of Object.entries(state[collection] || {}))
      rows.set(collection + ':' + key, { collection, key, data });
  for (const collection of arrays)
    for (const data of state[collection] || []) {
      const key = collection === 'history' ? (data._storeId ||= randomUUID()) : data.id;
      if (!key) throw Error('Missing durable record identity');
      rows.set(collection + ':' + key, { collection, key, data });
    }
  return rows;
}
export function changes(before, after) {
  const old = flatten(before),
    next = flatten(after),
    patch = [];
  for (const id of new Set([...old.keys(), ...next.keys()])) {
    const a = old.get(id),
      b = next.get(id);
    if (JSON.stringify(a?.data) !== JSON.stringify(b?.data))
      patch.push({
        collection: (b || a).collection,
        key: (b || a).key,
        previous: a?.data ?? null,
        next: b?.data ?? null,
      });
  }
  return patch;
}
export function recordStore({ read, apply }) {
  return {
    read,
    async mutate(fn) {
      for (let i = 0; i < 12; i++) {
        const old = await read(),
          before = structuredClone(old.data),
          after = structuredClone(old.data),
          result = fn(after),
          patch = changes(before, after);
        if (!patch.length || (await apply(patch))) return result;
        await new Promise((r) => setTimeout(r, Math.min(30, 3 * i)));
      }
      throw Object.assign(Error('Conflicting account change. Retry with the same request key.'), {
        status: 409,
      });
    },
  };
}
