'use strict';

/** Bad usage by the caller (unknown id, bad flag, missing folder). */
class UsageError extends Error {
  constructor(message) { super(message); this.name = 'UsageError'; }
}

/** Problem with the persisted database file. */
class StoreError extends Error {
  constructor(message) { super(message); this.name = 'StoreError'; }
}

/** A referenced item does not exist. */
class NotFoundError extends Error {
  constructor(message) { super(message); this.name = 'NotFoundError'; }
}

module.exports = { UsageError, StoreError, NotFoundError };
