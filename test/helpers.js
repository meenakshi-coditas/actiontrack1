import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from '../src/db.js';
import { Repository } from '../src/repository.js';

export const FIXED_NOW = new Date('2026-10-15T09:00:00Z');

export const tmpDir = (prefix = 'at-') => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

export function memRepo() {
  return new Repository(openDatabase(':memory:'), () => FIXED_NOW);
}

/** Write { 'rel/name.md': text } into dir. */
export function makeNotes(dir, files) {
  for (const [rel, text] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, text);
  }
  return dir;
}

/** Build a well-formed note. attendees: ['Name <email>', ...] */
export function note(date, attendees, items, title = 'Sync') {
  return `---\ndate: ${date}\ntitle: ${title}\nattendees: ${attendees.join(', ')}\n---\n\n${items.join('\n')}\n`;
}

export function capture() {
  const out = []; const err = [];
  return {
    stdout: { write: (s) => out.push(s) }, stderr: { write: (s) => err.push(s) },
    out: () => out.join(''), err: () => err.join(''),
  };
}

/** Mock Gmail gateway: only createDraft exists. Records calls; `failFor` makes chosen recipients fail. */
export function mockGateway({ failFor = [], noId = false } = {}) {
  const calls = [];
  return {
    calls,
    async createDraft(args) {
      calls.push(args);
      if (failFor.includes(args.to[0])) throw new Error('mock gmail failure');
      return noId ? {} : { id: `draft-${calls.length}`, viewUrl: `https://mail.example/${calls.length}` };
    },
  };
}
