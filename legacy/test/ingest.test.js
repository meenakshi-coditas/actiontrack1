'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { openStore } = require('../src/store');
const { ingestFolder } = require('../src/ingest');
const { UsageError } = require('../src/errors');
const { tmpDir, makeNotes, note } = require('./helpers');

const store = () => openStore(path.join(tmpDir(), 'db.json'));
const PS = 'Priya Sharma', PN = 'Priya Nair', RM = 'Rahul Mehta';

test('IN-01 recursion and extension filter', () => {
  const dir = makeNotes(tmpDir(), {
    'a.md': note('2026-09-01', [PS], ['- [ ] Priya to a1']),
    'readme.txt': 'ignore me',
    'sub/b.MD': note('2026-09-02', [RM], ['- [ ] Rahul to b1']),
  });
  const s = store();
  const r = ingestFolder(s, dir);
  assert.equal(r.filesScanned, 2);
  assert.ok(s.items().some((i) => i.sources[0].file === 'sub/b.MD'));
});
test('IN-02 chronological processing', () => {
  const dir = makeNotes(tmpDir(), {
    'a-late.md': note('2026-09-20', [RM], ['- [ ] Rahul to late']),
    'z-early.md': note('2026-09-01', [RM], ['- [ ] Rahul to early']),
  });
  const s = store();
  ingestFolder(s, dir);
  assert.equal(s.items().find((i) => i.task === 'early').id, 'AT-0001');
});
test('IN-03 folder-wide ambiguity', () => {
  const dir = makeNotes(tmpDir(), {
    'a.md': note('2026-09-01', [PS, RM], ['- [ ] Rahul to x1']),
    'b.md': note('2026-09-02', [PN], ['- [ ] Priya to y1']),
    'c.md': note('2026-09-03', [RM], ['- [ ] Priya to chase invoice']),
  });
  const s = store();
  ingestFolder(s, dir);
  const it = s.items().find((i) => i.task === 'chase invoice');
  assert.equal(it.ownerStatus, 'ambiguous');
  assert.deepEqual(it.candidates.sort(), [PN, PS]);
});
test('IN-04 malformed notes skipped and reported', () => {
  const dir = makeNotes(tmpDir(), {
    'good.md': note('2026-09-01', [PS], ['- [ ] Priya to ok']),
    'empty.md': '',
    'bad-date.md': '---\ndate: 2026-13-45\nattendees: A B\n---\n',
    'no-att.md': '---\ndate: 2026-09-01\n---\n',
  });
  const r = ingestFolder(store(), dir);
  assert.equal(r.parsed, 1);
  assert.deepEqual(r.malformed.map((m) => [m.file, m.reason]).sort(),
    [['bad-date.md', 'INVALID_DATE'], ['empty.md', 'EMPTY_FILE'], ['no-att.md', 'MISSING_ATTENDEES']]);
  assert.equal(r.created, 1);
});
test('IN-05 unreadable file is reported, not fatal', () => {
  const dir = makeNotes(tmpDir(), {
    'good.md': note('2026-09-01', [PS], ['- [ ] Priya to ok']),
    'locked.md': 'x',
  });
  const readFile = (p) => {
    if (p.endsWith('locked.md')) throw new Error('EACCES');
    return require('fs').readFileSync(p, 'utf8');
  };
  const r = ingestFolder(store(), dir, { readFile });
  assert.equal(r.malformed[0].reason, 'UNREADABLE');
  assert.equal(r.parsed, 1);
});
test('IN-06 missing folder / file path', () => {
  const file = path.join(tmpDir(), 'db.json');
  const s = openStore(file);
  assert.throws(() => ingestFolder(s, path.join(tmpDir(), 'nope')), UsageError);
  const dir = makeNotes(tmpDir(), { 'a.md': 'x' });
  assert.throws(() => ingestFolder(s, path.join(dir, 'a.md')), UsageError);
  assert.equal(require('fs').existsSync(file), false);
});
test('IN-07 empty folder', () => {
  const r = ingestFolder(store(), tmpDir());
  assert.deepEqual([r.filesScanned, r.itemsFound, r.created], [0, 0, 0]);
});
test('IN-08 idempotent re-ingest', () => {
  const dir = makeNotes(tmpDir(), {
    'a.md': note('2026-09-01', [PS], ['- [ ] Priya to a1', '- [ ] Priya to a2']),
    'b.md': note('2026-09-08', [PS], ['- [ ] Priya to a1']),
  });
  const s = store();
  ingestFolder(s, dir);
  const before = JSON.stringify(s.items());
  const r = ingestFolder(s, dir);
  assert.deepEqual([r.created, r.merged, r.unchanged], [0, 0, 3]);
  assert.equal(JSON.stringify(s.items()), before);
});
test('IN-09 report counts', () => {
  const dir = makeNotes(tmpDir(), {
    'a.md': note('2026-09-01', [PS, PN], ['- [ ] Order cake', '- [ ] Priya to ambiguous thing by Friday', '- [ ] Contoso to send contract', '- [ ] Rahul to x']),
  });
  const r = ingestFolder(store(), dir);
  assert.equal(r.itemsFound, 4);
  assert.equal(r.unassigned, 1);
  assert.equal(r.noDue, 3);
  assert.equal(r.ambiguousOwners, 1);
  assert.equal(r.unknownOwners, 2); // Contoso, Rahul (not an attendee, not in roster)
});
test('IN-10 forward-slash relative paths', () => {
  const dir = makeNotes(tmpDir(), { 'x/y/z.md': note('2026-09-01', [PS], ['- [ ] Priya to go']) });
  const s = store();
  ingestFolder(s, dir);
  assert.equal(s.items()[0].sources[0].file, 'x/y/z.md');
});
test('IN-11 parser warnings surfaced', () => {
  const dir = makeNotes(tmpDir(), { 'w.md': note('2026-09-01', [PS], ['- [ ] Priya to fix it due someday']) });
  const r = ingestFolder(store(), dir);
  assert.equal(r.warnings[0].file, 'w.md');
});
test('IN-12 note attendees take precedence over roster ambiguity', () => {
  const dir = makeNotes(tmpDir(), {
    'a.md': note('2026-09-01', [PS], ['- [ ] Priya to only sharma here']),
    'b.md': note('2026-09-02', [PN], ['- [ ] Priya to nair here']),
  });
  const s = store();
  ingestFolder(s, dir);
  assert.equal(s.items().find((i) => i.task === 'only sharma here').owner, PS);
  assert.equal(s.items().find((i) => i.task === 'nair here').owner, PN);
});
test('IN-13 duplicate across three meetings', () => {
  const dir = makeNotes(tmpDir(), {
    '1.md': note('2026-09-01', [PS], ['- [ ] Priya to send revised quote by Friday']),
    '2.md': note('2026-09-08', [PS], ['- [ ] Priya will send the revised quote (due Sept 18)']),
    '3.md': note('2026-09-15', [PS], ['- [ ] Priya: Send revised quote, due 2026-09-25']),
  });
  const s = store();
  const r = ingestFolder(s, dir);
  assert.equal(s.items().length, 1);
  assert.equal(s.items()[0].sources.length, 3);
  assert.equal(s.items()[0].due, '2026-09-25');
  assert.deepEqual([r.created, r.merged], [1, 2]);
});
test('IN-14 report persisted', () => {
  const s = store();
  ingestFolder(s, tmpDir());
  assert.equal(s.reports().length, 1);
});
