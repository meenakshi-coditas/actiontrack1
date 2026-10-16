'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

function tmpDir(prefix = 'at-') { return fs.mkdtempSync(path.join(os.tmpdir(), prefix)); }

/** Write { 'rel/name.md': text } into dir. */
function makeNotes(dir, files) {
  for (const [rel, text] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, text);
  }
  return dir;
}

/** Build a well-formed note. */
function note(date, attendees, items, title = 'Sync') {
  return `---\ndate: ${date}\ntitle: ${title}\nattendees: ${attendees.join(', ')}\n---\n\n${items.join('\n')}\n`;
}

/** Captured stdout/stderr for CLI tests. */
function capture() {
  const out = []; const err = [];
  return {
    stdout: { write: (s) => out.push(s) }, stderr: { write: (s) => err.push(s) },
    out: () => out.join(''), err: () => err.join(''),
  };
}

module.exports = { tmpDir, makeNotes, note, capture };
