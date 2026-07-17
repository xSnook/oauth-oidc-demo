# OAuth OIDC Demo

Internal OAuth/OIDC demo app built as a FastAPI, React, and MySQL monorepo.

The project has progressed through local auth, RBAC, frontend flows, production image
builds, and PR CI. Current milestone work is M7: AWS provisioning, DNS, TLS, and first
production deploy.

## Local Setup

Human setup and local environment steps are documented in `SETUP.md`. In short, copy
`.env.example` to `.env`, fill in the client IDs and `SESSION_JWT_SECRET`, then use Docker
Compose for local development.

## Redis Rate Limiting

The backend uses Redis-backed fixed-window rate limits for API guardrails. Local Docker
Compose starts a `redis:7.4-alpine` service automatically; production Compose runs the same
Redis container on the EC2 app host, so this adds no managed AWS service cost.

Default buckets:

- `POST /api/auth/google`: 10 requests/minute per IP.
- `POST /api/auth/logout`: 30 requests/minute per IP.
- `PATCH /api/users/*`: 30 requests/minute per IP.
- Other `/api/*` routes: 120 requests/minute per IP.

Tune with `RATE_LIMIT_*` environment variables in `.env` or SSM. If Redis is unavailable,
the limiter fails open by default so app availability is not tied to Redis.

M7 production setup helpers live in `infra/m7/`:

- `infra/m7/README.md` documents the AWS/domain/GitHub runbook.
- `infra/m7/preflight.ps1` checks local tooling and required config.
- `infra/m7/provision.ps1` prints a dry-run plan by default and can apply the AWS
  foundation after AWS CLI authentication.

## Project Docs

- `PLAN.md` is the implementation specification.
- `SETUP.md` is the human setup walkthrough.
- `team-portal-plan.html` is the human-readable visual plan.
