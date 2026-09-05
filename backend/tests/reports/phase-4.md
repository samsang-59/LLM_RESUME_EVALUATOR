# Phase 4 — Test Report

> Results + filters

| | |
|---|---|
| **Result** | ✅ ALL PASSED |
| **Tests** | 69 passed / 69 total |
| **Duration** | 1.77s |
| **Test file** | `tests/phase4.test.js` |
| **Run at** | 2026-09-05T13:46:33.260Z |

---

## Phase 4 - GET /api/evaluations/:id (the detail door)

12/12 passed

| # | Test | Result |
|---|---|---|
| 1 | a completed evaluation comes back whole - every result column filled | ✅ |
| 2 | the skill bags are real arrays and eligible is a real boolean, not 1/0 | ✅ |
| 3 | an ineligible candidate is eligible:false, not a missing field | ✅ |
| 4 | THE NEAR-MISS: a rejected candidate still shows the percentage they scored | ✅ |
| 5 | a still-processing evaluation is a 200, not a 404 - the result is simply not in yet | ✅ |
| 6 | a failed evaluation carries its failure_reason instead of a result | ✅ |
| 7 | a failure AFTER extraction still shows the candidate - HR gets a name, not a blank row | ✅ |
| 8 | the webhook fields are readable too - this door is the delivery backup | ✅ |
| 9 | an unknown id -> 404, in the same error shape as every other door | ✅ |
| 10 | a malformed id is 400 from the guard, not 404 - shape before existence | ✅ |
| 11 | id 0 and a negative id are rejected by shape as well | ✅ |
| 12 | reading one evaluation is exactly ONE query - the JOIN, not a second trip | ✅ |

## Phase 4 - the JOIN: the candidate travels with the result

6/6 passed

| # | Test | Result |
|---|---|---|
| 13 | the candidate comes back nested inside the evaluation | ✅ |
| 14 | the candidate's skill bags are arrays, not the JSON text the column holds | ✅ |
| 15 | an absent name / phone / email stays null - the resume simply did not have one | ✅ |
| 16 | the resume text and the file path are NOT exposed | ✅ |
| 17 | the JOIN is a LEFT join - an evaluation with no resume yet is still returned | ✅ |
| 18 | two candidates never get each other's details | ✅ |

## Phase 4 - GET /api/jobs/:jobId/evaluations (the list door)

9/9 passed

| # | Test | Result |
|---|---|---|
| 19 | with no filters, EVERY candidate for the job comes back - near-misses included | ✅ |
| 20 | processing and failed rows are listed too, with their state on show | ✅ |
| 21 | every row carries its own candidate, from the same single query | ✅ |
| 22 | the list is ranked - highest percentage first, the not-yet-scored last | ✅ |
| 23 | only THIS job's candidates are listed | ✅ |
| 24 | a real job with nobody in it is an empty list and a 200 - not a 404 | ✅ |
| 25 | an unknown job -> 404: "no candidates" and "no such job" are different answers | ✅ |
| 26 | a malformed :jobId is 400 from the guard, not 404 | ✅ |
| 27 | a list row is the same shape as the detail row - one contract, not two | ✅ |

## Phase 4 - the filters, one at a time

12/12 passed

| # | Test | Result |
|---|---|---|
| 28 | eligible=true keeps only the candidates who passed both gates | ✅ |
| 29 | eligible=false keeps only the ones a gate eliminated | ✅ |
| 30 | an unfinished evaluation is neither eligible nor ineligible - it is unknown | ✅ |
| 31 | minPercentage narrows to the candidates at or above that score | ✅ |
| 32 | minPercentage is >=, not > - landing exactly on the number keeps you in | ✅ |
| 33 | minPercentage=0 keeps every SCORED candidate, and only those | ✅ |
| 34 | a minPercentage nobody reaches gives an empty list, not an error | ✅ |
| 35 | minExperience narrows on the snapshotted candidate years | ✅ |
| 36 | minExperience is >= too - exactly 3 years passes a 3-year filter | ✅ |
| 37 | a decimal minExperience is honoured, not rounded | ✅ |
| 38 | each filter only ever NARROWS - it can never add a row | ✅ |
| 39 | a filtered list keeps its ranking and its candidates | ✅ |

## Phase 4 - the filters combined

6/6 passed

| # | Test | Result |
|---|---|---|
| 40 | eligible + minPercentage narrows on BOTH, not on whichever came last | ✅ |
| 41 | all three at once | ✅ |
| 42 | the order of the query parameters makes no difference | ✅ |
| 43 | combined filters are an AND - a row must satisfy every one of them | ✅ |
| 44 | a combination nobody satisfies is an empty list | ✅ |
| 45 | the same filters applied to another job stay scoped to the job in the URL | ✅ |

## Phase 4 - the filter guard, rule by rule (doc 04)

15/15 passed

| # | Test | Result |
|---|---|---|
| 46 | eligible=maybe -> 400 | ✅ |
| 47 | eligible=1 -> 400: a URL can carry an unambiguous word, so we insist on one | ✅ |
| 48 | an empty eligible -> 400 | ✅ |
| 49 | TRUE and True are accepted - the case of a word is not a rule | ✅ |
| 50 | minPercentage that is not a number -> 400 | ✅ |
| 51 | an empty minPercentage -> 400, not a silent filter of zero | ✅ |
| 52 | minPercentage below 0 or above 100 -> 400 | ✅ |
| 53 | the 0 and 100 boundaries are both allowed | ✅ |
| 54 | a negative minExperience -> 400 | ✅ |
| 55 | minExperience that is not a number -> 400 | ✅ |
| 56 | a filter repeated twice is an array, not a number -> 400 | ✅ |
| 57 | SQL in a filter never reaches the database - it is rejected as not a number | ✅ |
| 58 | unknown query parameters are ignored, never turned into a filter | ✅ |
| 59 | a rejected filter is refused before any query runs | ✅ |
| 60 | every bad filter is reported, not just the first one | ✅ |

## Phase 4 - the layers underneath

9/9 passed

| # | Test | Result |
|---|---|---|
| 61 | getEvaluationById returns null for an unknown id - the 404 is the service's call | ✅ |
| 62 | the service turns that null into NotFound | ✅ |
| 63 | listByJob refuses an unknown job rather than returning an empty list | ✅ |
| 64 | listByJob with no filters returns everything for the job | ✅ |
| 65 | the repository takes filters as values, and undefined adds no clause | ✅ |
| 66 | eligible=false is a filter, not an absent one - a falsy value still counts | ✅ |
| 67 | minPercentage 0 is a filter too, not a missing one | ✅ |
| 68 | toEvaluationWithCandidate maps a joined row, and null when there is no resume | ✅ |
| 69 | a job with no evaluations lists as an empty array, not null | ✅ |

