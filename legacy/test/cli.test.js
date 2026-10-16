'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { main } = require('../src/cli');
const { tmpDir, makeNotes, note, capture } = require('./helpers');

const TODAY = '2026-10-15';
const PS = 'Priya Sharma <priya@x.com>', PN = 'Priya Nair', RM = 'Rahul Mehta';

function env() {
  const dir = tmpDir();
  const notes = makeNotes(path.join(dir, 'notes'), {
    'a.md': note('2026-09-01', [PS, RM], ['- [ ] Priya to send revised quote by Friday', '- [ ] Rahul to book room by Oct 30', '- [ ] Order cake']),
    'b.md': note('2026-09-08', [PN, RM], ['- [ ] Priya to review contract by Sept 14']),
    'bad.md': '',
  });
  const base = ['--db', path.join(dir, 'db.json'), '--today', TODAY];
  const run = async (args, extraEnv) => {
    const io = capture();
    const code = await main([...args, ...base], { stdout: io.stdout, stderr: io.stderr, cwd: dir, env: extraEnv || {} });
    return { code, out: io.out(), err: io.err() };
  };
  return { dir, notes, run, base };
}

test('CL-01 ingest reports malformed, exits 0', async () => {
  const e = env();
  const r = await e.run(['ingest', 'notes']);
  assert.equal(r.code, 0);
  assert.match(r.out, /bad\.md: EMPTY_FILE/);
});
test('CL-02 ingest missing folder', async () => {
  const r = await env().run(['ingest', 'nope']);
  assert.equal(r.code, 2);
  assert.match(r.err, /Folder not found/);
});
test('CL-03 list table', async () => {
  const e = env(); await e.run(['ingest', 'notes']);
  const r = await e.run(['list']);
  assert.equal(r.code, 0);
  assert.match(r.out.split('\n')[0], /^ID\s+STATUS\s+OWNER\s+DUE\s+TASK\s+SOURCE/);
  assert.match(r.out, /overdue/);
});
test('CL-04 list filters', async () => {
  const e = env(); await e.run(['ingest', 'notes']);
  const r = await e.run(['list', '--status', 'overdue', '--owner', 'Priya']);
  assert.ok(r.out.split('\n').filter((l) => /^AT-/.test(l)).length >= 1);
  assert.ok(!/Rahul/.test(r.out));
});
test('CL-05 list --json', async () => {
  const e = env(); await e.run(['ingest', 'notes']);
  const rows = JSON.parse((await e.run(['list', '--json'])).out);
  assert.ok(Array.isArray(rows) && rows.every((x) => x.displayStatus));
});
test('CL-06 due-before', async () => {
  const e = env(); await e.run(['ingest', 'notes']);
  const rows = JSON.parse((await e.run(['list', '--json', '--due-before', '2026-09-12'])).out);
  assert.ok(rows.length >= 1 && rows.every((x) => x.due < '2026-09-12'));
});
test('CL-07 empty db', async () => {
  const r = await env().run(['list']);
  assert.deepEqual([r.code, r.out.trim()], [0, 'No items.']);
});
test('CL-08 done then list done', async () => {
  const e = env(); await e.run(['ingest', 'notes']);
  assert.equal((await e.run(['done', 'AT-0001'])).code, 0);
  assert.match((await e.run(['list', '--status', 'done'])).out, /AT-0001/);
});
test('CL-09 done unknown id exits 1', async () => {
  const e = env(); await e.run(['ingest', 'notes']);
  const r = await e.run(['done', 'AT-9999']);
  assert.equal(r.code, 1);
  assert.match(r.err, /Unknown item id/);
});
test('CL-10 done twice', async () => {
  const e = env(); await e.run(['ingest', 'notes']);
  await e.run(['done', '1']);
  const r = await e.run(['done', '1']);
  assert.equal(r.code, 0);
  assert.match(r.out, /already done/);
});
test('CL-11 followup writes draft, says nothing was sent', async () => {
  const e = env(); await e.run(['ingest', 'notes']);
  const r = await e.run(['followup', 'Priya Sharma']);
  assert.equal(r.code, 0);
  assert.match(r.out, /Nothing was sent/);
  const dir = path.join(e.dir, 'drafts');
  assert.deepEqual(fs.readdirSync(dir), ['followup-priya-sharma.eml']);
});
test('CL-12 followup --all --preview writes nothing', async () => {
  const e = env(); await e.run(['ingest', 'notes']);
  const r = await e.run(['followup', '--all', '--preview']);
  assert.equal(r.code, 0);
  assert.match(r.out, /--- Draft for Rahul Mehta ---/);
  assert.equal(fs.existsSync(path.join(e.dir, 'drafts')), false);
});
test('CL-13 usage errors exit 2 with one-line message', async () => {
  const e = env();
  for (const args of [['list', '--status', 'late'], ['bogus'], ['done'], ['list', '--wat'], ['list', '--due-before', 'x']]) {
    const r = await e.run(args);
    assert.equal(r.code, 2, args.join(' '));
    assert.equal(r.err.trim().split('\n').length, 1, args.join(' '));
    assert.ok(!/\n\s+at /.test(r.err));
  }
});
test('CL-14 real sample notes folder', async () => {
  const dir = tmpDir();
  const base = ['--db', path.join(dir, 'db.json'), '--today', TODAY];
  const io = () => capture();
  const samples = path.join(__dirname, '..', 'notes');
  let c = io();
  assert.equal(await main(['ingest', samples, ...base], { stdout: c.stdout, stderr: c.stderr, cwd: dir, env: {} }), 0);
  assert.match(c.out(), /Files scanned: 32 \| parsed: 26 \| malformed: 6/);
  c = io();
  await main(['ingest', samples, ...base], { stdout: c.stdout, stderr: c.stderr, cwd: dir, env: {} });
  assert.match(c.out(), /new 0, duplicates merged 0/);
});
test('CL-15 env vars respected', async () => {
  const e = env();
  const dbEnv = path.join(e.dir, 'other.json');
  const io = capture();
  await main(['ingest', 'notes'], { stdout: io.stdout, stderr: io.stderr, cwd: e.dir, env: { ACTIONTRACK_DB: dbEnv } });
  assert.ok(fs.existsSync(dbEnv));
  const l = capture();
  await main(['list', '--json'], { stdout: l.stdout, stderr: l.stderr, cwd: e.dir, env: { ACTIONTRACK_DB: dbEnv, ACTIONTRACK_TODAY: '2020-01-01' } });
  assert.ok(JSON.parse(l.out()).every((x) => x.displayStatus !== 'overdue'));
});
test('CL-16 ambiguous followup owner', async () => {
  const e = env(); await e.run(['ingest', 'notes']);
  const r = await e.run(['followup', 'Priya']);
  assert.equal(r.code, 2);
  assert.match(r.err, /Priya Sharma/);
  assert.match(r.err, /Priya Nair/);
});
test('CL-17 help and no args', async () => {
  const io = capture();
  assert.equal(await main(['--help'], { stdout: io.stdout, stderr: io.stderr, cwd: tmpDir(), env: {} }), 0);
  assert.match(io.out(), /Usage:/);
  const io2 = capture();
  assert.equal(await main([], { stdout: io2.stdout, stderr: io2.stderr, cwd: tmpDir(), env: {} }), 2);
});
test('CL-18 corrupt db is a clean error', async () => {
  const e = env();
  fs.writeFileSync(path.join(e.dir, 'db.json'), '{oops');
  const r = await e.run(['list']);
  assert.equal(r.code, 1);
  assert.match(r.err, /^Error: /);
  assert.ok(!/\n\s+at /.test(r.err));
});
test('CL-19 followup --json hands off drafts without writing', async () => {
  const e = env(); await e.run(['ingest', 'notes']);
  const r = await e.run(['followup', '--all', '--json']);
  assert.equal(r.code, 0);
  const j = JSON.parse(r.out);
  assert.equal(j.sent, false);
  assert.ok(j.drafts.length >= 1 && j.drafts.every((d) => d.subject && d.body && Array.isArray(d.itemIds) && 'to' in d));
  assert.equal(fs.existsSync(path.join(e.dir, 'drafts')), false);
});
