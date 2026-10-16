# cli — plan

| Step | Task | Status |
|------|------|--------|
| 1 | Argv parser (flags with values, booleans, positionals; unknown flag ⇒ usage error) | ☑ |
| 2 | Formatters: ingest report, list table, draft summary | ☑ |
| 3 | Command handlers (`ingest`, `list`, `done`, `followup`, `serve`) | ☑ |
| 4 | Error → exit-code mapping (`UsageError`→2, others→1) | ☑ |
| 5 | `bin/actiontrack.js` shim + `package.json` bin/scripts | ☑ |
| 6 | `test/cli.test.js` for CL-01…CL-18 | ☑ |
