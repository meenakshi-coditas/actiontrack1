// Deterministic duplicate detection helpers (see README "Duplicate detection").
const STOP = new Set(['the', 'a', 'an', 'to', 'of', 'and', 'please']);

export function tokens(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((t) => t && !STOP.has(t));
}

/** Whitespace/case/punctuation/stop-word-insensitive key. */
export function normalizeTask(s) { return tokens(s).join(' '); }

export function jaccard(a, b) {
  const A = new Set(tokens(a)), B = new Set(tokens(b));
  if (!A.size && !B.size) return 1;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

export const THRESHOLDS = {
  FUZZY_MERGE: 0.8,      // >= and compatible dates => same task
  POSSIBLE: 0.6,         // >= and < FUZZY_MERGE (or incompatible dates) => keep both, report ambiguity
  ROLLOVER_DAYS: 21,     // identical wording with different due dates merges only if meetings are this close
  GENERIC_TOKENS: 2,     // descriptions this short never merge without equal known due dates
};

const dayGap = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400000;

/**
 * Decide how candidate `c` relates to existing task `t` (both for the SAME owner identity; the caller
 * guarantees that). Returns 'same' | 'possible' | 'different'.
 *   c, t: { description, due, meetingDate }
 */
export function compareTasks(c, t) {
  const nc = normalizeTask(c.description), nt = normalizeTask(t.description);
  if (!nc || !nt) return 'different';
  const bothDue = c.due && t.due;
  const dueEqual = bothDue && c.due === t.due;
  const dueCompatible = !bothDue || dueEqual;
  const generic = nc.split(' ').length <= THRESHOLDS.GENERIC_TOKENS || nt.split(' ').length <= THRESHOLDS.GENERIC_TOKENS;

  if (nc === nt) {
    if (generic) return dueEqual ? 'same' : 'possible';
    if (dueCompatible) return 'same';
    return dayGap(c.meetingDate, t.lastMeeting || t.meetingDate) <= THRESHOLDS.ROLLOVER_DAYS ? 'same' : 'possible';
  }
  const j = jaccard(c.description, t.description);
  if (j >= THRESHOLDS.FUZZY_MERGE && !generic && dueCompatible) return 'same';
  if (j >= THRESHOLDS.POSSIBLE) return 'possible';
  return 'different';
}
