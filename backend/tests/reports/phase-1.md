# Phase 1 — Test Report

> Schema / DB — migrations for users, jobs, resumes, evaluations

| | |
|---|---|
| **Result** | ✅ ALL PASSED |
| **Tests** | 44 passed / 44 total |
| **Duration** | 0.27s |
| **Test file** | `tests/phase1.test.js` |
| **Run at** | 2026-09-05T13:46:33.266Z |

---

## Phase 1 - the migration runner

4/4 passed

| # | Test | Result |
|---|---|---|
| 1 | there are four migration files, ordered by their numeric prefix | ✅ |
| 2 | every migration is recorded in the schema_migrations ledger | ✅ |
| 3 | running again is idempotent - nothing is applied twice | ✅ |
| 4 | a broken migration rolls back and is not recorded | ✅ |

## Phase 1 - all four tables exist

1/1 passed

| # | Test | Result |
|---|---|---|
| 5 | users, jobs, resumes, evaluations (+ the ledger) are created | ✅ |

## Phase 1 - users table (doc 09)

7/7 passed

| # | Test | Result |
|---|---|---|
| 6 | has every designed column | ✅ |
| 7 | insert + select a row | ✅ |
| 8 | created_at is filled in automatically as an ISO timestamp | ✅ |
| 9 | email is UNIQUE - a duplicate is rejected (this becomes the 409 on register) | ✅ |
| 10 | a different email is accepted | ✅ |
| 11 | a blank username is rejected | ✅ |
| 12 | the password hash is stored, and there is no plain-password column | ✅ |

## Phase 1 - jobs table (doc 02)

11/11 passed

| # | Test | Result |
|---|---|---|
| 13 | has every designed column | ✅ |
| 14 | insert + select a row, with the skill bags round-tripping as JSON | ✅ |
| 15 | matching_mode accepts strict and soft | ✅ |
| 16 | matching_mode rejects anything else (the enum) | ✅ |
| 17 | cutoff_percentage must be between 0 and 100 | ✅ |
| 18 | required experience allows decimals but never a negative | ✅ |
| 19 | must-have skills cannot be an empty list (such a job is unmatchable) | ✅ |
| 20 | good-to-have skills MAY be empty (it is only a bonus) | ✅ |
| 21 | the skill bags must be JSON arrays, not objects or loose text | ✅ |
| 22 | defaults apply when the optional fields are omitted | ✅ |
| 23 | a blank title is rejected, but digits inside a title are fine | ✅ |

## Phase 1 - resumes table (doc 02)

6/6 passed

| # | Test | Result |
|---|---|---|
| 24 | has every designed column | ✅ |
| 25 | insert + select a row, with both skill lists round-tripping | ✅ |
| 26 | name / phone / email are nullable - the LLM may not find them on a resume | ✅ |
| 27 | file_path and extracted_text are required | ✅ |
| 28 | candidate experience can never be negative | ✅ |
| 29 | resume email is NOT unique - the same person may apply to several jobs | ✅ |

## Phase 1 - evaluations table (docs 02, 05, 06)

15/15 passed

| # | Test | Result |
|---|---|---|
| 30 | has every designed column | ✅ |
| 31 | declares both foreign keys | ✅ |
| 32 | has the indexes the read doors will need | ✅ |
| 33 | a row can be created with only job_id + callback_url (the 202 moment) | ✅ |
| 34 | the foreign keys are enforced, not just declared | ✅ |
| 35 | a job that has evaluations cannot be deleted (past results stay intact) | ✅ |
| 36 | callback_url is required | ✅ |
| 37 | the status enum accepts only processing / completed / failed | ✅ |
| 38 | the delivery_status enum accepts only pending / delivered / failed | ✅ |
| 39 | failure_reason is tied to status=failed, in both directions | ✅ |
| 40 | eligible is a strict 0/1 boolean | ✅ |
| 41 | overall_percentage must stay within 0-100 | ✅ |
| 42 | the full lifecycle: processing -> completed with a result -> delivered | ✅ |
| 43 | the failure path: processing -> failed with a reason | ✅ |
| 44 | the JOIN the read doors rely on returns evaluation + candidate together | ✅ |

