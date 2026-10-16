# followup — test cases
Fixture `today = 2026-09-15`. Priya Sharma: 1 overdue (due 09-10), 1 open (due 09-20), 1 done. Rahul Mehta: 1 open no due. Ana: only done. Unassigned: 2 open. Ambiguous `Priya`: 1 open. Vendor Bob (unknown, no email): 1 open.

| ID | Req | Scenario | Expected |
|----|-----|----------|----------|
| FU-01 | R1 | `all:true` | drafts for Priya Sharma, Rahul Mehta, Vendor Bob only (not Ana) |
| FU-02 | R2 | Priya's body | OVERDUE section before OPEN; done item absent |
| FU-03 | R2 | sorting inside sections | oldest overdue first; open no-due last |
| FU-04 | R3 | overdue line | contains `AT-…`, task, `due 2026-09-10`, `5 days overdue`, source file |
| FU-05 | R3 | no-due open line | `no due date` |
| FU-06 | R4 | `all:true` | skipped has `unassigned` count 2; none in any body |
| FU-07 | R5 | `all:true` | skipped has ambiguous `Priya` with candidates |
| FU-08 | R6 | `owner:'Priya'` | UsageError mentioning `Priya Sharma` and `Priya Nair` |
| FU-09 | R7 | `owner:'Zed Nobody'` | UsageError |
| FU-10 | R7 | `owner:'Ana Torres'` (only done) | no drafts; skipped `nothing-open` |
| FU-11 | R8 | Priya has email; Bob none | `to` set / `null` |
| FU-12 | R9 | subject for Priya | `Action items follow-up: 1 open, 1 overdue`; body starts `Hi Priya,` |
| FU-13 | R10 | `fileSink(tmp).write` | file `.eml` exists; contains `X-Unsent: 1`, `Subject:`; CRLF; `To:` omitted when null |
| FU-14 | R10 | write same draft twice | same path, single file |
| FU-15 | R11 | import module, list exports | none match `/send/i` |
| FU-16 | R11 | scan all `src/*.js` text | no `nodemailer`, `smtp`, `gmail.googleapis`, `messages/send`, `sendMail` |
| FU-17 | R12 | `buildFollowups` with tmp dir watching | no files created |
| FU-18 | R13 | owner name `Evil\r\nBcc: x@y.z` | no `Bcc:` header line in `.eml` |
| FU-19 | R6 | `owner:'Priya Sharma'` when two Priyas exist | draft for Priya Sharma only |
