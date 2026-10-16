import { NotFoundError, UsageError } from './errors.js';
import { ownerKey, norm } from './owners.js';
import { compareTasks, jaccard, normalizeTask } from './dedupe.js';

const hydrate = (r) => r && ({
  id: r.id,
  owner: r.owner_name,
  ownerStatus: r.owner_status,
  ownerMention: r.owner_mention,
  candidates: JSON.parse(r.owner_candidates),
  description: r.description,
  due: r.due_date,
  dueRaw: r.due_raw,
  status: r.status,
  completedAt: r.completed_at,
  completedBy: r.completed_by,
  firstMeeting: r.first_meeting,
  lastMeeting: r.last_meeting,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export class Repository {
  constructor(db, clock = () => new Date()) {
    this.db = db;
    this.stamp = () => clock().toISOString();
  }

  // ---- people -------------------------------------------------------------
  addPeople(people) {
    const sel = this.db.prepare('SELECT * FROM people WHERE name_key = ?');
    const ins = this.db.prepare('INSERT INTO people (name, name_key, email) VALUES (?, ?, ?)');
    const upd = this.db.prepare('UPDATE people SET email = ?, email_conflict = ? WHERE id = ?');
    for (const p of people) {
      const key = norm(p.name);
      if (!key) continue;
      const email = p.email ? p.email.trim().toLowerCase() : null;
      const cur = sel.get(key);
      if (!cur) ins.run(p.name.trim(), key, email);
      else if (email && !cur.email) upd.run(email, cur.email_conflict, cur.id);
      else if (email && cur.email && cur.email !== email) upd.run(cur.email, 1, cur.id);
    }
  }

  people() {
    return this.db.prepare('SELECT name, email, email_conflict AS emailConflict FROM people ORDER BY name').all()
      .map((p) => ({ ...p, emailConflict: !!p.emailConflict }));
  }

  // ---- tasks --------------------------------------------------------------
  /** Numeric id only, e.g. "12". Anything else is a usage error. */
  static parseId(raw) {
    const s = String(raw ?? '').trim();
    if (!/^\d+$/.test(s) || !Number.isSafeInteger(Number(s)) || Number(s) < 1) {
      throw new UsageError(`Invalid task id "${raw}" (expected a positive integer)`);
    }
    return Number(s);
  }

  sourcesOf(taskId) {
    return this.db.prepare(
      `SELECT file, line, slot, meeting_date AS meetingDate, checked, original_text AS originalText
         FROM task_sources WHERE task_id = ? ORDER BY meeting_date, file, line, slot`,
    ).all(taskId).map((s) => ({ ...s, checked: !!s.checked }));
  }

  getTask(id) {
    const t = hydrate(this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id));
    if (t) t.sources = this.sourcesOf(id);
    return t || null;
  }

  allTasks() {
    const sources = new Map();
    for (const s of this.db.prepare(
      `SELECT task_id, file, line, slot, meeting_date AS meetingDate, checked
         FROM task_sources ORDER BY meeting_date, file, line, slot`,
    ).all()) {
      if (!sources.has(s.task_id)) sources.set(s.task_id, []);
      sources.get(s.task_id).push({ file: s.file, line: s.line, slot: s.slot, meetingDate: s.meetingDate, checked: !!s.checked });
    }
    return this.db.prepare('SELECT * FROM tasks ORDER BY id').all()
      .map((r) => ({ ...hydrate(r), sources: sources.get(r.id) || [] }));
  }

  markDone(id) {
    const task = this.getTask(id);
    if (!task) throw new NotFoundError(`No task with id ${id}`);
    if (task.status === 'done') return { task, already: true };
    const ts = this.stamp();
    this.db.prepare("UPDATE tasks SET status='done', completed_at=?, completed_by='cli', updated_at=? WHERE id=?").run(ts, ts, id);
    return { task: this.getTask(id), already: false };
  }

  /**
   * candidate: { ownerInfo, ownerMention, description, due, dueRaw, checked, file, line, slot, meetingDate, original }
   * Returns { action: 'created'|'merged'|'unchanged', taskId, possible: [{taskId, similarity}] }
   */
  upsert(c) {
    const slot = c.slot || 0;
    const known = this.db.prepare('SELECT task_id FROM task_sources WHERE file=? AND line=? AND slot=?').get(c.file, c.line, slot);
    if (known) return { action: 'unchanged', taskId: known.task_id, possible: [] };

    const ts = this.stamp();
    const key = ownerKey(c.ownerInfo);
    const same = [];
    const possible = [];
    for (const row of this.db.prepare('SELECT * FROM tasks ORDER BY id').all()) {
      const t = hydrate(row);
      if (ownerKey(t) !== key) continue;
      const verdict = compareTasks(
        { description: c.description, due: c.due, meetingDate: c.meetingDate },
        { description: t.description, due: t.due, lastMeeting: t.lastMeeting },
      );
      if (verdict === 'same') same.push(t);
      else if (verdict === 'possible') possible.push({ taskId: t.id, similarity: jaccard(c.description, t.description) });
    }
    // Prefer an exact normalised match, then the earliest task (deterministic).
    const nc = normalizeTask(c.description);
    const match = same.find((t) => normalizeTask(t.description) === nc) || same[0] || null;

    let taskId;
    let action;
    if (match) {
      taskId = match.id;
      action = 'merged';
      const newest = c.meetingDate >= match.lastMeeting;
      const first = c.meetingDate < match.firstMeeting ? c.meetingDate : match.firstMeeting;
      const last = newest ? c.meetingDate : match.lastMeeting;
      let due = match.due;
      let dueRaw = match.dueRaw;
      if (c.due && (newest || !due)) { due = c.due; dueRaw = null; }
      else if (!due && !c.due && c.dueRaw && !dueRaw) dueRaw = c.dueRaw;
      let { status, completedBy, completedAt } = match;
      if (c.checked && status === 'open') { status = 'done'; completedBy = 'note'; completedAt = c.meetingDate; }
      this.db.prepare(
        'UPDATE tasks SET first_meeting=?, last_meeting=?, due_date=?, due_raw=?, status=?, completed_by=?, completed_at=?, updated_at=? WHERE id=?',
      ).run(first, last, due, dueRaw, status, completedBy, completedAt, ts, taskId);
    } else {
      action = 'created';
      taskId = this.db.prepare(
        `INSERT INTO tasks (owner_name, owner_status, owner_mention, owner_candidates, description, description_key, due_date, due_raw,
           status, completed_at, completed_by, first_meeting, last_meeting, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(
        c.ownerInfo.owner, c.ownerInfo.status, c.ownerMention ?? null, JSON.stringify(c.ownerInfo.candidates || []),
        c.description, nc, c.due || null, c.due ? null : (c.dueRaw || null),
        c.checked ? 'done' : 'open', c.checked ? c.meetingDate : null, c.checked ? 'note' : null,
        c.meetingDate, c.meetingDate, ts, ts,
      ).lastInsertRowid;
    }
    this.db.prepare(
      `INSERT INTO task_sources (task_id, file, line, slot, meeting_date, checked, original_text, ingested_at)
       VALUES (?,?,?,?,?,?,?,?)`,
    ).run(taskId, c.file, c.line, slot, c.meetingDate, c.checked ? 1 : 0, c.original ?? null, ts);

    const ins = this.db.prepare('INSERT OR IGNORE INTO possible_duplicates (task_a, task_b, similarity, detected_at) VALUES (?,?,?,?)');
    const reported = [];
    for (const p of possible) {
      if (p.taskId === taskId) continue;
      const [a, b] = p.taskId < taskId ? [p.taskId, taskId] : [taskId, p.taskId];
      if (ins.run(a, b, p.similarity, ts).changes) reported.push(p);
    }
    return { action, taskId, possible: reported };
  }

  possibleDuplicates() {
    return this.db.prepare('SELECT task_a AS a, task_b AS b, similarity FROM possible_duplicates ORDER BY task_a, task_b').all();
  }

  addReport(report) {
    this.db.prepare('INSERT INTO ingest_runs (started_at, report) VALUES (?, ?)').run(report.at, JSON.stringify(report));
  }

  // ---- follow-up draft ledger --------------------------------------------
  findDraft(fingerprint) {
    return this.db.prepare('SELECT * FROM followup_drafts WHERE fingerprint = ?').get(fingerprint) || null;
  }

  recordDraft({ fingerprint, owner, to, taskIds, draftId }) {
    this.db.prepare(
      'INSERT OR IGNORE INTO followup_drafts (fingerprint, owner_name, to_email, task_ids, gmail_draft_id, created_at) VALUES (?,?,?,?,?,?)',
    ).run(fingerprint, owner, to, JSON.stringify(taskIds), String(draftId), this.stamp());
  }

  transaction(fn) { return this.db.transaction(fn)(); }
  close() { this.db.close(); }
}
