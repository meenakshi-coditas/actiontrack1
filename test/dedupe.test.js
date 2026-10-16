import test from 'node:test';
import assert from 'node:assert/strict';
import { compareTasks, normalizeTask } from '../src/dedupe.js';
import { memRepo } from './helpers.js';

const cmp = (a, b) => compareTasks(a, b);
const T = (description, due = null, meetingDate = '2026-09-01') => ({ description, due, meetingDate, lastMeeting: meetingDate });

test('normalisation ignores case, punctuation, whitespace and stop words', () => {
  assert.equal(normalizeTask('  Send   THE revised-quote!! '), normalizeTask('send revised quote'));
});

test('identical wording, compatible dates => same', () => {
  assert.equal(cmp(T('Send the revised quote'), T('send revised quote.')), 'same');
  assert.equal(cmp(T('Send the revised quote', '2026-09-10'), T('Send the revised quote', null)), 'same');
});

test('identical wording but different due dates far apart => kept separate (possible)', () => {
  assert.equal(cmp(T('Send the weekly status report', '2026-09-10', '2026-09-01'), T('Send the weekly status report', '2026-11-10', '2026-11-01')), 'possible');
});

test('identical wording, different due dates, close meetings => rollover (same)', () => {
  assert.equal(cmp(T('Send the weekly status report', '2026-09-10', '2026-09-01'), T('Send the weekly status report', '2026-09-17', '2026-09-08')), 'same');
});

test('generic one/two-word descriptions never merge without equal known dates', () => {
  assert.equal(cmp(T('Follow up'), T('follow up')), 'possible');
  assert.equal(cmp(T('Follow up', '2026-09-10'), T('follow up', '2026-09-10')), 'same');
});

test('similar but not identical wording is reported, not merged, when dates conflict', () => {
  assert.equal(cmp(T('Update the staging environment config', '2026-09-10'), T('Update staging environment config file', '2026-10-30')), 'possible');
});

test('unrelated tasks differ', () => {
  assert.equal(cmp(T('Book the demo room'), T('Renew the SSL certificate')), 'different');
});

const cand = (over) => ({
  ownerInfo: { owner: 'Priya Sharma', status: 'resolved', candidates: [] }, ownerMention: 'Priya Sharma',
  description: 'send the revised quote', due: null, dueRaw: null, checked: false,
  file: 'a.md', line: 1, slot: 0, meetingDate: '2026-09-01', original: '', ...over,
});

test('repository: same action across meetings merges and keeps ALL sources', () => {
  const repo = memRepo();
  assert.equal(repo.upsert(cand({})).action, 'created');
  const r = repo.upsert(cand({ file: 'b.md', meetingDate: '2026-09-08', due: '2026-09-12' }));
  assert.equal(r.action, 'merged');
  const tasks = repo.allTasks();
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].sources.length, 2);
  assert.equal(tasks[0].due, '2026-09-12');
  assert.equal(tasks[0].firstMeeting, '2026-09-01');
  assert.equal(tasks[0].lastMeeting, '2026-09-08');
});

test('repository: same wording for different owners is NOT merged', () => {
  const repo = memRepo();
  repo.upsert(cand({}));
  repo.upsert(cand({ file: 'b.md', ownerInfo: { owner: 'Priya Nair', status: 'resolved', candidates: [] } }));
  assert.equal(repo.allTasks().length, 2);
});

test('repository: unassigned task never merges into an owned task', () => {
  const repo = memRepo();
  repo.upsert(cand({}));
  repo.upsert(cand({ file: 'b.md', ownerInfo: { owner: null, status: 'none', candidates: [] }, ownerMention: null }));
  assert.equal(repo.allTasks().length, 2);
});

test('repository: ambiguous similar task is retained and recorded', () => {
  const repo = memRepo();
  repo.upsert(cand({ description: 'send the weekly status report', due: '2026-09-10' }));
  const r = repo.upsert(cand({ file: 'b.md', description: 'send the weekly status report', due: '2026-11-10', meetingDate: '2026-11-01' }));
  assert.equal(r.action, 'created');
  assert.equal(r.possible.length, 1);
  assert.equal(repo.possibleDuplicates().length, 1);
});

test('repository: re-upserting the same source line is a no-op', () => {
  const repo = memRepo();
  repo.upsert(cand({}));
  assert.equal(repo.upsert(cand({})).action, 'unchanged');
  assert.equal(repo.allTasks()[0].sources.length, 1);
});

test('repository: a completed checkbox in a later meeting completes the task', () => {
  const repo = memRepo();
  repo.upsert(cand({}));
  repo.upsert(cand({ file: 'b.md', meetingDate: '2026-09-08', checked: true }));
  const t = repo.allTasks()[0];
  assert.equal(t.status, 'done');
  assert.equal(t.completedBy, 'note');
});
