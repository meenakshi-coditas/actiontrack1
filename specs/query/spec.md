# Module 6 — query (`src/query.js`)

## Goal
Derive status (including `overdue`), filter and sort items, summarise.

## Interface
- `statusOf(item, today): 'done'|'overdue'|'open'`
- `daysOverdue(item, today): number` (0 if not overdue)
- `listItems(items, { owner?, status?, dueBefore? }, today): Item[]` (each with derived `displayStatus`)
- `summarize(items, today): { open, overdue, done, unassigned, total }`
- `ownersSummary(items, today): [{owner, ownerStatus, open, overdue, done}]`
- `resolveToday({today?, env?, now?}): iso` (flag > env `ACTIONTRACK_TODAY` > local date); invalid ⇒ `UsageError`

## Requirements
| ID | Requirement |
|----|-------------|
| QY-R1 | `done` if stored done; else `overdue` if `due` non-null and `due < today` (strict); else `open`. An item due **today** is open. |
| QY-R2 | Filters combine with AND. `--owner` uses `matchesOwnerQuery` (OW-R8). |
| QY-R3 | `--status` accepts `open`, `done`, `overdue` (case-insens.); the three are mutually exclusive (`open` excludes overdue). Anything else ⇒ `UsageError`. |
| QY-R4 | `--due-before <date>`: strictly before; items without a due date are excluded. Date must be a valid ISO date ⇒ else `UsageError`. |
| QY-R5 | Sort: due date ascending (no-due last), then id. |
| QY-R6 | `summarize` counts by derived status; `unassigned` counts non-done items with no owner. |
| QY-R7 | `daysOverdue` = whole days between due and today. |
| QY-R8 | `resolveToday` precedence flag > env > system date; invalid value ⇒ `UsageError`. |
| QY-R9 | `ownersSummary` groups by `ownerKey`, excludes owner-less, sorted by owner name. |
