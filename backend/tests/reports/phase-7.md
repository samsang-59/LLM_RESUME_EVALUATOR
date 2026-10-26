# Phase 7 — Test Report

> Hardening

| | |
|---|---|
| **Result** | ✅ ALL PASSED |
| **Tests** | 111 passed / 111 total |
| **Duration** | 1.20s |
| **Test file** | `tests/phase7.test.js` |
| **Run at** | 2026-10-26T15:54:11.426Z |

---

## Phase 7 - SSRF: the switch is OFF unless asked for

2/2 passed

| # | Test | Result |
|---|---|---|
| 1 | WEBHOOK_ALLOW_INSECURE defaults to false | ✅ |
| 2 | only the word "true" turns it on - a typo leaves it safe | ✅ |

## Phase 7 - SSRF: the URL as written (checkCallbackUrl)

30/30 passed

| # | Test | Result |
|---|---|---|
| 3 | a public https URL is accepted | ✅ |
| 4 | plain http is refused | ✅ |
| 5 | schemes we cannot POST to are refused | ✅ |
| 6 | something that is not a URL at all is refused | ✅ |
| 7 | an internal address is refused: localhost | ✅ |
| 8 | an internal address is refused: a name under localhost | ✅ |
| 9 | an internal address is refused: localhost with a trailing dot | ✅ |
| 10 | an internal address is refused: loopback | ✅ |
| 11 | an internal address is refused: loopback, elsewhere in 127/8 | ✅ |
| 12 | an internal address is refused: the cloud metadata service | ✅ |
| 13 | an internal address is refused: private 10/8 | ✅ |
| 14 | an internal address is refused: private 172.16/12 | ✅ |
| 15 | an internal address is refused: private 172.16/12, top end | ✅ |
| 16 | an internal address is refused: private 192.168/16 | ✅ |
| 17 | an internal address is refused: carrier-grade NAT | ✅ |
| 18 | an internal address is refused: "this network" | ✅ |
| 19 | an internal address is refused: broadcast | ✅ |
| 20 | an internal address is refused: IPv6 loopback | ✅ |
| 21 | an internal address is refused: IPv6 unique-local | ✅ |
| 22 | an internal address is refused: IPv6 link-local | ✅ |
| 23 | an internal address is refused: IPv4-mapped IPv6 loopback | ✅ |
| 24 | an internal address is refused: IPv4-mapped IPv6 metadata service | ✅ |
| 25 | an internal address is refused: NAT64-wrapped address | ✅ |
| 26 | an internal address is refused: loopback written as one decimal number | ✅ |
| 27 | an internal address is refused: loopback written in hex | ✅ |
| 28 | an internal address is refused: loopback in shortened dotted form | ✅ |
| 29 | the edges of the private ranges are not over-blocked | ✅ |
| 30 | the development switch allows http and local addresses, but still only http(s) | ✅ |
| 31 | isBlockedAddress refuses anything that is not an IP at all | ✅ |
| 32 | public addresses in BOTH families pass - the IPv6 rules do not swallow IPv4 | ✅ |

## Phase 7 - SSRF: the submit door refuses a dangerous callbackUrl (400)

5/5 passed

| # | Test | Result |
|---|---|---|
| 33 | plain http -> 400, and nothing is started | ✅ |
| 34 | the metadata service -> 400, and nothing is started | ✅ |
| 35 | localhost -> 400, and nothing is started | ✅ |
| 36 | a private address -> 400, and nothing is started | ✅ |
| 37 | a public https callbackUrl is accepted -> 202 | ✅ |

## Phase 7 - SSRF: checked again at send time (webhookService.deliver)

9/9 passed

| # | Test | Result |
|---|---|---|
| 38 | a stored http URL to a local receiver is refused, and NOTHING is sent | ✅ |
| 39 | a stored URL with an internal IP is refused without a connection attempt | ✅ |
| 40 | DNS REBINDING: a public-looking name that resolves to 127.0.0.1 is refused, not retried | ✅ |
| 41 | a name resolving to the metadata service is refused | ✅ |
| 42 | a name with one public AND one private address is refused outright | ✅ |
| 43 | the check sits INSIDE the connection: the socket itself uses the guarded lookup | ✅ |
| 44 | a redirect is NOT followed - it could point anywhere, including inside | ✅ |
| 45 | with the development switch on, a local receiver still gets the webhook | ✅ |
| 46 | a blocked delivery is recorded on the row; the result itself is untouched | ✅ |

## Phase 7 - SSRF: safeLookup, the resolver handed to the socket

4/4 passed

| # | Test | Result |
|---|---|---|
| 47 | a public answer passes through in the single-address form | ✅ |
| 48 | ...and in the list form newer sockets ask for | ✅ |
| 49 | an internal answer fails with the blocked code | ✅ |
| 50 | a DNS failure is passed on unchanged (a transient error, not a block) | ✅ |

## Phase 7 - refresh tokens: issued with every login

7/7 passed

| # | Test | Result |
|---|---|---|
| 51 | register returns an access token AND a refresh token | ✅ |
| 52 | login returns the pair too | ✅ |
| 53 | the access token now lives 15 minutes | ✅ |
| 54 | the refresh token lives 7 days (REFRESH_TOKEN_TTL_DAYS) | ✅ |
| 55 | only a HASH is stored - the token itself is nowhere in the database | ✅ |
| 56 | every login gets its own refresh token | ✅ |
| 57 | a refresh token is NOT an access token - the HR doors refuse it | ✅ |

## Phase 7 - refresh tokens: POST /api/auth/refresh (rotation)

14/14 passed

| # | Test | Result |
|---|---|---|
| 58 | a valid refresh token -> 200 with a NEW pair, and the new access token works | ✅ |
| 59 | the refresh door needs no access token - it may well have expired | ✅ |
| 60 | rotation: the token presented is spent and cannot be used twice | ✅ |
| 61 | REUSE DETECTION: replaying a spent token logs that user out everywhere | ✅ |
| 62 | reuse by one user leaves another user signed in | ✅ |
| 63 | two simultaneous refreshes with the same token -> exactly one wins | ✅ |
| 64 | an EXPIRED refresh token -> 401 | ✅ |
| 65 | an unknown refresh token -> 401, the same answer as every other refusal | ✅ |
| 66 | a token whose account no longer exists -> 401 | ✅ |
| 67 | a missing refreshToken -> 400 from the guard | ✅ |
| 68 | a empty refreshToken -> 400 from the guard | ✅ |
| 69 | a blank refreshToken -> 400 from the guard | ✅ |
| 70 | a not a string refreshToken -> 400 from the guard | ✅ |
| 71 | a absurdly long refreshToken -> 400 from the guard | ✅ |

## Phase 7 - refresh tokens: POST /api/auth/logout

5/5 passed

| # | Test | Result |
|---|---|---|
| 72 | logout -> 204, and the refresh token is dead from then on | ✅ |
| 73 | logout ends THAT login only - another device stays signed in | ✅ |
| 74 | logging out twice, or with an unknown token, is still 204 - it reveals nothing | ✅ |
| 75 | logout needs no access token | ✅ |
| 76 | logout with no refreshToken -> 400 | ✅ |

## Phase 7 - refresh tokens: the table

3/3 passed

| # | Test | Result |
|---|---|---|
| 77 | refresh_tokens has the designed columns | ✅ |
| 78 | it belongs to users, and deleting the user deletes its logins | ✅ |
| 79 | the same hash cannot be stored twice | ✅ |

## Phase 7 - per-ATS keys: HR issues them (POST /api/ats-clients)

9/9 passed

| # | Test | Result |
|---|---|---|
| 80 | creating a client -> 201 with the client and its key, shown this once | ✅ |
| 81 | only a HASH of the key is stored | ✅ |
| 82 | two clients get two different keys | ✅ |
| 83 | a missing name -> 400 | ✅ |
| 84 | a empty name -> 400 | ✅ |
| 85 | a blank name -> 400 | ✅ |
| 86 | a not a string name -> 400 | ✅ |
| 87 | a too long name -> 400 | ✅ |
| 88 | the name is trimmed | ✅ |

## Phase 7 - per-ATS keys: list and revoke

6/6 passed

| # | Test | Result |
|---|---|---|
| 89 | GET /api/ats-clients lists every client - names and status, never keys or hashes | ✅ |
| 90 | revoking -> 200 with the client marked inactive | ✅ |
| 91 | revoking twice is harmless and keeps the first timestamp | ✅ |
| 92 | a revoked client stays in the list, as the record of who had access | ✅ |
| 93 | revoking an unknown client -> 404 | ✅ |
| 94 | a malformed id -> 400 | ✅ |

## Phase 7 - per-ATS keys: only HR manages them

6/6 passed

| # | Test | Result |
|---|---|---|
| 95 | post /api/ats-clients without a token -> 401 | ✅ |
| 96 | get /api/ats-clients without a token -> 401 | ✅ |
| 97 | post /api/ats-clients/1/revoke without a token -> 401 | ✅ |
| 98 | post /api/ats-clients with an ATS key instead of a token -> 401 | ✅ |
| 99 | get /api/ats-clients with an ATS key instead of a token -> 401 | ✅ |
| 100 | post /api/ats-clients/1/revoke with an ATS key instead of a token -> 401 | ✅ |

## Phase 7 - per-ATS keys: company A gets key A, company B gets key B

8/8 passed

| # | Test | Result |
|---|---|---|
| 101 | each company's own key opens the submit door | ✅ |
| 102 | revoking B shuts B out and leaves A working | ✅ |
| 103 | a revoked key and a key that never existed get the same answer | ✅ |
| 104 | a revoked key starts nothing: no row, no LLM call | ✅ |
| 105 | the old shared .env key is retired - it opens nothing | ✅ |
| 106 | the guard tells the rest of the request WHICH ats is calling | ✅ |
| 107 | an HR token still cannot submit a resume | ✅ |
| 108 | authenticate() answers null for unknown and revoked keys alike | ✅ |

## Phase 7 - per-ATS keys: the table

3/3 passed

| # | Test | Result |
|---|---|---|
| 109 | ats_clients has the designed columns | ✅ |
| 110 | a blank name is refused by the database too | ✅ |
| 111 | the same key hash cannot be stored twice | ✅ |

