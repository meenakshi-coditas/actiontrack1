'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveDue, isValidISO, addDays } = require('../src/dates');

const MON = '2026-09-07'; // Monday

test('DT-01 ISO passthrough', () => assert.equal(resolveDue('2026-09-20', MON), '2026-09-20'));
test('DT-02 invalid ISO date is null', () => assert.equal(resolveDue('2026-02-30', MON), null));
test('DT-03 today / EOD', () => {
  assert.equal(resolveDue('today', MON), MON);
  assert.equal(resolveDue('EOD', MON), MON);
});
test('DT-04 tomorrow', () => assert.equal(resolveDue('tomorrow', MON), '2026-09-08'));
test('DT-05 plain weekday is next occurrence', () => assert.equal(resolveDue('Friday', MON), '2026-09-11'));
test('DT-06 same weekday means +7', () => assert.equal(resolveDue('Friday', '2026-09-11'), '2026-09-18'));
test('DT-07 this Fri', () => assert.equal(resolveDue('this Fri', '2026-09-09'), '2026-09-11'));
test('DT-08 next Tuesday from Wednesday', () => assert.equal(resolveDue('next Tuesday', '2026-09-09'), '2026-09-15'));
test('DT-09 next Tuesday from Monday', () => assert.equal(resolveDue('next Tuesday', MON), '2026-09-15'));
test('DT-10 in N days/weeks', () => {
  assert.equal(resolveDue('in 3 days', MON), '2026-09-10');
  assert.equal(resolveDue('in 2 weeks', MON), '2026-09-21');
});
test('DT-11 next week is Friday of following week', () => assert.equal(resolveDue('next week', MON), '2026-09-18'));
test('DT-12 end of week / EOW', () => {
  assert.equal(resolveDue('end of week', MON), '2026-09-11');
  assert.equal(resolveDue('EOW', '2026-09-12'), '2026-09-18');
});
test('DT-13 end of month', () => {
  assert.equal(resolveDue('end of month', MON), '2026-09-30');
  assert.equal(resolveDue('EOM', '2026-02-10'), '2026-02-28');
});
test('DT-14 absolute month/day forms', () => {
  for (const p of ['Sept 20', 'September 20th', '20 Sep', '20th of September', 'Sep 20, 2026']) {
    assert.equal(resolveDue(p, MON), '2026-09-20', p);
  }
});
test('DT-15 past month/day rolls to next year', () => assert.equal(resolveDue('Sep 5', MON), '2027-09-05'));
test('DT-16 Feb 30 is null', () => assert.equal(resolveDue('Feb 30', MON), null));
test('DT-17 normalisation', () => {
  for (const p of ['Friday EOD', 'FRIDAY.', '  friday ) ']) assert.equal(resolveDue(p, MON), '2026-09-11', p);
});
test('DT-18 unrecognised is null', () => {
  for (const p of ['soon', 'ASAP', 'whenever', '']) assert.equal(resolveDue(p, MON), null, p);
});
test('DT-19 weekday across DST change', () => assert.equal(resolveDue('Friday', '2026-10-30'), '2026-11-06'));
test('DT-20 helpers', () => {
  assert.equal(isValidISO('2026-13-01'), false);
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});
