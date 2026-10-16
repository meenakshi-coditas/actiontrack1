import fs from 'node:fs';
import crypto from 'node:crypto';
import { UsageError } from './errors.js';
import { ownerKey, firstName, norm } from './owners.js';
import { statusOf, daysOverdue } from './query.js';

const EMAIL_RE = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;
export const isEmail = (s) => typeof s === 'string' && s.length <= 254 && EMAIL_RE.test(s);

const oneLine = (s) => String(s ?? '').replace(/[\r\n]+/g, ' ').trim();

/** Load explicit contacts: { "Full Name": "email@host" }. Throws UsageError on a bad file. */
export function loadContacts(file) {
  if (!file) return new Map();
  let data;
  try { data = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')); } catch (e) {
    throw new UsageError(`Cannot read contacts file ${file}: ${e.message}`);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new UsageError(`Contacts file ${file} must be a JSON object of name -> email`);
  const map = new Map();
  for (const [name, email] of Object.entries(data)) {
    if (!isEmail(email)) throw new UsageError(`Contacts file ${file}: invalid email for "${name}"`);
    map.set(norm(name), email.toLowerCase());
  }
  return map;
}

/** Trusted email resolution: explicit contacts first, then addresses written in the notes' attendee lists. */
export function resolveEmail(owner, people, contacts = new Map()) {
  const k = norm(owner);
  if (contacts.has(k)) return { email: contacts.get(k), source: 'contacts' };
  const p = people.find((x) => norm(x.name) === k);
  if (!p || !p.email) return { email: null, reason: 'no-email' };
  if (p.emailConflict) return { email: null, reason: 'email-conflict' };
  if (!isEmail(p.email)) return { email: null, reason: 'invalid-email' };
  return { email: p.email, source: 'notes' };
}

function fileOf(task) { return task.sources[0] ? task.sources[0].file.split('/').pop() : 'unknown'; }

function renderLine(task, today, n) {
  let due = 'no due date';
  if (task.due) {
    due = `due ${task.due}`;
    const d = daysOverdue(task, today);
    if (d > 0) due += `, ${d} day${d === 1 ? '' : 's'} overdue`;
  }
  const src = task.sources[0];
  const more = task.sources.length > 1 ? ` +${task.sources.length - 1} more` : '';
  return `${n}. ${oneLine(task.description)} (${due}; task #${task.id}; from ${fileOf(task)}, meeting ${src ? src.meetingDate : task.firstMeeting}${more})`;
}

const byDue = (a, b) => {
  if (a.due !== b.due) { if (!a.due) return 1; if (!b.due) return -1; return a.due < b.due ? -1 : 1; }
  return a.id - b.id;
};

/** Stable across retries: depends on owner, recipient and the exact set of tasks/due dates, not on today. */
export function fingerprint(owner, to, tasks) {
  const payload = JSON.stringify([norm(owner), to, tasks.map((t) => [t.id, t.due]).sort((a, b) => a[0] - b[0])]);
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 32);
}

function makeDraft(owner, tasks, to, today) {
  const overdue = tasks.filter((t) => statusOf(t, today) === 'overdue').sort(byDue);
  const open = tasks.filter((t) => statusOf(t, today) === 'open').sort(byDue);
  const lines = [`Hi ${firstName(owner)},`, '', 'Following up on your action items from recent meetings:', ''];
  let n = 1;
  if (overdue.length) {
    lines.push(`Overdue (${overdue.length}):`);
    for (const t of overdue) lines.push(renderLine(t, today, n++));
    lines.push('');
  }
  if (open.length) {
    lines.push(`Open (${open.length}):`);
    for (const t of open) lines.push(renderLine(t, today, n++));
    lines.push('');
  }
  lines.push('Could you reply with a short status update, or let me know if any item can be closed?', '', 'Thank you');
  const all = [...overdue, ...open];
  return {
    owner,
    to,
    subject: `Action items follow-up: ${all.length} open${overdue.length ? `, ${overdue.length} overdue` : ''}`,
    body: lines.join('\n'),
    taskIds: all.map((t) => t.id),
    counts: { open: open.length, overdue: overdue.length },
    fingerprint: to ? fingerprint(owner, to, all) : null,
  };
}

/**
 * Pure: group open+overdue tasks by owner and build one draft per identifiable owner.
 * Returns { drafts (with a resolved `to`), unresolved: [{owner, reason, taskIds, candidates?}], unassigned: [taskIds] }.
 * opts: { today, people, contacts?, owner? (single owner, exact/first-name query already resolved by caller) }
 */
export function buildFollowups(tasks, opts) {
  const { today, people, contacts } = opts;
  if (!opts.all && !opts.owner) throw new UsageError('Specify --all or an owner name');
  const active = tasks.filter((t) => t.status !== 'done');
  const groups = new Map();
  const unassigned = [];
  for (const t of active) {
    if (!t.owner) { unassigned.push(t.id); continue; }
    const k = ownerKey(t);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(t);
  }
  const drafts = [];
  const unresolved = [];
  for (const list of groups.values()) {
    const first = list[0];
    if (opts.owner && norm(first.owner) !== norm(opts.owner)) continue;
    const taskIds = list.map((t) => t.id);
    if (first.ownerStatus === 'ambiguous') {
      unresolved.push({ owner: first.owner, reason: 'ambiguous-owner', taskIds, candidates: first.candidates });
      continue;
    }
    const r = resolveEmail(first.owner, people, contacts);
    if (!r.email) { unresolved.push({ owner: first.owner, reason: r.reason, taskIds }); continue; }
    const d = makeDraft(first.owner, list, r.email, today);
    d.toSource = r.source;
    drafts.push(d);
  }
  drafts.sort((a, b) => a.owner.localeCompare(b.owner));
  unresolved.sort((a, b) => a.owner.localeCompare(b.owner));
  return { drafts, unresolved, unassigned };
}
