# Phase 2 — Test Report

> Jobs — first full vertical slice (router → validator → controller → service → repository)

| | |
|---|---|
| **Result** | ✅ ALL PASSED |
| **Tests** | 47 passed / 47 total |
| **Duration** | 1.38s |
| **Test file** | `tests/phase2.test.js` |
| **Run at** | 2026-09-05T13:46:33.262Z |

---

## Phase 2 - POST /api/jobs (the happy path)

10/10 passed

| # | Test | Result |
|---|---|---|
| 1 | a valid job is created -> 201 with the job and its new id | ✅ |
| 2 | the skill bags come back as real arrays, not JSON text | ✅ |
| 3 | the optional fields default correctly when omitted | ✅ |
| 4 | soft mode is accepted as well as strict | ✅ |
| 5 | decimal experience is kept exactly (1.5 years) | ✅ |
| 6 | digits inside a title are fine - we ban the wrong type, not digits | ✅ |
| 7 | surrounding whitespace is trimmed from the title and the skills | ✅ |
| 8 | the cutoff boundaries 0 and 100 are both allowed | ✅ |
| 9 | the job is really persisted - it can be read back afterwards | ✅ |
| 10 | unknown extra fields are ignored, never stored | ✅ |

## Phase 2 - POST /api/jobs (every validator rule -> 400)

22/22 passed

| # | Test | Result |
|---|---|---|
| 11 | no body at all | ✅ |
| 12 | title missing | ✅ |
| 13 | title is a number, not a string | ✅ |
| 14 | title is blank / only whitespace | ✅ |
| 15 | mustHaveSkills missing | ✅ |
| 16 | mustHaveSkills is an empty list (a job with no requirements) | ✅ |
| 17 | mustHaveSkills is a string instead of a list | ✅ |
| 18 | mustHaveSkills contains a number | ✅ |
| 19 | mustHaveSkills contains a blank string | ✅ |
| 20 | goodToHaveSkills is not a list | ✅ |
| 21 | goodToHaveSkills contains a non-string | ✅ |
| 22 | requiredExperienceYears is a string | ✅ |
| 23 | requiredExperienceYears is negative | ✅ |
| 24 | matchingMode missing | ✅ |
| 25 | matchingMode is neither strict nor soft | ✅ |
| 26 | cutoffPercentage missing | ✅ |
| 27 | cutoffPercentage is a string | ✅ |
| 28 | cutoffPercentage is below 0 | ✅ |
| 29 | cutoffPercentage is above 100 | ✅ |
| 30 | the error body has a consistent, frontend-friendly shape | ✅ |
| 31 | several problems are reported together, not one at a time | ✅ |
| 32 | a rejected request writes nothing to the database | ✅ |

## Phase 2 - GET /api/jobs (list)

4/4 passed

| # | Test | Result |
|---|---|---|
| 33 | an empty database returns 200 and an empty list, not a 404 | ✅ |
| 34 | every created job is listed | ✅ |
| 35 | the newest job comes first (HR dashboard order) | ✅ |
| 36 | listed jobs carry parsed skill arrays too | ✅ |

## Phase 2 - GET /api/jobs/:jobId (get one)

7/7 passed

| # | Test | Result |
|---|---|---|
| 37 | an existing job is returned in full | ✅ |
| 38 | the right job is returned when several exist | ✅ |
| 39 | an id that does not exist -> 404 | ✅ |
| 40 | a non-numeric id -> 400 from the guard, not 404 | ✅ |
| 41 | id 0 and a negative id are both rejected as bad shape | ✅ |
| 42 | a decimal id is rejected as bad shape | ✅ |
| 43 | a well-formed id that simply has no row -> 404 | ✅ |

## Phase 2 - the layers underneath

4/4 passed

| # | Test | Result |
|---|---|---|
| 44 | the repository returns null for a missing job (it does not throw) | ✅ |
| 45 | the service turns that null into a NotFoundError (which becomes the 404) | ✅ |
| 46 | the repository round-trips a job unchanged | ✅ |
| 47 | an unknown /api path still returns the standard 404 | ✅ |

