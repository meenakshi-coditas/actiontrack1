import fs from 'node:fs';
import path from 'node:path';
import { UsageError } from './errors.js';
import { parseNote } from './parser.js';
import { buildRoster, resolveOwner } from './owners.js';

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
 * Ingest every .md note under `folder`. A malformed or failing note is skipped and reported;
 * it never aborts the run. Re-ingesting unchanged notes changes nothing (idempotent).
 * opts.readFile / opts.now are injectable for tests.
 */
export function ingestFolder(repo, folder, opts = {}) {
  const readFile = opts.readFile || ((p) => fs.readFileSync(p, 'utf8'));
  const root = path.resolve(folder);
  let stat = null;
  try { stat = fs.statSync(root); } catch { /* reported below */ }
  if (!stat || !stat.isDirectory()) throw new UsageError(`Folder not found or not a directory: ${folder}`);

  const files = listMarkdown(root, '', []);
  const report = {
    folder: root, at: (opts.now || new Date()).toISOString(),
    filesScanned: files.length, filesProcessed: 0, filesSkipped: [],
    tasksFound: 0, tasksAdded: 0, duplicatesDetected: 0, alreadyKnown: 0,
    possibleDuplicates: [], unassigned: 0, noDueDate: 0, ambiguousOwners: 0, unknownOwners: 0,
    warnings: [],
  };

  // Pass 1: read + parse (no DB writes)
  const notes = [];
  for (const rel of files) {
    let text;
    try { text = readFile(path.join(root, rel)); } catch (e) {
      report.filesSkipped.push({ file: rel, reason: 'UNREADABLE', detail: e.message });
      continue;
    }
    const res = parseNote(text, rel);
    if (!res.ok) { report.filesSkipped.push({ file: rel, reason: res.reason, detail: res.detail }); continue; }
    for (const w of res.warnings) report.warnings.push({ file: rel, message: w });
    notes.push(res.note);
  }

  // Roster from ALL valid notes before any owner is resolved
  repo.transaction(() => repo.addPeople(notes.flatMap((n) => n.attendees)));
  const roster = buildRoster(repo.people());

  // Pass 2: chronological upsert, one transaction per note so a failure only skips that note
  notes.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
  const ambiguous = new Set();
  const unknown = new Set();
  for (const note of notes) {
    const local = { tasksFound: 0, tasksAdded: 0, dup: 0, known: 0, unassigned: 0, noDue: 0, possible: [], amb: [], unk: [] };
    try {
      repo.transaction(() => {
        for (const raw of note.items) {
          local.tasksFound++;
          if (!raw.ownerRaw) local.unassigned++;
          if (!raw.due) local.noDue++;
          const ownerInfo = resolveOwner(raw.ownerRaw, note.attendees, roster);
          if (ownerInfo.status === 'ambiguous') local.amb.push(ownerInfo.owner.toLowerCase());
          if (ownerInfo.status === 'unknown') local.unk.push(ownerInfo.owner.toLowerCase());
          const r = repo.upsert({
            ownerInfo, ownerMention: raw.ownerRaw, description: raw.task, due: raw.due, dueRaw: raw.dueRaw,
            checked: raw.checked, file: note.file, line: raw.line, slot: raw.slot, meetingDate: note.date,
            original: raw.original,
          });
          if (r.action === 'created') local.tasksAdded++;
          else if (r.action === 'merged') local.dup++;
          else local.known++;
          for (const p of r.possible) local.possible.push({ taskId: r.taskId, similarTo: p.taskId, similarity: Number(p.similarity.toFixed(2)) });
        }
      });
    } catch (e) {
      report.filesSkipped.push({ file: note.file, reason: 'PROCESSING_ERROR', detail: e.message });
      continue;
    }
    report.filesProcessed++;
    report.tasksFound += local.tasksFound;
    report.tasksAdded += local.tasksAdded;
    report.duplicatesDetected += local.dup;
    report.alreadyKnown += local.known;
    report.unassigned += local.unassigned;
    report.noDueDate += local.noDue;
    report.possibleDuplicates.push(...local.possible);
    local.amb.forEach((x) => ambiguous.add(x));
    local.unk.forEach((x) => unknown.add(x));
  }
  report.ambiguousOwners = ambiguous.size;
  report.unknownOwners = unknown.size;

  repo.addReport(report);
  return report;
}
