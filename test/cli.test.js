import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { main } from '../src/cli.js';
import { tmpDir, makeNotes, note, capture, FIXED_NOW } from './helpers.js';

const PEOPLE = ['Priya Sharma <priya.sharma@x.test>', 'Priya Nair <priya.nair@x.test>', 'Rahul Patil <rahul@x.test>'];

function setup() {
  const dir = tmpDir('at cli ');
  makeNotes(dir, {
    'notes/a.md': note('2026-10-05', PEOPLE, [
      '- [ ] Priya Sharma to send the revised quote by 2026-10-14',
      '- [ ] Rahul Patil to update the test cases by 2026-10-15',
      '- [ ] Priya Nair to write the release notes',
    ]),
  });
  const db = path.join(dir, 'data', 'x.db');
  const run = async (args) => {
    const io = capture();
    const code = await main([...args, '--db', db, '--today', '2026-10-15'], { ...io, cwd: dir, env: {}, now: FIXED_NOW });
    return { code, out: io.out(), err: io.err() };
  };
  return { dir, db, run };
}

test('ingest → list → done flow works end to end (paths with spaces)', async () => {
  const { run } = setup();
  const ing = await run(['ingest', 'notes']);
  assert.equal(ing.code, 0);
  assert.match(ing.out, /added: 3/);

  const all = await run(['list']);
  assert.equal(all.code, 0);
  assert.match(all.out, /ID\s+OWNER\s+TASK\s+DUE\s+STATUS\s+SOURCE/);
  assert.match(all.out, /a\.md:7/);

  const overdue = await run(['list', '--status', 'overdue']);
  assert.match(overdue.out, /send the revised quote/);
  assert.doesNotMatch(overdue.out, /update the test cases/); // due today, not overdue

  const d1 = await run(['done', '1']);
  assert.equal(d1.code, 0);
  assert.match(d1.out, /marked done/);
  const d2 = await run(['done', '1']);
  assert.equal(d2.code, 0);
  assert.match(d2.out, /already done/);

  const done = await run(['list', '--status', 'done', '--json']);
  const rows = JSON.parse(done.out);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 1);
  assert.equal((await run(['list'])).out.trim().split('\n').length, 4); // done did not create a new task
});

test('invalid ids and arguments: exit code 2 (usage) / 1 (not found)', async () => {
  const { run } = setup();
  await run(['ingest', 'notes']);
  for (const bad of ['abc', '0', '-3', '1.5', '1e3', '']) {
    const r = await run(['done', bad]);
    assert.equal(r.code, 2, `done ${JSON.stringify(bad)}`);
    assert.match(r.err, /Invalid task id|needs an id/);
  }
  assert.equal((await run(['done'])).code, 2);
  const missing = await run(['done', '999']);
  assert.equal(missing.code, 1);
  assert.match(missing.err, /No task with id 999/);
  assert.equal((await run(['list', '--status', 'late'])).code, 2);
  assert.equal((await run(['list', '--due-before', '2026-99-99'])).code, 2);
  assert.equal((await run(['list', '--owner', 'Priya'])).code, 2); // ambiguous first name
  assert.equal((await run(['list', '--bogus'])).code, 2);
  assert.equal((await run(['frobnicate'])).code, 2);
  assert.equal((await run(['ingest'])).code, 2);
  assert.equal((await run(['ingest', 'no-such-folder'])).code, 2);
  assert.equal((await run(['followup'])).code, 2);
});

test('list on an empty database shows a helpful message', async () => {
  const { run } = setup();
  const r = await run(['list']);
  assert.equal(r.code, 0);
  assert.match(r.out, /No tasks match/);
});

test('--help prints usage and exits 0', async () => {
  const io = capture();
  assert.equal(await main(['--help'], { ...io, env: {} }), 0);
  assert.match(io.out(), /actiontrack ingest <folder>/);
});

test('list --owner full name and --due-before filters via CLI', async () => {
  const { run } = setup();
  await run(['ingest', 'notes']);
  const o = await run(['list', '--owner', 'Priya Sharma']);
  assert.match(o.out, /Priya Sharma/);
  assert.doesNotMatch(o.out, /Priya Nair/);
  const b = await run(['list', '--due-before', '2026-10-14']);
  assert.match(b.out, /send the revised quote/);
  assert.doesNotMatch(b.out, /test cases/);
});
