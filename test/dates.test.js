import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveDue, isAmbiguousDue, todayISO, addDays, isValidISO } from '../src/dates.js';

// 2026-10-14 is a Wednesday; 2026-10-16 Friday; 2026-10-17 Saturday; 2026-12-31 Thursday.
test('explicit ISO dates resolve; impossible ones do not', () => {
  assert.equal(resolveDue('2026-10-20', '2026-10-14'), '2026-10-20');
  assert.equal(resolveDue('2026-02-30', '2026-10-14'), null);
  assert.equal(isValidISO('2026-13-01'), false);
});

test('today / tomorrow are relative to the MEETING date, not the system clock', () => {
  assert.equal(resolveDue('today', '2024-02-28'), '2024-02-28');
  assert.equal(resolveDue('tomorrow', '2024-02-28'), '2024-02-29'); // leap day
  assert.equal(resolveDue('tomorrow', '2026-12-31'), '2027-01-01'); // year boundary
});

test('bare weekday = first such day strictly after the meeting', () => {
  assert.equal(resolveDue('Friday', '2026-10-14'), '2026-10-16');
  assert.equal(resolveDue('Monday', '2026-10-14'), '2026-10-19');
  assert.equal(resolveDue('Friday', '2026-12-30'), '2027-01-01'); // year boundary
});

test('weekday on a weekend meeting', () => {
  assert.equal(resolveDue('Monday', '2026-10-17'), '2026-10-19'); // from Saturday
  assert.equal(resolveDue('Friday', '2026-10-18'), '2026-10-23'); // from Sunday
});

test('bare weekday equal to the meeting weekday is ambiguous -> unknown', () => {
  assert.equal(resolveDue('Friday', '2026-10-16'), null);
  assert.equal(isAmbiguousDue('Friday', '2026-10-16'), true);
  assert.equal(isAmbiguousDue('Friday', '2026-10-14'), false);
  assert.equal(resolveDue('next Friday', '2026-10-16'), '2026-10-23'); // explicit "next" is not ambiguous
});

test('next <weekday> = that weekday in the following Mon-Sun week', () => {
  assert.equal(resolveDue('next Tuesday', '2026-10-14'), '2026-10-20');
  assert.equal(resolveDue('next Monday', '2026-10-18'), '2026-10-19'); // Sunday meeting: week begins next day
});

test('month-day phrases roll to next year when already past', () => {
  assert.equal(resolveDue('Sept 30', '2026-08-05'), '2026-09-30');
  assert.equal(resolveDue('Jan 5', '2026-12-20'), '2027-01-05');
  assert.equal(resolveDue('Oct 9th', '2026-08-10'), '2026-10-09');
});

test('unrecognised text is null, never guessed', () => {
  for (const p of ['ASAP', 'someday', '', 'soon-ish']) assert.equal(resolveDue(p, '2026-10-14'), null);
});

test('todayISO honours the timezone and addDays crosses boundaries', () => {
  const instant = new Date('2026-10-14T23:30:00Z');
  assert.equal(todayISO(instant, 'UTC'), '2026-10-14');
  assert.equal(todayISO(instant, 'Asia/Kolkata'), '2026-10-15');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.throws(() => todayISO(instant, 'Not/AZone'), RangeError);
});
