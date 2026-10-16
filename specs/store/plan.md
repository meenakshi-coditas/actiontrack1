# store — plan

| Step | Task | Status |
|------|------|--------|
| 1 | `dedupe.js`: `normalizeTask` (lowercase, strip punctuation, drop stopwords `the a an to of and please`), `jaccard` on token sets | ☑ |
| 2 | `errors.js`: `UsageError`, `StoreError` (shared) | ☑ |
| 3 | `openStore`: load/validate, atomic `save` (tmp + rename) | ☑ |
| 4 | ID allocator + `getItem` normalisation | ☑ |
| 5 | `upsert`: source-key short-circuit → find match by ownerKey + (equal ∨ Jaccard ≥ 0.8) → merge or create | ☑ |
| 6 | Merge semantics (first/last meeting, newest-due-wins, checked→done, sticky done) | ☑ |
| 7 | `markDone`, `addPeople`, `addReport` | ☑ |
| 8 | `test/store.test.js` for ST-01…ST-23 | ☑ |

Design note: `upsert` expects candidates in ascending meeting-date order (ingest guarantees this) but ST-16 proves order-insensitivity for first/last/due.
