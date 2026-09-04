# LLM Resume Evaluator — Design Doc 07

## Repository (the DB-query layer)

> The repository is the **only** layer that talks to the database. Ideally **one
> function per query**. Services call these functions and never write SQL themselves —
> so if the DB ever changes, only the repository changes. (Same idea as the LLM
> adapter hiding the provider.)
>
> Three tables → three repositories. We **derived** each query from what the app
> actually does, not by guessing.

---

## `jobRepository`

| Function | Query | Called by |
|---|---|---|
| `createJob(data)` | INSERT a new job | `POST /api/jobs` |
| `listJobs()` | SELECT all jobs | `GET /api/jobs` |
| `getJobById(id)` | SELECT one job | `GET /api/jobs/:id` **and** the pipeline (to check the job exists) |

> Jobs are **immutable in v1** — no `updateJob()`. If HR wants a change, they create
> a new job. (Our snapshotting in `evaluations` means past results are safe anyway.)

---

## `resumeRepository`

| Function | Query | Called by |
|---|---|---|
| `createResume(data)` | INSERT the extracted resume | the pipeline (after extraction) |

> No `getResumeById()` — when HR views a result, candidate details come through a
> **JOIN** inside the evaluation reads (below), not a separate query.

---

## `evaluationRepository` (the busiest)

| Function | Query | Called by |
|---|---|---|
| `createEvaluation(...)` | INSERT a row with `status = "processing"` | **start** of the pipeline — *before* the work, so the controller can return 202 with an id (async) |
| `updateEvaluation(id, ...)` | UPDATE the row (status, result fields, `failure_reason`, `delivery_status`) | as the pipeline progresses / finishes |
| `getEvaluationById(id)` | SELECT one evaluation **JOIN resume** | `GET /api/evaluations/:id` |
| `listEvaluationsByJob(jobId, filters)` | SELECT evaluations WHERE `job_id` **JOIN resume**, plus optional filters | `GET /api/jobs/:jobId/evaluations` |

### The lifecycle of one evaluation row
```
createEvaluation()      → status = processing        (row is born, empty-ish)
   … pipeline runs …
updateEvaluation()      → status = completed + result   (or failed + failure_reason)
updateEvaluation()      → delivery_status after webhook
getEvaluationById()     → HR reads it later (JOIN resume for candidate details)
```

### The JOIN
Reads that show a candidate use ONE query that stitches the evaluation to its resume:
```sql
SELECT ... FROM evaluations
JOIN resumes ON evaluations.resume_id = resumes.id
WHERE evaluations.id = :id          -- (or WHERE job_id = :jobId for the list)
```
One trip to the DB, evaluation + candidate come back together.

### The filters (list view)
- Default (no filters) → **all** evaluated candidates for the job, near-misses included.
- Filters **narrow** it, all on plain scalar columns (simple `WHERE`, no JSON querying):
  - `eligible = true`
  - `overall_percentage >= <min>`
  - `candidate_experience_years >= <min>`
  - combinable (e.g. eligible AND % ≥ 70)
- **No skill filter** — eligible candidates already have the required skills, so it'd be redundant. (This keeps skills as pure JSON read-whole columns — Doc 02's decision holds.)

---

## The full repository at a glance

```
jobRepository:         createJob · listJobs · getJobById
resumeRepository:      createResume
evaluationRepository:  createEvaluation · updateEvaluation · getEvaluationById · listEvaluationsByJob(filters)
```

---

## Settled ✅
- 3 repositories, one function per query
- Jobs immutable (no update in v1)
- Resume reads happen via JOIN, not a standalone getResumeById
- Evaluation row created at pipeline start (status=processing) → enables async 202
- List view shows all by default; scalar filters (eligible / min % / min experience) narrow it
- No skill filter → skills stay JSON read-whole (Doc 02 intact)

---

## Backend design is now COMPLETE
01 Overview · 02 Schema · 03 Router · 04 Validators · 05 Controllers · 06 Services · 07 Repository ✅

*Next: 08 — Frontend (built against this finished backend).*
