# Module 2 — parser (`src/parser.js`)

## Goal
Parse the text of **one** meeting note into a `Note` or a structured rejection. Never throws.

## Interface
`parseNote(text: string, file: string): { ok:true, note, warnings:[string] } | { ok:false, reason, detail }`

Reason codes: `EMPTY_FILE`, `BINARY_FILE`, `UNCLOSED_FRONT_MATTER`, `MISSING_DATE`, `INVALID_DATE`, `MISSING_ATTENDEES`.

## Requirements
| ID | Requirement |
|----|-------------|
| PR-R1 | Header is a `---` front-matter block, or (if the file doesn't start with `---`) bare `Key: value` lines within the first 15 lines. Keys: `date`, `attendees`, `title` (case-insensitive). |
| PR-R2 | `date` is required and must be a real ISO date; else `MISSING_DATE` / `INVALID_DATE`. |
| PR-R3 | `attendees` is required and non-empty: comma-separated, or `[a, b]`; each may be `Name <email>`. Else `MISSING_ATTENDEES`. |
| PR-R4 | Empty/whitespace-only file → `EMPTY_FILE`. Content containing NUL bytes → `BINARY_FILE`. Front matter opened but never closed → `UNCLOSED_FRONT_MATTER`. |
| PR-R5 | Action items are task lines `- [ ] text`, `* [x] text`, `-[ ]text` (indent allowed, `x`/`X`). |
| PR-R6 | Lines inside fenced code blocks (``` or ~~~) are ignored. Plain bullets without a checkbox are ignored. |
| PR-R7 | Owner forms: `Name to <task>`, `Name will/should/must/needs to/is going to <task>`, `Name: <task>`, `Name - <task>`, `@Name <task>`. Name = 1–3 capitalised words. |
| PR-R8 | Non-person subjects (`Team`, `Everyone`, `All`, `We`, `Someone`, `TBD`, `Nobody`, `Unassigned`, `Owner TBD`) ⇒ `ownerRaw = null`. |
| PR-R9 | Capitalised imperative verbs (`Update to…`, `Follow up to…`, `Send`, `Review`, `Add`, `Check`, …) are **not** owners. |
| PR-R10 | `A and B to <task>` (also `,`/`&`) ⇒ one RawItem per owner (`slot` 0,1,…). |
| PR-R11 | Due phrase: trailing `by|due|due by|due on|before|until <phrase>` (optionally in parentheses or after `,;-–—`). If it resolves via `dates`, `due` is set and the phrase is stripped from `task`. If the keyword is `due` and it does not resolve, `dueRaw` keeps the phrase, task is untouched, and a warning is added. Other unresolved `by …` text stays in the task (e.g. "by hand"). |
| PR-R12 | `checked` is true for `[x]`/`[X]`. |
| PR-R13 | CRLF, UTF-8 BOM and trailing spaces are tolerated. |
| PR-R14 | A checkbox line with empty text is skipped with a warning. Task text is trimmed, trailing `.` removed, leading `to ` removed. |
| PR-R15 | Each RawItem records the 1-based `line` number in the original file. |

## Out of scope
NLP owner detection from free text, nested sub-tasks, checkbox lines in tables.
