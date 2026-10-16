# query — test cases
Fixture `today = 2026-09-15`; items: a (open, due 09-10), b (open, due 09-15), c (open, due 09-20), d (open, no due), e (done, due 09-01), f (open, no owner, due 09-12), g (open, owner Rahul Mehta, due 09-14).

| ID | Req | Scenario | Expected |
|----|-----|----------|----------|
| QY-01 | R1 | statusOf a, b, c, d, e | overdue, open, open, open, done |
| QY-02 | R1 | open item due yesterday / today / tomorrow | overdue / open / open |
| QY-03 | R2 | `owner: 'Rahul'` | only g |
| QY-04 | R2 | `owner` + `status:'overdue'` | AND semantics (e.g. owner Priya + overdue ⇒ only a) |
| QY-05 | R3 | `status:'overdue'` | a, f, g |
| QY-06 | R3 | `status:'open'` | b, c, d (excludes overdue) |
| QY-07 | R3 | `status:'DONE'` | e |
| QY-08 | R3 | `status:'late'` | UsageError |
| QY-09 | R4 | `dueBefore:'2026-09-15'` | a, e, f, g (not b; no-due d excluded) |
| QY-10 | R4 | `dueBefore:'15/09/2026'` | UsageError |
| QY-11 | R5 | sort result of no filters | e,a,f,g,b,c,d |
| QY-12 | R6 | summarize | open 3, overdue 3, done 1, unassigned 1, total 7 |
| QY-13 | R7 | daysOverdue(a) = 5; daysOverdue(b) = 0 | as stated |
| QY-14 | R8 | flag wins over env; env wins over default; bad env throws | as stated |
| QY-15 | R9 | ownersSummary | one row per owner key, owner-less excluded, sorted |
| QY-16 | R2 | `owner:'unassigned'` | only f |
