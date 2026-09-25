# Phase 5 — Test Report

> Auth — register / login, JWT + API key guards

| | |
|---|---|
| **Result** | ✅ ALL PASSED |
| **Tests** | 62 passed / 62 total |
| **Duration** | 1.77s |
| **Test file** | `tests/phase5.test.js` |
| **Run at** | 2026-09-25T11:32:50.064Z |

---

## Phase 5 - POST /api/auth/register

21/21 passed

| # | Test | Result |
|---|---|---|
| 1 | a valid registration -> 201 with a token and the new user | ✅ |
| 2 | the token works immediately - registering IS logging in | ✅ |
| 3 | the password is never returned, in any shape | ✅ |
| 4 | what is STORED is a bcrypt hash, never the password itself | ✅ |
| 5 | two people who chose the SAME password get different hashes - bcrypt salts | ✅ |
| 6 | a duplicate email -> 409 | ✅ |
| 7 | a duplicate in different case or with spaces is still a duplicate | ✅ |
| 8 | the email is stored normalised | ✅ |
| 9 | a duplicate registration leaves exactly one user behind | ✅ |
| 10 | a password under 8 characters -> 400 | ✅ |
| 11 | exactly 8 characters is accepted - the rule is >=, not > | ✅ |
| 12 | a password longer than bcrypt can hash (72 bytes) -> 400, not a silent truncation | ✅ |
| 13 | the 72-byte limit counts BYTES, not characters | ✅ |
| 14 | a password is not trimmed - a space is a character somebody meant | ✅ |
| 15 | an invalid email -> 400 | ✅ |
| 16 | a missing username, email or password -> 400, naming the field | ✅ |
| 17 | a whitespace-only username -> 400 | ✅ |
| 18 | the wrong TYPE for any field -> 400 | ✅ |
| 19 | an empty body -> 400 listing every missing field at once | ✅ |
| 20 | extra fields are ignored - nobody registers themselves an id or a role | ✅ |
| 21 | a rejected registration writes no user at all | ✅ |

## Phase 5 - POST /api/auth/login

12/12 passed

| # | Test | Result |
|---|---|---|
| 22 | the right password -> 200 with a token and the user | ✅ |
| 23 | the token from login opens the HR doors | ✅ |
| 24 | a wrong password -> 401 | ✅ |
| 25 | an unknown email -> 401 | ✅ |
| 26 | both failures answer identically - the door never says who has an account | ✅ |
| 27 | an unknown email still pays for a comparison - the timing does not leak either | ✅ |
| 28 | login is case-insensitive about the email, exactly as registration was | ✅ |
| 29 | login never returns the hash | ✅ |
| 30 | a missing email or password -> 400, before any lookup | ✅ |
| 31 | an invalid email format -> 400, not 401 | ✅ |
| 32 | an empty password -> 400 from the guard | ✅ |
| 33 | login does NOT apply register's length rule - an old password must still work | ✅ |

## Phase 5 - the JWT guard on the HR doors (doc 09)

13/13 passed

| # | Test | Result |
|---|---|---|
| 34 | every HR door refuses a request with no token -> 401 | ✅ |
| 35 | every HR door accepts a valid token | ✅ |
| 36 | an EXPIRED token -> 401 | ✅ |
| 37 | a TAMPERED token -> 401: the payload cannot be edited without the key | ✅ |
| 38 | a token signed with a DIFFERENT secret -> 401 | ✅ |
| 39 | the "alg: none" trick -> 401: an unsigned token is not a token | ✅ |
| 40 | garbage in the header -> 401, not a 500 | ✅ |
| 41 | a bare token with no scheme -> 401 | ✅ |
| 42 | a different scheme (Basic) -> 401 | ✅ |
| 43 | the scheme is case-insensitive, as HTTP says it is | ✅ |
| 44 | an unauthorised call touches nothing - no query is ever run | ✅ |
| 45 | the guard runs BEFORE the input guards - a bad id with no token is still 401 | ✅ |
| 46 | the 401 body has the same shape as every other error | ✅ |

## Phase 5 - two callers, two mechanisms (doc 09)

5/5 passed

| # | Test | Result |
|---|---|---|
| 47 | the ATS submit door does NOT accept an HR token - it wants the API key | ✅ |
| 48 | the HR read doors do NOT accept the ATS key - a machine is not a person | ✅ |
| 49 | the auth doors themselves are open - they are how you get a token | ✅ |
| 50 | /health stays open - a monitor cannot be asked to log in | ✅ |
| 51 | an unknown path is still 404, not 401 | ✅ |

## Phase 5 - the layers underneath

11/11 passed

| # | Test | Result |
|---|---|---|
| 52 | a token round-trips: sign it, verify it, get the user back | ✅ |
| 53 | the payload carries the minimum - never the password or the hash | ✅ |
| 54 | the token expires in a day (doc 09), not never | ✅ |
| 55 | verifyToken throws Unauthorized for expired, foreign and malformed tokens alike | ✅ |
| 56 | a token whose subject is not a real id is refused, however well signed | ✅ |
| 57 | jwtGuard attaches req.user and calls next with nothing | ✅ |
| 58 | jwtGuard hands the error to next, it never throws at Express | ✅ |
| 59 | getUserByEmail returns null for an unknown email | ✅ |
| 60 | the hash comes back only when it is explicitly asked for | ✅ |
| 61 | the UNIQUE constraint is the real guarantee - the repository turns it into a 409 | ✅ |
| 62 | authService.login rejects with Unauthorized, not by returning null | ✅ |

