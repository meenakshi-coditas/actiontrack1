

export function norm(s) {
  return String(s == null ? '' : s)
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/['’`.,]/g, '').replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
const firstTok = (name) => norm(name).split(' ')[0] || '';
export const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || '';

export function buildRoster(people = []) {
  const byName = new Map();
  for (const p of people) {
    const k = norm(p.name);
    if (!k) continue;
    const cur = byName.get(k);
    if (!cur) byName.set(k, { name: p.name.trim(), email: p.email || null });
    else if (!cur.email && p.email) cur.email = p.email;
  }
  return { people: [...byName.values()] };
}

function matchPool(raw, pool) {
  const toks = norm(raw).split(' ');
  let hits;
  if (toks.length === 1) {
    hits = pool.filter((p) => firstTok(p.name) === toks[0]);
  } else {
    hits = pool.filter((p) => norm(p.name) === norm(raw));
    if (!hits.length) {
      const rest = toks.slice(1).join(' ');
      hits = pool.filter((p) => {
        const pt = norm(p.name).split(' ');
        return pt[0] === toks[0] && pt.slice(1).join(' ').startsWith(rest);
      });
    }
  }
  const seen = new Set();
  return hits.filter((p) => { const k = norm(p.name); if (seen.has(k)) return false; seen.add(k); return true; });
}

/** Resolve raw owner text; attendees of the note win over the global roster. Never guesses. */
export function resolveOwner(raw, attendees, roster) {
  if (raw == null || !String(raw).trim()) return { owner: null, status: 'none', candidates: [], email: null };
  const text = String(raw).trim();
  for (const pool of [attendees || [], (roster && roster.people) || []]) {
    const hits = matchPool(text, pool);
    if (hits.length === 1) return { owner: hits[0].name, status: 'resolved', candidates: [], email: hits[0].email || null };
    if (hits.length > 1) return { owner: text, status: 'ambiguous', candidates: hits.map((h) => h.name), email: null };
  }
  return { owner: text, status: 'unknown', candidates: [], email: null };
}

/** Identity key; accepts an Item (ownerStatus) or a resolveOwner result (status). */
export function ownerKey(x) {
  const status = x.ownerStatus || x.status;
  if (!x.owner || status === 'none') return 'n:';
  const k = norm(x.owner);
  if (status === 'ambiguous') return `a:${k}`;
  if (status === 'unknown') return `u:${k}`;
  return `r:${k}`;
}

export function matchesOwnerQuery(item, query) {
  const q = norm(query);
  if (['unassigned', 'none', '-'].includes(q)) return !item.owner;
  if (!item.owner || !q) return false;
  if (q.includes(' ')) return norm(item.owner) === q;
  return firstTok(item.owner) === q;
}



/**
 * Resolve a CLI --owner query against known owner names.
 * Full names match exactly (case/accents/punctuation-insensitive); a single token must match exactly one
 * distinct person's first name, otherwise the query is ambiguous and the caller must ask for a full name.
 */
export function resolveOwnerQuery(query, ownerNames) {
  const q = norm(query);
  if (!q) return { kind: 'invalid' };
  if (['unassigned', 'none', '-'].includes(q)) return { kind: 'unassigned' };
  const uniq = [...new Map(ownerNames.filter(Boolean).map((n) => [norm(n), n])).values()];
  const hits = q.includes(' ')
    ? uniq.filter((n) => norm(n) === q)
    : uniq.filter((n) => firstTok(n) === q);
  if (hits.length === 1) return { kind: 'person', name: hits[0] };
  if (hits.length > 1) return { kind: 'ambiguous', candidates: hits.sort() };
  return { kind: 'unknown' };
}
