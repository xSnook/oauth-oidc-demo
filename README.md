# OAuth OIDC Demo

Internal OAuth/OIDC demo app built as a FastAPI, React, and MySQL monorepo.

The project has progressed through local auth, RBAC, frontend flows, production image
builds, and PR CI. Current milestone work is M7: AWS provisioning, DNS, TLS, and first
production deploy.

## Local Setup

Human setup and local environment steps are documented in `SETUP.md`. In short, copy
`.env.example` to `.env`, fill in the client IDs and `SESSION_JWT_SECRET`, then use Docker
Compose for local development.

M7 production setup helpers live in `infra/m7/`:

- `infra/m7/README.md` documents the AWS/domain/GitHub runbook.
- `infra/m7/preflight.ps1` checks local tooling and required config.
- `infra/m7/provision.ps1` prints a dry-run plan by default and can apply the AWS
  foundation after AWS CLI authentication.

## Project Docs

- `PLAN.md` is the implementation specification.
- `SETUP.md` is the human setup walkthrough.
- `team-portal-plan.html` is the human-readable visual plan.
