# Module 5 — ingest (`src/ingest.js`)

## Goal
Ingest a folder of notes into the store, skipping malformed notes and reporting them.

## Interface
`ingestFolder(store, folder, { now? }): Report`
```
Report { folder, at, filesScanned, parsed, malformed:[{file,reason,detail}],
         itemsFound, created, merged, unchanged, unassigned, noDue,
         ambiguousOwners, unknownOwners, warnings:[{file,message}] }
```

## Algorithm (two passes)
1. Recursively list `*.md` (case-insensitive extension), sorted by path. Read + parse each; collect malformed.
2. Sort valid notes by `(date, file)`. Build the roster from valid notes' attendees ∪ stored people; `store.addPeople`.
3. For each note → each RawItem → `resolveOwner(raw, note.attendees, roster)` → `store.upsert`.
4. Tally, `store.addReport`, `store.save()`.

## Requirements
| ID | Requirement |
|----|-------------|
| IN-R1 | Recurses into sub-folders; only `.md` files; files processed in deterministic order. |
| IN-R2 | Two-pass: the roster is built from **all** valid notes before any owner is resolved (so a first name that is ambiguous across the folder is detected even when one note has a single attendee). |
| IN-R3 | A malformed note is skipped and listed in `malformed` with its reason code; it never aborts the run and contributes no people/items. |
| IN-R4 | An unreadable file (I/O error) is reported as malformed `UNREADABLE`. |
| IN-R5 | Folder missing or not a directory ⇒ `UsageError` (no db change). Empty folder ⇒ zero-count report, no error. |
| IN-R6 | Idempotent: second ingest of the same folder ⇒ `created 0, merged 0`, all `unchanged`; item data identical. |
| IN-R7 | Report counts: `unassigned` = items found with no owner, `noDue` = items found with no due date, `ambiguousOwners`, `unknownOwners` (unique owner strings). |
| IN-R8 | Stored `file` paths are relative to the ingested folder with `/` separators. |
| IN-R9 | Parser warnings are surfaced in `warnings`. |
| IN-R10 | Folder-wide ambiguity (OW-R5) is honoured: a note listing only `Priya Sharma` as attendee but with `Priya to…` resolves to her (note precedence), while a note with no Priya attendee and two Priyas in the roster yields `ambiguous`. |
