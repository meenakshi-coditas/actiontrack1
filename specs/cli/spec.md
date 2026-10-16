# Module 8 — cli (`src/cli.js`, `bin/actiontrack.js`)

## Commands
```
actiontrack ingest <folder>
actiontrack list [--owner <name>] [--status open|done|overdue] [--due-before <date>] [--json]
actiontrack done <id>
actiontrack followup <owner> | --all   [--out <dir>] [--preview]
actiontrack serve [--port 3000]
Global: --db <file>  --today <date>  --help
```

## Interface
`main(argv, { stdout, stderr, cwd, env }): Promise<number>` returns the exit code (testable, never calls `process.exit`). `bin/` is a 3-line shim.

## Requirements
| ID | Requirement |
|----|-------------|
| CL-R1 | `ingest` prints a human report (counts; malformed files with reasons; warnings) and exits **0** even when notes were malformed. |
| CL-R2 | `list` prints an aligned table `ID STATUS OWNER DUE TASK SOURCE` (status derived, `-` for missing owner/due); `--json` prints a JSON array. Filters per QY-R2…R4. Empty result prints `No items.` |
| CL-R3 | `done <id>` marks done and prints the item; unknown id ⇒ exit 1 + message; already done ⇒ exit 0 + notice. Accepts `AT-0001`/`1`. |
| CL-R4 | `followup <owner>` / `--all` creates `.eml` drafts in `--out` (default `<db dir>/drafts`), prints one line per draft plus skipped notes, and states **"Nothing was sent."** `--preview` prints bodies and writes nothing. `--json` prints `{drafts, skipped, sent:false}` (each draft: owner, to, subject, body, itemIds, overdue, open), writes nothing — this is the hand-off to the Gmail connector (see followup spec). |
| CL-R5 | Usage errors (unknown command/flag, missing argument, bad status/date, ambiguous owner) ⇒ exit **2**, one-line message on stderr, no stack trace. |
| CL-R6 | Runtime errors (unknown id, corrupt db) ⇒ exit **1**, message on stderr, no stack trace. A missing folder is a usage error ⇒ exit 2. |
| CL-R7 | `--db` and `ACTIONTRACK_DB` select the store; `--today` and `ACTIONTRACK_TODAY` set today (QY-R8). |
| CL-R8 | `--help` prints usage to stdout, exit 0. No command at all prints usage to stderr, exit 2. |
| CL-R9 | Unexpected exceptions are caught at the top level: message `Internal error: …` exit 1 (stack only with `ACTIONTRACK_DEBUG=1`). |
| CL-R10 | Windows-safe paths; output uses `\n`. |

## Exit codes
`0` success · `1` runtime failure · `2` usage error.
