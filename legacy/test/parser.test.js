'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseNote } = require('../src/parser');

const HEAD = '---\ndate: 2026-09-07\ntitle: Sync\nattendees: Priya Sharma, Rahul Mehta, Ana Torres\n---\n';
const parse = (items, head = HEAD) => parseNote(`${head}${items}`, 'n.md');
const one = (line) => { const r = parse(line); assert.equal(r.ok, true); return r.note.items; };

test('PR-01 front matter note', () => {
  const r = parse('- [ ] Priya to send the quote');
  assert.equal(r.ok, true);
  assert.equal(r.note.date, '2026-09-07');
  assert.equal(r.note.title, 'Sync');
  assert.deepEqual(r.note.attendees.map((a) => a.name), ['Priya Sharma', 'Rahul Mehta', 'Ana Torres']);
});
test('PR-02 bare header lines', () => {
  const r = parseNote('Date: 2026-09-07\nAttendees: Priya Sharma, Rahul\n\n- [ ] Priya to go', 'n.md');
  assert.equal(r.ok, true);
  assert.equal(r.note.items.length, 1);
});
test('PR-03 bracket list and emails', () => {
  const r = parseNote('---\ndate: 2026-09-07\nattendees: [Priya Sharma, Rahul <r@x.com>]\n---\n', 'n.md');
  assert.equal(r.ok, true);
  assert.deepEqual(r.note.attendees, [{ name: 'Priya Sharma', email: null }, { name: 'Rahul', email: 'r@x.com' }]);
});
test('PR-04 empty file', () => {
  assert.equal(parseNote('', 'n.md').reason, 'EMPTY_FILE');
  assert.equal(parseNote('   \n', 'n.md').reason, 'EMPTY_FILE');
});
test('PR-05 binary file', () => assert.equal(parseNote('abc\0def', 'n.md').reason, 'BINARY_FILE'));
test('PR-06 unclosed front matter', () => {
  assert.equal(parseNote('---\ndate: 2026-09-01\nattendees: A B', 'n.md').reason, 'UNCLOSED_FRONT_MATTER');
});
test('PR-07 missing date', () => {
  assert.equal(parseNote('---\nattendees: A B\n---\n', 'n.md').reason, 'MISSING_DATE');
});
test('PR-08 invalid date', () => {
  assert.equal(parseNote('---\ndate: 2026-13-45\nattendees: A B\n---\n', 'n.md').reason, 'INVALID_DATE');
});
test('PR-09 missing attendees', () => {
  assert.equal(parseNote('---\ndate: 2026-09-07\n---\n', 'n.md').reason, 'MISSING_ATTENDEES');
  assert.equal(parseNote('---\ndate: 2026-09-07\nattendees:\n---\n', 'n.md').reason, 'MISSING_ATTENDEES');
});
test('PR-10 checkbox variants and checked flag', () => {
  const items = one('- [ ] A one\n* [x] B two\n-[ ]C three\n  - [X] D four');
  assert.equal(items.length, 4);
  assert.deepEqual(items.map((i) => i.checked), [false, true, false, true]);
});
test('PR-11 fenced code and plain bullets ignored', () => {
  const items = one('```\n- [ ] Priya to hide\n```\n- Priya to plain bullet\n- [ ] Ana to real');
  assert.equal(items.length, 1);
  assert.equal(items[0].ownerRaw, 'Ana');
});
test('PR-12 owner forms', () => {
  for (const l of ['Priya to send the quote', 'Priya will send the quote', 'Priya: send the quote',
    'Priya - send the quote', '@Priya send the quote']) {
    const [it] = one(`- [ ] ${l}`);
    assert.equal(it.ownerRaw, 'Priya', l);
    assert.equal(it.task, 'send the quote', l);
  }
});
test('PR-13 full-name owner with needs to', () => {
  const [it] = one('- [ ] Priya Sharma needs to book room');
  assert.equal(it.ownerRaw, 'Priya Sharma');
  assert.equal(it.task, 'book room');
});
test('PR-14 non-person subjects', () => {
  for (const l of ['Team to review', 'We should fix', 'TBD: call vendor', 'Someone to email']) {
    assert.equal(one(`- [ ] ${l}`)[0].ownerRaw, null, l);
  }
});
test('PR-15 imperative verbs are not owners', () => {
  for (const l of ['Update to the policy doc is needed', 'Follow up to client']) {
    const [it] = one(`- [ ] ${l}`);
    assert.equal(it.ownerRaw, null, l);
    assert.equal(it.task, l);
  }
});
test('PR-16 multiple owners', () => {
  const items = one('- [ ] Priya and Rahul to prep demo');
  assert.equal(items.length, 2);
  assert.deepEqual(items.map((i) => [i.slot, i.ownerRaw]), [[0, 'Priya'], [1, 'Rahul']]);
});
test('PR-17 by Friday', () => {
  const [it] = one('- [ ] Priya to send quote by Friday');
  assert.equal(it.due, '2026-09-11');
  assert.equal(it.task, 'send quote');
});
test('PR-18 parenthesised due', () => {
  const [it] = one('- [ ] Priya to send quote (due Sept 20)');
  assert.equal(it.due, '2026-09-20');
  assert.equal(it.task, 'send quote');
});
test('PR-19 "by hand" stays in the task', () => {
  const [it] = one('- [ ] Rahul to fix it by hand');
  assert.equal(it.due, null);
  assert.equal(it.task, 'fix it by hand');
});
test('PR-20 unresolved due keyword', () => {
  const r = parse('- [ ] Rahul to fix it due someday');
  const [it] = r.note.items;
  assert.equal(it.due, null);
  assert.equal(it.dueRaw, 'someday');
  assert.ok(r.warnings.length >= 1);
});
test('PR-21 before ISO date', () => {
  const [it] = one('- [ ] Ana to send report, before 2026-09-30');
  assert.equal(it.due, '2026-09-30');
  assert.equal(it.task, 'send report');
});
test('PR-22 CRLF and BOM', () => {
  const text = `﻿${HEAD}- [ ] Priya to send the quote\n`.replace(/\n/g, '\r\n');
  const r = parseNote(text, 'n.md');
  assert.equal(r.ok, true);
  assert.equal(r.note.items[0].task, 'send the quote');
});
test('PR-23 empty item skipped with warning', () => {
  const r = parse('- [ ]   \n- [ ] Ana to go');
  assert.equal(r.note.items.length, 1);
  assert.ok(r.warnings.some((w) => /empty/.test(w)));
});
test('PR-24 line numbers', () => {
  const r = parse('\n\n- [ ] A first\n\n\n- [ ] B second');
  assert.deepEqual(r.note.items.map((i) => i.line), [8, 11]);
});
test('PR-25 no owner', () => {
  const [it] = one('- [ ] Order cake for Friday');
  assert.equal(it.ownerRaw, null);
  assert.equal(it.task, 'Order cake for Friday');
});
