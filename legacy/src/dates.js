'use strict';

const MONTHS = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5,
  june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8, september: 9, sept: 9, sep: 9,
  october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12,
};
const WEEKDAYS = {
  monday: 0, mon: 0, tuesday: 1, tues: 1, tue: 1, wednesday: 2, weds: 2, wed: 2,
  thursday: 3, thurs: 3, thur: 3, thu: 3, friday: 4, fri: 4, saturday: 5, sat: 5, sunday: 6, sun: 6,
};

const monthAlt = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');
const dayAlt = Object.keys(WEEKDAYS).sort((a, b) => b.length - a.length).join('|');

const MONTH_FIRST = new RegExp(`^(${monthAlt})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?$`);
const DAY_FIRST = new RegExp(`^(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+of)?\\s+(${monthAlt})(?:,?\\s+(\\d{4}))?$`);
const WEEKDAY = new RegExp(`^(?:(next|this)\\s+)?(${dayAlt})$`);

function parseISO(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof s === 'string' ? s : '');
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}
const fmt = (dt) => dt.toISOString().slice(0, 10);
const plus = (dt, n) => new Date(dt.getTime() + n * 86400000);
const weekdayIdx = (dt) => (dt.getUTCDay() + 6) % 7; // Monday = 0

function isValidISO(s) { return parseISO(s) !== null; }
function addDays(iso, n) { return fmt(plus(parseISO(iso), n)); }
function compareISO(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
function diffDays(aISO, bISO) { return Math.round((parseISO(aISO) - parseISO(bISO)) / 86400000); }
function todayISO(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

function makeDate(y, mo, d) {
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? dt : null;
}

function monthDay(base, mo, d, yearStr) {
  if (yearStr) {
    const dt = makeDate(+yearStr, mo, d);
    return dt ? fmt(dt) : null;
  }
  let dt = makeDate(base.getUTCFullYear(), mo, d);
  if (!dt) return null;
  if (dt < base) dt = makeDate(base.getUTCFullYear() + 1, mo, d);
  return dt ? fmt(dt) : null;
}

/** Resolve a due-date phrase relative to the meeting date; null when unrecognised. */
function resolveDue(phrase, meetingISO) {
  const base = parseISO(meetingISO);
  if (!base || typeof phrase !== 'string') return null;
  let p = phrase.toLowerCase().trim().replace(/^[\s(]+/, '').replace(/[\s.,;!)]+$/, '');
  p = p.replace(/\s+(eod|cob|end of day|end-of-day)$/, '').trim();
  if (!p) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(p)) return isValidISO(p) ? p : null;
  if (/^(today|eod|cob|end of day|end-of-day|tonight)$/.test(p)) return fmt(base);
  if (p === 'tomorrow') return fmt(plus(base, 1));

  let m = /^in (\d{1,3}) (day|days|week|weeks)$/.exec(p);
  if (m) return fmt(plus(base, +m[1] * (m[2].startsWith('week') ? 7 : 1)));

  const monday = plus(base, -weekdayIdx(base));
  m = WEEKDAY.exec(p);
  if (m) {
    const idx = WEEKDAYS[m[2]];
    if (m[1] === 'next') return fmt(plus(monday, 7 + idx));
    return fmt(plus(base, ((idx - weekdayIdx(base) + 6) % 7) + 1));
  }

  if (p === 'next week') return fmt(plus(monday, 7 + 4));
  if (/^(end of (the |this )?week|eow|this week)$/.test(p)) {
    let fri = plus(monday, 4);
    if (fri < base) fri = plus(fri, 7);
    return fmt(fri);
  }
  if (/^(end of (the |this )?month|eom)$/.test(p)) {
    return fmt(new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)));
  }

  m = MONTH_FIRST.exec(p);
  if (m) return monthDay(base, MONTHS[m[1]], +m[2], m[3]);
  m = DAY_FIRST.exec(p);
  if (m) return monthDay(base, MONTHS[m[2]], +m[1], m[3]);
  return null;
}

module.exports = { resolveDue, isValidISO, addDays, compareISO, diffDays, todayISO };
