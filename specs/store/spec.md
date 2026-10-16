# Module 4 — store (`src/store.js`, `src/dedupe.js`)

## Goal
Persist items in one JSON file, assign stable IDs, merge duplicates repeated across meetings, and mark items done.

## Interface
- `openStore(path): Store` — loads (or starts empty); `store.save()` atomic.
- `store.upsert(candidate): { action: 'created'|'merged'|'unchanged', item }`
  - candidate = `{ ownerInfo, task, due, dueRaw, checked, file, line, slot, meetingDate }`
- `store.markDone(idOrNumber): { item, already:boolean }` (throws `NotFoundError` if unknown)
- `store.getItem(idOrNumber)`, `store.items()`, `store.addPeople(people)`, `store.people()`, `store.addReport(r)`
- `dedupe.normalizeTask(s)`, `dedupe.jaccard(a,b)`

## Requirements
| ID | Requirement |
|----|-------------|
| ST-R1 | Missing db file ⇒ empty db. Corrupt JSON ⇒ throw `StoreError` naming the file; the file is **not** overwritten. |
| ST-R2 | `save()` writes to a temp file then renames (atomic); creates parent directories. |
| ST-R3 | IDs are `AT-0001`, sequential, never reused. `getItem` accepts `AT-0001`, `at-1`, `1`. |
| ST-R4 | New unseen candidate ⇒ `created` with `status open` (or `done`/`doneBy note` if `[x]`). |
| ST-R5 | **Duplicate**: same `ownerKey` and `normalizeTask` equal ⇒ `merged` into the existing item (one item, extra `sources`). |
| ST-R6 | **Near-duplicate**: same `ownerKey` and token Jaccard ≥ 0.8 ⇒ merged. |
| ST-R7 | Different `ownerKey` never merges, incl. unassigned vs owned and ambiguous-`Priya` vs resolved `Priya Sharma`. Unassigned items merge only with unassigned items of the same task. |
| ST-R8 | A source `(file,line,slot)` already stored ⇒ `unchanged` (idempotent re-ingest). |
| ST-R9 | On merge: `lastMeeting` = max meeting date; if the candidate's meeting is the newest seen and its `due` is non-null, `due` is replaced; `firstMeeting` = min; task text keeps the first-seen wording. |
| ST-R10 | On merge, a checked candidate marks an open item `done` (`doneBy note`). |
| ST-R11 | `markDone` sets `status done`, `doneAt` (ISO timestamp), `doneBy cli`; calling again is a no-op returning `already:true`. |
| ST-R12 | `done` is sticky: a later note re-listing the task as open does not reopen it. |
| ST-R13 | `addPeople` dedupes by normalised full name; an email is filled in if previously null, never overwritten. |
| ST-R14 | `addReport` keeps only the last 20 ingest reports. |

## Out of scope
Concurrent writers (single-process assumption), reopen command, delete command.
