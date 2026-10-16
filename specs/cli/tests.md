# cli — test cases
Tests call `main()` with captured stdout/stderr, a temp db (`--db`), `--today 2026-10-15`, against a temp notes folder (and the real `notes/` sample set for CL-14).

| ID | Req | Scenario | Expected |
|----|-----|----------|----------|
| CL-01 | R1 | `ingest` folder with 1 bad note | exit 0; stdout mentions malformed file + reason |
| CL-02 | R1 | `ingest` missing folder | exit 2; stderr message |
| CL-03 | R2 | `list` after ingest | table header + rows; derived status shown |
| CL-04 | R2 | `list --status overdue --owner Priya` | filtered rows |
| CL-05 | R2 | `list --json` | valid JSON array with `displayStatus` |
| CL-06 | R2 | `list --due-before 2026-09-10` | only earlier-due items |
| CL-07 | R2 | `list` on empty db | `No items.` exit 0 |
| CL-08 | R3 | `done AT-0001` then `list --status done` | item listed done |
| CL-09 | R3 | `done AT-9999` | exit 1 |
| CL-10 | R3 | `done 1` twice | second says already done, exit 0 |
| CL-11 | R4 | `followup "Priya Sharma"` | `.eml` created; stdout contains `Nothing was sent` |
| CL-12 | R4 | `followup --all --preview` | bodies printed; no files |
| CL-13 | R5 | `list --status late`, `bogus` command, `done` (no id), `list --wat` | each exit 2, stderr one line, no `at ` stack |
| CL-14 | – | ingest real `notes/` (32 files) | exit 0; 6 malformed reported; idempotent second run (0 created) |
| CL-15 | R7 | `ACTIONTRACK_DB` / `ACTIONTRACK_TODAY` env respected | list uses them |
| CL-16 | R5 | `followup Priya` with two Priyas | exit 2; stderr names both |
| CL-17 | R8 | `--help` | exit 0 usage; no args | exit 2 |
| CL-19 | R4 | `followup --all --json` | valid JSON, `sent:false`, drafts have to/subject/body/itemIds; no files written |
| CL-18 | R9 | corrupt db file | exit 1, `Error:` line, no stack |
