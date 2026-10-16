# store — test cases
`cand(owner, task, due, meeting, line)` is a test helper that builds a candidate with a resolved owner.

| ID | Req | Scenario | Expected |
|----|-----|----------|----------|
| ST-01 | R1 | open path that doesn't exist | 0 items, no file created until save |
| ST-02 | R1 | file contains `{not json` | throws `StoreError`; file content unchanged |
| ST-03 | R2 | save into a non-existent nested dir, reopen | items round-trip; no `.tmp` left |
| ST-04 | R3 | create 3 items | `AT-0001`,`AT-0002`,`AT-0003`; `getItem('2')`, `('at-2')` work |
| ST-05 | R4 | upsert new open / new checked | open / done+doneBy note |
| ST-06 | R5 | same owner, `Send revised quote` in 3 meetings | 1 item, 3 sources, actions created,merged,merged |
| ST-07 | R5 | `Send the revised quote.` vs `send revised quote` | merged |
| ST-08 | R6 | `Book the conference room for demo` vs `Book conference room for the demo day` (J≥0.8) | merged; clearly different task stays separate |
| ST-09 | R7 | same task, owners Priya Sharma vs Priya Nair | 2 items |
| ST-10 | R7 | same task, owned vs unassigned | 2 items |
| ST-11 | R7 | same task unassigned in two meetings | 1 item |
| ST-12 | R7 | ambiguous `Priya` vs resolved `Priya Sharma` same task | 2 items |
| ST-13 | R8 | upsert identical candidate twice | second is `unchanged`; sources length 1 |
| ST-14 | R9 | meeting 09-01 due 09-05, then meeting 09-08 due 09-12 | due 09-12, first 09-01, last 09-08 |
| ST-15 | R9 | later meeting has no due | due stays 09-05 |
| ST-16 | R9 | ingest later meeting first, then earlier | first/last correct; due from newest meeting |
| ST-17 | R10 | open item, then `[x]` in a later meeting | status done, doneBy note |
| ST-18 | R11 | markDone twice | first `already:false`, second `already:true`; doneAt unchanged |
| ST-19 | R11 | markDone('AT-9999') | throws NotFoundError |
| ST-20 | R12 | done via CLI, then open candidate from later meeting | still done |
| ST-21 | R13 | addPeople twice with email filled second time | one person, email set |
| ST-22 | R14 | add 25 reports | 20 kept, newest last |
| ST-23 | – | `normalizeTask`, `jaccard` unit checks | stopwords/punct removed; jaccard identical=1, disjoint=0 |
