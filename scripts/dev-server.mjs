/* Local preview only. Never used by the Vercel production handler. */
import http from 'node:http';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
if (existsSync('.env')) process.loadEnvFile('.env');
import { readFile } from 'node:fs/promises';
import { resolve, extname, relative, isAbsolute } from 'node:path';
if (process.env.VERCEL) throw Error('Local server must not run on Vercel');
process.env.SHIELD_LOCAL_DB = process.env.SHIELD_LOCAL_DB || '.openai/shared-development.sqlite';
process.env.INVESTIGATOR_ACCESS_CODE =
  process.env.INVESTIGATOR_ACCESS_CODE || 'local-test-investigator-2026-only';
if (process.env.SHIELD_LOCAL_DB !== ':memory:')
  mkdirSync(dirname(resolve(process.env.SHIELD_LOCAL_DB)), { recursive: true });
const workspace = (await import('../api/workspace.mjs')).default,
  assess = (await import('../api/assess.mjs')).default,
  demoPayments = (await import('../api/demo-payments.mjs')).default,
  base = resolve('dist');
http
  .createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://' + req.headers.host);
      if (url.pathname.startsWith('/api/')) {
        let chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const body = Buffer.concat(chunks);
        const request = new Request(url, {
          method: req.method,
          headers: req.headers,
          ...(req.method === 'GET' || req.method === 'HEAD' ? {} : { body }),
        });
        const result = await (url.pathname === '/api/workspace' ? workspace : url.pathname === '/api/demo-payments' ? demoPayments : assess).fetch(
          request,
        );
        res.writeHead(result.status, Object.fromEntries(result.headers));
        res.end(Buffer.from(await result.arrayBuffer()));
        return;
      }
      let path = decodeURIComponent(url.pathname);
      if (path === '/') path = '/index.html';
      if (!extname(path)) path += '.html';
      const file = resolve(base, '.' + path);
      const relativeFile = relative(base, file);
      if (relativeFile.startsWith('..') || isAbsolute(relativeFile)) {
        res.writeHead(403);
        res.end();
        return;
      }
      const bytes = await readFile(file);
      res.writeHead(200, {
        'Content-Type':
          {
            '.html': 'text/html',
            '.js': 'application/javascript',
            '.css': 'text/css',
            '.json': 'application/json',
            '.svg': 'image/svg+xml',
            '.png': 'image/png',
            '.webp': 'image/webp',
          }[extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(bytes);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  })
  .listen(Number(process.env.PORT || 4173), '0.0.0.0', () =>
    console.log('Shared development server ready'),
  );
