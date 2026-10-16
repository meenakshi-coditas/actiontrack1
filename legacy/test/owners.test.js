'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildRoster, resolveOwner, ownerKey, matchesOwnerQuery } = require('../src/owners');

const P = (name, email = null) => ({ name, email });
const A = [P('Priya Sharma', 'priya@x.com'), P('Rahul Mehta')];
const B = [P('Priya Sharma'), P('Priya Nair')];
const roster = buildRoster([P('Priya Sharma'), P('Priya Nair'), P('Rahul Mehta'), P('Ana Torres')]);

test('OW-01 null / blank raw', () => {
  assert.equal(resolveOwner(null, A, roster).status, 'none');
  assert.equal(resolveOwner('  ', A, roster).owner, null);
});
test('OW-02 full name', () => {
  const r = resolveOwner('priya sharma', A, roster);
  assert.deepEqual([r.status, r.owner], ['resolved', 'Priya Sharma']);
});
test('OW-03 unique first name', () => {
  const r = resolveOwner('Priya', A, roster);
  assert.deepEqual([r.status, r.owner], ['resolved', 'Priya Sharma']);
});
test('OW-04 shared first name is ambiguous', () => {
  const r = resolveOwner('Priya', B, roster);
  assert.equal(r.status, 'ambiguous');
  assert.equal(r.owner, 'Priya');
  assert.deepEqual(r.candidates.sort(), ['Priya Nair', 'Priya Sharma']);
});
test('OW-05 roster fallback, unique', () => {
  const r = resolveOwner('Ana', A, roster);
  assert.deepEqual([r.status, r.owner], ['resolved', 'Ana Torres']);
});
test('OW-06 roster fallback, ambiguous', () => {
  assert.equal(resolveOwner('Priya', [P('Rahul Mehta')], roster).status, 'ambiguous');
});
test('OW-07 unknown external owner', () => {
  const r = resolveOwner('Vendor Bob', A, roster);
  assert.deepEqual([r.status, r.owner], ['unknown', 'Vendor Bob']);
});
test('OW-08 first name + last initial (Sharma)', () => {
  assert.equal(resolveOwner('Priya S.', B, roster).owner, 'Priya Sharma');
});
test('OW-09 first name + last initial (Nair)', () => {
  assert.equal(resolveOwner('Priya N', B, roster).owner, 'Priya Nair');
});
test('OW-10 full name found via roster', () => {
  const r = resolveOwner('Priya Nair', [P('Priya Sharma')], roster);
  assert.deepEqual([r.status, r.owner], ['resolved', 'Priya Nair']);
});
test('OW-11 ownerKey', () => {
  assert.equal(ownerKey({ owner: 'Priya Sharma', ownerStatus: 'resolved' }), 'r:priya sharma');
  assert.equal(ownerKey({ owner: 'Priya', ownerStatus: 'ambiguous' }), 'a:priya');
  assert.equal(ownerKey({ owner: 'Vendor Bob', ownerStatus: 'unknown' }), 'u:vendor bob');
  assert.equal(ownerKey({ owner: null, ownerStatus: 'none' }), 'n:');
});
const items = [
  { owner: 'Priya Sharma', ownerStatus: 'resolved' }, { owner: 'Priya Nair', ownerStatus: 'resolved' },
  { owner: 'Priya', ownerStatus: 'ambiguous', candidates: ['Priya Sharma', 'Priya Nair'] },
  { owner: 'Rahul Mehta', ownerStatus: 'resolved' }, { owner: null, ownerStatus: 'none' },
];
test('OW-12 first-name query matches all Priyas', () => {
  assert.deepEqual(items.filter((i) => matchesOwnerQuery(i, 'Priya')).map((i) => i.owner),
    ['Priya Sharma', 'Priya Nair', 'Priya']);
});
test('OW-13 full-name query is exact', () => {
  assert.deepEqual(items.filter((i) => matchesOwnerQuery(i, 'Priya Nair')).map((i) => i.owner), ['Priya Nair']);
});
test('OW-14 unassigned query', () => {
  assert.equal(items.filter((i) => matchesOwnerQuery(i, 'unassigned')).length, 1);
});
test('OW-15 email returned for resolved owner', () => {
  assert.equal(resolveOwner('Priya', A, roster).email, 'priya@x.com');
});
test('OW-16 punctuation-insensitive match', () => {
  const r = resolveOwner('sean obrien', [P("Sean O'Brien")], buildRoster([]));
  assert.deepEqual([r.status, r.owner], ['resolved', "Sean O'Brien"]);
});
