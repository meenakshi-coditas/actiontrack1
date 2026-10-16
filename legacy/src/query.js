'use strict';

const { UsageError } = require('./errors');
const { isValidISO, diffDays, todayISO } = require('./dates');
const { matchesOwnerQuery, ownerKey } = require('./owners');

const STATUSES = ['open', 'done', 'overdue'];

function statusOf(item, today) {
  if (item.status === 'done') return 'done';
  if (item.due && item.due < today) return 'overdue';
  return 'open';
}

function daysOverdue(item, today) {
  return statusOf(item, today) === 'overdue' ? diffDays(today, item.due) : 0;
}

function listItems(items, filters = {}, today) {
  let status = null;
  if (filters.status != null && filters.status !== '') {
    status = String(filters.status).toLowerCase();
    if (!STATUSES.includes(status)) throw new UsageError(`Invalid --status "${filters.status}" (use open, done or overdue)`);
  }
  const dueBefore = filters.dueBefore != null && filters.dueBefore !== '' ? String(filters.dueBefore) : null;
  if (dueBefore && !isValidISO(dueBefore)) throw new UsageError(`Invalid --due-before "${dueBefore}" (use YYYY-MM-DD)`);

  return items
    .filter((it) => !filters.owner || matchesOwnerQuery(it, filters.owner))
    .filter((it) => !status || statusOf(it, today) === status)
    .filter((it) => !dueBefore || (it.due && it.due < dueBefore))
    .map((it) => Object.assign({}, it, { displayStatus: statusOf(it, today), daysOverdue: daysOverdue(it, today) }))
    .sort((a, b) => {
      if (a.due !== b.due) {
        if (!a.due) return 1;
        if (!b.due) return -1;
        return a.due < b.due ? -1 : 1;
      }
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
}

function summarize(items, today) {
  const s = { open: 0, overdue: 0, done: 0, unassigned: 0, total: items.length };
  for (const it of items) {
    const st = statusOf(it, today);
    s[st]++;
    if (st !== 'done' && !it.owner) s.unassigned++;
  }
  return s;
}

function ownersSummary(items, today) {
  const rows = new Map();
  for (const it of items) {
    if (!it.owner) continue;
    const k = ownerKey(it);
    if (!rows.has(k)) rows.set(k, { owner: it.owner, ownerStatus: it.ownerStatus, open: 0, overdue: 0, done: 0 });
    rows.get(k)[statusOf(it, today)]++;
  }
  return [...rows.values()].sort((a, b) => a.owner.localeCompare(b.owner));
}

function resolveToday({ today, env, now } = {}) {
  const v = today || (env && env.ACTIONTRACK_TODAY) || null;
  if (v) {
    if (!isValidISO(v)) throw new UsageError(`Invalid today value "${v}" (use YYYY-MM-DD)`);
    return v;
  }
  return todayISO(now || new Date());
}

module.exports = { statusOf, daysOverdue, listItems, summarize, ownersSummary, resolveToday };
