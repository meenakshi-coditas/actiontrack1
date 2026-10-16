'use strict';

const STOP = new Set(['the', 'a', 'an', 'to', 'of', 'and', 'please']);

function tokens(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((t) => t && !STOP.has(t));
}

function normalizeTask(s) { return tokens(s).join(' '); }

function jaccard(a, b) {
  const A = new Set(tokens(a)), B = new Set(tokens(b));
  if (!A.size && !B.size) return 1;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

module.exports = { normalizeTask, jaccard };
