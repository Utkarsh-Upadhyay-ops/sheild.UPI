import { neon } from '@neondatabase/serverless';
import { readFile } from 'node:fs/promises';
import { recordStore } from './record-store.mjs';
import { measureDatabase } from './request-metrics.mjs';
export const initialState = () => ({
  users: {},
  sessions: {},
  payments: [],
  history: [],
  audit: [],
  loginAttempts: {},
});
export function createStore({ read, cas }) {
  return {
    read,
    async mutate(fn) {
      for (let i = 0; i < 30; i++) {
        const old = await read(),
          data = structuredClone(old.data),
          result = fn(data);
        if (await cas(old.version, data)) return result;
        await new Promise((r) => setTimeout(r, Math.min(25, i * 2)));
      }
      throw Object.assign(Error('Workspace busy. Retry with the same request key.'), {
        status: 409,
      });
    },
  };
}
let ready;
export async function getStore() {
  if (!ready)
    ready = connect().catch((e) => {
      ready = null;
      throw e;
    });
  return ready;
}
async function connect() {
  if (process.env.SHIELD_LOCAL_DB && !process.env.VERCEL) {
    const { DatabaseSync } = await import('node:sqlite'),
      db = new DatabaseSync(process.env.SHIELD_LOCAL_DB);
    db.exec(
      'CREATE TABLE IF NOT EXISTS workspace (id TEXT PRIMARY KEY,version INTEGER NOT NULL,data TEXT NOT NULL)',
    );
    db.prepare('INSERT OR IGNORE INTO workspace VALUES (?,0,?)').run(
      'main',
      JSON.stringify(initialState()),
    );
    return createStore({
      read: async () => {
        const r = db.prepare('SELECT version,data FROM workspace WHERE id=?').get('main');
        return { version: r.version, data: JSON.parse(r.data) };
      },
      cas: async (v, d) =>
        db
          .prepare('UPDATE workspace SET data=?,version=version+1 WHERE id=? AND version=?')
          .run(JSON.stringify(d), 'main', v).changes === 1,
    });
  }
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw Object.assign(Error('Shared database is not configured.'), { status: 503 });
  const sql = neon(url);
  let migration;
  async function read() {
    try {
      const [r] = await sql`SELECT version, jsonb_build_object(
 'users',COALESCE((SELECT jsonb_object_agg(key,data) FROM shield_records WHERE collection='users'),'{}'::jsonb),
 'sessions',COALESCE((SELECT jsonb_object_agg(key,data) FROM shield_records WHERE collection='sessions'),'{}'::jsonb),
 'loginAttempts',COALESCE((SELECT jsonb_object_agg(key,data) FROM shield_records WHERE collection='loginAttempts'),'{}'::jsonb),
 'payments',COALESCE((SELECT jsonb_agg(data ORDER BY data->>'timestamp',key) FROM shield_records WHERE collection='payments'),'[]'::jsonb),
 'history',COALESCE((SELECT jsonb_agg(data ORDER BY data->>'timestamp',key) FROM shield_records WHERE collection='history'),'[]'::jsonb),
 'audit',COALESCE((SELECT jsonb_agg(data ORDER BY data->>'time',key) FROM shield_records WHERE collection='audit'),'[]'::jsonb)
 ) data FROM shield_revision WHERE id='main'`;
      if (!r) throw Object.assign(Error('Migration required'), { code: '42P01' });
      return r;
    } catch (e) {
      if (e.code !== '42P01') throw e;
      if (!migration)
        migration = (async () => {
          const source = await readFile(
            new URL('../migrations/002_record_storage.sql', import.meta.url),
            'utf8',
          );
          const statements = source
            .split('-- @statement')
            .filter((q) => /\b(CREATE|SELECT)\b/.test(q));
          await sql.transaction([
            sql`SELECT pg_advisory_xact_lock(78231005)`,
            ...statements.map((q) => sql.query(q)),
          ]);
        })().catch((e) => {
          migration = null;
          throw e;
        });
      await migration;
      return read();
    }
  }
  return recordStore({
    read: () => measureDatabase('databaseRead', read),
    apply: (patch) =>
      measureDatabase('databaseWrite', async () => {
        const [r] = await sql`SELECT shield_apply_records(${JSON.stringify(patch)}::jsonb) applied`;
        return r.applied;
      }),
  });
}
