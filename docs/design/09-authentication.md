# LLM Resume Evaluator — Design Doc 09

## Authentication (added across all backend layers)

> Added after the core design, so it **ripples through every layer.** Two kinds of
> callers → two mechanisms:
>
> | Caller | Proves identity with | Guards which doors |
> |---|---|---|
> | **HR** (human, browser) | **JWT** (issued at login) | dashboard doors: create job, list/get jobs, view evaluations |
> | **ATS** (system, Model A) | **API key** (a shared secret we issue) | only `POST /api/jobs/:jobId/evaluations` |
>
> JWT is **stateless** — server stores nothing, just verifies the signature.

---

## Schema — new `users` table (HR accounts)

| column | type |
|---|---|
| id | PK, auto |
| username | varchar (display name) |
| email | varchar, **UNIQUE** (login identifier) |
| password_hash | varchar (**bcrypt** — one-way + salted; never the plain password) |
| created_at | timestamp |

---

## Router — 2 new doors + apply the guards

New:
- `POST /api/auth/register`
- `POST /api/auth/login`

Guards applied to existing doors:
- **`jwtGuard`** → all HR doors (`/api/jobs*`, `/api/evaluations*` reads, create job)
- **`apiKeyGuard`** → only the resume-submission door (`POST /api/jobs/:jobId/evaluations`)

---

## Validators — 2 new guards
- **register:** username non-empty · email valid format · password **≥ 8 chars**
- **login:** email valid format · password present

---

## Controllers — thin, as always
- `authController.register` → `authService.register` → **201** + **token** (auto-login)
- `authController.login` → `authService.login` → **200** + **token**
- Existing controllers can now read **`req.user`** (attached by `jwtGuard`).

---

## Services — the core auth logic
- **`authService.register(data)`**
  1. check email is free (`userRepository.getUserByEmail`)
  2. **hash** password (bcrypt)
  3. create user (`userRepository.createUser`)
  4. **issue JWT** and return it (**auto-login**)
- **`authService.login(email, password)`**
  1. find user by email
  2. `bcrypt.compare(typed, stored_hash)`
  3. match → **issue JWT**; no match → 401
- **`tokenService`** → `generateToken(userId)` (signs with a secret, **1-day expiry**) · `verifyToken(token)`
- **guards (middleware):**
  - `jwtGuard` → read `Authorization: Bearer <token>` → verify → attach `req.user` → else 401
  - `apiKeyGuard` → read `x-api-key` header → compare to our stored key → else 401

---

## Repository — new `userRepository`
- `createUser(data)`
- `getUserByEmail(email)` — used by **both** login and the register uniqueness check

---

## The three decisions (locked)
1. **Auto-login on register** — return a JWT right after signup (smoother).
2. **Password ≥ 8 chars** — simple rule; no complexity requirements for v1.
3. **Token expiry = 1 day** — balance of security vs convenience. A JWT can't be easily revoked before expiry, so 1 day keeps the damage window small if a token leaks, while HR only logs in once a day.

---

## Noted for later (hardening)
- **Refresh tokens** — short access token + revocable refresh token (the "proper" way to get security *and* convenience). Overkill for v1.
- **Per-ATS API keys** — if more than one external system integrates, issue a key each (and be able to revoke one). v1 = a single shared key in config/env.
- (from earlier) webhook SSRF hardening; prompt-injection residual risk.

---

## Frontend side of auth
→ Designed in **Doc 10 (Frontend Architecture)**: storing the token, the API layer attaching it, the auth Context (global state), and `ProtectedRoute` (block logged-out users from `/dashboard`).

*Next doc: 10 — Frontend Architecture (components · API layer · routing · state + auth handling).*
