# LLM Resume Evaluator — Design Doc 01

## Project Overview + Tech Stack (Phase 0)

> This is our first design doc. It captures *what* we're building and *what* we're building it with.
> We fill the later docs (schema, layers, phases) as we discuss each one.

---

## 1. What this project is

An **LLM-powered web application** (not an "AI agent" — there's no autonomous
decision-making or tool-looping; it's a fixed pipeline that uses an LLM at
specific steps for its language ability).

**In one line:** HR gives a list of requirements, a candidate's resume goes in,
and the app returns how well the resume matches — with a score, a breakdown, and
the gaps.

## 2. What it does (the core flow)

```
Resume file (PDF / DOCX)
        │
        ▼
1. PARSE        → extract raw text from the file        (library, NOT the LLM)
        │
        ▼
2. EXTRACT      → LLM reads text, returns structured     (LLM + structured output)
                  data: { skills[], experienceYears, projects[] }
        │
        ▼
3. MATCH        → compare extracted data against the HR   (LLM judges nuance +
                  requirements list, per requirement        code does the scoring)
        │
        ▼
4. SCORE        → weighted % (overall + per category)     (our code, deterministic)
        │
        ▼
5. STORE        → save resume + evaluation result          (database)
        │
        ▼
6. RETURN       → score, category breakdown, matched      (API response → frontend)
                  items, missing/gap items, short rationale
```

**Key principle:** the LLM is used *only* where language understanding is needed
(reading messy resume text, judging that "built REST APIs with Express" satisfies
"Node.js"). Everything mechanical — file parsing, the math, storage — is normal
code. This keeps it cheaper, faster, and explainable.

## 3. Output (what HR actually gets back)

Not a bare number. A useful result:
- **Overall match %**
- **Category breakdown** — skills %, experience %, projects %
- **Matched** items (with evidence from the resume)
- **Missing / gap** items (what HR asked for but resume lacks)
- **Short rationale** — 2–3 lines explaining the score

## 4. Matching approach — Hybrid (chosen)

The LLM does the *judgment* per requirement (does the resume satisfy this? yes/no
+ evidence), returning structured booleans. **Our code** then applies weights and
computes the final percentage.

- LLM handles **language nuance** ("ReactJS" = "React", "REST APIs w/ Express" ≈ "Node.js backend")
- Code handles **the math** → consistent, repeatable, explainable

Weights (placeholder — we'll finalise later):
`skills 40% · experience 30% · projects 30%`

## 5. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Backend | **Node.js + Express** | Sangram's domain; fully first-class for calling LLM APIs |
| LLM provider | **OpenAI** (the model runs on their server; we call it over HTTP) | matches what Sangram learned (system role, temperature, tokens) |
| LLM SDK | **`openai`** npm package | mature structured-output support, most-used |
| Structured output / validation | Node equivalent of Pydantic (e.g. Zod) — the JS-native way to force the LLM's reply into a fixed JSON shape | LLM speaks JSON; this enforces the shape. No JS↔Pydantic "translation" needed |
| File parsing | PDF + DOCX text-extraction libraries | parsing is a code job, not an LLM job |
| Database | **TBD — SQL vs NoSQL decided during schema design** | the data shape will tell us which fits |
| Frontend | TBD (built after backend is complete) | upload resume + enter HR requirements → show result |

## 6. Architecture (Sangram's layered MVC)

```
Router  →  Validators  →  Controller  →  Service  →  Repository  →  DB
                                            │
                                            └──→  LLM Service / adapter  →  OpenAI
```

- **Router** — endpoints
- **Validators** — file type/size, HR-list shape
- **Controller** — thin; receives request, calls service
- **Service** — core business logic: parse → call LLM → match → score
- **LLM Service (adapter)** — *own layer*, hides which LLM/provider we use (swappable, like the repository hides the DB)
- **Repository** — DB queries
- **Model / schema** — data shapes (DB models + LLM output schemas)

## 7. Build order

1. Design (this doc set) — layer by layer, backend design first
2. Backend implementation (fully)
3. Frontend implementation (against the finished backend)

## 8. Open decisions (to settle as we design)

- [ ] DB engine: SQL vs NoSQL (→ schema design step)
- [ ] Frontend framework (→ after backend)
- [ ] Final scoring weights
- [ ] Exact structured-output fields (→ schema design step, next)

---

*Next doc: 02 — Data / Schema design (data-first).*
