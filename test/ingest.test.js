import test from 'node:test';
import assert from 'node:assert/strict';
import { ingestFolder } from '../src/ingest.js';
import { UsageError } from '../src/errors.js';
import { memRepo, tmpDir, makeNotes, note, FIXED_NOW } from './helpers.js';

const ingest = (repo, dir) => ingestFolder(repo, dir, { now: FIXED_NOW });
const PEOPLE = ['Priya Sharma <priya.sharma@x.test>', 'Priya Nair <priya.nair@x.test>', 'Rahul Patil <rahul@x.test>'];

test('ingesting the same folder twice is idempotent', () => {
  const dir = makeNotes(tmpDir(), { 'a.md': note('2026-10-14', PEOPLE, ['- [ ] Priya Sharma to send the quote by Friday', '- [x] Rahul Patil to fix the build']) });
  const repo = memRepo();
  const r1 = ingest(repo, dir);
  assert.equal(r1.tasksAdded, 2);
  const before = JSON.stringify(repo.allTasks());
  const r2 = ingest(repo, dir);
  assert.equal(r2.tasksAdded, 0);
  assert.equal(r2.alreadyKnown, 2);
  assert.equal(JSON.stringify(repo.allTasks()), before);
});

test('duplicate action across meetings is merged with both sources kept', () => {
  const dir = makeNotes(tmpDir(), {
    'a.md': note('2026-10-05', PEOPLE, ['- [ ] Rahul Patil to update the test cases']),
    'b.md': note('2026-10-12', PEOPLE, ['- [ ] Rahul Patil to update the test cases']),
  });
  const repo = memRepo();
  const r = ingest(repo, dir);
  assert.equal(r.tasksAdded, 1);
  assert.equal(r.duplicatesDetected, 1);
  assert.deepEqual(repo.allTasks()[0].sources.map((s) => s.file), ['a.md', 'b.md']);
});

test('two attendees with the same first name: full names resolve, bare first name is ambiguous', () => {
  const dir = makeNotes(tmpDir(), { 'a.md': note('2026-10-14', PEOPLE, ['- [ ] Priya Sharma to a one', '- [ ] Priya Nair to b two', '- [ ] Priya to c three']) });
  const repo = memRepo();
  const r = ingest(repo, dir);
  const by = Object.fromEntries(repo.allTasks().map((t) => [t.description, t]));
  assert.equal(by['a one'].ownerStatus, 'resolved');
  assert.equal(by['b two'].owner, 'Priya Nair');
  assert.equal(by['c three'].ownerStatus, 'ambiguous');
  assert.deepEqual(by['c three'].candidates.sort(), ['Priya Nair', 'Priya Sharma']);
  assert.equal(r.ambiguousOwners, 1);
});

test('malformed files are skipped with filename+reason; others still ingest', () => {
  const dir = makeNotes(tmpDir(), {
    'good.md': note('2026-10-14', PEOPLE, ['- [ ] Rahul Patil to ship']),
    'empty.md': '',
    'baddate.md': '---\ndate: 2026-13-45\nattendees: A B\n---\n- [ ] A to b',
    'sub/binary.md': 'x\0y',
    'ignored.txt': 'not markdown',
  });
  const r = ingest(memRepo(), dir);
  assert.equal(r.filesScanned, 4);
  assert.equal(r.filesProcessed, 1);
  assert.deepEqual(r.filesSkipped.map((s) => `${s.file}:${s.reason}`).sort(), ['baddate.md:INVALID_DATE', 'empty.md:EMPTY_FILE', 'sub/binary.md:BINARY_FILE']);
  assert.equal(r.tasksAdded, 1);
});

test('unreadable file is skipped, run continues', () => {
  const dir = makeNotes(tmpDir(), { 'a.md': note('2026-10-14', PEOPLE, ['- [ ] Rahul Patil to ship']), 'b.md': 'x' });
  const r = ingestFolder(memRepo(), dir, { now: FIXED_NOW, readFile: (p) => { if (p.endsWith('b.md')) throw new Error('EACCES'); return note('2026-10-14', PEOPLE, ['- [ ] Rahul Patil to ship']); } });
  assert.equal(r.filesSkipped[0].reason, 'UNREADABLE');
  assert.equal(r.tasksAdded, 1);
});

test('notes with no action items and empty notes are processed/skipped without error', () => {
  const dir = makeNotes(tmpDir(), { 'none.md': note('2026-10-14', PEOPLE, ['Just talk.']) });
  const r = ingest(memRepo(), dir);
  assert.equal(r.filesProcessed, 1);
  assert.equal(r.tasksFound, 0);
});

test('missing owners and missing due dates are stored as null and counted', () => {
  const dir = makeNotes(tmpDir(), { 'a.md': note('2026-10-14', PEOPLE, ['- [ ] Update the runbook']) });
  const repo = memRepo();
  const r = ingest(repo, dir);
  const t = repo.allTasks()[0];
  assert.equal(t.owner, null);
  assert.equal(t.due, null);
  assert.equal(r.unassigned, 1);
  assert.equal(r.noDueDate, 1);
});

test('completed checkbox becomes done with note provenance; source line is preserved', () => {
  const dir = makeNotes(tmpDir(), { 'a.md': note('2026-10-14', PEOPLE, ['- [x] Rahul Patil to fix the build']) });
  const repo = memRepo();
  ingest(repo, dir);
  const t = repo.getTask(1);
  assert.equal(t.status, 'done');
  assert.equal(t.completedBy, 'note');
  assert.equal(t.sources[0].file, 'a.md');
  assert.equal(t.sources[0].line, 7);
  assert.match(t.sources[0].originalText, /fix the build/);
});

test('long file with unusual whitespace', () => {
  const filler = Array.from({ length: 3000 }, (_, i) => `Discussion paragraph ${i}   with   odd\t spacing.`);
  const items = [...filler.slice(0, 1500), '-   [ ]    Rahul Patil   to   ship   the   release   by   2026-10-30  ', ...filler.slice(1500)];
  const dir = makeNotes(tmpDir(), { 'long.md': note('2026-10-14', PEOPLE, items) });
  const repo = memRepo();
  const r = ingest(repo, dir);
  assert.equal(r.tasksAdded, 1);
  const t = repo.allTasks()[0];
  assert.equal(t.description, 'ship the release');
  assert.equal(t.due, '2026-10-30');
  assert.equal(t.sources[0].line, 1507);
});

test('missing folder is a usage error', () => {
  assert.throws(() => ingest(memRepo(), '/definitely/not/here'), UsageError);
});

test('folder path containing spaces works', () => {
  const dir = makeNotes(tmpDir('at with space-'), { 'my notes/a.md': note('2026-10-14', PEOPLE, ['- [ ] Rahul Patil to ship']) });
  assert.equal(ingest(memRepo(), dir).tasksAdded, 1);
});
