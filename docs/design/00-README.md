# LLM Resume Evaluator — Design Docs

An internal, company-side backend service (LLM application) that evaluates resumes
arriving from a third-party ATS against an HR job description, and returns a match
result. Designed layer by layer, backend first, then frontend.

## Read in order

| # | Doc | What it covers |
|---|---|---|
| 01 | [Project Overview + Tech Stack](01-project-overview-and-tech-stack.md) | what we're building, hybrid approach, Node/Express + OpenAI + SQL |
| 02 | [Schema Design](02-schema-design.md) | the 3 SQL tables (resumes, jobs, evaluations) |
| 03 | [Router](03-router-design.md) | the 6 API endpoints |
| 04 | [Validators](04-validators.md) | the guards at each door (file + job input) |
| 05 | [Controllers](05-controllers.md) | thin layer; async + webhook decision |
| 06 | [Services](06-services.md) | the 5-step pipeline (parse → extract → match → score → webhook) |
| 07 | [Repository](07-repository.md) | the DB-query layer (3 repos) |
| 08 | [Frontend Screens](08-frontend.md) | HR dashboard, 5 screens (Model A) |
| 09 | [Authentication](09-authentication.md) | JWT (HR) + API key (ATS), across all layers |
| 10 | [Frontend Architecture](10-frontend-architecture.md) | components, API layer, routing, state, auth handling |
| 11 | [Phase Plan](11-phase-plan.md) | the 8 build phases and the test round that closes each one |

## Tech stack
- **Backend:** Node.js + Express
- **LLM:** OpenAI (via the `openai` SDK) — structured output with a Zod-style schema
- **DB:** SQL (Postgres recommended)
- **Frontend:** React (visual/UX via Claude Design, separately)
- **Auth:** JWT for HR, API key for the ATS

## Core principles that shaped the design
- **LLM for words, code for numbers** — LLM extracts/judges language; code does the math.
- **Extract once, match cheaply** — one LLM read per resume; scoring is code.
- **Hybrid contains risk** — since code does the scoring, prompt injection can't set the score.
- **Match on clean lists, not raw text** — the injection shield.
- **Async + webhook, read-door as backup** — nothing is lost if delivery fails.

## Status
Design complete (docs 01-10). Implementation is underway against the
[phase plan](11-phase-plan.md) - phases 0 through 3 are done.

## Parked / harden later
- Reject / send-email action on a result
- Webhook hardening (https-only + block internal addresses / SSRF)
- Refresh tokens; per-ATS API keys
- Frontend token storage (httpOnly cookie vs localStorage)
- Prompt-injection residual risk (injection hidden inside a skill name)
