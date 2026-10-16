# Module 7 — followup (`src/followup.js`)

## Goal
Build one follow-up email per owner covering their **open and overdue** items, and hand each to a **draft sink**. It never sends.

## Interface
- `buildFollowups(items, people, { owner?, all?, today }): { drafts:[Draft], skipped:[{reason, ...}] }`
  - `Draft { owner, to|null, subject, body, itemIds, overdue, open }`
- `fileSink(dir): { write(draft): { path } }` — writes `<slug>.eml`
- `createDrafts(drafts, sink): [{owner, path}]`
- Throws `UsageError` for: neither `owner` nor `all`; owner not found; owner query ambiguous.

## Requirements
| ID | Requirement |
|----|-------------|
| FU-R1 | One draft per owner with ≥1 non-done item. Owners with only done items produce no draft. |
| FU-R2 | Body lists **OVERDUE** first (oldest due first) then **OPEN** (due soonest first, no-due last). Done items never appear. |
| FU-R3 | Each line: item id, task, `due <date>` or `no due date`, for overdue `(N days overdue)`, and the source note file name (first source). |
| FU-R4 | Owner-less items are never emailed; reported in `skipped` (`reason: 'unassigned'`, count). |
| FU-R5 | Ambiguous owners are never emailed; `--all` reports them in `skipped` (`reason:'ambiguous'`, candidates). |
| FU-R6 | `followup <name>` where the name matches an ambiguous owner or several distinct owners (e.g. `Priya` with two Priyas) ⇒ `UsageError` listing candidates and telling the user to use the full name. |
| FU-R7 | Owner argument matching nobody ⇒ `UsageError`. Owner exists but has nothing open ⇒ **no draft, `skipped` reason `nothing-open`**, not an error. |
| FU-R8 | `to` is the owner's known email or `null` (draft is still created; recipient left for the human). |
| FU-R9 | Subject: `Action items follow-up: N open, M overdue` where N = the owner's open (not overdue) items and M = overdue. Greeting uses the first name. |
| FU-R10 | `fileSink` writes a standards-shaped message: headers `To` (if any), `Subject`, `X-Unsent: 1`, `MIME-Version`, `Content-Type: text/plain; charset=UTF-8`; CRLF line endings; filename slug is filesystem-safe and stable (re-run overwrites). |
| FU-R11 | **No send capability**: module exports no function matching `/send/i`; sink interface has only `write`; no network module is imported by any `src/` file except `server.js` (HTTP *serving*). |
| FU-R12 | `preview` (building drafts without a sink) has no side effects. |
| FU-R13 | Header-injection safe: owner names/tasks containing CR/LF cannot add headers (CR/LF stripped from subject/To). |

## Gmail hand-off (Option B)
1. `actiontrack followup --all --json` (or `<owner>`) emits the drafts; nothing is written or sent.
2. The human reviews the preview (`--preview` or the dashboard).
3. Claude, in a session with the Gmail connector, calls `create_draft` once per draft (`to` omitted when `null`), using `subject` and `body` verbatim. Send/forward/reply tools are never called.
4. Claude reports the created draft IDs and anything in `skipped`.
