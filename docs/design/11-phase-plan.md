# LLM Resume Evaluator — Design Doc 11

## Phase Plan (implementation + testing)

> Build **phase by phase**. Each phase ends with a **test round** that must pass
> before moving on. Claude implements each phase and writes + runs the tests.

## How we work
- **Built in the cloud workspace**, each finished phase delivered into the project folder on the user's PC.
- **Tests are automated** (Jest + supertest): unit tests for pure logic, integration tests for endpoints.
- **The LLM is mocked in tests** — real, paid OpenAI calls are non-deterministic, so tests feed fake LLM responses and verify *our code* handles them. The user runs the **real** end-to-end check himself at the end with his own OpenAI key.
- **Testing is detailed** — cover every failure path, not just the happy one.

## Tech
Express (CommonJS) · PostgreSQL (`pg`, raw SQL) · Zod · `openai` (mockable adapter) ·
Jest + supertest · bcrypt + jsonwebtoken · React (Vite) frontend.

---

## Phases

### Phase 0 — Setup
Repo, Express skeleton, config/env, folder structure (layered), DB connection helper, health-check route.
**Test:** server boots · `/health` → 200 · DB connection helper connects.

### Phase 1 — Schema / DB
SQL migrations for all 4 tables: `users`, `jobs`, `resumes`, `evaluations` (+ constraints: unique email, FKs, enums).
**Test:** migrations run · tables/columns/constraints exist · insert + select a row per table.

### Phase 2 — Jobs (first full vertical slice)
router → validator → controller → service → repository for **create / list / get** job.
**Test:** valid create → 201 · every bad input → 400 (each validator rule) · list · get one · missing id → 404.

### Phase 3 — Evaluation pipeline (async + webhook)
Pipeline function (parse → extract → match → score) + async wiring (create eval → background run → update → webhook) + apiKey guard on the submit door.
**Test A (isolation):** call the pipeline directly on sample resume+job (LLM mocked) → assert extraction handling, match+evidence verification, score math, both gates, near-miss kept, failure classification (unreadable, malformed, network-retry).
**Test B (full flow):** POST resume → 202 + id · background updates status processing→completed · webhook fires (mock endpoint) on success **and** failure · bad/missing api key → 401.

### Phase 4 — Results + filters
`getEvaluationById` (JOIN resume) · `listEvaluationsByJob` + filters.
**Test:** detail includes candidate (JOIN) · list shows all incl near-misses · each filter (eligible / min % / min experience) narrows correctly · combined filters · missing id → 404.

### Phase 5 — Auth
`users` table wired · register / login · JWT + apiKey guards · protect the HR routes.
**Test:** register (ok→201+token · duplicate email→409 · weak password→400) · login (ok→token · wrong password→401 · unknown email→401) · protected route without token→401, with valid token→ok, with expired/tampered token→401.

### Phase 6 — Frontend (React)
Setup → API layer → AuthContext → login/register → dashboard → create job → candidates (+filters) → candidate detail → ProtectedRoute.
**Test:** each screen renders + calls the right door · loading/empty/error/processing states · login + protected-route redirect · create-job validation mirrors backend · view results end-to-end (backend mocked or running).

### Phase 7 — Hardening (parked items)
Webhook SSRF (https-only + block internal), refresh tokens, per-ATS keys, token-storage review, prompt-injection residual note.
**Test:** per-item checks.

---

## The loop
```
build phase → write + run its test round → all pass → deliver → next phase
```
