'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { statusOf, daysOverdue, listItems, summarize, ownersSummary, resolveToday } = require('../src/query');
const { UsageError } = require('../src/errors');

const TODAY = '2026-09-15';
const mk = (id, owner, due, status = 'open', ownerStatus = owner ? 'resolved' : 'none') =>
  ({ id, owner, ownerStatus, candidates: [], task: `task ${id}`, due, status, sources: [{ file: 'f.md', line: 1 }] });
const A = mk('AT-0001', 'Priya Sharma', '2026-09-10');
const B = mk('AT-0002', 'Priya Sharma', '2026-09-15');
const C = mk('AT-0003', 'Priya Nair', '2026-09-20');
const D = mk('AT-0004', 'Priya Sharma', null);
const E = mk('AT-0005', 'Ana Torres', '2026-09-01', 'done');
const F = mk('AT-0006', null, '2026-09-12');
const G = mk('AT-0007', 'Rahul Mehta', '2026-09-14');
const ALL = [A, B, C, D, E, F, G];
const ids = (rows) => rows.map((r) => r.id.slice(-1));

test('QY-01 statusOf', () => {
  assert.deepEqual([A, B, C, D, E].map((i) => statusOf(i, TODAY)), ['overdue', 'open', 'open', 'open', 'done']);
});
test('QY-02 yesterday/today/tomorrow', () => {
  assert.deepEqual(['2026-09-14', '2026-09-15', '2026-09-16'].map((d) => statusOf(mk('x', 'A', d), TODAY)),
    ['overdue', 'open', 'open']);
});
test('QY-03 owner filter', () => assert.deepEqual(ids(listItems(ALL, { owner: 'Rahul' }, TODAY)), ['7']));
test('QY-04 AND semantics', () => {
  assert.deepEqual(ids(listItems(ALL, { owner: 'Priya', status: 'overdue' }, TODAY)), ['1']);
});
test('QY-05 overdue filter', () => assert.deepEqual(ids(listItems(ALL, { status: 'overdue' }, TODAY)), ['1', '6', '7']));
test('QY-06 open excludes overdue', () => assert.deepEqual(ids(listItems(ALL, { status: 'open' }, TODAY)), ['2', '3', '4']));
test('QY-07 done filter, case-insensitive', () => assert.deepEqual(ids(listItems(ALL, { status: 'DONE' }, TODAY)), ['5']));
test('QY-08 invalid status', () => assert.throws(() => listItems(ALL, { status: 'late' }, TODAY), UsageError));
test('QY-09 due-before is strict, excludes no-due', () => {
  assert.deepEqual(ids(listItems(ALL, { dueBefore: '2026-09-15' }, TODAY)), ['5', '1', '6', '7']);
});
test('QY-10 invalid due-before', () => assert.throws(() => listItems(ALL, { dueBefore: '15/09/2026' }, TODAY), UsageError));
test('QY-11 sort order', () => assert.deepEqual(ids(listItems(ALL, {}, TODAY)), ['5', '1', '6', '7', '2', '3', '4']));
test('QY-12 summarize', () => {
  assert.deepEqual(summarize(ALL, TODAY), { open: 3, overdue: 3, done: 1, unassigned: 1, total: 7 });
});
test('QY-13 daysOverdue', () => {
  assert.equal(daysOverdue(A, TODAY), 5);
  assert.equal(daysOverdue(B, TODAY), 0);
});
test('QY-14 resolveToday precedence', () => {
  assert.equal(resolveToday({ today: '2026-01-02', env: { ACTIONTRACK_TODAY: '2026-03-04' } }), '2026-01-02');
  assert.equal(resolveToday({ env: { ACTIONTRACK_TODAY: '2026-03-04' } }), '2026-03-04');
  assert.equal(resolveToday({ now: new Date(2026, 4, 6) }), '2026-05-06');
  assert.throws(() => resolveToday({ env: { ACTIONTRACK_TODAY: 'nope' } }), UsageError);
});
test('QY-15 ownersSummary', () => {
  const rows = ownersSummary(ALL, TODAY);
  assert.deepEqual(rows.map((r) => r.owner), ['Ana Torres', 'Priya Nair', 'Priya Sharma', 'Rahul Mehta']);
  assert.deepEqual(rows.find((r) => r.owner === 'Priya Sharma'), { owner: 'Priya Sharma', ownerStatus: 'resolved', open: 2, overdue: 1, done: 0 });
});
test('QY-16 unassigned owner filter', () => assert.deepEqual(ids(listItems(ALL, { owner: 'unassigned' }, TODAY)), ['6']));
