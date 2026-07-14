# OAuth OIDC Demo

Internal OAuth/OIDC demo app planned as a FastAPI, React, and MySQL monorepo.

This repository is currently at milestone M0 from `PLAN.md`: the repo shell, project docs,
root `.gitignore`, and example environment file are in place. The next milestone is M1:
Docker Compose, FastAPI skeleton, SQLAlchemy models, Alembic initial migration, and
`/api/health`.

## Local Setup

Human setup and local environment steps are documented in `SETUP.md`. In short, copy
`.env.example` to `.env`, fill in the client IDs and `SESSION_JWT_SECRET`, then use Docker
Compose once the application milestone files are implemented.

## Project Docs

- `PLAN.md` is the implementation specification.
- `SETUP.md` is the human setup walkthrough.
- `team-portal-plan.html` is the human-readable visual plan.
