'use strict';

const fs = require('fs');
const path = require('path');
const { UsageError } = require('./errors');
const { parseNote } = require('./parser');
const { buildRoster, resolveOwner } = require('./owners');

function listMarkdown(dir, rel, out) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const e of entries) {
    const relPath = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) listMarkdown(path.join(dir, e.name), relPath, out);
    else if (e.isFile() && /\.md$/i.test(e.name)) out.push(relPath);
  }
  return out;
}

/**
 * Ingest every .md note under `folder` into `store`. Malformed notes are skipped and reported.
 * opts.readFile / opts.now are injectable for tests.
 */
function ingestFolder(store, folder, opts = {}) {
  const readFile = opts.readFile || ((p) => fs.readFileSync(p, 'utf8'));
  const root = path.resolve(folder);
  let stat;
  try { stat = fs.statSync(root); } catch (_) { stat = null; }
  if (!stat || !stat.isDirectory()) throw new UsageError(`Folder not found or not a directory: ${folder}`);

  const files = listMarkdown(root, '', []);
  const report = {
    folder: root, at: (opts.now || new Date()).toISOString(), filesScanned: files.length, parsed: 0,
    malformed: [], itemsFound: 0, created: 0, merged: 0, unchanged: 0, unassigned: 0, noDue: 0,
    ambiguousOwners: 0, unknownOwners: 0, warnings: [],
  };

  // Pass 1: read + parse
  const notes = [];
  for (const rel of files) {
    let text;
    try { text = readFile(path.join(root, rel)); } catch (e) {
      report.malformed.push({ file: rel, reason: 'UNREADABLE', detail: e.message });
      continue;
    }
    const res = parseNote(text, rel);
    if (!res.ok) { report.malformed.push({ file: rel, reason: res.reason, detail: res.detail }); continue; }
    report.parsed++;
    for (const w of res.warnings) report.warnings.push({ file: rel, message: w });
    notes.push(res.note);
  }

  // Roster from ALL valid notes before any owner is resolved
  const everyone = notes.flatMap((n) => n.attendees);
  store.addPeople(everyone);
  const roster = buildRoster(store.people());

  // Pass 2: chronological upsert
  notes.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
  const ambiguous = new Set();
  const unknown = new Set();
  for (const note of notes) {
    for (const raw of note.items) {
      report.itemsFound++;
      if (!raw.ownerRaw) report.unassigned++;
      if (!raw.due) report.noDue++;
      const ownerInfo = resolveOwner(raw.ownerRaw, note.attendees, roster);
      if (ownerInfo.status === 'ambiguous') ambiguous.add(ownerInfo.owner.toLowerCase());
      if (ownerInfo.status === 'unknown') unknown.add(ownerInfo.owner.toLowerCase());
      const { action } = store.upsert({
        ownerInfo, task: raw.task, due: raw.due, dueRaw: raw.dueRaw, checked: raw.checked,
        file: note.file, line: raw.line, slot: raw.slot, meetingDate: note.date,
      });
      report[action]++;
    }
  }
  report.ambiguousOwners = ambiguous.size;
  report.unknownOwners = unknown.size;

  store.addReport(report);
  store.save();
  return report;
}

module.exports = { ingestFolder };
