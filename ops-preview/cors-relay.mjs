import { createServer } from 'node:http';

const ORIGIN = 'https://nuvexa-ops-ui-preview.onrender.com';
const UPSTREAM = 'https://nuvexa-ops-bridge.onrender.com';
const PORT = Number(process.env.PORT || 10000);
const MAX_BODY = 4 * 1024 * 1024;
const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH']);

function respond(res, status, payload) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  });
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) {
      const error = new Error('BODY_TOO_LARGE');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

createServer(async (req, res) => {
  const origin = req.headers.origin || '';
  const url = new URL(req.url || '/', 'http://localhost');
  if (url.pathname === '/healthz' && req.method === 'GET') {
    return respond(res, 200, { ok: true, role: 'nuvexa-preview-relay' });
  }

  // A private preview-only transport; no open proxy and no production DNS changes.
  if (origin !== ORIGIN) return respond(res, 403, { error: 'PREVIEW_ORIGIN_REQUIRED' });
  res.setHeader('access-control-allow-origin', ORIGIN);
  res.setHeader('vary', 'Origin');
  res.setHeader('access-control-allow-methods', 'GET,POST,PUT,PATCH,OPTIONS');
  res.setHeader('access-control-allow-headers', 'Content-Type,Authorization');
  res.setHeader('access-control-max-age', '600');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('referrer-policy', 'no-referrer');
  res.setHeader('x-content-type-options', 'nosniff');

  if (!url.pathname.startsWith('/v1/')) return respond(res, 404, { error: 'NOT_FOUND' });
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }
  if (!METHODS.has(req.method || '')) return respond(res, 405, { error: 'METHOD_NOT_ALLOWED' });

  try {
    const body = (req.method === 'GET') ? undefined : await readBody(req);
    const headers = { accept: 'application/json' };
    if (req.headers.authorization) headers.authorization = req.headers.authorization;
    if (body && body.length) headers['content-type'] = 'application/json';
    const upstream = await fetch(UPSTREAM + url.pathname + url.search, {
      method: req.method,
      headers,
      body: body && body.length ? body : undefined,
      redirect: 'manual',
      signal: AbortSignal.timeout(60000)
    });
    const bytes = Buffer.from(await upstream.arrayBuffer());
    res.statusCode = upstream.status;
    res.setHeader('content-type', upstream.headers.get('content-type') || 'application/json; charset=utf-8');
    res.end(bytes);
  } catch (error) {
    const status = error?.status || 502;
    // Never log token, body, account identifiers, or QR information.
    return respond(res, status, { error: status === 413 ? 'BODY_TOO_LARGE' : 'UPSTREAM_TEMPORARILY_UNAVAILABLE' });
  }
}).listen(PORT, '0.0.0.0', () => {
  console.log('Nuvexa preview API relay ready on port', PORT);
});
