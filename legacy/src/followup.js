'use strict';

const fs = require('fs');
const path = require('path');
const { UsageError } = require('./errors');
const { ownerKey, matchesOwnerQuery, firstName, norm } = require('./owners');
const { statusOf, daysOverdue } = require('./query');

const oneLine = (s) => String(s == null ? '' : s).replace(/[\r\n]+/g, ' ').trim();

function renderLine(item, today) {
  const file = item.sources && item.sources[0] ? item.sources[0].file.split('/').pop() : 'unknown';
  let due = 'no due date';
  if (item.due) {
    due = `due ${item.due}`;
    const n = daysOverdue(item, today);
    if (n > 0) due += `, ${n} day${n === 1 ? '' : 's'} overdue`;
  }
  return `- [${item.id}] ${oneLine(item.task)} (${due}; from ${file})`;
}

function byDue(a, b) {
  if (a.due !== b.due) {
    if (!a.due) return 1;
    if (!b.due) return -1;
    return a.due < b.due ? -1 : 1;
  }
  return a.id < b.id ? -1 : 1;
}

function makeDraft(owner, ownerItems, people, today) {
  const overdue = ownerItems.filter((i) => statusOf(i, today) === 'overdue').sort(byDue);
  const open = ownerItems.filter((i) => statusOf(i, today) === 'open').sort(byDue);
  const person = people.find((p) => norm(p.name) === norm(owner));
  const lines = [`Hi ${firstName(owner)},`, '', 'Following up on your action items from recent meetings. Our records show:', ''];
  if (overdue.length) {
    lines.push(`OVERDUE (${overdue.length})`, ...overdue.map((i) => renderLine(i, today)), '');
  }
  if (open.length) {
    lines.push(`OPEN (${open.length})`, ...open.map((i) => renderLine(i, today)), '');
  }
  lines.push('Could you reply with a status update, or let me know if any item can be closed?', '', 'Thanks');
  return {
    owner,
    to: person && person.email ? person.email : null,
    subject: `Action items follow-up: ${open.length} open, ${overdue.length} overdue`,
    body: lines.join('\n'),
    itemIds: [...overdue, ...open].map((i) => i.id),
    overdue: overdue.length,
    open: open.length,
  };
}

/**
 * Build follow-up drafts (no side effects).
 * opts: { owner?: string, all?: boolean, today: ISO }
 */
function buildFollowups(items, people, opts) {
  const { owner, all, today } = opts;
  if (!owner && !all) throw new UsageError('Specify an owner name or use --all');
  const skipped = [];
  const active = items.filter((i) => i.status !== 'done');
  const groups = new Map();
  for (const it of active) {
    if (!it.owner) continue;
    const k = ownerKey(it);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(it);
  }
  const drafts = [];

  if (all) {
    const unassigned = active.filter((i) => !i.owner).length;
    if (unassigned) skipped.push({ reason: 'unassigned', count: unassigned });
    for (const list of groups.values()) {
      const first = list[0];
      if (first.ownerStatus === 'ambiguous') {
        skipped.push({ reason: 'ambiguous', owner: first.owner, candidates: first.candidates || [], count: list.length });
      } else {
        drafts.push(makeDraft(first.owner, list, people, today));
      }
    }
    drafts.sort((a, b) => a.owner.localeCompare(b.owner));
    return { drafts, skipped };
  }

  if (['unassigned', 'none', '-'].includes(norm(owner))) {
    throw new UsageError('Unassigned items have no recipient and cannot be emailed');
  }
  const matched = new Map(); // ownerKey -> sample item (from ALL items, done included)
  for (const it of items) {
    if (it.owner && matchesOwnerQuery(it, owner) && !matched.has(ownerKey(it))) matched.set(ownerKey(it), it);
  }
  if (matched.size === 0) throw new UsageError(`No owner matches "${owner}"`);
  const samples = [...matched.values()];
  const hasAmbiguous = samples.some((s) => s.ownerStatus === 'ambiguous');
  if (matched.size > 1 || hasAmbiguous) {
    const names = new Set();
    for (const s of samples) {
      if (s.ownerStatus === 'ambiguous') (s.candidates || []).forEach((c) => names.add(c));
      else names.add(s.owner);
    }
    throw new UsageError(`"${owner}" is ambiguous - use a full name: ${[...names].sort().join(', ')}`);
  }
  const key = ownerKey(samples[0]);
  const list = groups.get(key) || [];
  if (!list.length) {
    skipped.push({ reason: 'nothing-open', owner: samples[0].owner });
  } else {
    drafts.push(makeDraft(samples[0].owner, list, people, today));
  }
  return { drafts, skipped };
}

function slugOf(owner) {
  return norm(owner).replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || 'draft';
}

/** Draft sink that writes an unsent .eml message into `dir`. Sinks expose only `write`. */
function fileSink(dir) {
  return {
    write(draft) {
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `followup-${slugOf(draft.owner)}.eml`);
      const headers = [];
      if (draft.to) {
        const display = oneLine(draft.owner).replace(/["<>]/g, '');
        headers.push(`To: "${display}" <${oneLine(draft.to).replace(/[<>\s]/g, '')}>`);
      }
      headers.push(
        `Subject: ${oneLine(draft.subject)}`,
        'X-Unsent: 1',
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
      );
      const text = `${headers.join('\r\n')}\r\n\r\n${draft.body.replace(/\r?\n/g, '\r\n')}\r\n`;
      fs.writeFileSync(file, text, 'utf8');
      return { path: file };
    },
  };
}

function createDrafts(drafts, sink) {
  return drafts.map((d) => Object.assign({ owner: d.owner }, sink.write(d)));
}

module.exports = { buildFollowups, fileSink, createDrafts };
