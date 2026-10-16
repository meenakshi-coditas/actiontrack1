import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../src/cli.js';
import { buildFollowups, resolveEmail } from '../src/followup.js';
import { createDrafts, buildCreateDraftArgs, recordExternalResults } from '../src/gmail.js';
import { IntegrationError } from '../src/errors.js';
import { memRepo, tmpDir, makeNotes, note, capture, mockGateway, FIXED_NOW } from './helpers.js';

const TODAY = '2026-10-15';
const people = [
  { name: 'Priya Sharma', email: 'priya@x.test', emailConflict: false },
  { name: 'Rahul Patil', email: null, emailConflict: false },
  { name: 'Ana Torres', email: 'ana@x.test', emailConflict: true },
];
const task = (id, owner, due, over = {}) => ({
  id, owner, ownerStatus: owner ? 'resolved' : 'none', candidates: [], description: `do thing ${id}`, due, dueRaw: null,
  status: 'open', firstMeeting: '2026-10-01', lastMeeting: '2026-10-01',
  sources: [{ file: 'a.md', line: id, slot: 0, meetingDate: '2026-10-01' }], ...over,
});

test('groups by owner; one draft per identifiable owner; no empty drafts', () => {
  const tasks = [
    task(1, 'Priya Sharma', '2026-10-01'), task(2, 'Priya Sharma', null), task(3, 'Priya Sharma', '2026-12-01'),
    task(4, 'Priya Sharma', '2026-01-01', { status: 'done' }), task(5, 'Priya Nair', '2026-10-01', { status: 'done' }),
  ];
  const r = buildFollowups(tasks, { today: TODAY, people, all: true });
  assert.equal(r.drafts.length, 1);
  const d = r.drafts[0];
  assert.deepEqual(d.taskIds.sort(), [1, 2, 3]);
  assert.deepEqual(d.counts, { open: 2, overdue: 1 });
  assert.equal(d.to, 'priya@x.test');
  assert.match(d.body, /a\.md, meeting 2026-10-01/);
});

test('unknown due date is never called overdue', () => {
  const d = buildFollowups([task(2, 'Priya Sharma', null)], { today: TODAY, people, all: true }).drafts[0];
  assert.match(d.body, /no due date/);
  assert.doesNotMatch(d.body, /overdue/i);
  assert.doesNotMatch(d.subject, /overdue/i);
});

test('missing / conflicting email and ambiguous owner are reported, never invented', () => {
  const tasks = [
    task(1, 'Rahul Patil', '2026-10-01'), task(2, 'Ana Torres', null), task(3, 'Nobody Known', null),
    task(4, 'Priya', null, { ownerStatus: 'ambiguous', candidates: ['Priya Nair', 'Priya Sharma'] }), task(5, null, null),
  ];
  const r = buildFollowups(tasks, { today: TODAY, people, all: true });
  assert.equal(r.drafts.length, 0);
  assert.deepEqual(Object.fromEntries(r.unresolved.map((u) => [u.owner, u.reason])),
    { 'Ana Torres': 'email-conflict', Priya: 'ambiguous-owner', 'Nobody Known': 'no-email', 'Rahul Patil': 'no-email' });
  assert.deepEqual(r.unassigned, [5]);
});

test('explicit contacts take precedence and can fill gaps', () => {
  const contacts = new Map([['rahul patil', 'rahul@corp.test']]);
  assert.deepEqual(resolveEmail('Rahul Patil', people, contacts), { email: 'rahul@corp.test', source: 'contacts' });
  assert.equal(resolveEmail('Rahul Patil', people).email, null);
});

test('create_draft arguments are validated', () => {
  assert.deepEqual(buildCreateDraftArgs({ owner: 'P', to: 'p@x.test', subject: 'S\nx', body: 'B' }), { to: ['p@x.test'], subject: 'S x', body: 'B' });
  assert.throws(() => buildCreateDraftArgs({ owner: 'P', to: 'not-an-email', subject: 'S', body: 'B' }), IntegrationError);
  assert.throws(() => buildCreateDraftArgs({ owner: 'P', to: 'p@x.test', subject: '', body: 'B' }), IntegrationError);
  assert.throws(() => buildCreateDraftArgs({ owner: 'P', to: 'p@x.test', subject: 'S', body: ' ' }), IntegrationError);
});

const twoDrafts = () => buildFollowups(
  [task(1, 'Priya Sharma', '2026-10-01'), task(2, 'Ana Torres', null)],
  { today: TODAY, people: [people[0], { name: 'Ana Torres', email: 'ana@x.test', emailConflict: false }], all: true },
).drafts;

test('gmail mock: drafts created, ledger prevents duplicates on retry', async () => {
  const repo = memRepo();
  const gw = mockGateway();
  const first = await createDrafts(twoDrafts(), gw, repo);
  assert.deepEqual(first.map((r) => r.status), ['created', 'created']);
  assert.equal(gw.calls.length, 2);
  const second = await createDrafts(twoDrafts(), gw, repo);
  assert.deepEqual(second.map((r) => r.status), ['already_created', 'already_created']);
  assert.equal(gw.calls.length, 2, 'retry must not create duplicate drafts');
});

test('gmail mock: partial failure is reported per draft and retry only repeats the failure', async () => {
  const repo = memRepo();
  const gw = mockGateway({ failFor: ['ana@x.test'] });
  const r = await createDrafts(twoDrafts(), gw, repo);
  assert.deepEqual(r.map((x) => x.status), ['failed', 'created']); // Ana, Priya (sorted)
  assert.match(r[0].error, /mock gmail failure/);
  const gw2 = mockGateway();
  const r2 = await createDrafts(twoDrafts(), gw2, repo);
  assert.deepEqual(r2.map((x) => x.status), ['created', 'already_created']);
  assert.equal(gw2.calls.length, 1);
});

test('gateway returning no id is a failure, not a success', async () => {
  const r = await createDrafts(twoDrafts(), mockGateway({ noId: true }), memRepo());
  assert.ok(r.every((x) => x.status === 'failed'));
});

test('recording drafts created by an external MCP host', () => {
  const repo = memRepo();
  const drafts = twoDrafts();
  const out = recordExternalResults(repo, drafts, [{ fingerprint: drafts[0].fingerprint, draftId: 'abc' }, { fingerprint: 'zzz', draftId: 'q' }]);
  assert.deepEqual(out.map((o) => o.status), ['recorded', 'rejected']);
  assert.equal(repo.findDraft(drafts[0].fingerprint).gmail_draft_id, 'abc');
});

// ---- CLI level -------------------------------------------------------------
const PEOPLE = ['Priya Sharma <priya.sharma@x.test>', 'Rahul Patil'];
function setup() {
  const dir = tmpDir('at fu ');
  makeNotes(dir, { 'notes/a.md': note('2026-10-05', PEOPLE, [
    '- [ ] Priya Sharma to send the revised quote by 2026-10-14', '- [ ] Rahul Patil to update tests', '- [ ] Unowned item',
  ]) });
  const db = path.join(dir, 'x.db');
  const run = async (args, extra = {}) => {
    const io = capture();
    const code = await main([...args, '--db', db, '--today', TODAY], { ...io, cwd: dir, env: {}, now: FIXED_NOW, ...extra });
    return { code, out: io.out(), err: io.err() };
  };
  return { dir, run };
}

test('followup --all --json without a gateway: reviewable preview, nothing claimed as created', async () => {
  const { run, dir } = setup();
  await run(['ingest', 'notes']);
  const r = await run(['followup', '--all', '--json']);
  assert.equal(r.code, 0);
  const j = JSON.parse(r.out);
  assert.equal(j.sent, false);
  assert.equal(j.gmail.attempted, false);
  assert.equal(j.drafts.length, 1);
  assert.equal(j.drafts[0].status, 'pending');
  assert.deepEqual(j.drafts[0].createDraftArguments.to, ['priya.sharma@x.test']);
  assert.deepEqual(j.unresolved.map((u) => [u.owner, u.reason]), [['Rahul Patil', 'no-email']]);
  assert.equal(j.unassignedTaskIds.length, 1);
  assert.ok(fs.existsSync(path.join(dir, 'followup-preview.json')), 'local preview retained');
});

test('followup with injected mock gateway creates drafts once', async () => {
  const { run } = setup();
  await run(['ingest', 'notes']);
  const gateway = mockGateway();
  const a = JSON.parse((await run(['followup', '--all', '--json'], { gateway })).out);
  assert.equal(a.drafts[0].status, 'created');
  assert.equal(gateway.calls.length, 1);
  const b = JSON.parse((await run(['followup', '--all', '--json'], { gateway })).out);
  assert.equal(b.drafts[0].status, 'already_created');
  assert.equal(gateway.calls.length, 1);
});

test('gateway failure -> exit 1, failure reported, preview retained', async () => {
  const { run } = setup();
  await run(['ingest', 'notes']);
  const r = await run(['followup', '--all', '--json'], { gateway: mockGateway({ failFor: ['priya.sharma@x.test'] }) });
  assert.equal(r.code, 1);
  const j = JSON.parse(r.out);
  assert.equal(j.drafts[0].status, 'failed');
  assert.match(r.err, /failed/);
});

test('unloadable gateway module -> clear integration error, exit 1, no false success', async () => {
  const { run } = setup();
  await run(['ingest', 'notes']);
  const r = await run(['followup', '--all', '--json', '--gateway', './does-not-exist.mjs']);
  assert.equal(r.code, 1);
  const j = JSON.parse(r.out);
  assert.match(j.gmail.error, /Cannot load Gmail gateway/);
  assert.ok(j.drafts.every((d) => d.status === 'pending'));
});

test('followup --owner with ambiguous first name is a usage error', async () => {
  const { run } = setup();
  await run(['ingest', 'notes']);
  assert.equal((await run(['followup', '--owner', 'Nobody'])).code, 2);
});

// ---- safety ------------------------------------------------------------------
test('NO send operation exists anywhere in src/ and gateways only expose createDraft', async () => {
  const srcDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
  const forbidden = /send_message|sendMessage|send_email|sendEmail|messages\.send|drafts\.send|\.forward\(|\bforward\b.*tool|mcp__.*send/i;
  for (const f of fs.readdirSync(srcDir)) {
    const text = fs.readFileSync(path.join(srcDir, f), 'utf8');
    assert.doesNotMatch(text, forbidden, `${f} must not reference a send operation`);
  }
  // A gateway that traps every property except createDraft: any attempt to reach another method fails the test.
  const touched = [];
  const calls = [];
  const gw = new Proxy({ createDraft: async (a) => { calls.push(a); return { id: 'd1' }; } }, {
    get(t, k) { if (k !== 'createDraft') touched.push(String(k)); return t[k]; },
  });
  await createDrafts(twoDrafts(), gw, memRepo());
  assert.deepEqual(touched, ['createDraft', 'createDraft', 'createDraft'].slice(0, touched.length));
  assert.ok(touched.every((k) => k === 'createDraft'));
  assert.equal(calls.length, 2);
});
