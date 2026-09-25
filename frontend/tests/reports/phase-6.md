# Phase 6 — Test Report

> Frontend (React) — every screen renders and calls the right door; loading / empty / error / processing states; login + protected-route redirect; create-job validation mirrors the backend; results end to end (backend mocked at fetch).

| | |
|---|---|
| **Result** | ✅ ALL PASSED |
| **Tests** | 130 passed / 130 total |
| **Test files** | 9 (`frontend/tests/`) |
| **Runner** | Vitest + React Testing Library (jsdom) |
| **Run at** | 2026-09-25T11:33:38.118Z |

| File | Covers | Tests |
|---|---|---|
| `api.test.js` | API layer — the one place that calls the backend | 20/20 |
| `auth.test.jsx` | Login / Register, AuthContext, ProtectedRoute, logout | 23/23 |
| `dashboard.test.jsx` | Dashboard — GET /api/jobs | 8/8 |
| `createJob.test.jsx` | Create Job — POST /api/jobs | 11/11 |
| `jobCandidates.test.jsx` | Job Candidates — list, async states, filters | 22/22 |
| `candidateDetail.test.jsx` | Candidate Detail — GET /api/evaluations/:id | 12/12 |
| `validation.test.js` | Client validation mirrors the backend guards | 23/23 |
| `format.test.js` | Display helpers and the verdict sentence | 10/10 |
| `e2e.test.jsx` | End to end — sign-up to a candidate result | 1/1 |

---

## Phase 6 - API layer: each function calls the right door

8/8 passed

| # | Test | Result |
|---|---|---|
| 1 | getJobs -> () => __vite_ssr_import_1__.getJobs() GET | ✅ |
| 2 | getJobById -> () => __vite_ssr_import_1__.getJobById(3) GET | ✅ |
| 3 | getJobCandidates -> () => __vite_ssr_import_1__.getJobCandidates(3) GET | ✅ |
| 4 | getEvaluationById -> () => __vite_ssr_import_1__.getEvaluationById(9) GET | ✅ |
| 5 | createJob POSTs the job as JSON | ✅ |
| 6 | login and register POST to the auth doors | ✅ |
| 7 | there is no resume-submit function - that door belongs to the ATS (Model A) | ✅ |
| 8 | logout forgets the token (JWTs are stateless - nothing to call) | ✅ |

## Phase 6 - API layer: the JWT is attached

3/3 passed

| # | Test | Result |
|---|---|---|
| 9 | a stored token goes out as Authorization: Bearer on HR doors | ✅ |
| 10 | no token stored -> no Authorization header at all (not "Bearer null") | ✅ |
| 11 | the auth doors never send a token, even a stored one | ✅ |

## Phase 6 - API layer: filters become the query string

3/3 passed

| # | Test | Result |
|---|---|---|
| 12 | no filters -> no query at all (the default is everyone, near-misses included) | ✅ |
| 13 | each filter maps to the backend parameter name | ✅ |
| 14 | filters combine | ✅ |

## Phase 6 - API layer: failures

6/6 passed

| # | Test | Result |
|---|---|---|
| 15 | a non-2xx answer throws ApiError carrying status, code, message and details | ✅ |
| 16 | a network failure becomes ApiError with status 0 and a readable message | ✅ |
| 17 | a body that is not JSON still produces a usable ApiError | ✅ |
| 18 | 401 on a guarded door triggers the unauthorized handler (session died) | ✅ |
| 19 | 401 on the login door is just a wrong password - no logout triggered | ✅ |
| 20 | other errors (403, 404, 500) do not log the user out | ✅ |

## Phase 6 - ProtectedRoute

10/10 passed

| # | Test | Result |
|---|---|---|
| 21 | logged out: /dashboard redirects to /login | ✅ |
| 22 | logged out: /jobs/new redirects to /login | ✅ |
| 23 | logged out: /jobs/1/candidates redirects to /login | ✅ |
| 24 | logged out: /evaluations/7 redirects to /login | ✅ |
| 25 | an expired token counts as logged out | ✅ |
| 26 | a garbage token counts as logged out | ✅ |
| 27 | a valid token reaches the protected page | ✅ |
| 28 | already signed in: /login and /register go to the dashboard | ✅ |
| 29 | "/" goes to the dashboard (and so to /login when logged out) | ✅ |
| 30 | a 401 mid-session (token revoked / expired server-side) sends the user to /login | ✅ |

## Phase 6 - Login screen

6/6 passed

| # | Test | Result |
|---|---|---|
| 31 | renders the design: title, fields, button, link to register | ✅ |
| 32 | success: calls POST /api/auth/login, stores the token, lands on the dashboard | ✅ |
| 33 | after login, the user returns to the page they were bounced from | ✅ |
| 34 | wrong password or unknown email (401): one message, the same for both | ✅ |
| 35 | empty form: client-side errors, and no request is sent | ✅ |
| 36 | server unreachable: a friendly message, the form stays usable | ✅ |

## Phase 6 - Register screen

5/5 passed

| # | Test | Result |
|---|---|---|
| 37 | renders the design, including the bcrypt / 8-character hint | ✅ |
| 38 | success (201): sends username/email/password, signs in straight away | ✅ |
| 39 | duplicate email (409): the backend message shows under the email field | ✅ |
| 40 | weak password: stopped on the client, no request | ✅ |
| 41 | a 400 the client missed is shown per field from the backend details | ✅ |

## Phase 6 - Logout

2/2 passed

| # | Test | Result |
|---|---|---|
| 42 | clears the token and the user, returns to /login | ✅ |
| 43 | after logout, protected pages redirect again | ✅ |

## Phase 6 - Dashboard

8/8 passed

| # | Test | Result |
|---|---|---|
| 44 | calls GET /api/jobs with the Bearer token on page load | ✅ |
| 45 | loading: skeleton cards while the request is in flight | ✅ |
| 46 | data: one card per job with title, date, count, mode, cutoff, years, skills | ✅ |
| 47 | a card links to that job's candidates | ✅ |
| 48 | empty: "No jobs yet" with a way to create one | ✅ |
| 49 | error: the design's message, and Retry calls the door again | ✅ |
| 50 | the navbar: Jobs link active, user email, initials, theme toggle | ✅ |
| 51 | there is no STATE switcher in the real app (it was a design-mockup control) | ✅ |

## Phase 6 - Create Job screen

11/11 passed

| # | Test | Result |
|---|---|---|
| 52 | renders every field from the Job schema | ✅ |
| 53 | valid submit: POST /api/jobs with numbers as numbers, then back to the dashboard | ✅ |
| 54 | empty experience is sent as 0 (the backend default) | ✅ |
| 55 | empty form: every rule reports at once, and nothing is sent | ✅ |
| 56 | cutoff 101 is refused on the client | ✅ |
| 57 | cutoff -1 is refused on the client | ✅ |
| 58 | negative experience is refused on the client | ✅ |
| 59 | the backend still validates: a 400 it returns is shown under the fields | ✅ |
| 60 | a server error shows a message and keeps the form filled in | ✅ |
| 61 | skills: Enter adds (without submitting), Add button adds, duplicates ignored, × removes | ✅ |
| 62 | Cancel returns to the dashboard without sending anything | ✅ |

## Phase 6 - Job Candidates: loading the page

6/6 passed

| # | Test | Result |
|---|---|---|
| 63 | calls both doors with the token: the job and its evaluations | ✅ |
| 64 | loading state while the requests are in flight | ✅ |
| 65 | header: title, mode, cutoff, required years, must-haves | ✅ |
| 66 | stats: evaluated / eligible / processing / failed | ✅ |
| 67 | job not found (404): says so, no Retry | ✅ |
| 68 | server error: message and a working Retry | ✅ |

## Phase 6 - Job Candidates: every async state renders

7/7 passed

| # | Test | Result |
|---|---|---|
| 69 | completed + eligible: score, name, email, Eligible, skills summary, experience | ✅ |
| 70 | near-miss is SHOWN by default: rejected, but with its 68% | ✅ |
| 71 | processing: "Evaluating…", no score, pending verdict | ✅ |
| 72 | failed: the failure_reason is shown, name unknown (extraction never ran) | ✅ |
| 73 | rows keep the backend order (best first, unscored last) | ✅ |
| 74 | clicking a row (or Enter on it) opens that candidate | ✅ |
| 75 | empty: "No candidates yet" and zeroed stats | ✅ |

## Phase 6 - Job Candidates: filters

9/9 passed

| # | Test | Result |
|---|---|---|
| 76 | "Eligible only" asks the backend for eligible=true and narrows the rows | ✅ |
| 77 | min score and min experience sliders send minPercentage / minExperience | ✅ |
| 78 | all three filters combine into one request | ✅ |
| 79 | a slider drag sends ONE request for where it stops, not one per step | ✅ |
| 80 | the stats keep the job totals while the table is filtered | ✅ |
| 81 | no matches: says so and offers a reset | ✅ |
| 82 | Reset clears every filter and shows everyone again | ✅ |
| 83 | a failed filter request shows an error in the table with Retry | ✅ |
| 84 | rowFor helper sanity: a filtered-out row is really gone from the DOM | ✅ |

## Phase 6 - Candidate Detail

12/12 passed

| # | Test | Result |
|---|---|---|
| 85 | calls GET /api/evaluations/:id then GET /api/jobs/:jobId, with the token | ✅ |
| 86 | loading state | ✅ |
| 87 | eligible: everything the evaluation provides | ✅ |
| 88 | no evidence quotes are shown (decision: skill chips only) | ✅ |
| 89 | rejected: missing skills listed in red and the skill gate named | ✅ |
| 90 | failed: the failure_reason, a plain explanation, no score, no skills section | ✅ |
| 91 | failed AFTER extraction keeps the candidate details it has | ✅ |
| 92 | processing: still evaluating, pending score | ✅ |
| 93 | back link goes to that job's candidates, labelled with the job title | ✅ |
| 94 | if the job read fails, the result still shows (degrades, no error screen) | ✅ |
| 95 | evaluation not found (404): says so, no Retry | ✅ |
| 96 | server error: message and Retry | ✅ |

## Phase 6 - create-job validation mirrors createJobSchema

15/15 passed

| # | Test | Result |
|---|---|---|
| 97 | a valid job has no errors | ✅ |
| 98 | empty title -> error on { title: '' } | ✅ |
| 99 | whitespace title -> error on { title: '   ' } | ✅ |
| 100 | no must-have skills -> error on { mustHaveSkills: [] } | ✅ |
| 101 | negative experience -> error on { requiredExperienceYears: '-1' } | ✅ |
| 102 | non-numeric experience -> error on { requiredExperienceYears: 'abc' } | ✅ |
| 103 | bad matching mode -> error on { matchingMode: 'loose' } | ✅ |
| 104 | missing cutoff -> error on { cutoffPercentage: '' } | ✅ |
| 105 | cutoff above 100 -> error on { cutoffPercentage: '101' } | ✅ |
| 106 | cutoff below 0 -> error on { cutoffPercentage: '-5' } | ✅ |
| 107 | non-numeric cutoff -> error on { cutoffPercentage: 'high' } | ✅ |
| 108 | boundaries are allowed: cutoff 0 and 100, experience 0, decimals | ✅ |
| 109 | experience is optional (the backend defaults it to 0) | ✅ |
| 110 | good-to-have skills are optional | ✅ |
| 111 | every broken field is reported at once, like the backend guard | ✅ |

## Phase 6 - auth form validation mirrors the auth guards

6/6 passed

| # | Test | Result |
|---|---|---|
| 112 | register: valid input passes | ✅ |
| 113 | register: name required, email format, password >= 8 | ✅ |
| 114 | register: exactly 8 characters is enough | ✅ |
| 115 | register: over 72 BYTES is refused (bcrypt would silently truncate it) | ✅ |
| 116 | register: a padded email is accepted (the backend trims it) | ✅ |
| 117 | login: email format and a non-empty password | ✅ |

## Phase 6 - backend 400 details map onto form fields

2/2 passed

| # | Test | Result |
|---|---|---|
| 118 | flat and nested paths land on their top-level field; the first message wins | ✅ |
| 119 | no details -> no errors | ✅ |

## Phase 6 - display helpers

3/3 passed

| # | Test | Result |
|---|---|---|
| 120 | backend timestamps (UTC, no zone) are read as UTC | ✅ |
| 121 | percent and years | ✅ |
| 122 | initials from the name, else the email | ✅ |

## Phase 6 - the verdict sentence follows the backend gates

7/7 passed

| # | Test | Result |
|---|---|---|
| 123 | eligible in strict mode: passed both gates | ✅ |
| 124 | eligible in soft mode: only the score gate applies | ✅ |
| 125 | strict rejection with missing skills names them | ✅ |
| 126 | rejection with nothing missing is the score gate | ✅ |
| 127 | soft mode never blames the skill gate | ✅ |
| 128 | processing and failed rows have no verdict to explain | ✅ |
| 129 | without the job (its read failed) it still says something true | ✅ |

## Phase 6 - end to end: an HR user from sign-up to a candidate's result

1/1 passed

| # | Test | Result |
|---|---|---|
| 130 | register -> create a job -> the ATS sends resumes -> review the list -> open one candidate | ✅ |

