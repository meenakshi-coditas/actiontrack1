'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { startServer } = require('../src/server');
const { openStore } = require('../src/store');
const { tmpDir, makeNotes, note } = require('./helpers');

const PS = 'Priya Sharma <priya@x.com>', PN = 'Priya Nair', RM = 'Rahul Mehta';

async function boot() {
  const dir = tmpDir();
  makeNotes(path.join(dir, 'rel', 'notes'), {
    'a.md': note('2026-09-01', [PS, RM], ['- [ ] Priya to send revised quote by Friday', '- [ ] Rahul to book room by Oct 30', '- [ ] Order cake']),
    'b.md': note('2026-09-08', [PN, RM], ['- [ ] Priya to review contract by Sept 14']),
    'bad.md': '',
  });
  const dbPath = path.join(dir, 'db.json');
  const { server, port, url } = await startServer({ dbPath, port: 0, cwd: dir, today: '2026-10-15' });
  const call = async (method, p, body, headers) => {
    const res = await fetch(url + p, {
      method, headers: Object.assign(body !== undefined ? { 'Content-Type': 'application/json' } : {}, headers),
      body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
    });
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch (_) { /* not json */ }
    return { status: res.status, json, text, headers: res.headers };
  };
  return { dir, dbPath, server, port, url, call, close: () => new Promise((r) => server.close(r)) };
}
const withServer = (fn) => async () => { const s = await boot(); try { await fn(s); } finally { await s.close(); } };

test('AW-01 binds loopback only', withServer(async (s) => {
  assert.equal(s.server.address().address, '127.0.0.1');
}));
test('AW-02 ingest then summary and last report', withServer(async (s) => {
  const r = await s.call('POST', '/api/ingest', { folder: 'rel/notes' });
  assert.equal(r.status, 200);
  assert.equal(r.json.malformed.length, 1);
  const sum = await s.call('GET', '/api/summary');
  assert.equal(sum.json.total, r.json.created);
  assert.equal(sum.json.today, '2026-10-15');
  assert.deepEqual((await s.call('GET', '/api/ingest/last')).json, r.json);
}));
test('AW-03 filtered items', withServer(async (s) => {
  await s.call('POST', '/api/ingest', { folder: 'rel/notes' });
  const r = await s.call('GET', '/api/items?status=overdue&owner=Priya');
  assert.equal(r.status, 200);
  assert.ok(r.json.length >= 1 && r.json.every((i) => i.displayStatus === 'overdue'));
}));
test('AW-04 bad status is 400', withServer(async (s) => {
  const r = await s.call('GET', '/api/items?status=late');
  assert.equal(r.status, 400);
  assert.ok(r.json.error);
}));
test('AW-05 done twice', withServer(async (s) => {
  await s.call('POST', '/api/ingest', { folder: 'rel/notes' });
  const a = await s.call('POST', '/api/items/AT-0001/done', {});
  const b = await s.call('POST', '/api/items/AT-0001/done', {});
  assert.deepEqual([a.status, a.json.already, b.json.already], [200, false, true]);
}));
test('AW-06 unknown id is 404', withServer(async (s) => {
  assert.equal((await s.call('POST', '/api/items/AT-9999/done', {})).status, 404);
}));
test('AW-07 unknown route is 404 JSON', withServer(async (s) => {
  const r = await s.call('GET', '/api/nope');
  assert.equal(r.status, 404);
  assert.ok(r.json.error);
}));
test('AW-08 wrong method is 405', withServer(async (s) => {
  assert.equal((await s.call('DELETE', '/api/items')).status, 405);
}));
test('AW-09 bad / oversized / wrong-type bodies', withServer(async (s) => {
  assert.equal((await s.call('POST', '/api/ingest', '{nope')).status, 400);
  const big = JSON.stringify({ folder: 'x'.repeat(1024 * 1024 + 10) });
  let st;
  try { st = (await s.call('POST', '/api/ingest', big)).status; } catch (e) { st = 413; } // server may reset the socket
  assert.equal(st, 413);
  const r = await s.call('POST', '/api/ingest', '{"folder":"x"}', { 'Content-Type': 'text/plain' });
  assert.equal(r.status, 415);
}));
test('AW-10 static files and content types', withServer(async (s) => {
  const home = await s.call('GET', '/');
  assert.equal(home.status, 200);
  assert.match(home.headers.get('content-type'), /text\/html/);
  assert.match((await s.call('GET', '/app.js')).headers.get('content-type'), /javascript/);
  assert.match((await s.call('GET', '/styles.css')).headers.get('content-type'), /text\/css/);
}));
test('AW-11 path traversal blocked', withServer(async (s) => {
  const pkg = fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8');
  for (const p of ['/..%2f..%2fpackage.json', '/%2e%2e/package.json', '/..%5c..%5cpackage.json', '/%2e%2e%2fsrc%2fcli.js']) {
    const r = await s.call('GET', p);
    assert.ok([400, 403, 404].includes(r.status), `${p} -> ${r.status}`);
    assert.ok(!r.text.includes(pkg.trim().slice(0, 30)), p);
  }
  // raw request bypassing URL normalisation
  const raw = await new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port: s.port, path: '/../package.json', method: 'GET' }, (res) => {
      let t = ''; res.on('data', (d) => { t += d; }); res.on('end', () => resolve({ status: res.statusCode, t }));
    });
    req.end();
  });
  assert.ok([400, 403, 404].includes(raw.status));
}));
test('AW-12 followup preview writes nothing', withServer(async (s) => {
  await s.call('POST', '/api/ingest', { folder: 'rel/notes' });
  const r = await s.call('POST', '/api/followup', { all: true, preview: true });
  assert.equal(r.status, 200);
  assert.ok(r.json.drafts.length >= 1);
  assert.deepEqual([r.json.sent, r.json.preview, r.json.created], [false, true, []]);
  assert.equal(fs.existsSync(path.join(s.dir, 'drafts')), false);
}));
test('AW-13 followup creates .eml', withServer(async (s) => {
  await s.call('POST', '/api/ingest', { folder: 'rel/notes' });
  const r = await s.call('POST', '/api/followup', { owner: 'Priya Sharma' });
  assert.equal(r.status, 200);
  assert.equal(r.json.sent, false);
  assert.ok(fs.existsSync(r.json.created[0].path));
}));
test('AW-14 ambiguous owner is 400', withServer(async (s) => {
  await s.call('POST', '/api/ingest', { folder: 'rel/notes' });
  const r = await s.call('POST', '/api/followup', { owner: 'Priya' });
  assert.equal(r.status, 400);
  assert.match(r.json.error, /Priya Sharma/);
}));
test('AW-15 relative folder resolves against cwd', withServer(async (s) => {
  const r = await s.call('POST', '/api/ingest', { folder: 'rel/notes' });
  assert.equal(r.status, 200);
  assert.equal((await s.call('POST', '/api/ingest', { folder: 'does/not/exist' })).status, 400);
}));
test('AW-16 state is re-read per request', withServer(async (s) => {
  await s.call('POST', '/api/ingest', { folder: 'rel/notes' });
  const store = openStore(s.dbPath);
  store.markDone('AT-0002'); store.save();
  const items = (await s.call('GET', '/api/items')).json;
  assert.equal(items.find((i) => i.id === 'AT-0002').displayStatus, 'done');
}));
test('AW-17 no send endpoint or handler', () => {
  const text = fs.readFileSync(path.join(__dirname, '..', 'src', 'server.js'), 'utf8');
  assert.ok(!/\bsend\w*/i.test(text));
});
test('WF-01 frontend never uses HTML injection APIs', () => {
  const text = fs.readFileSync(path.join(__dirname, '..', 'web', 'app.js'), 'utf8');
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(text));
});
