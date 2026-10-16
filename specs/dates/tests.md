# dates — test cases
Reference week: **2026-09-07 is a Monday**; 2026-09-09 Wed; 2026-09-11 Fri; 2026-09-12 Sat.

| ID | Req | Input (phrase @ meeting) | Expected |
|----|-----|--------------------------|----------|
| DT-01 | R1 | `2026-09-20` @ 2026-09-07 | `2026-09-20` |
| DT-02 | R1 | `2026-02-30` | `null` |
| DT-03 | R2 | `today` @ 09-07 / `EOD` @ 09-07 | `2026-09-07` |
| DT-04 | R2 | `tomorrow` @ 2026-09-07 | `2026-09-08` |
| DT-05 | R3 | `Friday` @ Mon 2026-09-07 | `2026-09-11` |
| DT-06 | R3 | `Friday` @ Fri 2026-09-11 (same weekday) | `2026-09-18` |
| DT-07 | R3 | `this Fri` @ Wed 2026-09-09 | `2026-09-11` |
| DT-08 | R4 | `next Tuesday` @ Wed 2026-09-09 | `2026-09-15` |
| DT-09 | R4 | `next Tuesday` @ Mon 2026-09-07 | `2026-09-15` |
| DT-10 | R5 | `in 3 days` @ 09-07 → `2026-09-10`; `in 2 weeks` → `2026-09-21` | as stated |
| DT-11 | R6 | `next week` @ Mon 2026-09-07 | `2026-09-18` |
| DT-12 | R6 | `end of week` @ Mon 09-07 → `2026-09-11`; `EOW` @ Sat 09-12 → `2026-09-18` | as stated |
| DT-13 | R7 | `end of month` @ 2026-09-07 → `2026-09-30`; `EOM` @ 2026-02-10 → `2026-02-28` | as stated |
| DT-14 | R8 | `Sept 20`, `September 20th`, `20 Sep`, `20th of September`, `Sep 20, 2026` @ 09-07 | all `2026-09-20` |
| DT-15 | R8 | `Sep 5` @ 2026-09-07 (before meeting) | `2027-09-05` |
| DT-16 | R8 | `Feb 30` | `null` |
| DT-17 | R9 | `Friday EOD`, `FRIDAY.`, `  friday ) ` @ 09-07 | all `2026-09-11` |
| DT-18 | R10 | `soon`, `ASAP`, `whenever`, `` | `null` |
| DT-19 | R11 | `Friday` @ 2026-10-30 (across DST end) | `2026-11-06` |
| DT-20 | – | `isValidISO('2026-13-01')` false, `addDays('2026-12-31',1)` = `2027-01-01` | as stated |
