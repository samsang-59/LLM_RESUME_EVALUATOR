# LLM Resume Evaluator — Design Doc 05

## Controllers (the thin traffic layer)

> A controller does **no business logic.** It only:
> **1.** takes the already-validated request → **2.** calls the right **service** →
> **3.** sends the response back.
> All the real work (parse, LLM, match, score, DB) lives in the **service** layer.

---

## The big decision we made: the submit-resume door is ASYNC

Because the pipeline is slow (LLM call), we chose **asynchronous + webhook**:

```
Caller sends resume (+ callbackUrl)
      │
      ▼
Controller  ── creates evaluation record (status = "processing")
      │        and replies INSTANTLY:  202 Accepted { evaluationId, status }
      │
      ▼   (meanwhile, in the background)
Background job:  parse → LLM extract → match → score → store result
      │                                   status → "completed" (or "failed")
      ▼
We POST the result to the caller's callbackUrl   ← the webhook
```

Two ripples this created (folded into Docs 02 & 04):
- **`status`** field on evaluations → `processing` / `completed` / `failed`
- **`callbackUrl`** → sent per submission, **validated** (valid URL; https; block internal addresses = SSRF guard, harden later), **stored** on the evaluation record

---

## Every door → its controller

| Door | Controller does | Calls service | Responds |
|---|---|---|---|
| **POST /api/jobs** | take validated job data → create it | `jobService.createJob()` | **201** + created job |
| **POST /api/jobs/:jobId/evaluations** | take file + jobId + callbackUrl → start async pipeline | `evaluationService.startEvaluation()` | **202** + `{ evaluationId, status: "processing" }` |
| **GET /api/jobs** | ask for all jobs | `jobService.listJobs()` | **200** + list |
| **GET /api/jobs/:jobId** | ask for one job | `jobService.getJob()` | **200** + job / **404** |
| **GET /api/jobs/:jobId/evaluations** | ask for all evaluations of a job | `evaluationService.listByJob()` | **200** + list |
| **GET /api/evaluations/:id** | ask for one evaluation | `evaluationService.getById()` | **200** (may be `processing` or `completed`) / **404** |

Notice: every controller is **2–3 lines of real intent.** No `if`s about scoring, no
LLM code, no SQL — those are the service's job.

---

## Existence checks live here (not in the validator)

Remember from Doc 04: the validator only checks **shape** ("is `:jobId` a valid id
format?"). Whether the job **actually exists** is a **DB lookup** → the service does
it, and the controller turns "not found" into a **404** response.

Example — submit-resume:
1. controller calls `evaluationService.startEvaluation(jobId, file, callbackUrl)`
2. service looks up the job → doesn't exist → throws `NotFound`
3. controller catches it → responds **404** (never starts the pipeline, never calls the LLM)

---

## Error handling — kept out of the controllers

Controllers stay thin by **not** writing try/catch everywhere. Services throw typed
errors (`NotFound`, `BadInput`, …); one **central error handler** (Express
middleware) turns them into the right HTTP status:

| Error from service | HTTP response |
|---|---|
| NotFound | 404 |
| Validation / BadInput | 400 |
| anything unexpected | 500 |

---

## Standard status codes we'll use

- **201** — job created
- **202** — resume accepted, processing in background
- **200** — reads (list/get)
- **400** — bad input (guard failed)
- **404** — job/evaluation doesn't exist
- **500** — unexpected server error

---

## Settled ✅
- Controllers are thin: receive → call service → respond
- Submit-resume = **async**: 202 instantly + background pipeline + **webhook** POST to callbackUrl
- `status` and `callbackUrl` added to the evaluation (Docs 02 & 04 updated)
- Existence checks → service (controller returns 404)
- Errors → central error handler → correct status code

## Noted for later
- Webhook hardening: https-only + block internal addresses (SSRF)
- Webhook retries if the caller's URL is temporarily down (service-layer concern)

---

*Next doc: 06 — Services (the core: parse → LLM extract → match → score → webhook). The big one.*
