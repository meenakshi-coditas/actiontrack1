# Module 3 — owners (`src/owners.js`)

## Goal
Map the raw owner text of an action item (`Priya`, `Priya S.`, `Priya Sharma`) to a real person, and **never guess** when two people share a first name.

## Interface
- `buildRoster(people: [{name,email}]): Roster`
- `resolveOwner(raw|null, attendees, roster): { owner|null, status, candidates:[name], email|null }`
  - `status`: `resolved` | `ambiguous` | `unknown` | `none`
- `ownerKey(item): string` — identity used for dedupe/grouping
- `matchesOwnerQuery(item, query): boolean` — used by `list --owner`
- `firstName(name): string`

## Resolution order
1. **Note attendees** take precedence over the global roster (people seen in any note).
2. Within a pool: single token ⇒ match on first name; ≥2 tokens ⇒ exact full name, else first name + last-name initial/prefix.

## Requirements
| ID | Requirement |
|----|-------------|
| OW-R1 | `null`/blank raw ⇒ `status none`, `owner null`. |
| OW-R2 | Full name matching an attendee (case/punctuation-insensitive) ⇒ `resolved`, canonical attendee spelling. |
| OW-R3 | First name matching exactly **one** attendee ⇒ `resolved` to that attendee's full name. |
| OW-R4 | First name matching **two or more** attendees ⇒ `ambiguous`; `owner` = the raw first name; `candidates` lists the full names. Never picks one. |
| OW-R5 | No attendee match: search the roster; exactly one ⇒ `resolved`, several ⇒ `ambiguous`, none ⇒ `unknown` (owner = raw text as written, e.g. an external person). |
| OW-R6 | `Priya S.` / `Priya S` resolves to the attendee whose last name starts with `S` if exactly one fits; otherwise `ambiguous`. |
| OW-R7 | `ownerKey`: resolved ⇒ `r:<full name lower>`; ambiguous ⇒ `a:<first lower>`; unknown ⇒ `u:<raw lower>`; none ⇒ `n:`. Two different keys never merge. |
| OW-R8 | `matchesOwnerQuery`: query with ≥2 tokens ⇒ exact (case-insens.) full-name match on `owner`; single token ⇒ matches every item whose owner (or candidate) first name equals it, including ambiguous ones. `unassigned`/`none` query ⇒ items with no owner. |
| OW-R9 | Attendee email is returned for resolved owners (null if unknown). |
| OW-R10 | Matching ignores case, accents-free punctuation (`O'Brien` = `obrien`), and repeated spaces. |
