import test from 'node:test';
import assert from 'node:assert/strict';
import { listTasks, statusOf, resolveToday } from '../src/query.js';
import { UsageError } from '../src/errors.js';

const mk = (id, owner, due, status = 'open', ownerStatus = owner ? 'resolved' : 'none') => ({
  id, owner, ownerStatus, description: `task ${id}`, due, dueRaw: null, status, sources: [{ file: 'a.md', line: id }],
});
const TODAY = '2026-10-15';
const tasks = [
  mk(1, 'Priya Sharma', '2026-10-14'),               // due yesterday -> overdue
  mk(2, 'Priya Sharma', '2026-10-15'),               // due today -> open, NOT overdue
  mk(3, 'Priya Nair', '2026-10-20'),
  mk(4, 'Rahul Patil', null),                        // no due date -> never overdue
  mk(5, 'Rahul Patil', '2026-09-01', 'done'),        // done, past due -> done not overdue
  mk(6, null, '2026-10-01'),
  mk(7, 'Priya', '2026-10-01', 'open', 'ambiguous'),
];
const ids = (rows) => rows.map((r) => r.id);

test('today vs yesterday: only strictly earlier is overdue', () => {
  assert.equal(statusOf(tasks[0], TODAY), 'overdue');
  assert.equal(statusOf(tasks[1], TODAY), 'open');
  assert.equal(statusOf(tasks[3], TODAY), 'open');
  assert.equal(statusOf(tasks[4], TODAY), 'done');
});

test('status filters: open = not done (includes overdue); overdue; done', () => {
  assert.deepEqual(ids(listTasks(tasks, { status: 'overdue' }, TODAY)), [6, 7, 1]);
  assert.deepEqual(ids(listTasks(tasks, { status: 'done' }, TODAY)), [5]);
  assert.deepEqual(ids(listTasks(tasks, { status: 'open' }, TODAY)).sort(), [1, 2, 3, 4, 6, 7]);
});

test('--due-before is inclusive and ignores undated tasks', () => {
  assert.deepEqual(ids(listTasks(tasks, { dueBefore: '2026-10-15' }, TODAY)), [5, 6, 7, 1, 2]);
  assert.ok(!ids(listTasks(tasks, { dueBefore: '2099-01-01' }, TODAY)).includes(4));
});

test('owner filter: full name exact; shared first name is ambiguous; unique first name ok', () => {
  assert.deepEqual(ids(listTasks(tasks, { owner: 'Priya Sharma' }, TODAY)), [1, 2]);
  assert.deepEqual(ids(listTasks(tasks, { owner: 'priya nair' }, TODAY)), [3]);
  assert.throws(() => listTasks(tasks, { owner: 'Priya' }, TODAY), /ambiguous.*Priya Nair, Priya Sharma/);
  assert.deepEqual(ids(listTasks(tasks, { owner: 'Rahul' }, TODAY)), [5, 4]);
  assert.deepEqual(ids(listTasks(tasks, { owner: 'Nobody Here' }, TODAY)), []);
  assert.deepEqual(ids(listTasks(tasks, { owner: 'unassigned' }, TODAY)), [6]);
});

test('invalid status / date produce clear usage errors', () => {
  assert.throws(() => listTasks(tasks, { status: 'late' }, TODAY), UsageError);
  assert.throws(() => listTasks(tasks, { dueBefore: '2026-02-30' }, TODAY), /YYYY-MM-DD/);
  assert.throws(() => listTasks(tasks, { dueBefore: 'tomorrow' }, TODAY), UsageError);
});

test('resolveToday precedence and validation (injectable clock)', () => {
  const now = new Date('2026-10-14T23:30:00Z');
  assert.equal(resolveToday({ now, env: { ACTIONTRACK_TZ: 'UTC' } }), '2026-10-14');
  assert.equal(resolveToday({ now, env: { ACTIONTRACK_TZ: 'Asia/Kolkata' } }), '2026-10-15');
  assert.equal(resolveToday({ now, env: { ACTIONTRACK_TODAY: '2026-01-01' } }), '2026-01-01');
  assert.equal(resolveToday({ today: '2026-02-02', env: { ACTIONTRACK_TODAY: '2026-01-01' } }), '2026-02-02');
  assert.throws(() => resolveToday({ today: '2026-02-31' }), UsageError);
  assert.throws(() => resolveToday({ now, env: { ACTIONTRACK_TZ: 'Bad/Zone' } }), UsageError);
});
