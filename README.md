# actiontrack

Extract action items from Markdown meeting notes, track them in SQLite, and prepare **draft-only** Gmail follow-ups. Nothing is ever sent.

Node.js ≥ 18, ES modules, SQLite via `better-sqlite3` (pinned to 11.10.0, the last line with Node 18 prebuilt binaries; no compiler needed).

## Windows PowerShell quick start

```powershell
cd "C:\Users\meenakshi.hajare\OneDrive\Desktop\AI practice\actiontrack"
npm install
npm test

node bin/actiontrack.js ingest ./notes
node bin/actiontrack.js list
node bin/actiontrack.js list --owner "Priya Sharma"
node bin/actiontrack.js list --status overdue
node bin/actiontrack.js list --due-before 2026-10-20
node bin/actiontrack.js done 12
node bin/actiontrack.js followup --all --json
```

Paths with spaces work when quoted. Exit codes: `0` success, `1` processing/integration failure (including any failed draft), `2` invalid usage.

## Commands

| Command | Behaviour |
|---|---|
| `ingest <folder>` | Recursively reads `*.md`; reports files processed/skipped, tasks added, duplicates detected, possible duplicates, warnings. A bad file is skipped with filename + reason, never fatal. Idempotent. |
| `list [--owner n] [--status open\|done\|overdue] [--due-before YYYY-MM-DD] [--json]` | Shows ID, owner, description, due, status, source file:line. |
| `done <id>` | Marks an existing task done (numeric id). Unknown id → exit 1; invalid id → exit 2; already done → message, exit 0. Never creates a task. |
| `followup --all [--json] [--owner n] [--gateway f] [--contacts f] [--record f]` | One draft per identifiable owner with open/overdue work. See *Gmail* below. |

Options: `--db`, `--today`, env `ACTIONTRACK_DB`, `ACTIONTRACK_TODAY`, `ACTIONTRACK_TZ` (see `.env.example`).

## Note format

Front matter (`---` block) with `date: YYYY-MM-DD`, `attendees:` (comma list, optional `<email>`), optional `title:`; or bare `Date:`/`Attendees:` lines. Action items are task lines (`- [ ]`, `- [x]`, `*`/`+` bullets, `-[ ]text` without a space, any indentation); lines in code fences are ignored. Owner patterns: `Name to/will/should …`, `Name: …`, `@Name …`, `A and B to …` (one task per owner).

## Date policy

* "Today" for overdue = `--today` > `ACTIONTRACK_TODAY` > current calendar date in `ACTIONTRACK_TZ` (default: system timezone). All date arithmetic is UTC calendar math.
* Relative phrases resolve against the **meeting date**, never the system clock: `today`, `tomorrow`, `in N days/weeks`, weekdays, `next week`, `end of week/month`, `Sept 30`, `Oct 9th`, ISO dates.
* **Weekday rule:** bare `Friday` = first Friday *strictly after* the meeting. If the meeting itself is on that weekday the intent is ambiguous (today vs. next week) → **due date stored as unknown** and a warning is reported. `next Friday` = the Friday of the following Mon–Sun week. Month/day without year rolls to next year if already past the meeting date.
* Unrecognised phrases (`ASAP`, `someday`) → due unknown + warning. Nothing is guessed.
* Overdue = not done **and** known due date strictly before today. `open` means not done (so it includes overdue). `--due-before D` includes `due <= D`; undated tasks never match it.

## Database (SQLite, `.actiontrack/actiontrack.db`)

Migrations via `PRAGMA user_version` (`src/db.js`).

| Table | Purpose |
|---|---|
| `tasks` | `id` (stable autoincrement), `owner_name`, `owner_status` (resolved/ambiguous/unknown/none), `owner_mention`, `owner_candidates`, `description`, `description_key`, `due_date` (nullable), `due_raw`, `status` (open/done), `completed_at/by`, `first_meeting`, `last_meeting`, `created_at`, `updated_at` |
| `task_sources` | One row per note line mentioning the task: file, line, slot, meeting date, checkbox state, original text. `UNIQUE(file,line,slot)` makes re-ingest idempotent and keeps duplicate history. |
| `possible_duplicates` | Similar-but-not-safely-identical task pairs (both retained). |
| `people` | Names + emails from attendee lists; `email_conflict` flag. |
| `ingest_runs` | JSON report of each run. |
| `followup_drafts` | Ledger (fingerprint → Gmail draft id) so retries don't duplicate drafts. |

All SQL is parameterised. Owners: full name when resolved against the meeting's attendees (then the global roster); a bare first name shared by two people (e.g. two Priyas) is stored `ambiguous` with candidates and is never emailed.

## Duplicate detection (deterministic, `src/dedupe.js`)

Candidates are compared only against tasks with the **same owner identity** (resolved name; unresolved owners by normalised mention; unassigned only with unassigned). Description normalisation: lowercase, strip punctuation/accents/whitespace/stop-words (`the a an to of and please`).

1. Identical normalised text and compatible due dates (equal or either unknown) → **same task** (merged; new source appended).
2. Identical text, both dated but different: merged only if the meetings are ≤ 21 days apart (rollover); otherwise **kept separate and reported** as a possible duplicate.
3. Token Jaccard ≥ 0.8, not generic, compatible dates → same task.
4. Jaccard 0.6–0.8, or any of the above blocked by date conflict → **both kept, ambiguity recorded and reported**.
5. Descriptions of ≤ 2 meaningful words never merge unless both have the same known due date.

On merge: latest meeting's due date wins, `first/last_meeting` updated, a completed checkbox in any meeting completes the task (`completed_by = note`).
Limitation: the 21-day rollover and 0.8/0.6 thresholds are heuristics (constants in `THRESHOLDS`); an identical recurring chore ("send meeting minutes") for one person within 21 days is merged by design.

## Gmail follow-ups

`followup --all --json` groups open + overdue tasks by owner and prints a reviewable JSON preview (also saved to `.actiontrack/followup-preview.json`): draft subject/body, `taskIds`, `createDraftArguments` (exactly `to[]`, `subject`, `body` for the Gmail connector's `create_draft`), unresolved owners and unassigned task ids. Drafts say "overdue" only for known past due dates.

**Recipient trust:** emails come only from (1) `--contacts`/`ACTIONTRACK_CONTACTS` JSON `{ "Full Name": "email" }` or (2) addresses written in note attendee lists. Missing, conflicting, or ambiguous-owner cases are reported as `unresolved`; no address is ever invented.

**Execution boundary.** A local Node process cannot call a remote MCP tool by itself. Two supported paths:

1. *MCP host (e.g. Claude Code with the Gmail connector):* run `followup --all --json`, have the host call **`create_draft`** with each `createDraftArguments`, write `[{ "fingerprint": "...", "draftId": "..." }]` to a file, then run `followup --all --record results.json` so retries skip those drafts.
2. *In-process:* `--gateway ./my-gateway.mjs` (or `ACTIONTRACK_GATEWAY`) where the module default-exports `{ async createDraft({ to, subject, body }) { return { id } } }`. Only `createDraft` is ever retained/called. Gateway load failure → exit 1, clear error, preview kept, no draft reported as created. Per-draft failures are reported (`created` / `already_created` / `failed`) and do not stop the batch (exit 1 if any failed).

Safety: no send/forward/reply code exists; a test scans `src/` for send operations and a trapping proxy proves only `createDraft` is touched.

## Layout

```
bin/actiontrack.js      entry point
src/cli.js              argument parsing, commands, formatting, exit codes
src/parser.js           note parsing (front matter, checkbox items, owners, due phrases)
src/dates.js            date resolution and timezone-aware "today"
src/owners.js           owner resolution / query matching
src/dedupe.js           deterministic duplicate rules
src/db.js               SQLite open + migrations
src/repository.js       persistence, upsert/merge, ledger
src/ingest.js           folder walk + two-pass ingest
src/query.js            status derivation and list filters
src/followup.js         grouping, email resolution, draft text
src/gmail.js            draft-only gateway interface + idempotent creation
test/                   node:test suites (68 tests; no network, no Gmail)
notes/                  32 sample notes (scripts/gen-samples.cjs regenerates them)
legacy/                 previous zero-dependency CommonJS/JSON implementation + web dashboard, kept untouched
```

## Verified vs. not verified

Verified by automated tests and runs on the supplied notes: ingest, idempotency, dedupe, list filters, done, follow-up generation, mocked Gmail success/failure/partial/retry, no-send guard, PowerShell invocation with quoted paths.
**Not verified:** a real Gmail draft creation (needs the Gmail connector, authenticated in an MCP host or a gateway module you provide). `create_draft` argument shape was taken from the connector's tool schema as exposed in the Claude session.
