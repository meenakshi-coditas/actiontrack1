# query — plan

| Step | Task | Status |
|------|------|--------|
| 1 | `statusOf`, `daysOverdue` (UTC day diff) | ☑ |
| 2 | `listItems`: validate filters first (fail fast), then filter + sort | ☑ |
| 3 | `summarize`, `ownersSummary` | ☑ |
| 4 | `resolveToday` | ☑ |
| 5 | `test/query.test.js` for QY-01…QY-16 | ☑ |
