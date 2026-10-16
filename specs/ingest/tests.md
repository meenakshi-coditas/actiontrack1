# ingest — test cases
Tests build temp folders with small notes (helper `makeNotes({name: text})`).

| ID | Req | Scenario | Expected |
|----|-----|----------|----------|
| IN-01 | R1 | 2 notes + `readme.txt` + sub-folder note | 3 scanned, txt ignored, subfolder file path `sub/x.md` |
| IN-02 | R1 | notes named so path order ≠ date order | items created in date order (IDs follow meeting dates) |
| IN-03 | R2 | note A attendees {Priya Sharma, Rahul}; note B {Priya Nair}; note C attendees {Rahul} with `Priya to …` | C's item ambiguous with 2 candidates |
| IN-04 | R3 | 1 good + empty + bad-date + no-attendees notes | good ingested; 3 malformed with reasons EMPTY_FILE, INVALID_DATE, MISSING_ATTENDEES |
| IN-05 | R4 | file replaced by an unreadable entry (directory named `x.md`) | skipped w/o crash (directory named .md is not scanned; simulate by stubbing `fs.readFileSync` failure) → `UNREADABLE` |
| IN-06 | R5 | nonexistent folder; path to a file | UsageError; db untouched |
| IN-07 | R5 | empty folder | report all zeros, no throw |
| IN-08 | R6 | ingest twice | second: created 0, merged 0, unchanged = itemsFound; db items deep-equal |
| IN-09 | R7 | notes with 1 unowned, 2 no-due, 1 ambiguous | counts match |
| IN-10 | R8 | nested path on Windows-style separators | stored with `/` |
| IN-11 | R9 | item `due someday` | warning present with file name |
| IN-12 | R10 | note with only Priya Sharma + `Priya to…` while roster has two Priyas | resolved to Priya Sharma |
| IN-13 | – | duplicate item across 3 meetings | 1 stored item, 3 sources, report created 1 / merged 2 |
| IN-14 | – | report persisted in `store.reports()` | length 1 after ingest |
