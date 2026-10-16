import { UsageError } from './errors.js';
import { isValidISO, diffDays, todayISO } from './dates.js';
import { resolveOwnerQuery, norm } from './owners.js';

export const STATUSES = ['open', 'done', 'overdue'];

/** done | overdue | open. Overdue = not done AND known due date strictly before today. */
export function statusOf(task, today) {
  if (task.status === 'done') return 'done';
  if (task.due && task.due < today) return 'overdue';
  return 'open';
}

export function daysOverdue(task, today) {
  return statusOf(task, today) === 'overdue' ? diffDays(today, task.due) : 0;
}

/**
 * Filters (all optional): owner, status ('open' = not done, incl. overdue; 'done'; 'overdue'), dueBefore
 * (inclusive: due <= date). Tasks without a due date never match overdue or --due-before.
 */
export function listTasks(tasks, filters = {}, today) {
  let status = null;
  if (filters.status != null && filters.status !== '') {
    status = String(filters.status).toLowerCase();
    if (!STATUSES.includes(status)) throw new UsageError(`Invalid --status "${filters.status}" (use open, done or overdue)`);
  }
  const dueBefore = filters.dueBefore != null && filters.dueBefore !== '' ? String(filters.dueBefore) : null;
  if (dueBefore && !isValidISO(dueBefore)) throw new UsageError(`Invalid --due-before "${filters.dueBefore}" (use a real date as YYYY-MM-DD)`);

  let ownerName = null;
  let wantUnassigned = false;
  if (filters.owner != null) {
    const r = resolveOwnerQuery(filters.owner, tasks.filter((t) => t.ownerStatus === 'resolved').map((t) => t.owner));
    if (r.kind === 'invalid') throw new UsageError('--owner needs a non-empty name');
    if (r.kind === 'ambiguous') throw new UsageError(`--owner "${filters.owner}" is ambiguous; use a full name: ${r.candidates.join(', ')}`);
    if (r.kind === 'unassigned') wantUnassigned = true;
    else if (r.kind === 'person') ownerName = r.name;
    else ownerName = filters.owner; // unknown to roster: exact (normalised) match on raw owner text only
  }

  return tasks
    .filter((t) => (wantUnassigned ? !t.owner : ownerName == null || (t.owner && t.ownerStatus !== 'ambiguous' && norm(t.owner) === norm(ownerName))))
    .filter((t) => {
      if (!status) return true;
      const s = statusOf(t, today);
      return status === 'open' ? s !== 'done' : s === status;
    })
    .filter((t) => !dueBefore || (t.due && t.due <= dueBefore))
    .map((t) => ({ ...t, displayStatus: statusOf(t, today), daysOverdue: daysOverdue(t, today) }))
    .sort((a, b) => {
      if (a.due !== b.due) {
        if (!a.due) return 1;
        if (!b.due) return -1;
        return a.due < b.due ? -1 : 1;
      }
      return a.id - b.id;
    });
}

/**
 * "Today" policy: --today flag > ACTIONTRACK_TODAY > current date in ACTIONTRACK_TZ (or system timezone).
 * Tests inject `now` or a fixed today.
 */
export function resolveToday({ today, env = {}, now } = {}) {
  const v = today || env.ACTIONTRACK_TODAY || null;
  if (v) {
    if (!isValidISO(v)) throw new UsageError(`Invalid today value "${v}" (use YYYY-MM-DD)`);
    return v;
  }
  try {
    return todayISO(now || new Date(), env.ACTIONTRACK_TZ || undefined);
  } catch (e) {
    throw new UsageError(e.message);
  }
}
