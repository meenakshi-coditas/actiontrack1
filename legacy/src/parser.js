'use strict';

const { resolveDue, isValidISO } = require('./dates');

const NON_PERSON = new Set([
  'team', 'everyone', 'everybody', 'all', 'we', 'someone', 'somebody', 'tbd', 'tbc', 'nobody',
  'unassigned', 'anyone', 'us', 'they', 'group', 'owner tbd', 'i', 'you',
  'note', 'todo', 'action', 'fyi', 'reminder', 'decision', 'followup',
]);
const VERBS = new Set([
  'update', 'follow', 'send', 'review', 'add', 'check', 'set', 'schedule', 'reply', 'move', 'talk',
  'reach', 'confirm', 'finalize', 'finalise', 'prepare', 'create', 'fix', 'call', 'email', 'book',
  'ask', 'share', 'write', 'draft', 'plan', 'ping', 'remind', 'order', 'get', 'make', 'look',
  'investigate', 'test', 'deploy', 'publish', 'merge', 'close', 'open', 'file', 'raise', 'submit',
  'collect', 'compile', 'organise', 'organize', 'clean', 'verify', 'approve', 'sign', 'pay',
]);

const W = "[A-Z][A-Za-z'’.-]*";
const NAME = `${W}(?:\\s+${W}){0,2}`;
const LIST = `${NAME}(?:\\s*(?:,|&|\\band\\b)\\s*${NAME})*`;
const OWNER_VERB = new RegExp(
  `^@?(${LIST})\\s+(?:to|will|should|must|shall|can|needs to|need to|is going to|are going to)\\s+(.+)$`);
const OWNER_COLON = new RegExp(`^@?(${LIST})\\s*(?::|\\s[-–—])\\s+(.+)$`);
const OWNER_AT = /^@([A-Za-z][\w.'-]*)\s+(.+)$/;
const DUE_KW = /\b(due(?:\s+(?:by|on))?:?|by|before|until)\s+/gi;
const CHECKBOX = /^\s*[-*+]\s*\[([ xX])\]\s*(.*)$/;

function reject(reason, detail) { return { ok: false, reason, detail }; }

function parseAttendees(value, extra = []) {
  let v = String(value || '').trim();
  if (v.startsWith('[') && v.endsWith(']')) v = v.slice(1, -1);
  const parts = v.split(/[,;]/).concat(extra);
  const out = [];
  for (let part of parts) {
    part = part.trim().replace(/^["']|["']$/g, '').trim();
    if (!part) continue;
    const m = /^(.*?)\s*<([^>]+)>$/.exec(part);
    const name = (m ? m[1] : part).replace(/^["']|["']$/g, '').trim();
    if (name) out.push({ name, email: m ? m[2].trim() : null });
  }
  return out;
}

function parseDateValue(v) {
  const s = String(v || '').trim().replace(/^["']|["']$/g, '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return isValidISO(s) ? s : null;
  if (/\b\d{4}\b/.test(s)) {
    const iso = resolveDue(s, '2000-01-01');
    if (iso && s.includes(iso.slice(0, 4))) return iso;
  }
  return null;
}

function readHeader(lines) {
  const header = { date: null, attendees: null, title: '', dateRaw: undefined };
  let firstIdx = lines.findIndex((l) => l.trim() !== '');
  let bodyStart = 0;
  const set = (key, value, listItems) => {
    if (key === 'date') header.dateRaw = value;
    else if (key === 'attendees') header.attendees = parseAttendees(value, listItems);
    else if (key === 'title') header.title = value.trim();
  };
  if (lines[firstIdx].trim() === '---') {
    const end = lines.findIndex((l, i) => i > firstIdx && l.trim() === '---');
    if (end < 0) return { error: reject('UNCLOSED_FRONT_MATTER', 'front matter opened with --- but never closed') };
    for (let i = firstIdx + 1; i < end; i++) {
      const m = /^\s*([A-Za-z]+)\s*:\s*(.*)$/.exec(lines[i]);
      if (!m) continue;
      const key = m[1].toLowerCase();
      const list = [];
      if (key === 'attendees' && m[2].trim() === '') {
        while (i + 1 < end && /^\s*-\s+\S/.test(lines[i + 1])) list.push(lines[++i].replace(/^\s*-\s+/, ''));
      }
      set(key, m[2], list);
    }
    bodyStart = end + 1;
  } else {
    for (let i = 0; i < Math.min(lines.length, 15); i++) {
      const cleaned = lines[i].replace(/^[#>*\s]+/, '').replace(/\*\*/g, '');
      const m = /^(date|attendees|title)\s*:\s*(.*)$/i.exec(cleaned);
      if (m) set(m[1].toLowerCase(), m[2], []);
    }
  }
  return { header, bodyStart };
}

function extractDue(text, meetingISO) {
  const matches = [...text.matchAll(DUE_KW)];
  let dueRaw = null;
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i];
    const phrase = text.slice(m.index + m[0].length);
    const iso = resolveDue(phrase, meetingISO);
    if (iso) return { due: iso, dueRaw: null, text: text.slice(0, m.index).replace(/[\s,;(–—-]+$/, '') };
    if (i === matches.length - 1 && /^due/i.test(m[1])) dueRaw = phrase.trim().replace(/[\s.,;!)]+$/, '');
  }
  return { due: null, dueRaw, text };
}

function extractOwners(body) {
  let m = OWNER_VERB.exec(body) || OWNER_COLON.exec(body);
  let list;
  let task;
  if (m) { list = m[1]; task = m[2]; } else {
    m = OWNER_AT.exec(body);
    if (!m) return { owners: [], task: body };
    list = m[1]; task = m[2];
  }
  const names = list.split(/\s*(?:,|&|\band\b)\s*/).map((s) => s.trim()).filter(Boolean);
  if (names.some((n) => VERBS.has(n.split(/\s+/)[0].toLowerCase()))) return { owners: [], task: body };
  const owners = names.filter((n) => !NON_PERSON.has(n.toLowerCase()));
  return { owners, task };
}

function cleanTask(t) {
  return t.trim().replace(/^to\s+/i, '').replace(/[\s.]+$/, '').replace(/\s{2,}/g, ' ').trim();
}

function parseNote(text, file) {
  if (typeof text !== 'string' || text.trim() === '') return reject('EMPTY_FILE', 'file is empty');
  if (text.includes('\0')) return reject('BINARY_FILE', 'file contains binary data');
  const clean = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const lines = clean.split('\n');

  const head = readHeader(lines);
  if (head.error) return head.error;
  const { header, bodyStart } = head;
  if (header.dateRaw === undefined || String(header.dateRaw).trim() === '') return reject('MISSING_DATE', 'no date found');
  const date = parseDateValue(header.dateRaw);
  if (!date) return reject('INVALID_DATE', `cannot read date "${String(header.dateRaw).trim()}"`);
  if (!header.attendees || header.attendees.length === 0) return reject('MISSING_ATTENDEES', 'no attendees listed');

  const items = [];
  const warnings = [];
  let fence = null;
  for (let i = bodyStart; i < lines.length; i++) {
    const line = lines[i];
    const f = /^\s*(```|~~~)/.exec(line);
    if (f) { fence = fence === null ? f[1] : (fence === f[1] ? null : fence); continue; }
    if (fence) continue;
    const m = CHECKBOX.exec(line);
    if (!m) continue;
    const checked = m[1] !== ' ';
    const raw = m[2].replace(/\*\*|__/g, '').trim();
    if (!raw) { warnings.push(`line ${i + 1}: empty action item skipped`); continue; }

    const d = extractDue(raw, date);
    if (d.dueRaw) warnings.push(`line ${i + 1}: could not understand due date "${d.dueRaw}"`);
    const o = extractOwners(d.text);
    const task = cleanTask(o.task);
    if (!task) { warnings.push(`line ${i + 1}: empty action item skipped`); continue; }
    const owners = o.owners.length ? o.owners : [null];
    owners.forEach((ownerRaw, slot) => {
      items.push({ line: i + 1, slot, checked, ownerRaw, task, due: d.due, dueRaw: d.dueRaw });
    });
  }
  return { ok: true, note: { file, date, title: header.title, attendees: header.attendees, items }, warnings };
}

module.exports = { parseNote };
