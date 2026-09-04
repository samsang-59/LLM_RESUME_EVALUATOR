# LLM Resume Evaluator — Design Doc 10

## Frontend Architecture (React)

> Doc 08 was *what* screens exist. This is *how the React app is structured* — the
> layered breakdown, mirroring the discipline of the backend.

**The layers (and their backend cousins):**

| Frontend layer | Job | Backend cousin |
|---|---|---|
| Pages | one component per screen | controllers |
| Components | small reusable UI pieces | building blocks |
| API / service layer | the ONLY place that calls the backend | **repository** |
| Routing | URL path → which page shows | router |
| State | data the UI holds now | (in-memory) |

---

## 1. Components (reused via props)

Reusable pieces (built once, rendered many times by passing **props**):
- **Button**, **InputField**
- **JobCard** (dashboard)
- **CandidateRow** (candidates list)
- **CircularPercentage** (the score dial)
- **SkillTag / Chip** (matched / missing / extra skills)
- **StatusBadge** (eligible/rejected, processing/completed/failed)
- **Layout / Navbar** (page shell, consistent nav)
- **Loader**, **EmptyState**

> Core idea: `<CandidateRow candidate={c} />` — same component, different data via props.
> **Component + props = reuse.**

Pages: `Login`, `Register`, `Dashboard`, `CreateJob`, `JobCandidates`, `CandidateDetail`.

---

## 2. API / service layer (the frontend's "repository")

One place holds **all** backend calls. Screens never `fetch` directly — they call these.
Change an endpoint once, here, not across 5 screens.

```
login()        register()        logout()
getJobs()      getJobById()      createJob()
getJobCandidates(jobId, filters)
getEvaluationById(id)
```

> **No resume-processing function** — that door belongs to the **ATS** (Model A), not
> our UI. The API layer only mirrors **HR-facing** doors.

This layer also **attaches the JWT** (`Authorization: Bearer <token>`) to every request.

---

## 3. Routing (React Router) — separate from the backend router

Two different routers: **frontend routes show pages; backend routes return JSON.**

| Screen | Frontend path | Backend door the page calls |
|---|---|---|
| Login | `/login` | `POST /api/auth/login` |
| Register | `/register` | `POST /api/auth/register` |
| Dashboard | `/dashboard` | `GET /api/jobs` |
| Create Job | `/jobs/new` | `POST /api/jobs` |
| Job Candidates | `/jobs/:jobId/candidates` | `GET /api/jobs/:jobId/evaluations` |
| Candidate Detail | `/evaluations/:evaluationId` | `GET /api/evaluations/:id` |

> **A route shows a page — it does NOT call the backend by itself.** An **event** does:
> **page-load** (reads, e.g. Dashboard fetches jobs on load) or a **click/submit**
> (e.g. Login button → `login()`). Route → page → event → API layer → backend.

---

## 4. State

- **Local state** — most of it: form fields, loading flags, a screen's fetched data. Lives in the component.
- **Global state** — one thing: **auth** (is-logged-in, the user, the token). Lives app-wide in a React **Context**, because the navbar, the API layer, and the routes all need it.

---

## 5. Auth handling on the frontend

- **On login/register:** backend returns a **JWT** → store it → mark logged-in (auth Context).
- **API layer** attaches the token to every request (`Authorization: Bearer`).
- **ProtectedRoute** — a wrapper around HR screens: no valid token → **redirect to `/login`.** Stops a logged-out person reaching `/dashboard`.
- **Logout** — clear the stored token + reset the auth Context.
- **Token storage:** v1 = `localStorage` (simple). Honest tradeoff — it's readable by JavaScript, so vulnerable to XSS; the more secure option is an **httpOnly cookie** (needs CSRF handling). → **harden later.**

---

## Suggested folder structure
```
src/
  pages/          Login, Register, Dashboard, CreateJob, JobCandidates, CandidateDetail
  components/     Button, JobCard, CandidateRow, CircularPercentage, SkillTag, StatusBadge, Layout, Loader...
  api/            the API layer (all backend calls + token attach)
  context/        AuthContext
  routes/         router setup + ProtectedRoute
```

---

## Settled ✅
- React; pages + reusable components (props)
- API layer = single place that calls the backend + attaches the JWT
- Two-router model understood (frontend routes = screens, backend routes = data)
- State: local everywhere, one global = auth (Context)
- Auth handling: store token, attach it, ProtectedRoute, logout

## Noted for later
- Token storage hardening (httpOnly cookie vs localStorage)
- Visual/UX design → **Claude Design** (Sangram will do this separately)

---

## 🎉 DESIGN COMPLETE
01 Overview · 02 Schema · 03 Router · 04 Validators · 05 Controllers · 06 Services ·
07 Repository · 08 Frontend Screens · 09 Authentication · 10 Frontend Architecture

*Next: implementation — build it phase by phase against these blueprints.*
