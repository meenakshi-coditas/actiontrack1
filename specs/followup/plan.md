# followup — plan

| Step | Task | Status |
|------|------|--------|
| 1 | Group non-done items by `ownerKey`; skip none/ambiguous with reasons | ☑ |
| 2 | Owner-argument resolution (full name exact; single token → distinct owners; ambiguity error) | ☑ |
| 3 | Body/subject renderer (sections, sorting, overdue days) | ☑ |
| 4 | `fileSink` (.eml, CRLF, slug, header sanitising) + `createDrafts` | ☑ |
| 5 | `test/followup.test.js` for FU-01…FU-19 (incl. no-send guard tests) | ☑ |

Extension point: a Gmail-MCP sink only needs `{ write(draft) → {path|id} }`; nothing else changes.
