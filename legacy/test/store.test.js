'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { openStore } = require('../src/store');
const { StoreError, NotFoundError } = require('../src/errors');
const { normalizeTask, jaccard } = require('../src/dedupe');
const { tmpDir } = require('./helpers');

const info = (owner, status = 'resolved') => ({ owner, status: owner ? status : 'none', candidates: [] });
let line = 0;
function cand(owner, task, due, meeting, extra = {}) {
  return Object.assign({
    ownerInfo: typeof owner === 'object' && owner !== null ? owner : info(owner),
    task, due: due || null, dueRaw: null, checked: false, file: `${meeting}.md`, line: ++line, slot: 0, meetingDate: meeting,
  }, extra);
}
const fresh = () => openStore(path.join(tmpDir(), 'db.json'));

test('ST-01 missing file opens empty and writes nothing', () => {
  const file = path.join(tmpDir(), 'db.json');
  const s = openStore(file);
  assert.equal(s.items().length, 0);
  assert.equal(fs.existsSync(file), false);
});
test('ST-02 corrupt file throws and is untouched', () => {
  const file = path.join(tmpDir(), 'db.json');
  fs.writeFileSync(file, '{not json');
  assert.throws(() => openStore(file), StoreError);
  assert.equal(fs.readFileSync(file, 'utf8'), '{not json');
});
test('ST-03 atomic save round-trips in nested dir', () => {
  const dir = tmpDir();
  const file = path.join(dir, 'a', 'b', 'db.json');
  const s = openStore(file);
  s.upsert(cand('Ana', 'x', null, '2026-09-01'));
  s.save();
  assert.equal(openStore(file).items().length, 1);
  assert.deepEqual(fs.readdirSync(path.dirname(file)).filter((f) => f.endsWith('.tmp')), []);
});
test('ST-04 sequential ids and lookup forms', () => {
  const s = fresh();
  ['a', 'b', 'c'].forEach((t) => s.upsert(cand('Ana', `${t} unique${t}`, null, '2026-09-01')));
  assert.deepEqual(s.items().map((i) => i.id), ['AT-0001', 'AT-0002', 'AT-0003']);
  assert.equal(s.getItem('2').id, 'AT-0002');
  assert.equal(s.getItem('at-2').id, 'AT-0002');
});
test('ST-05 open vs checked creation', () => {
  const s = fresh();
  assert.equal(s.upsert(cand('Ana', 'open thing', null, '2026-09-01')).item.status, 'open');
  const d = s.upsert(cand('Ana', 'done thing', null, '2026-09-01', { checked: true })).item;
  assert.deepEqual([d.status, d.doneBy], ['done', 'note']);
});
test('ST-06 same item across 3 meetings', () => {
  const s = fresh();
  const acts = ['2026-09-01', '2026-09-08', '2026-09-15'].map((d) => s.upsert(cand('Priya Sharma', 'Send revised quote', null, d)).action);
  assert.deepEqual(acts, ['created', 'merged', 'merged']);
  assert.equal(s.items().length, 1);
  assert.equal(s.items()[0].sources.length, 3);
});
test('ST-07 normalisation merges', () => {
  const s = fresh();
  s.upsert(cand('Priya Sharma', 'Send the revised quote.', null, '2026-09-01'));
  assert.equal(s.upsert(cand('Priya Sharma', 'send revised quote', null, '2026-09-08')).action, 'merged');
});
test('ST-08 fuzzy merge, distinct tasks stay apart', () => {
  const s = fresh();
  s.upsert(cand('Priya', 'Book the conference room for demo', null, '2026-09-01'));
  assert.equal(s.upsert(cand('Priya', 'Book conference room for the demo day', null, '2026-09-08')).action, 'merged');
  assert.equal(s.upsert(cand('Priya', 'Book the flights for the offsite', null, '2026-09-08')).action, 'created');
});
test('ST-09 different owners never merge', () => {
  const s = fresh();
  s.upsert(cand('Priya Sharma', 'Send quote', null, '2026-09-01'));
  assert.equal(s.upsert(cand('Priya Nair', 'Send quote', null, '2026-09-01')).action, 'created');
});
test('ST-10 owned vs unassigned do not merge', () => {
  const s = fresh();
  s.upsert(cand('Ana Torres', 'Order cake', null, '2026-09-01'));
  assert.equal(s.upsert(cand(null, 'Order cake', null, '2026-09-01')).action, 'created');
});
test('ST-11 unassigned merges with unassigned', () => {
  const s = fresh();
  s.upsert(cand(null, 'Order cake', null, '2026-09-01'));
  assert.equal(s.upsert(cand(null, 'order cake', null, '2026-09-08')).action, 'merged');
});
test('ST-12 ambiguous vs resolved do not merge', () => {
  const s = fresh();
  s.upsert(cand(info('Priya', 'ambiguous'), 'Send quote', null, '2026-09-01'));
  assert.equal(s.upsert(cand('Priya Sharma', 'Send quote', null, '2026-09-01')).action, 'created');
});
test('ST-13 identical source is unchanged', () => {
  const s = fresh();
  const c = cand('Ana', 'x thing', null, '2026-09-01');
  s.upsert(c);
  assert.equal(s.upsert(Object.assign({}, c)).action, 'unchanged');
  assert.equal(s.items()[0].sources.length, 1);
});
test('ST-14 newest due wins', () => {
  const s = fresh();
  s.upsert(cand('Ana', 'Send report', '2026-09-05', '2026-09-01'));
  const it = s.upsert(cand('Ana', 'Send report', '2026-09-12', '2026-09-08')).item;
  assert.deepEqual([it.due, it.firstMeeting, it.lastMeeting], ['2026-09-12', '2026-09-01', '2026-09-08']);
});
test('ST-15 later meeting without due keeps old due', () => {
  const s = fresh();
  s.upsert(cand('Ana', 'Send report', '2026-09-05', '2026-09-01'));
  assert.equal(s.upsert(cand('Ana', 'Send report', null, '2026-09-08')).item.due, '2026-09-05');
});
test('ST-16 ingest order does not corrupt first/last/due', () => {
  const s = fresh();
  s.upsert(cand('Ana', 'Send report', '2026-09-12', '2026-09-08'));
  const it = s.upsert(cand('Ana', 'Send report', '2026-09-05', '2026-09-01')).item;
  assert.deepEqual([it.due, it.firstMeeting, it.lastMeeting], ['2026-09-12', '2026-09-01', '2026-09-08']);
});
test('ST-17 checked later meeting closes item', () => {
  const s = fresh();
  s.upsert(cand('Ana', 'Send report', null, '2026-09-01'));
  const it = s.upsert(cand('Ana', 'Send report', null, '2026-09-08', { checked: true })).item;
  assert.deepEqual([it.status, it.doneBy], ['done', 'note']);
});
test('ST-18 markDone is idempotent', () => {
  const s = fresh();
  s.upsert(cand('Ana', 'Send report', null, '2026-09-01'));
  const a = s.markDone('AT-0001');
  const at = a.item.doneAt;
  const b = s.markDone('1');
  assert.deepEqual([a.already, b.already, b.item.doneAt], [false, true, at]);
});
test('ST-19 markDone unknown id', () => {
  assert.throws(() => fresh().markDone('AT-9999'), NotFoundError);
});
test('ST-20 done is sticky', () => {
  const s = fresh();
  s.upsert(cand('Ana', 'Send report', null, '2026-09-01'));
  s.markDone('1');
  assert.equal(s.upsert(cand('Ana', 'Send report', null, '2026-09-15')).item.status, 'done');
});
test('ST-21 addPeople fills email once', () => {
  const s = fresh();
  s.addPeople([{ name: 'Priya Sharma', email: null }]);
  s.addPeople([{ name: 'priya sharma', email: 'p@x.com' }, { name: 'Priya Sharma', email: 'other@x.com' }]);
  assert.deepEqual(s.people(), [{ name: 'Priya Sharma', email: 'p@x.com' }]);
});
test('ST-22 reports capped at 20', () => {
  const s = fresh();
  for (let i = 0; i < 25; i++) s.addReport({ n: i });
  assert.equal(s.reports().length, 20);
  assert.equal(s.reports()[19].n, 24);
});
test('ST-23 dedupe helpers', () => {
  assert.equal(normalizeTask('Send the Revised, Quote!'), 'send revised quote');
  assert.equal(jaccard('a b c', 'a b c'), 1);
  assert.equal(jaccard('alpha', 'beta'), 0);
});
