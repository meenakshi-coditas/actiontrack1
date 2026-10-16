/** Bad usage by the caller (unknown id, bad flag, missing folder). Exit code 2. */
export class UsageError extends Error {
  constructor(message) { super(message); this.name = 'UsageError'; }
}

/** A referenced record does not exist. Exit code 1. */
export class NotFoundError extends Error {
  constructor(message) { super(message); this.name = 'NotFoundError'; }
}

/** Database problem. Exit code 1. */
export class StoreError extends Error {
  constructor(message) { super(message); this.name = 'StoreError'; }
}

/** Gmail/draft gateway problem. Exit code 1. */
export class IntegrationError extends Error {
  constructor(message) { super(message); this.name = 'IntegrationError'; }
}
