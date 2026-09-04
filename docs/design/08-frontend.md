# LLM Resume Evaluator — Design Doc 08

## Frontend Design (HR's dashboard)

> Built against the finished backend. The frontend is **HR-only** — candidates never
> touch it. Flow is **Model A (system-to-system)**: their ATS auto-feeds resumes to
> our API, we webhook results back; HR uses this site only to **create jobs** and
> **review results.** So there is **no resume-upload screen.**
>
> Frontend design = **screens**, each mapping to backend doors we already built.

---

## The screens & their doors

| Screen | Purpose | Backend door(s) |
|---|---|---|
| **Login / Register** | HR signs in | *auth endpoints — designed in Doc 09* |
| **Dashboard** | see all jobs, start a new one | `GET /api/jobs` |
| **Create Job** | fill the HR requirements form | `POST /api/jobs` |
| **Job Candidates** | all candidates for one job + filters | `GET /api/jobs/:jobId/evaluations` |
| **Candidate Detail** | one candidate's full result | `GET /api/evaluations/:id` |

## Navigation flow
```
Login ──► Dashboard ──► Create Job  (back to Dashboard)
                   └──► Job Candidates ──► Candidate Detail
```

---

## Screen details

### Dashboard
- Lists every job (title, maybe created date, candidate count).
- A **"Create Job"** button → Create Job screen.
- Each job is clickable → its Job Candidates screen.

### Create Job (form)
Fields = our Job schema (from Doc 02):
- title
- must-have skills (add multiple)
- good-to-have skills (add multiple, optional)
- required experience (number)
- matching mode → strict / soft (a toggle/dropdown)
- cutoff % (0–100)

**Client-side validation mirrors the backend guard** (Doc 04) — e.g. must-have ≥ 1,
cutoff 0–100, mode is strict/soft. (Frontend checks are for UX; the backend still
validates for real — never trust the client.)

### Job Candidates (results list)
- Shows every evaluated candidate for the job: **name, overall %, eligible/not, status**.
- **Filters** (from Doc 07): eligible only · min % · min experience — combinable.
- Default view shows **all**, including near-misses ("rejected, but 71%"), so HR can spot them.
- Must handle the **async states** a candidate can be in:
  - `processing` → "evaluating…" (result not ready yet)
  - `completed` → show %, eligible
  - `failed` → show the `failure_reason` (e.g. "unreadable resume")

### Candidate Detail
Everything the backend gives for one evaluation:
- name, email, phone
- overall %, eligible / not
- **matched** required skills (+ the evidence word)
- **missing** required skills
- **extra / good-to-have** skills (HR's tiebreaker info)
- experience: required vs candidate's actual
- status; if failed, the `failure_reason`

---

## Key states every screen handles (frontend basics)
- **loading** — while a GET is in flight
- **empty** — e.g. no jobs yet, or a job with no candidates yet
- **error** — the API call failed (show a friendly message)
- **async** — the `processing` / `failed` evaluation states above

---

## Settled ✅
- HR-only dashboard, Model A (no upload screen; webhook delivers to their system)
- 5 screens, each mapped to an existing backend door
- Create-Job form mirrors backend validation (UX only; backend still validates)
- Candidates list has the filters + shows all incl. near-misses + handles processing/failed
- Candidate detail shows everything the evaluation provides

## Depends on
- **Login/Register screen** needs the **auth layer** → **Doc 09 (next).**

*Next doc: 09 — Authentication (ripples back into schema/router/validators/controllers/repository).*
