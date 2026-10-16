# ingest — plan

| Step | Task | Status |
|------|------|--------|
| 1 | Recursive `.md` walker (sorted, forward-slash relative paths) | ☑ |
| 2 | Pass 1: read + `parseNote`, collect malformed (`UNREADABLE` on I/O error) | ☑ |
| 3 | Roster build + `store.addPeople` | ☑ |
| 4 | Pass 2: sort by `(date,file)`, resolve owners, upsert, tally | ☑ |
| 5 | Report assembly, persist, save | ☑ |
| 6 | `test/ingest.test.js` for IN-01…IN-14 | ☑ |
