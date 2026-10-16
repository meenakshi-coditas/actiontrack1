import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNote } from '../src/parser.js';
import { note } from './helpers.js';

const parse = (items, date = '2026-10-14', attendees = ['Priya Sharma', 'Rahul Patil']) =>
  parseNote(note(date, attendees, items), 'n.md');

test('checkbox variants: spacing, bullets, no space after bracket', () => {
  const r = parse([
    '- [ ] Priya Sharma to send the revised quote by Friday.',
    '- [x] Rahul Patil to update the test cases by 2026-10-20.',
    '- [ ]Priya to confirm the deployment date.',
    '*   [X]   Rahul Patil   to   fix   the   build',
  ]);
  assert.equal(r.ok, true);
  const [a, b, c, d] = r.note.items;
  assert.deepEqual([a.ownerRaw, a.task, a.due, a.checked], ['Priya Sharma', 'send the revised quote', '2026-10-16', false]);
  assert.deepEqual([b.ownerRaw, b.task, b.due, b.checked], ['Rahul Patil', 'update the test cases', '2026-10-20', true]);
  assert.deepEqual([c.ownerRaw, c.task, c.due], ['Priya', 'confirm the deployment date', null]);
  assert.equal(d.task, 'fix the build'); // unusual whitespace collapsed
  assert.equal(d.checked, true);
});

test('missing owner and missing due date are not invented', () => {
  const r = parse(['- [ ] Update the runbook']);
  const [i] = r.note.items;
  assert.equal(i.ownerRaw, null);
  assert.equal(i.due, null);
  assert.equal(i.task, 'Update the runbook');
});

test('ambiguous weekday is reported and stored as unknown', () => {
  const r = parse(['- [ ] Priya to send the deck by Wednesday'], '2026-10-14');
  assert.equal(r.note.items[0].due, null);
  assert.match(r.warnings[0], /ambiguous/);
});

test('items inside code fences are ignored', () => {
  const r = parse(['```', '- [ ] Priya to do nothing', '```', '- [ ] Priya to do something']);
  assert.equal(r.note.items.length, 1);
});

test('malformed notes are rejected with a reason', () => {
  assert.equal(parseNote('', 'a.md').reason, 'EMPTY_FILE');
  assert.equal(parseNote('   \n\n', 'a.md').reason, 'EMPTY_FILE');
  assert.equal(parseNote('---\ntitle: x\nattendees: A B\n---\n- [ ] A to b', 'a.md').reason, 'MISSING_DATE');
  assert.equal(parseNote('---\ndate: 2026-13-45\nattendees: A B\n---\n', 'a.md').reason, 'INVALID_DATE');
  assert.equal(parseNote('---\ndate: 2026-02-30\nattendees: A B\n---\n', 'a.md').reason, 'INVALID_DATE');
  assert.equal(parseNote('---\ndate: 2026-10-01\n', 'a.md').reason, 'UNCLOSED_FRONT_MATTER');
  assert.equal(parseNote('---\ndate: 2026-10-01\n---\n- [ ] A to b', 'a.md').reason, 'MISSING_ATTENDEES');
  assert.equal(parseNote('abc\0def', 'a.md').reason, 'BINARY_FILE');
});

test('note without action items parses with zero items', () => {
  const r = parseNote(note('2026-10-14', ['Priya Sharma'], ['Just discussion, no actions.']), 'n.md');
  assert.equal(r.ok, true);
  assert.equal(r.note.items.length, 0);
});

test('CRLF and BOM input is handled', () => {
  const text = '﻿' + note('2026-10-14', ['Priya Sharma'], ['- [ ] Priya to ship it']).replace(/\n/g, '\r\n');
  const r = parseNote(text, 'n.md');
  assert.equal(r.ok, true);
  assert.equal(r.note.items[0].task, 'ship it');
});

test('attendee emails are parsed', () => {
  const r = parseNote(note('2026-10-14', ['Priya Sharma <p@x.test>', 'Rahul Patil'], []), 'n.md');
  assert.deepEqual(r.note.attendees, [{ name: 'Priya Sharma', email: 'p@x.test' }, { name: 'Rahul Patil', email: null }]);
});
