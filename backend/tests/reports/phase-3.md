# Phase 3 — Test Report

> Evaluation pipeline — async + webhook

| | |
|---|---|
| **Result** | ✅ ALL PASSED |
| **Tests** | 116 passed / 116 total |
| **Duration** | 5.06s |
| **Test file** | `tests/phase3.test.js` |
| **Run at** | 2026-09-05T13:24:58.731Z |

---

## Phase 3 - the file guard: what the bytes really are (doc 04)

6/6 passed

| # | Test | Result |
|---|---|---|
| 1 | a real PDF is recognised | ✅ |
| 2 | a real DOCX is recognised | ✅ |
| 3 | an executable renamed resume.pdf is not a PDF - the name lies, the bytes do not | ✅ |
| 4 | a spreadsheet is rejected even though it has the same ZIP magic bytes | ✅ |
| 5 | an empty buffer and a non-buffer are both rejected | ✅ |
| 6 | plain text that merely mentions %PDF- later on is not a PDF | ✅ |

## Phase 3 - STEP 1 parse: file -> text (no LLM)

8/8 passed

| # | Test | Result |
|---|---|---|
| 7 | a real PDF gives back its text | ✅ |
| 8 | a real DOCX gives back its text | ✅ |
| 9 | a scanned resume (a picture of text) fails as unreadable_resume | ✅ |
| 10 | a file with only a few stray characters is unreadable too | ✅ |
| 11 | a corrupt file that got past the guard fails as unreadable, not as a crash | ✅ |
| 12 | an empty DOCX body is unreadable | ✅ |
| 13 | ragged whitespace is tidied without losing the paragraph breaks | ✅ |
| 14 | parsing never calls the LLM - it is a library job | ✅ |

## Phase 3 - STEP 2 extraction: LLM call #1

16/16 passed

| # | Test | Result |
|---|---|---|
| 15 | the resume is turned into the structured shape from doc 02 | ✅ |
| 16 | our rules go in the system message and the resume goes in the user message | ✅ |
| 17 | the system prompt states the "data, not instructions" rule | ✅ |
| 18 | temperature is 0 - facts, not creativity | ✅ |
| 19 | the reply is constrained by a strict JSON schema, not just asked for nicely | ✅ |
| 20 | skills are trimmed and de-duplicated regardless of case | ✅ |
| 21 | an absent name/phone/email comes through as null, not as an empty string | ✅ |
| 22 | a reply that is not JSON -> malformed_output, and is NEVER retried | ✅ |
| 23 | valid JSON in the wrong shape -> malformed_output | ✅ |
| 24 | a field of the wrong type -> malformed_output (the local re-check catches it) | ✅ |
| 25 | an empty reply -> malformed_output | ✅ |
| 26 | a network failure is retried, and gives up as "network" | ✅ |
| 27 | a network blip that clears is not a failure at all | ✅ |
| 28 | a rate limit (429) is retried, and gives up as "llm_overloaded" | ✅ |
| 29 | an overloaded provider (503) is retried as llm_overloaded too | ✅ |
| 30 | a bad API key (401) is our bug, not a busy provider - and is not retried | ✅ |

## Phase 3 - STEP 3 matching: LLM for words, code for numbers

15/15 passed

| # | Test | Result |
|---|---|---|
| 31 | grounded matches are kept | ✅ |
| 32 | a match whose evidence the candidate does not have is REJECTED as a hallucination | ✅ |
| 33 | "matched" with no evidence at all is rejected - a claim is not proof | ✅ |
| 34 | evidence is grounded case-insensitively - "node.js" still proves "Node.js" | ✅ |
| 35 | a requirement the model simply did not answer counts as missing | ✅ |
| 36 | a requirement the model invented is ignored - our list decides, not its reply | ✅ |
| 37 | the RAW resume text is never sent to the matching call - only the clean lists | ✅ |
| 38 | extra skills are everything not spent proving a must-have (good-to-haves included) | ✅ |
| 39 | the candidate skill list is used and listed skills are pooled with used ones | ✅ |
| 40 | experience is closeness, not a cutoff: 1.5 of 3 years scores 0.5 | ✅ |
| 41 | more experience than required is capped at 1, never a bonus | ✅ |
| 42 | a job requiring 0 years gives everyone full credit | ✅ |
| 43 | no experience against a job that wants some scores 0, it does not throw | ✅ |
| 44 | the experience number is not rounded | ✅ |
| 45 | matching one resume against one job makes exactly ONE LLM call | ✅ |

## Phase 3 - STEP 4 scoring: pure code, both gates

12/12 passed

| # | Test | Result |
|---|---|---|
| 46 | a perfect candidate scores 100 and is eligible | ✅ |
| 47 | the weights are skills 75 / experience 25 | ✅ |
| 48 | experience alone cannot carry a candidate | ✅ |
| 49 | experience alone cannot eliminate a candidate either | ✅ |
| 50 | GATE 1 (strict): one missing must-have eliminates, however high the score | ✅ |
| 51 | GATE 1 does not apply in soft mode - a big penalty, but still ranked | ✅ |
| 52 | GATE 2 (cutoff) applies in BOTH modes | ✅ |
| 53 | landing exactly on the cutoff passes - the gate is >=, not > | ✅ |
| 54 | eligible needs BOTH gates, never just one | ✅ |
| 55 | the NEAR-MISS is kept: the % is computed even when a gate eliminates | ✅ |
| 56 | the percentage is not rounded away | ✅ |
| 57 | scoring is pure - the same input always gives the same answer, with no LLM call | ✅ |

## Phase 3 - Test A: the pipeline in isolation (LLM mocked)

13/13 passed

| # | Test | Result |
|---|---|---|
| 58 | a good resume produces a completed evaluation with every result column filled | ✅ |
| 59 | exactly TWO LLM calls per resume: extract, then match | ✅ |
| 60 | the candidate is stored and linked to the evaluation | ✅ |
| 61 | a DOCX resume runs through the same pipeline | ✅ |
| 62 | an unreadable resume fails before a single (paid) LLM call is made | ✅ |
| 63 | a malformed LLM reply fails the evaluation as malformed_output | ✅ |
| 64 | an unreachable LLM fails the evaluation as network | ✅ |
| 65 | an overloaded LLM fails the evaluation as llm_overloaded | ✅ |
| 66 | a failure in the SECOND call still leaves the candidate on record | ✅ |
| 67 | an unexpected bug is recorded honestly as internal_error, not blamed on the resume | ✅ |
| 68 | a near-miss is COMPLETED, not failed - ineligible but with its % on record | ✅ |
| 69 | a resume that tries prompt injection cannot set its own score | ✅ |
| 70 | even if the model claims every match, ungrounded evidence cannot inflate the score | ✅ |

## Phase 3 - STEP 5 webhook delivery

9/9 passed

| # | Test | Result |
|---|---|---|
| 71 | the result is POSTed as JSON to the callbackUrl on success | ✅ |
| 72 | the webhook fires on FAILURE too, carrying the reason instead of a result | ✅ |
| 73 | a transient 500 is retried, and the delivery still succeeds | ✅ |
| 74 | a server that never recovers ends as delivery_status = failed | ✅ |
| 75 | a permanent 404 is NOT retried - a bad URL never becomes a good one | ✅ |
| 76 | a dropped connection is transient, so it is retried | ✅ |
| 77 | THE SAFETY NET: an undeliverable webhook never damages the stored result | ✅ |
| 78 | the transient/permanent split is exactly doc 06's | ✅ |
| 79 | deliver() reports a failure rather than throwing it | ✅ |

## Phase 3 - Test B: POST /api/jobs/:jobId/evaluations (the door)

6/6 passed

| # | Test | Result |
|---|---|---|
| 80 | a valid submission is accepted with 202 and an id, immediately | ✅ |
| 81 | the row is already "processing" when the 202 comes back - the work runs after | ✅ |
| 82 | processing -> completed, with the webhook fired at a real endpoint | ✅ |
| 83 | processing -> failed, and the webhook fires for that too | ✅ |
| 84 | a DOCX upload is accepted just like a PDF | ✅ |
| 85 | the file is stored under a name WE generate - the uploaded one is discarded | ✅ |

## Phase 3 - the apiKey guard on the submit door (doc 09)

7/7 passed

| # | Test | Result |
|---|---|---|
| 86 | no x-api-key header -> 401 | ✅ |
| 87 | a wrong x-api-key -> 401 | ✅ |
| 88 | a key of the right length but the wrong bytes -> 401 | ✅ |
| 89 | an empty x-api-key -> 401 | ✅ |
| 90 | an unauthorised call starts nothing: no row, no file, no LLM call | ✅ |
| 91 | the guard fails CLOSED when no key is configured on the server | ✅ |
| 92 | the correct key is accepted | ✅ |

## Phase 3 - the submit guard, rule by rule (doc 04 Guard 1)

15/15 passed

| # | Test | Result |
|---|---|---|
| 93 | no file attached -> 400 | ✅ |
| 94 | an executable renamed resume.pdf -> 400, judged by content | ✅ |
| 95 | a spreadsheet (same ZIP magic bytes as DOCX) -> 400 | ✅ |
| 96 | an empty file -> 400 | ✅ |
| 97 | an oversized file -> 400, and it is never parsed | ✅ |
| 98 | the file sent under the wrong field name -> 400 | ✅ |
| 99 | callbackUrl missing -> 400 | ✅ |
| 100 | callbackUrl that is not a URL -> 400 | ✅ |
| 101 | a callbackUrl with a scheme we cannot POST to -> 400 | ✅ |
| 102 | an https callbackUrl is accepted | ✅ |
| 103 | a malformed :jobId is 400 from the guard, not 404 | ✅ |
| 104 | a well-formed :jobId with no such job -> 404 (existence is the service's job) | ✅ |
| 105 | an unknown job costs nothing - no row, no file, no LLM call | ✅ |
| 106 | a rejected submission writes nothing to the database | ✅ |
| 107 | the error body keeps the same shape as every other guard | ✅ |

## Phase 3 - the layers underneath

9/9 passed

| # | Test | Result |
|---|---|---|
| 108 | createEvaluation starts the row empty, processing and pending | ✅ |
| 109 | updateEvaluation is partial - it leaves untouched columns alone | ✅ |
| 110 | updateEvaluation only touches whitelisted columns | ✅ |
| 111 | updateEvaluation with nothing to change is a no-op, not a broken query | ✅ |
| 112 | the JSON skill bags come back as real arrays, and booleans as booleans | ✅ |
| 113 | the DB refuses a failed row with no reason - the pairing is enforced | ✅ |
| 114 | a PipelineError carries the reason that gets stored | ✅ |
| 115 | the background run is trackable, and empties once the work is done | ✅ |
| 116 | two submissions run independently | ✅ |

