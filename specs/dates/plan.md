# dates — plan

| Step | Task | Status |
|------|------|--------|
| 1 | UTC date helpers (`parse`, `format`, `addDays`, `isValidISO`, `compareISO`, `todayISO`) | ☑ |
| 2 | Normaliser (case, punctuation, EOD suffix) | ☑ |
| 3 | Ordered rule table: ISO → today/tomorrow → in N → next/this weekday → week/month → month-day | ☑ |
| 4 | Month-name map incl. `sept`; ordinal suffix handling; year roll-over | ☑ |
| 5 | Write `test/dates.test.js` for DT-01…DT-20 | ☑ |

Design note: rules are an ordered list of `(regex, handler)`; first match wins and a handler may return `null` (e.g. invalid day) which stops resolution — no fall-through guessing (DT-R10).
