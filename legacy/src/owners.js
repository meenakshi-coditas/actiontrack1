'use strict';

function norm(s) {
  return String(s == null ? '' : s)
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/['’`.,]/g, '').replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
const firstTok = (name) => norm(name).split(' ')[0] || '';
const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || '';

function buildRoster(people = []) {
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
function resolveOwner(raw, attendees, roster) {
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
function ownerKey(x) {
  const status = x.ownerStatus || x.status;
  if (!x.owner || status === 'none') return 'n:';
  const k = norm(x.owner);
  if (status === 'ambiguous') return `a:${k}`;
  if (status === 'unknown') return `u:${k}`;
  return `r:${k}`;
}

function matchesOwnerQuery(item, query) {
  const q = norm(query);
  if (['unassigned', 'none', '-'].includes(q)) return !item.owner;
  if (!item.owner || !q) return false;
  if (q.includes(' ')) return norm(item.owner) === q;
  return firstTok(item.owner) === q;
}

module.exports = { buildRoster, resolveOwner, ownerKey, matchesOwnerQuery, firstName, norm };
