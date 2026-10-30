import { getStore } from '../lib/store.mjs';
import { requestMetrics } from '../lib/request-metrics.mjs';
import {
  bootstrap,
  bootstrapInvestigator,
  login,
  view,
  command,
  createPayment,
  benchmark,
  loadOverviewSamples,
} from '../lib/workspace.mjs';
const cookieName = 'shield_session';
const headers = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Content-Type': 'application/json',
};
function token(r) {
  const cookieName =
    r.headers.get('x-shield-role') === 'investigator' ? 'shield_investigator' : 'shield_session';
  return (
    (r.headers.get('cookie') || '')
      .split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith(cookieName + '='))
      ?.slice(cookieName.length + 1) || ''
  );
}
function cookie(t, r, admin = false) {
  const cookieName = admin ? 'shield_investigator' : 'shield_session';
  return `${cookieName}=${t}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400${new URL(r.url).protocol === 'https:' ? '; Secure' : ''}`;
}
export default {
  fetch(request) {
    return requestMetrics.run({}, () => handle(request));
  },
};
async function handle(request) {
  const start = performance.now();
  try {
    if (!['GET', 'POST'].includes(request.method))
      return Response.json(
        { error: 'Method not allowed' },
        { status: 405, headers: { ...headers, Allow: 'GET, POST' } },
      );
    const url = new URL(request.url),
      t = token(request),
      store = await getStore();
    if (request.method === 'GET') {
      if (url.searchParams.has('health')) {
        await store.read();
        return Response.json(
          {
            ready: true,
            database: 'Postgres',
            investigatorConfigured: !!process.env.INVESTIGATOR_ACCESS_CODE,
            simulated: true,
          },
          { headers },
        );
      }
      const result = await view(store, t, url.searchParams.get('since'));
      return Response.json(result, { headers });
    }
    if (request.headers.get('origin') !== url.origin)
      return Response.json({ error: 'Same origin request required.' }, { status: 403, headers });
    if (!request.headers.get('content-type')?.includes('application/json'))
      return Response.json({ error: 'JSON required.' }, { status: 415, headers });
    if (+(request.headers.get('content-length') || 0) > 16384)
      return Response.json({ error: 'Request too large.' }, { status: 413, headers });
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 16384)
      return Response.json({ error: 'Request too large.' }, { status: 413, headers });
    const b = JSON.parse(raw);
    let result,
      h = { ...headers };
    if (b.action === 'bootstrap') {
      const investigator = request.headers.get('x-shield-role') === 'investigator';
      const a = await (investigator ? bootstrapInvestigator : bootstrap)(store, t);
      if (!a.existing) h['Set-Cookie'] = cookie(a.token, request, investigator);
      result = { actor: a.actor, shared: true };
    } else if (b.action === 'login') {
      const t2 = await login(store, b.code, request.headers.get('x-forwarded-for') || 'unknown', t);
      h['Set-Cookie'] = cookie(t2, request, true);
      result = { role: 'investigator' };
    } else if (b.action === 'loadOverviewSamples') result = await loadOverviewSamples(store, t);
    else if (b.action === 'benchmark') result = await benchmark(store, t, b.mode);
    else if (b.action === 'create') result = await createPayment(store, t, b);
    else result = await command(store, t, b);
    if (b.action === 'logout')
      h['Set-Cookie'] = cookie(
        '',
        request,
        request.headers.get('x-shield-role') === 'investigator',
      ).replace('Max-Age=86400', 'Max-Age=0');
    const measured = { handlerMs: performance.now() - start, ...requestMetrics.getStore() };
    h['Server-Timing'] =
      `workspace;dur=${measured.handlerMs.toFixed(2)},dbread;dur=${(measured.databaseReadMs || 0).toFixed(2)},dbwrite;dur=${(measured.databaseWriteMs || 0).toFixed(2)}`;
    return Response.json({ ...result, requestTiming: measured }, { headers: h });
  } catch (e) {
    const status = e.status || (e instanceof SyntaxError ? 400 : 503);
    if (status >= 500) {
      const redact = (value) => {
        let message = String(value || '').replace(/https?:\/\/[^\s]+|postgres(?:ql)?:\/\/[^\s]+/gi, '[connection]');
        for (const [key, secret] of Object.entries(process.env)) {
          if (!/DATABASE|POSTGRES|^PG|PASSWORD|TOKEN|SECRET|ACCESS_CODE/i.test(key) || !secret) continue;
          if (secret.length >= 6) message = message.split(secret).join('[redacted]');
          if (/URL/.test(key)) {
            try { const url = new URL(secret); for (const part of [url.hostname, url.username, url.password]) if (part.length >= 3) message = message.split(part).join('[redacted]'); } catch {}
          }
        }
        return message.slice(0, 500);
      };
      console.error('workspace_request_failed', JSON.stringify({ name: e.name, code: e.code, message: redact(e.message), cause: redact(e.sourceError?.message || e.cause?.message) }));
    }
    return Response.json(
      {
        error:
          e.status || e instanceof SyntaxError
            ? e.message
            : 'Shared service unavailable. Retry without changing the request key.',
      },
      { status, headers },
    );
  }
}
