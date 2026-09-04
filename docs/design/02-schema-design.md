# LLM Resume Evaluator — Design Doc 02

## Schema Design (data-first)

> Built part-by-part together. This doc has two halves:
> **A. Plain-language schema** (what we decided) and
> **B. Database design** (how it becomes tables).
>
> Reminder of the core principle behind all of it:
> **The LLM reads a resume ONCE and extracts everything; our own code does the
> matching and scoring.** A resume is submitted **for one specific job**, and we
> store the result as a **record** (for audit / crash-recovery) — *not* to reuse
> one resume across many jobs. (Revised after we decided the real-world flow: a
> candidate applies to one post, so one resume → one evaluation → one job.)

---

## A. The schema in plain language

We ended up with **three pieces of data**.

### Piece 1 — Resume (a candidate, read once)

| Field | Where it comes from |
|---|---|
| upload time | set by our system when the resume arrives |
| name | extracted from resume by LLM |
| phone | extracted from resume by LLM |
| email | extracted from resume by LLM |
| file path | original PDF/DOCX saved *outside* the DB; DB keeps the path |
| extracted text | plain text pulled from the file (this is what the LLM reads) |
| **listed skills** | all skills the resume mentions (skills section) |
| **used skills** | skills actually used in projects/experience ("built X using React") |
| **total experience** | total years, *calculated* by the LLM from job dates |

Notes:
- No project names are stored — if a skill matches, the resume goes to HR and HR reads the details themselves.
- `used skills` is stronger proof than `listed skills` (actually did it vs just wrote it).

### Piece 2 — HR list / Job (what we match against)

| Field | Meaning |
|---|---|
| job title | so HR can tell different openings apart |
| must-have skills | mandatory |
| good-to-have skills | bonus, not mandatory |
| required experience (years) | affects score only — **never eliminates** |
| matching mode | **strict** or **soft** (applies to **skills only**) |
| cutoff percentage (X) | set **per job**, applies in **both** modes |

Modes:
- **strict** → missing a must-have skill = candidate out.
- **soft** → missing a must-have = big penalty, still ranked.

### Piece 3 — Result / Evaluation (produced after matching one resume × one job)

| Field | Meaning |
|---|---|
| which resume + which job | links back to Pieces 1 and 2 |
| **status** | `processing` / `completed` / `failed` — added because the flow is **async** (record exists before the result does) |
| **callbackUrl** | where we POST the result when done (the webhook target); validated + stored per submission |
| **failure_reason** | why it failed (unreadable_resume / network / llm_overloaded / malformed_output …); set only when `status = failed` |
| **delivery_status** | webhook delivery outcome: pending / delivered / failed |
| eligible or not | see the two gates below |
| matched required skills | required skills the candidate **has** |
| extra skills | skills the candidate has **beyond** what was asked |
| missing skills | required skills the candidate **lacks** |
| experience comparison | required years vs candidate's actual years |
| overall percentage | single number (no separate breakdown) |
| created time | when this evaluation was made |

**Eligibility = pass BOTH gates:**
1. **Skill gate** (strict mode only): no must-have skill missing.
2. **Score gate** (always): overall % ≥ cutoff X.

### Parked for later (not stored data)
- **Action on a result**: HR *reject* or *send an email*. This is a feature/action,
  not schema. Email-sending is its own feature. We'll design it later.

---

## B. Turning this into a database

### The relationships (this is what picks SQL vs NoSQL)

*(Updated for the one-resume-one-job flow.)*

- One **Job** → has **many** Evaluations (many candidates apply to one opening) — this is the strong relationship
- One **Evaluation** → belongs to exactly **one** Resume + **one** Job
- A **Resume** is submitted for **one** job → effectively one Resume ↔ one Evaluation

So even without cross-job reuse, we still have **three distinct, related records**
(jobs, resumes, results) and a clear **one-job → many-candidates** structure. That's
textbook relational, with no duplication → **SQL.**
(In NoSQL we'd copy job data into every candidate's document, or fake joins that
NoSQL is bad at.)

**Why keep Resume and Evaluation as separate tables even though they're ~1-to-1:**
they're different concerns — a Resume holds *candidate facts* (reusable record of a
person), an Evaluation holds *the match result for one job*. Splitting them keeps
each clean and leaves the rare talent-pool case possible later.

> **SQL — confirmed.** ✅

### Proposed tables

**`resumes`**
| column | type |
|---|---|
| id | PK |
| name | varchar |
| phone | varchar |
| email | varchar |
| file_path | varchar |
| extracted_text | text |
| listed_skills | json (array of strings) |
| used_skills | json (array of strings) |
| total_experience_years | numeric |
| uploaded_at | timestamp |

**`jobs`**
| column | type |
|---|---|
| id | PK |
| title | varchar |
| must_have_skills | json (array) |
| good_to_have_skills | json (array) |
| required_experience_years | numeric |
| matching_mode | enum('strict','soft') |
| cutoff_percentage | numeric |
| created_at | timestamp |

**`evaluations`**
| column | type |
|---|---|
| id | PK |
| resume_id | FK → resumes.id |
| job_id | FK → jobs.id |
| status | enum('processing','completed','failed') — async |
| callback_url | varchar — webhook target for this submission |
| failure_reason | varchar, nullable — set only when status='failed' |
| delivery_status | enum('pending','delivered','failed') — webhook delivery |
| eligible | boolean |
| matched_required_skills | json (array) |
| extra_skills | json (array) |
| missing_skills | json (array) |
| required_experience_years | numeric (snapshot) |
| candidate_experience_years | numeric (snapshot) |
| overall_percentage | numeric |
| created_at | timestamp |

Why snapshot the experience numbers into `evaluations`: if HR later edits the job,
old results shouldn't silently change. A result is a record of *that moment*.

### One DBMS choice inside SQL: skills as JSON columns

The skill lists (`listed_skills`, `missing_skills`, etc.) are stored as **JSON
columns**, not as separate normalized tables.

Rule of thumb: **normalize what you query and join; use a JSON column for bags
you always read as a whole.** We never search the DB for "all resumes with React"
— we load a resume and match in code. So JSON columns are the right, simpler call
here. (Fully normalizing skills into their own table is possible as a pure DBMS
exercise, but it's heavier and buys us nothing for this app.)

---

## C. The runtime contracts (not DB — in-memory shapes)

These are enforced by the Zod-equivalent validator during a request.

**LLM extraction output** (what the LLM must return after reading a resume):
```
{
  name, phone, email,
  listedSkills: string[],
  usedSkills: string[],
  totalExperienceYears: number
}
```

**HR input** (what a job request must contain):
```
{
  title,
  mustHaveSkills: string[],
  goodToHaveSkills: string[],
  requiredExperienceYears: number,
  matchingMode: "strict" | "soft",
  cutoffPercentage: number
}
```

**Evaluation result** (what our API returns) = Piece 3 above.

---

## Settled ✅
- All three data pieces and every field (above)
- Eligibility = skill gate (strict) + score gate (always)
- Single overall %, no breakdown
- No project names stored
- Experience never eliminates
- Storage bags as JSON columns

## Confirmed ✅
- **SQL** as the database (one-job → many-candidates is relational)
- Real-world flow: one resume submitted **for one job**; storing = records, not cross-job reuse

## Still parked
- Reject / send-email action on a result (a later feature)

---

*Next doc: 03 — the Router layer (API endpoints). ✅ done.*
