# parser — plan

| Step | Task | Status |
|------|------|--------|
| 1 | Pre-checks: BOM strip, CRLF normalise, empty / NUL detection | ☑ |
| 2 | Header extraction (front matter, bare keys) + attendee parsing | ☑ |
| 3 | Body scan with fence tracking; checkbox regex; line numbers | ☑ |
| 4 | Due extraction: walk keyword matches right→left, accept first that `resolveDue` accepts | ☑ |
| 5 | Owner extraction: patterns, non-person list, imperative-verb list, multi-owner split | ☑ |
| 6 | Task clean-up (trim, trailing dot, dangling punctuation) | ☑ |
| 7 | `test/parser.test.js` for PR-01…PR-25 | ☑ |

Order matters: due is stripped **before** owner parsing so `Priya to send quote by Friday` doesn't leak the date into the task.
