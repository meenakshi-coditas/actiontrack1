# owners — plan

| Step | Task | Status |
|------|------|--------|
| 1 | `norm()` (lowercase, strip punctuation, collapse spaces), `firstName`, `lastNames` | ☑ |
| 2 | `buildRoster` with first-name index | ☑ |
| 3 | `resolveOwner`: attendee pool then roster pool; single-token vs multi-token matching | ☑ |
| 4 | `ownerKey`, `matchesOwnerQuery` | ☑ |
| 5 | `test/owners.test.js` for OW-01…OW-16 | ☑ |

Design note: `ambiguous` keeps the raw first name as `owner` so the item stays visible in `list` and is queryable, while `followup` refuses to email it (FU-R6).
