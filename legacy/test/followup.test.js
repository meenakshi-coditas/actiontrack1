'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const followup = require('../src/followup');
const { buildFollowups, fileSink, createDrafts } = followup;
const { UsageError } = require('../src/errors');
const { tmpDir } = require('./helpers');

const TODAY = '2026-09-15';
const mk = (id, owner, due, status, file, extra = {}) => Object.assign({
  id, owner, ownerStatus: owner ? 'resolved' : 'none', candidates: [], task: `Task ${id}`, due, status: status || 'open',
  sources: [{ file: file || 'notes/2026-09-01-sync.md', line: 3 }],
}, extra);
const PEOPLE = [{ name: 'Priya Sharma', email: 'priya@x.com' }, { name: 'Priya Nair', email: null },
  { name: 'Rahul Mehta', email: null }, { name: 'Ana Torres', email: null }];
const ITEMS = [
  mk('AT-0001', 'Priya Sharma', '2026-09-10'),
  mk('AT-0002', 'Priya Sharma', '2026-09-20'),
  mk('AT-0003', 'Priya Sharma', '2026-09-01', 'done'),
  mk('AT-0004', 'Rahul Mehta', null),
  mk('AT-0005', 'Ana Torres', '2026-09-02', 'done'),
  mk('AT-0006', null, null), mk('AT-0007', null, '2026-09-09'),
  mk('AT-0008', 'Priya', '2026-09-30', 'open', null, { ownerStatus: 'ambiguous', candidates: ['Priya Sharma', 'Priya Nair'] }),
  mk('AT-0009', 'Vendor Bob', '2026-09-18', 'open', null, { ownerStatus: 'unknown' }),
  mk('AT-0010', 'Priya Nair', '2026-09-25'),
];
const all = () => buildFollowups(ITEMS, PEOPLE, { all: true, today: TODAY });
const priya = () => all().drafts.find((d) => d.owner === 'Priya Sharma');

test('FU-01 one draft per owner with open work', () => {
  assert.deepEqual(all().drafts.map((d) => d.owner), ['Priya Nair', 'Priya Sharma', 'Rahul Mehta', 'Vendor Bob']);
});
test('FU-02 overdue before open, done absent', () => {
  const b = priya().body;
  assert.ok(b.indexOf('OVERDUE') < b.indexOf('OPEN'));
  assert.ok(!b.includes('AT-0003'));
});
test('FU-03 sorting inside sections', () => {
  const items = [mk('AT-0001', 'Ana', '2026-09-12'), mk('AT-0002', 'Ana', '2026-09-05'), mk('AT-0003', 'Ana', null),
    mk('AT-0004', 'Ana', '2026-09-30'), mk('AT-0005', 'Ana', '2026-09-20')];
  const b = buildFollowups(items, [], { all: true, today: TODAY }).drafts[0].body;
  const pos = ['AT-0002', 'AT-0001', 'AT-0005', 'AT-0004', 'AT-0003'].map((id) => b.indexOf(id));
  assert.deepEqual(pos, [...pos].sort((x, y) => x - y));
});
test('FU-04 overdue line content', () => {
  const line = priya().body.split('\n').find((l) => l.includes('AT-0001'));
  for (const s of ['Task AT-0001', 'due 2026-09-10', '5 days overdue', '2026-09-01-sync.md']) assert.ok(line.includes(s), s);
});
test('FU-05 no due date wording', () => {
  const d = all().drafts.find((x) => x.owner === 'Rahul Mehta');
  assert.ok(d.body.includes('no due date'));
});
test('FU-06 unassigned reported, never emailed', () => {
  const r = all();
  assert.deepEqual(r.skipped.find((s) => s.reason === 'unassigned'), { reason: 'unassigned', count: 2 });
  assert.ok(r.drafts.every((d) => !d.body.includes('AT-0006') && !d.body.includes('AT-0007')));
});
test('FU-07 ambiguous reported, never emailed', () => {
  const s = all().skipped.find((x) => x.reason === 'ambiguous');
  assert.equal(s.owner, 'Priya');
  assert.deepEqual(s.candidates, ['Priya Sharma', 'Priya Nair']);
  assert.ok(all().drafts.every((d) => !d.body.includes('AT-0008')));
});
test('FU-08 ambiguous owner argument errors with candidates', () => {
  assert.throws(() => buildFollowups(ITEMS, PEOPLE, { owner: 'Priya', today: TODAY }),
    (e) => e instanceof UsageError && /Priya Sharma/.test(e.message) && /Priya Nair/.test(e.message));
});
test('FU-09 unknown owner argument', () => {
  assert.throws(() => buildFollowups(ITEMS, PEOPLE, { owner: 'Zed Nobody', today: TODAY }), UsageError);
});
test('FU-10 owner with only done items', () => {
  const r = buildFollowups(ITEMS, PEOPLE, { owner: 'Ana Torres', today: TODAY });
  assert.deepEqual(r.drafts, []);
  assert.equal(r.skipped[0].reason, 'nothing-open');
});
test('FU-11 recipient address', () => {
  assert.equal(priya().to, 'priya@x.com');
  assert.equal(all().drafts.find((d) => d.owner === 'Vendor Bob').to, null);
});
test('FU-12 subject and greeting', () => {
  assert.equal(priya().subject, 'Action items follow-up: 1 open, 1 overdue');
  assert.ok(priya().body.startsWith('Hi Priya,'));
});
test('FU-13 file sink writes unsent .eml with CRLF', () => {
  const dir = tmpDir();
  const [c] = createDrafts([priya()], fileSink(dir));
  const text = fs.readFileSync(c.path, 'utf8');
  assert.match(c.path, /\.eml$/);
  assert.ok(text.includes('X-Unsent: 1') && text.includes('Subject: Action items follow-up'));
  assert.ok(text.includes('\r\n') && !/[^\r]\n/.test(text));
  assert.ok(text.includes('To: "Priya Sharma" <priya@x.com>'));
  const [b] = createDrafts([all().drafts.find((d) => d.owner === 'Vendor Bob')], fileSink(dir));
  assert.ok(!/^To:/m.test(fs.readFileSync(b.path, 'utf8')));
});
test('FU-14 same draft twice overwrites', () => {
  const dir = tmpDir();
  const a = createDrafts([priya()], fileSink(dir))[0].path;
  const b = createDrafts([priya()], fileSink(dir))[0].path;
  assert.equal(a, b);
  assert.equal(fs.readdirSync(dir).length, 1);
});
test('FU-15 no send-like exports', () => {
  assert.deepEqual(Object.keys(followup).filter((k) => /send/i.test(k)), []);
  assert.deepEqual(Object.keys(fileSink(tmpDir())), ['write']);
});
test('FU-16 no mail-sending code anywhere in src', () => {
  const dir = path.join(__dirname, '..', 'src');
  for (const f of fs.readdirSync(dir)) {
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    assert.ok(!/nodemailer|smtp|gmail\.googleapis|messages\/send|sendMail/i.test(text), `${f} mentions mail sending`);
  }
});
test('FU-17 building drafts has no side effects', () => {
  const before = fs.readdirSync(process.cwd()).length;
  all();
  assert.equal(fs.readdirSync(process.cwd()).length, before);
});
test('FU-18 header injection is neutralised', () => {
  const evil = Object.assign({}, priya(), {
    owner: 'Evil\r\nBcc: x@y.z', to: 'a@b.c\r\nBcc: x@y.z', subject: 'Hi\r\nBcc: x@y.z',
  });
  const [c] = createDrafts([evil], fileSink(tmpDir()));
  assert.ok(!/^Bcc:/mi.test(fs.readFileSync(c.path, 'utf8')));
});
test('FU-19 full name works when first name is shared', () => {
  const r = buildFollowups(ITEMS, PEOPLE, { owner: 'Priya Sharma', today: TODAY });
  assert.deepEqual(r.drafts.map((d) => d.owner), ['Priya Sharma']);
});
