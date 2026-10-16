# parser — test cases

| ID | Req | Scenario | Expected |
|----|-----|----------|----------|
| PR-01 | R1,R2,R3 | Front-matter note with date, 3 attendees, title | `ok`, date/title/attendees parsed |
| PR-02 | R1 | No `---`, header as `Date:` / `Attendees:` lines | `ok` |
| PR-03 | R3 | `attendees: [Priya Sharma, Rahul <r@x.com>]` | 2 attendees, email on Rahul |
| PR-04 | R4 | `''` and `'   \n'` | `EMPTY_FILE` |
| PR-05 | R4 | text containing `\0` | `BINARY_FILE` |
| PR-06 | R4 | `---\ndate: 2026-09-01` with no closing `---` | `UNCLOSED_FRONT_MATTER` |
| PR-07 | R2 | no date key | `MISSING_DATE` |
| PR-08 | R2 | `date: 2026-13-45` | `INVALID_DATE` |
| PR-09 | R3 | no attendees / `attendees:` blank | `MISSING_ATTENDEES` |
| PR-10 | R5,R12 | `- [ ] A`, `* [x] B`, `-[ ]C`, `  - [X] D` | 4 items; checked = F,T,F,T |
| PR-11 | R6 | checkbox inside ``` fence; plain `- bullet` | ignored |
| PR-12 | R7 | `Priya to send the quote` / `Priya will send…` / `Priya: send…` / `Priya - send…` / `@Priya send…` | all ownerRaw `Priya`, task `send the quote` (or equivalent) |
| PR-13 | R7 | `Priya Sharma needs to book room` | ownerRaw `Priya Sharma` |
| PR-14 | R8 | `Team to review`, `We should fix`, `TBD: call vendor`, `Someone to email` | ownerRaw null |
| PR-15 | R9 | `Update to the policy doc is needed`, `Follow up to client` | ownerRaw null |
| PR-16 | R10 | `Priya and Rahul to prep demo` | 2 items, slots 0 and 1, owners Priya/Rahul |
| PR-17 | R11 | `Priya to send quote by Friday` @ 2026-09-07 | due 2026-09-11, task `send quote` |
| PR-18 | R11 | `Priya to send quote (due Sept 20)` | due 2026-09-20, no dangling `(` |
| PR-19 | R11 | `Rahul to fix it by hand` | due null, task keeps `by hand` |
| PR-20 | R11 | `Rahul to fix it due someday` | due null, dueRaw `someday`, warning |
| PR-21 | R11 | `Ana to send report, before 2026-09-30` | due 2026-09-30 |
| PR-22 | R13 | CRLF + BOM version of PR-01 | same result |
| PR-23 | R14 | `- [ ]   ` | skipped, warning |
| PR-24 | R15 | items on lines 8 and 11 | `line` 8 and 11 |
| PR-25 | R7 | no owner: `- [ ] Order cake for Friday` | ownerRaw null, task intact |
