# LLM Resume Evaluator — Design Doc 03

## Router Design (the API endpoints / "doors")

> The router only defines **what the outside world can trigger.** The work behind
> each door (parse, match, score) is the **service layer** — a later doc.
>
> Key rule we used: **a step is only a door if something outside triggers it.**
> Parsing, extracting, matching, scoring, storing = internal mechanisms, NOT doors.

---

## The real-world flow we settled on

A candidate applies for **one specific job**. The resume arrives **already tied to
that job**. So a resume is submitted *for a job*, the whole pipeline runs, the
result is **stored as a record**, and returned.

We store results **for records/audit/crash-recovery — not** to reuse one resume
across many jobs (that's a rare talent-pool case, dropped from the main design).

---

## Core doors (the two you confirmed)

### 1. Add a job
```
POST /api/jobs
```
- **Who:** HR
- **Body:** the job (title, must-have skills, good-to-have skills, required
  experience, matching mode, cutoff %) — the "HR input" contract from Doc 02
- **Does:** validate → store a new job
- **Returns:** the created job, with its new `id`

### 2. Submit a resume for a job  ← the whole pipeline lives behind this door
```
POST /api/jobs/:jobId/evaluations
```
- **Who:** the source system (third-party app / ATS)
- **Body:** the resume **file** (PDF/DOCX, sent as multipart/form-data)
- **Does (all internal mechanism):**
  1. parse file → text
  2. LLM extracts fields (name, phone, email, listed skills, used skills, experience)
  3. store the resume
  4. match against job `:jobId` (skills → experience)
  5. score + apply the two gates (skill gate + cutoff)
  6. store the evaluation result
- **Returns:** the evaluation result (eligible?, matched/extra/missing skills,
  experience comparison, overall %)

> Note the path: `/jobs/:jobId/evaluations` reads as *"create an evaluation **under
> this job**."* The job context is baked into the URL — clean and honest.

---

## Read doors (so HR can look at results later)

These come straight from something we said: *"HR opens the job later and sees all
the candidates and their scores."* That viewing needs its own doors:

### 3. List all jobs
```
GET /api/jobs
```
HR's dashboard of open jobs.

### 4. Get one job
```
GET /api/jobs/:jobId
```
The job's details.

### 5. Get all evaluations for a job  ← the "see all candidates" screen
```
GET /api/jobs/:jobId/evaluations
```
Every resume evaluated for this job, with scores — the main HR review screen.

### 6. Get one evaluation
```
GET /api/evaluations/:id
```
Full detail of a single candidate's result.

---

## The full router at a glance

| # | Method | Path | Purpose | Type |
|---|---|---|---|---|
| 1 | POST | `/api/jobs` | HR adds a job | write |
| 2 | POST | `/api/jobs/:jobId/evaluations` | submit a resume for a job → runs pipeline | write |
| 3 | GET | `/api/jobs` | list jobs | read |
| 4 | GET | `/api/jobs/:jobId` | one job | read |
| 5 | GET | `/api/jobs/:jobId/evaluations` | all candidates for a job | read |
| 6 | GET | `/api/evaluations/:id` | one candidate's full result | read |

---

## Settled ✅
- Two core doors: **add job**, **submit resume for a job** (pipeline + store)
- Pipeline steps (parse/extract/match/score/store) are **internal**, not endpoints
- Storing = records/audit/crash-recovery, not cross-job reuse

## To confirm before Doc 04
- [ ] The **4 read doors** (#3–#6) — keep all, or trim any you feel we don't need yet?

## Still parked
- Reject / send-email action on a result (later feature)
- "Evaluate a stored resume against another job" (talent-pool case — dropped for now)

---

*Next doc: 04 — Validators (checking the file + the job input before work begins).*
