# owners — test cases
Fixtures: attendees A = {Priya Sharma, Rahul Mehta}; B = {Priya Sharma, Priya Nair}; roster = {Priya Sharma, Priya Nair, Rahul Mehta, Ana Torres}.

| ID | Req | Scenario | Expected |
|----|-----|----------|----------|
| OW-01 | R1 | raw `null`, raw `'  '` | status none, owner null |
| OW-02 | R2 | `priya sharma` with A | resolved, `Priya Sharma` |
| OW-03 | R3 | `Priya` with A | resolved, `Priya Sharma` |
| OW-04 | R4 | `Priya` with B | ambiguous, owner `Priya`, candidates both |
| OW-05 | R5 | `Ana` with A, roster has one Ana | resolved `Ana Torres` |
| OW-06 | R5 | `Priya` with attendees {Rahul} (roster has 2 Priyas) | ambiguous |
| OW-07 | R5 | `Vendor Bob` not anywhere | unknown, owner `Vendor Bob` |
| OW-08 | R6 | `Priya S.` with B | resolved `Priya Sharma` |
| OW-09 | R6 | `Priya N` with B | resolved `Priya Nair` |
| OW-10 | R2 | full name `Priya Nair` with attendees {Priya Sharma} but roster has her | resolved via roster |
| OW-11 | R7 | ownerKey for resolved/ambiguous/unknown/none | `r:priya sharma`, `a:priya`, `u:vendor bob`, `n:` |
| OW-12 | R8 | query `Priya` vs items {Priya Sharma, Priya Nair, ambiguous Priya, Rahul Mehta} | first three match |
| OW-13 | R8 | query `Priya Nair` | only Priya Nair |
| OW-14 | R8 | query `unassigned` | only owner-less items |
| OW-15 | R9 | resolved owner with email | email returned |
| OW-16 | R10 | raw `sean obrien` vs attendee `Sean O'Brien` | resolved |
