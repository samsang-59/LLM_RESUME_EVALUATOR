# Test Reports

One report per phase, regenerated from Jest output by `npm run test:report`.

| Phase | Covers | Tests | Result | Report |
|---|---|---|---|---|
| 0 | Setup — Express skeleton, config/env, DB helper, health check | 26/26 | ✅ passed | [phase-0.md](phase-0.md) |
| 1 | Schema / DB — migrations for users, jobs, resumes, evaluations | 44/44 | ✅ passed | [phase-1.md](phase-1.md) |
| 2 | Jobs — first full vertical slice (router → validator → controller → service → repository) | 47/47 | ✅ passed | [phase-2.md](phase-2.md) |
| 3 | Evaluation pipeline — async + webhook | 116/116 | ✅ passed | [phase-3.md](phase-3.md) |
| 4 | Results + filters | 69/69 | ✅ passed | [phase-4.md](phase-4.md) |
| 5 | Auth — register / login, JWT + API key guards | 62/62 | ✅ passed | [phase-5.md](phase-5.md) |
| **All** | | **364/364** | ✅ | |

_Last run: 2026-09-05T14:01:28.032Z_
