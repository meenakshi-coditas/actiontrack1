'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { UsageError, NotFoundError } = require('./errors');
const { openStore } = require('./store');
const { ingestFolder } = require('./ingest');
const { listItems, summarize, ownersSummary, resolveToday } = require('./query');
const { buildFollowups, fileSink, createDrafts } = require('./followup');

const MAX_BODY = 1024 * 1024;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon', '.png': 'image/png',
};

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function respond(res, status, body, headers = {}) {
  const isJson = typeof body !== 'string' && !Buffer.isBuffer(body);
  const payload = isJson ? JSON.stringify(body) : body;
  res.writeHead(status, Object.assign({
    'Content-Type': isJson ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  }, headers));
  res.end(payload);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const type = String(req.headers['content-type'] || '');
    if (!/^application\/json\b/i.test(type)) { req.resume(); return reject(new HttpError(415, 'Content-Type must be application/json')); }
    const chunks = [];
    let size = 0;
    let failed = false;
    req.on('data', (c) => {
      if (failed) return;
      size += c.length;
      if (size > MAX_BODY) { failed = true; reject(new HttpError(413, 'Request body too large')); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (failed) return;
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text.trim()) return resolve({});
      try {
        const parsed = JSON.parse(text);
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
        resolve(parsed);
      } catch (_) { reject(new HttpError(400, 'Request body is not valid JSON object')); }
    });
    req.on('error', reject);
  });
}

function createServer(opts) {
  const cwd = opts.cwd || process.cwd();
  const dbPath = path.resolve(cwd, opts.dbPath);
  const draftsDir = opts.draftsDir || path.join(path.dirname(dbPath), 'drafts');
  const webDir = path.resolve(opts.webDir || path.join(__dirname, '..', 'web'));
  const todayNow = () => resolveToday({ today: opts.today || undefined });

  const routes = [
    ['GET', /^\/api\/summary$/, () => {
      const t = todayNow();
      return Object.assign(summarize(openStore(dbPath).items(), t), { today: t });
    }],
    ['GET', /^\/api\/items$/, (req, res, url) => {
      const q = url.searchParams;
      return listItems(openStore(dbPath).items(),
        { owner: q.get('owner'), status: q.get('status'), dueBefore: q.get('dueBefore') }, todayNow());
    }],
    ['GET', /^\/api\/owners$/, () => ownersSummary(openStore(dbPath).items(), todayNow())],
    ['POST', /^\/api\/items\/([^/]+)\/done$/, (req, res, url, m) => {
      const store = openStore(dbPath);
      const { item, already } = store.markDone(decodeURIComponent(m[1]));
      if (!already) store.save();
      return { item, already };
    }],
    ['POST', /^\/api\/ingest$/, async (req) => {
      const body = await readJson(req);
      if (typeof body.folder !== 'string' || !body.folder.trim()) throw new UsageError('"folder" is required');
      return ingestFolder(openStore(dbPath), path.resolve(cwd, body.folder));
    }],
    ['GET', /^\/api\/ingest\/last$/, () => {
      const reports = openStore(dbPath).reports();
      return reports.length ? reports[reports.length - 1] : null;
    }],
    ['POST', /^\/api\/followup$/, async (req) => {
      const body = await readJson(req);
      if (body.owner != null && typeof body.owner !== 'string') throw new UsageError('"owner" must be a string');
      const store = openStore(dbPath);
      const { drafts, skipped } = buildFollowups(store.items(), store.people(),
        { owner: body.owner || undefined, all: body.all === true, today: todayNow() });
      const preview = body.preview === true;
      const created = preview ? [] : createDrafts(drafts, fileSink(draftsDir));
      return { drafts, skipped, created, preview, sent: false };
    }],
  ];

  function staticFile(req, res, url) {
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed');
    let decoded;
    try { decoded = decodeURIComponent(url.pathname); } catch (_) { throw new HttpError(400, 'Bad path'); }
    if (decoded.includes('\0')) throw new HttpError(400, 'Bad path');
    if (decoded === '/') decoded = '/index.html';
    const full = path.join(webDir, path.normalize(decoded).replace(/^[/\\]+/, ''));
    if (full !== webDir && !full.startsWith(webDir + path.sep)) throw new HttpError(403, 'Forbidden');
    let stat;
    try { stat = fs.statSync(full); } catch (_) { stat = null; }
    if (!stat || !stat.isFile()) throw new HttpError(404, 'Not found');
    const type = MIME[path.extname(full).toLowerCase()] || 'application/octet-stream';
    const headers = { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
    if (type.startsWith('text/html')) headers['Content-Security-Policy'] = "default-src 'self'; style-src 'self'; script-src 'self'";
    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();
    return res.end(fs.readFileSync(full));
  }

  const server = http.createServer(async (req, res) => {
    try {
      const host = String(req.headers.host || '');
      if (!/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(host)) throw new HttpError(403, 'Forbidden host');
      const url = new URL(req.url, 'http://127.0.0.1');
      if (!url.pathname.startsWith('/api/')) return staticFile(req, res, url);

      let pathMatched = false;
      for (const [method, re, handler] of routes) {
        const m = re.exec(url.pathname);
        if (!m) continue;
        pathMatched = true;
        if (method !== req.method) continue;
        const result = await handler(req, res, url, m);
        return respond(res, 200, result === undefined ? null : result);
      }
      throw new HttpError(pathMatched ? 405 : 404, pathMatched ? 'Method not allowed' : 'Not found');
    } catch (e) {
      let status = 500;
      let message = 'Internal server error';
      if (e instanceof HttpError) { status = e.status; message = e.message; }
      else if (e instanceof UsageError) { status = 400; message = e.message; }
      else if (e instanceof NotFoundError) { status = 404; message = e.message; }
      else if (e && e.name === 'StoreError') { message = e.message; }
      return respond(res, status, { error: message });
    }
  });
  return server;
}

function startServer(opts) {
  const server = createServer(opts);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port === undefined ? 3000 : opts.port, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, port, url: `http://127.0.0.1:${port}` });
    });
  });
}

module.exports = { createServer, startServer };
