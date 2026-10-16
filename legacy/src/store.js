'use strict';

const fs = require('fs');
const path = require('path');
const { NotFoundError, StoreError } = require('./errors');
const { ownerKey, norm } = require('./owners');
const { normalizeTask, jaccard } = require('./dedupe');

const FUZZY_THRESHOLD = 0.8;
const MAX_REPORTS = 20;

function emptyDb() { return { version: 1, nextId: 1, items: [], people: [], ingests: [] }; }

class Store {
  constructor(file, db) { this.file = file; this.db = db; }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.db, null, 2));
    fs.renameSync(tmp, this.file);
  }

  items() { return this.db.items; }
  people() { return this.db.people; }
  reports() { return this.db.ingests; }

  getItem(idOrNumber) {
    const m = /^(?:at-)?(\d+)$/i.exec(String(idOrNumber).trim());
    if (!m) return null;
    const id = `AT-${m[1].padStart(4, '0')}`;
    return this.db.items.find((i) => i.id === id) || null;
  }

  addPeople(people) {
    for (const p of people) {
      const key = norm(p.name);
      if (!key) continue;
      const cur = this.db.people.find((x) => norm(x.name) === key);
      if (!cur) this.db.people.push({ name: p.name.trim(), email: p.email || null });
      else if (!cur.email && p.email) cur.email = p.email;
    }
  }

  addReport(report) {
    this.db.ingests.push(report);
    if (this.db.ingests.length > MAX_REPORTS) this.db.ingests.splice(0, this.db.ingests.length - MAX_REPORTS);
  }

  markDone(idOrNumber) {
    const item = this.getItem(idOrNumber);
    if (!item) throw new NotFoundError(`Unknown item id: ${idOrNumber}`);
    if (item.status === 'done') return { item, already: true };
    item.status = 'done';
    item.doneAt = new Date().toISOString();
    item.doneBy = 'cli';
    return { item, already: false };
  }

  /** candidate: { ownerInfo, task, due, dueRaw, checked, file, line, slot, meetingDate } */
  upsert(c) {
    const slot = c.slot || 0;
    const known = this.db.items.find((it) =>
      it.sources.some((s) => s.file === c.file && s.line === c.line && (s.slot || 0) === slot));
    if (known) return { action: 'unchanged', item: known };

    const source = { file: c.file, line: c.line, slot, meetingDate: c.meetingDate, checked: !!c.checked };
    const key = ownerKey(c.ownerInfo);
    const nt = normalizeTask(c.task);
    let match = null;
    if (nt) {
      const sameOwner = this.db.items.filter((it) => ownerKey(it) === key);
      match = sameOwner.find((it) => normalizeTask(it.task) === nt)
        || sameOwner.find((it) => jaccard(it.task, c.task) >= FUZZY_THRESHOLD)
        || null;
    }

    if (match) {
      const newest = c.meetingDate >= match.lastMeeting;
      match.sources.push(source);
      if (c.meetingDate < match.firstMeeting) match.firstMeeting = c.meetingDate;
      if (newest) match.lastMeeting = c.meetingDate;
      if (newest && c.due) { match.due = c.due; match.dueRaw = null; }
      else if (!match.due && !c.due && c.dueRaw && !match.dueRaw) match.dueRaw = c.dueRaw;
      if (c.checked && match.status === 'open') {
        match.status = 'done'; match.doneBy = 'note'; match.doneAt = c.meetingDate;
      }
      return { action: 'merged', item: match };
    }

    const id = `AT-${String(this.db.nextId++).padStart(4, '0')}`;
    const item = {
      id,
      owner: c.ownerInfo.owner,
      ownerStatus: c.ownerInfo.status,
      candidates: c.ownerInfo.candidates || [],
      task: c.task,
      due: c.due || null,
      dueRaw: c.due ? null : (c.dueRaw || null),
      status: c.checked ? 'done' : 'open',
      doneAt: c.checked ? c.meetingDate : null,
      doneBy: c.checked ? 'note' : null,
      firstMeeting: c.meetingDate,
      lastMeeting: c.meetingDate,
      sources: [source],
    };
    this.db.items.push(item);
    return { action: 'created', item };
  }
}

function openStore(file) {
  let db = emptyDb();
  if (fs.existsSync(file)) {
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      throw new StoreError(`Database file is corrupt and was left untouched: ${file} (${e.message})`);
    }
    if (!parsed || !Array.isArray(parsed.items) || !Array.isArray(parsed.people) || !Array.isArray(parsed.ingests)) {
      throw new StoreError(`Database file has an unexpected shape and was left untouched: ${file}`);
    }
    db = Object.assign(emptyDb(), parsed);
  }
  return new Store(file, db);
}

module.exports = { openStore, Store };
