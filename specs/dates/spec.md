# Module 1 — dates (`src/dates.js`)

## Goal
Turn a human due-date phrase into an ISO date, relative to the date of the meeting it was written in.

## Interface
- `resolveDue(phrase: string, meetingISO: string): string | null`
- `isValidISO(s): boolean`, `addDays(iso, n): iso`, `compareISO(a,b): -1|0|1`, `todayISO(now = new Date()): iso` (local calendar date)
- Pure functions; never throw on bad input (return `null` / `false`).

## Requirements
| ID | Requirement |
|----|-------------|
| DT-R1 | An ISO `YYYY-MM-DD` phrase resolves to itself only if it is a real calendar date (`2026-02-30` → `null`). |
| DT-R2 | `today`, `eod`, `cob`, `end of day` → meeting date. `tomorrow` → +1 day. |
| DT-R3 | Plain or `this` weekday (`Friday`, `Fri`, `this Friday`) → the **next occurrence strictly after** the meeting date (same weekday ⇒ +7). |
| DT-R4 | `next <weekday>` → that weekday in the **following Mon–Sun week**. |
| DT-R5 | `in N day(s)/week(s)` → meeting + N days / 7N days. |
| DT-R6 | `next week` → Friday of the following week. `end of week`, `eow`, `this week` → Friday of the meeting's week; if that is before the meeting (meeting on Sat/Sun) → following Friday. |
| DT-R7 | `end of month`, `eom` → last day of the meeting's month. |
| DT-R8 | Absolute month/day: `Sept 20`, `September 20th`, `20 Sep`, `20th of September`, optional year (`, 2026`). Year omitted ⇒ meeting year; if that date is before the meeting date ⇒ next year. Invalid day (`Feb 30`) ⇒ `null`. |
| DT-R9 | Normalisation: case-insensitive; surrounding whitespace and trailing `.,;!)` ignored; trailing `EOD`/`COB`/`end of day` suffix ignored (`Friday EOD` = `Friday`). |
| DT-R10 | Anything unrecognised (`soon`, `ASAP`, `whenever`) → `null` (caller decides; never guessed). |
| DT-R11 | Week starts Monday. Arithmetic uses UTC to avoid DST errors. |

## Out of scope
Numeric slash dates (`9/12`, ambiguous US/EU), time zones, times of day, `next month`, quarters.
