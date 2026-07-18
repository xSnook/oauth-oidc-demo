# Implementation Plan — Internal Web App (FastAPI + React + MySQL on AWS)

> **How to use this document:** This is the build specification for an AI coding agent
> (Codex). Everything here is prescriptive — exact names, paths, env vars, and contracts.
> Implement it verbatim; where a decision was possible, it has already been made.
> Human-only setup steps (Google/Azure consoles, AWS account, IAM, domain) live in
> `SETUP.md` — this file only references them.
>
> **Suggested prompting flow:** give the agent this whole file as context, then ask for one
> milestone at a time (see §14 Build order). Verify each milestone's "done when" check
> before moving on.

---

## 1. What v1 is

An internal web app with exactly these capabilities and nothing more:

- Sign in with **Google** or **Microsoft** (OIDC ID tokens, verified server-side).
- Users are **auto-provisioned** on first login into the app's own MySQL database.
- **Roles live in our database** (`users.role`: `admin` | `user`), never in the provider.
  New users get `user`.
- **Admin screen**: table of all users — change role, activate/deactivate.
- **Dashboard**: placeholder page proving the full auth → API → DB path.
- Runs locally with **Docker Compose**; deploys to **AWS (EC2 + RDS + Route 53)** via a
  **GitHub Actions YAML pipeline**.

## 2. Locked stack

| Layer | Choice |
|---|---|
| Backend | Python 3.12, FastAPI, SQLAlchemy 2.x, Alembic, uvicorn, pydantic-settings, PyMySQL |
| Database | MySQL 8.0 (Docker locally, RDS `db.t4g.micro` in prod), `utf8mb4` / `utf8mb4_0900_ai_ci` |
| Frontend | React 18 + TypeScript + Vite, React Router v6, plain CSS (no UI framework in v1) |
| Auth | Google Identity Services + MSAL.js in the browser → backend verifies ID tokens → app-issued session JWT in an HttpOnly cookie |
| Local dev | docker-compose: `mysql`, `api` (port 8000), `web` (Vite, port 5173, proxies `/api`) |
| Prod | one EC2 t3.small (Ubuntu 24.04, docker compose), Caddy for TLS (Let's Encrypt), nginx serving the SPA, RDS MySQL, ECR, Route 53 |
| CI/CD | GitHub Actions: test → build/push to ECR → deploy through AWS SSM Run Command |
| Node/Python in CI | Node 24.18.0, Python 3.12 |

**Same-origin everywhere; no CORS middleware anywhere.** Locally the Vite proxy makes
`/api` same-origin; in prod Caddy serves SPA + API on one domain.

## 3. Repository layout (monorepo)

```
/
├── .github/workflows/deploy.yml
├── .gitignore
├── docker-compose.yml            # local dev (mysql, api, web)
├── .env.example                  # committed; copy to .env (gitignored)
├── README.md
├── PLAN.md / SETUP.md            # this plan + human setup walkthroughs
├── backend/
│   ├── Dockerfile                # multi-stage: base → dev → prod
│   ├── .dockerignore
│   ├── requirements.txt          # pinned runtime deps
│   ├── requirements-dev.txt      # pytest, httpx, ruff
│   ├── alembic.ini
│   ├── alembic/
│   │   ├── env.py
│   │   ├── script.py.mako
│   │   └── versions/0001_initial_schema.py
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py               # app factory, routers, exception handlers
│   │   ├── config.py             # pydantic-settings Settings (canonical env vars, §5)
│   │   ├── db.py                 # engine, SessionLocal, get_db
│   │   ├── models/
│   │   │   ├── __init__.py       # re-exports Base, User, UserIdentity
│   │   │   ├── base.py           # DeclarativeBase + naming convention
│   │   │   ├── user.py
│   │   │   └── user_identity.py
│   │   ├── schemas/
│   │   │   ├── auth.py           # TokenLoginRequest {id_token}
│   │   │   └── user.py           # UserOut, UserListOut, RoleUpdateRequest, StatusUpdateRequest
│   │   ├── routers/
│   │   │   ├── auth.py           # /api/auth/*
│   │   │   ├── users.py          # /api/users/* (admin)
│   │   │   ├── dashboard.py      # /api/dashboard
│   │   │   └── health.py         # /api/health
│   │   └── auth/
│   │       ├── __init__.py       # VerifiedIdentity dataclass
│   │       ├── jwt.py            # session JWT encode/decode + cookie helpers
│   │       ├── google.py         # Google ID-token verification
│   │       ├── microsoft.py      # Microsoft ID-token verification
│   │       ├── service.py        # find_or_create_user (provisioning rules, §7)
│   │       └── deps.py           # get_current_user, require_admin
│   └── tests/
│       ├── conftest.py           # MySQL test session (Alembic-migrated; never create_all)
│       ├── test_auth.py
│       └── test_users.py
├── frontend/
│   ├── Dockerfile                # multi-stage: base → dev → build → prod (nginx)
│   ├── .dockerignore
│   ├── nginx.conf                # SPA fallback config baked into prod image
│   ├── .env.example              # VITE_GOOGLE_CLIENT_ID=, VITE_AZURE_CLIENT_ID=
│   ├── index.html                # loads GIS script tag
│   ├── package.json / package-lock.json
│   ├── tsconfig.json / tsconfig.node.json / eslint.config.js
│   ├── vite.config.ts
│   └── src/
│       ├── main.tsx              # BrowserRouter > AuthProvider > App
│       ├── App.tsx               # routes only
│       ├── index.css
│       ├── vite-env.d.ts
│       ├── types.ts              # User, Role, Provider (§10 canonical shape)
│       ├── api/client.ts         # fetch wrapper, ApiError, global 401 handling
│       ├── auth/
│       │   ├── AuthContext.tsx
│       │   ├── ProtectedRoute.tsx
│       │   ├── AdminRoute.tsx
│       │   ├── msal.ts
│       │   └── google-gsi.d.ts
│       ├── components/
│       │   ├── Layout.tsx        # top nav: Dashboard, Users (admin only), Logout
│       │   ├── RoleBadge.tsx
│       │   └── ProviderBadge.tsx
│       └── pages/
│           ├── LoginPage.tsx
│           ├── DashboardPage.tsx
│           └── AdminUsersPage.tsx
└── deploy/
    ├── docker-compose.prod.yml
    ├── Caddyfile
    └── fetch-env.sh              # pulls SSM params → /opt/app/api.env
```

Root `.gitignore` (create exactly this):

```
.env
frontend/.env
node_modules/
dist/
__pycache__/
*.pyc
.venv/
.pytest_cache/
.ruff_cache/
```

## 4. Canonical decisions (conflicts resolved — do not revisit)

These were adjudicated during plan review. The agent must not "improve" them:

1. **Account identity key is `(provider, provider_subject)` — never email.** Same email
   from Google and Microsoft = **two separate accounts**. No email-based linking anywhere.
   Rationale: Microsoft `email` claims are not verified and are tenant-admin-controlled;
   auto-linking on email is an account-takeover vector. `users.email` is **NOT unique**
   (non-unique index only). Deliberate account linking is out of scope for v1.
2. **Role is a string column** `users.role VARCHAR(20) NOT NULL DEFAULT 'user'` with app-level
   `Literal["admin", "user"]` validation. No `roles` table in v1 — adding one later is a
   migration, and two static roles don't justify a join on every request.
3. **Admin bootstrap is restricted to provider-verified identities** (§7). `ADMIN_EMAILS`
   is consulted **only at account creation**, and only for (a) Google logins (which require
   `email_verified=true`) or (b) Microsoft logins whose `tid` equals `AZURE_ADMIN_TENANT_ID`.
   Promotion/demotion afterwards happens only through the admin screen. Recovery if you
   lock yourself out: `UPDATE users SET role='admin' WHERE email='<you>';` via mysql client.
4. **Microsoft stable subject = `oid`** (UUID-validated), never `sub` (pairwise per app).
5. **Session env vars:** `SESSION_JWT_SECRET` + `SESSION_TTL_HOURS` (see §5 for the full
   canonical table). Microsoft client ID env var is `AZURE_CLIENT_ID` everywhere.
6. **Endpoints and payloads:** exactly §8. Login body key is `{"id_token": ...}`.
   `GET /api/users` returns `{"items": [...], "total": n}`. User payload field is
   `display_name`.
7. **Error shape:** every non-2xx body is `{"detail": {"code": "<CODE>", "message": "<text>"}}`.
8. **Prod web image is nginx** (SPA fallback baked in); **Caddy is the only reverse proxy /
   TLS terminator**; **backend prod server is `uvicorn --workers 2`** (no gunicorn).
9. **Migrations run before the container swap** on deploy, and must stay additive
   (destructive changes split across two releases).
10. **No CORS middleware, no tokens in localStorage, no Authorization headers** — the
    session cookie is the only credential the SPA holds.

## 5. Configuration — canonical env var table

`backend/app/config.py` (pydantic-settings). This table is the single source of truth;
every other file (`.env.example`, compose, SSM, CI) uses exactly these names:

| Env var | Local value | Prod value (source) | Notes |
|---|---|---|---|
| `APP_ENV` | `local` | `production` (SSM) | `Literal["local","production"]` |
| `DATABASE_URL` | `mysql+pymysql://appuser:apppass@mysql:3306/appdb?charset=utf8mb4` | RDS URL (SSM SecureString) | PyMySQL driver always |
| `DB_REQUIRE_TLS` | `false` | `true` (SSM) | enables RDS TLS via bundled CA (§6) |
| `SESSION_JWT_SECRET` | generated hex | (SSM SecureString) | see validator below |
| `SESSION_TTL_HOURS` | `8` | `8` | cookie + JWT lifetime |
| `COOKIE_SECURE` | `false` | `true` (SSM) | dev runs on plain HTTP |
| `GOOGLE_CLIENT_ID` | from console | (SSM) | public identifier |
| `AZURE_CLIENT_ID` | from portal | (SSM) | public identifier |
| `AZURE_ADMIN_TENANT_ID` | empty | your tenant GUID (SSM) | empty = Microsoft logins never auto-promote |
| `ADMIN_EMAILS` | your email | (SSM) | comma-separated, compared lowercase |
| `LOG_LEVEL` | `INFO` | `INFO` | |

```python
from typing import Literal
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False, extra="ignore")

    app_env: Literal["local", "production"] = "local"
    database_url: str
    db_require_tls: bool = False
    session_jwt_secret: str
    session_ttl_hours: int = 8
    cookie_secure: bool = True
    google_client_id: str
    azure_client_id: str
    azure_admin_tenant_id: str = ""
    admin_emails: str = ""
    log_level: str = "INFO"

    @field_validator("session_jwt_secret")
    @classmethod
    def secret_must_be_strong(cls, v: str) -> str:
        if len(v) < 32 or "replace-me" in v:
            raise ValueError("SESSION_JWT_SECRET must be >=32 chars and not the placeholder")
        return v

    @property
    def admin_email_set(self) -> set[str]:
        return {e.strip().lower() for e in self.admin_emails.split(",") if e.strip()}

settings = Settings()
```

Frontend build-time vars (Vite; public identifiers, safe to bake into the bundle):
`VITE_GOOGLE_CLIENT_ID`, `VITE_AZURE_CLIENT_ID`. There is deliberately **no**
`VITE_API_URL` — all API calls are relative (`/api/...`).

Root `/.env.example` (copy to `.env`, fill in; compose interpolates `${VAR}` from it):

```dotenv
# ---------- MySQL container (local only) ----------
MYSQL_ROOT_PASSWORD=devroot
MYSQL_DATABASE=appdb
MYSQL_USER=appuser
MYSQL_PASSWORD=apppass
MYSQL_HOST_PORT=3306

# ---------- Backend ----------
APP_ENV=local
DATABASE_URL=mysql+pymysql://appuser:apppass@127.0.0.1:3306/appdb?charset=utf8mb4
DB_REQUIRE_TLS=false
# Generate: python -c "import secrets; print(secrets.token_hex(32))"
SESSION_JWT_SECRET=
SESSION_TTL_HOURS=8
COOKIE_SECURE=false
GOOGLE_CLIENT_ID=
AZURE_CLIENT_ID=
AZURE_ADMIN_TENANT_ID=
ADMIN_EMAILS=you@example.com
LOG_LEVEL=INFO
```

(Compose overrides `DATABASE_URL` for the `api` service with host `mysql`; the localhost
value is only for running the backend outside Docker.)

## 6. Database

### Conventions

- DB `appdb`, charset `utf8mb4`, collation `utf8mb4_0900_ai_ci` (database, tables, and
  server: compose adds `command: --character-set-server=utf8mb4
  --collation-server=utf8mb4_0900_ai_ci`; RDS gets a custom parameter group with the same).
- Timestamps: UTC `DATETIME(6)`; `created_at DEFAULT CURRENT_TIMESTAMP(6)`;
  `updated_at ... ON UPDATE CURRENT_TIMESTAMP(6)`.
- Emails normalized to lowercase in app code before every read/write.
- InnoDB (default). PKs `INT AUTO_INCREMENT`.

### Tables (complete v1 schema — two tables, no roles table)

```sql
CREATE TABLE users (
  id INT NOT NULL AUTO_INCREMENT,
  email VARCHAR(255) NOT NULL,                 -- lowercase; NOT unique (decision §4.1)
  display_name VARCHAR(255) NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'user',    -- 'admin' | 'user' (app-enforced)
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  INDEX ix_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE user_identities (
  id INT NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  provider VARCHAR(20) NOT NULL,               -- 'google' | 'microsoft' (app-enforced, no ENUM)
  provider_subject VARCHAR(255) NOT NULL,      -- Google sub / Microsoft oid
  provider_email VARCHAR(255) NULL,            -- as reported at last login; audit only
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  CONSTRAINT uq_user_identities_provider_subject UNIQUE (provider, provider_subject),
  CONSTRAINT fk_user_identities_user_id_users FOREIGN KEY (user_id)
      REFERENCES users (id) ON DELETE CASCADE,
  INDEX ix_user_identities_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

SQLAlchemy models mirror this exactly (declarative 2.x style, `Mapped`/`mapped_column`,
naming-convention MetaData so Alembic autogenerate emits stable constraint names).

### Engine (`app/db.py`)

```python
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.config import settings

connect_args = {}
if settings.db_require_tls:
    # RDS certs chain to Amazon's *private* RDS CAs — NOT in the system trust store.
    # The Dockerfile downloads this bundle (see §11).
    connect_args["ssl"] = {"ca": "/app/rds-global-bundle.pem"}

engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_recycle=280,          # below MySQL/RDS wait_timeout and NAT idle limits
    connect_args=connect_args,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

### Alembic

- `alembic.ini`: `script_location = alembic`, `sqlalchemy.url` left unset.
- `env.py` injects the URL — **escape percent signs** or URL-encoded passwords break
  ConfigParser: `config.set_main_option("sqlalchemy.url", settings.database_url.replace("%", "%%"))`.
  `target_metadata = Base.metadata`; `compare_type=True, compare_server_default=True`.
- Initial migration `0001_initial_schema.py` (`revision = "0001"`): the two tables above.
  No seed data is needed (no roles table).
- Migrations are **not** run on app startup. Locally:
  `docker compose exec api alembic upgrade head`. CI and deploy run it explicitly (§12, §13).
- MySQL DDL is non-transactional: keep each revision to as few DDL statements as
  practical; never edit an applied migration. If a revision fails halfway, manually drop
  the half-created objects before re-running (document this in README).
- Never use `Base.metadata.create_all()` anywhere, tests included.
- CI enforces a single head: `alembic heads` must print exactly one.

## 7. Authentication & authorization

### Invariants

1. Provider ID tokens are verified **server-side only**, used once, **never stored or logged**.
2. The app issues its own **HS256 session JWT** (secret `SESSION_JWT_SECRET`, TTL
   `SESSION_TTL_HOURS`) in cookie `session`: `HttpOnly; SameSite=Lax; Path=/;
   Secure` when `COOKIE_SECURE=true`; `Max-Age = SESSION_TTL_HOURS * 3600`.
   Claims: `sub` (internal user id as string), `iat`, `exp` — **no role/email claims**.
3. Role and `is_active` are read **from the DB on every request** — deactivating a user or
   changing a role takes effect on their next request, no session invalidation needed.
4. Sessions are stateless; no server-side session table in v1. Mitigations: 8h TTL + per-request DB checks.

### Shared type (`app/auth/__init__.py`)

```python
from dataclasses import dataclass
from typing import Literal, Optional

@dataclass(frozen=True)
class VerifiedIdentity:
    provider: Literal["google", "microsoft"]
    subject: str            # Google 'sub' / Microsoft 'oid'
    email: str              # lowercased
    display_name: str
    tenant_id: Optional[str] = None   # Microsoft 'tid'; None for Google
```

### Google verification (`app/auth/google.py`)

Use `google.oauth2.id_token.verify_oauth2_token(raw, transport_request,
audience=settings.google_client_id, clock_skew_in_seconds=30)` — validates signature,
`exp`, `aud`. Then explicitly require:

- `iss` in `("accounts.google.com", "https://accounts.google.com")`
- `email_verified` truthy — otherwise reject
- `sub` and `email` present

Return `VerifiedIdentity(provider="google", subject=claims["sub"],
email=claims["email"].lower(), display_name=claims.get("name") or claims["email"])`.
Raise a module-level `ProviderTokenError` on any failure.

### Microsoft verification (`app/auth/microsoft.py`)

PyJWT + JWKS. Signing keys are tenant-independent; fetch once from the `common` endpoint
and cache (`PyJWKClient("https://login.microsoftonline.com/common/discovery/v2.0/keys",
cache_keys=True, lifespan=3600)` at module level).

```python
signing_key = _jwks_client.get_signing_key_from_jwt(raw_token)      # matches 'kid'
claims = jwt.decode(
    raw_token, signing_key.key,
    algorithms=["RS256"],                                            # pinned — never 'none'/HS*
    audience=settings.azure_client_id,
    leeway=30,
    options={"require": ["exp", "iat", "aud", "iss", "sub"], "verify_iss": False},
)
```

Multi-tenant issuer check (the `common` authority means `iss` varies per tenant):

1. `tid = claims.get("tid", "")` — must match UUID regex
   `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`, else reject.
2. Require `claims["iss"] == f"https://login.microsoftonline.com/{tid}/v2.0"` exactly.
   (Personal accounts use the fixed consumer tenant `9188040d-6c67-4c5b-b112-36a304b66dad`
   — same template applies.)
3. `oid = claims.get("oid", "")` — must match the same UUID regex; **`oid` is the subject**
   (`sub` is pairwise per app registration — decision §4.4). Known caveat, accepted: a user
   who is a guest in another tenant gets a different `oid` there → separate account,
   consistent with the no-linking policy.
4. `email = (claims.get("email") or claims.get("preferred_username") or "").lower()`;
   reject if it does not contain `@`. Microsoft has **no** `email_verified` — this email is
   display/audit only and is never used for lookups or (outside the tenant gate below)
   admin bootstrap.

Return `VerifiedIdentity(provider="microsoft", subject=oid, email=email,
display_name=claims.get("name") or email, tenant_id=tid)`.

### Provisioning (`app/auth/service.py`)

```
def find_or_create_user(db, ident: VerifiedIdentity) -> User:
    identity = SELECT FROM user_identities
               WHERE provider=ident.provider AND provider_subject=ident.subject
    if identity:
        user = identity.user
        if not user.is_active: raise AccountDisabled     # → 403, no cookie
        user.last_login_at = utcnow(); identity.provider_email = ident.email
        commit; return user

    # First login → provision. Admin bootstrap (decision §4.3):
    is_admin = ident.email in settings.admin_email_set and (
        ident.provider == "google"                        # email_verified enforced upstream
        or (ident.provider == "microsoft"
            and settings.azure_admin_tenant_id
            and ident.tenant_id == settings.azure_admin_tenant_id)
    )
    user = User(email=ident.email, display_name=ident.display_name,
                role="admin" if is_admin else "user",
                is_active=True, last_login_at=utcnow())
    db.add(user)
    db.add(UserIdentity(user=user, provider=ident.provider,
                        provider_subject=ident.subject, provider_email=ident.email))
    try:
        db.commit()
    except IntegrityError:            # two concurrent first logins — retry the lookup
        db.rollback()
        identity = <re-run the SELECT>; if not identity: raise
        return identity.user
    return user
```

`ADMIN_EMAILS` is consulted **only here, at creation**. It never re-promotes on later
logins (a demoted admin must stay demoted).

### Session helpers (`app/auth/jwt.py`) and dependencies (`app/auth/deps.py`)

- `create_session_token(user_id)` / `decode_session_token(token)` — PyJWT HS256,
  `options={"require": ["exp", "iat", "sub"]}` on decode.
- `set_session_cookie(response, token)` / `clear_session_cookie(response)` with the §7.2 flags.
- `get_current_user`: read cookie → decode → `db.get(User, id)` → 401 if missing cookie,
  bad/expired JWT, unknown user, or `is_active=False`. **DB read every request, by design.**
- `require_admin`: `Depends(get_current_user)`, 403 unless `user.role == "admin"`.
- The admin router mounts `dependencies=[Depends(require_admin)]` on the router itself so
  no admin endpoint can ever be added unprotected.

**401 vs 403 contract (frontend depends on it):** 401 = "not signed in / session no good"
(→ SPA clears state, goes to `/login`); 403 = "signed in but not allowed" (→ show error,
stay put). A disabled account with a valid cookie gets 401 on requests; a disabled account
*logging in* gets 403 `ACCOUNT_DISABLED` (and no cookie).

### Login CSRF hardening

`SameSite=Lax` covers authenticated CSRF (cookies aren't sent cross-site on POST), but not
**login CSRF** (the login endpoints need no cookie). Guard: the two auth POST endpoints
reject any request whose `Content-Type` is not `application/json` with 415. This blocks
cross-site `<form>`-based posts; a same-origin JSON `fetch` is unaffected. Keep every GET
side-effect-free — that completes the no-CSRF-token argument for v1.

## 8. Backend API surface (complete)

Canonical user payload `UserOut`:

```json
{
  "id": 1, "email": "jane@example.com", "display_name": "Jane Doe",
  "role": "user", "is_active": true, "auth_providers": ["google"],
  "created_at": "2026-07-13T14:00:00Z", "last_login_at": "2026-07-13T14:00:00Z"
}
```

| # | Method | Path | Auth | Behavior |
|---|--------|------|------|----------|
| 1 | GET | `/api/health` | none | `SELECT 1`; 200 `{"status":"ok","database":"ok"}` or 503 `{"status":"degraded","database":"error"}` (used by Docker healthcheck + deploy smoke test; exempt from the error-shape rule) |
| 2 | POST | `/api/auth/google` | none | body `{"id_token": "..."}` → verify → provision → set cookie → 200 `UserOut`. 401 `INVALID_TOKEN`, 403 `ACCOUNT_DISABLED`, 415 wrong content type |
| 3 | POST | `/api/auth/microsoft` | none | identical, Microsoft verifier |
| 4 | POST | `/api/auth/logout` | none | clears cookie; always 204 (idempotent) |
| 5 | GET | `/api/auth/me` | session | 200 `UserOut` (SPA calls on boot) |
| 6 | GET | `/api/users` | admin | `{"items": [UserOut...], "total": n}`, ordered by `created_at` asc; no pagination in v1 |
| 7 | PATCH | `/api/users/{id}/role` | admin | body `{"role": "admin"\|"user"}` (Literal). 200 updated `UserOut`; 404 `NOT_FOUND`; 400 `CANNOT_MODIFY_SELF` if `id == current_user.id` |
| 8 | PATCH | `/api/users/{id}/status` | admin | body `{"is_active": bool}`; same errors incl. `CANNOT_MODIFY_SELF` (admin lockout guard) |
| 9 | GET | `/api/dashboard` | session | `{"message": "...", "stats": {"total_users": n, "active_users": n}}` — real COUNT queries |

FastAPI app: `docs_url="/api/docs"`, `openapi_url="/api/openapi.json"`.

**Error shape** (every non-2xx except `/api/health`):
`{"detail": {"code": "<CODE>", "message": "<human text>"}}`.
Handlers in `main.py`: `RequestValidationError` → 422 `VALIDATION_ERROR` (include
`errors`); catch-all `Exception` → log traceback, 500 `INTERNAL_ERROR` (never leak
traces). Codes: `NOT_AUTHENTICATED`, `INVALID_SESSION`, `INVALID_TOKEN`,
`ACCOUNT_DISABLED`, `FORBIDDEN`, `NOT_FOUND`, `CANNOT_MODIFY_SELF`, `VALIDATION_ERROR`,
`INTERNAL_ERROR`. Never log raw ID tokens or session JWTs.

### Pinned backend dependencies

`requirements.txt`:

```
fastapi==0.115.12
uvicorn[standard]==0.34.0
SQLAlchemy==2.0.41
alembic==1.15.2
PyMySQL==1.1.1
cryptography==44.0.2
pydantic==2.11.4
pydantic-settings==2.9.1
email-validator==2.2.0
google-auth==2.40.1
requests==2.32.3
PyJWT==2.10.1
```

(`cryptography` serves both PyMySQL's `caching_sha2_password` auth and PyJWT's RS256.)
`requirements-dev.txt`: `pytest==8.3.5`, `httpx==0.28.1`, `ruff==0.11.8`.
Install only via `pip install -r ...` — never float versions.

## 9. Frontend

### Contracts

- Cookie-based auth only: every `fetch` uses `credentials: "same-origin"`; no
  Authorization header, no tokens in localStorage/sessionStorage (MSAL's internal
  sessionStorage cache is MSAL's business — the app never reads it).
- `src/api/client.ts`: JSON fetch wrapper throwing `ApiError {status, code, message}`
  (parse `body.detail?.message ?? body.detail ?? res.statusText`, keep `detail.code`).
  **Global 401 rule:** on any 401 except the initial `/api/auth/me` bootstrap call, invoke
  a callback registered by `AuthProvider` that does `setUser(null)` — `ProtectedRoute`
  then redirects to `/login`.
- `AuthContext`: on mount, `GET /api/auth/me` once; 401 = "not logged in", not an error.
  Exposes `{user, loading, setUser, logout}`; `logout()` = `POST /api/auth/logout` + `setUser(null)`.

### Routes

| Path | Access | Component | Not allowed → |
|---|---|---|---|
| `/login` | public | `LoginPage` | authenticated → `/dashboard` |
| `/dashboard` | authenticated | `DashboardPage` | → `/login` (preserve `state.from`) |
| `/admin/users` | admin | `AdminUsersPage` | non-admin → `/dashboard`; anon → `/login` |
| `/`, `*` | — | `<Navigate to="/dashboard" replace/>` | |

Guards use the React Router v6 layout-route pattern (`<Outlet/>`); `ProtectedRoute` shows
a loader until `loading` resolves. Client guards are UX only — the server enforces
everything independently.

### Login page

- **Google:** GIS script tag in `index.html` (`https://accounts.google.com/gsi/client`,
  async defer). `google.accounts.id.initialize({client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
  callback})` + `renderButton(ref, {theme:"outline", size:"large", width:320})`. Poll every
  100ms (max 5s) until `window.google` exists before initializing. **No One Tap**
  (`prompt()` is not called). The callback's `resp.credential` **is** the ID token:
  `api.post<User>('/api/auth/google', { id_token: resp.credential })`.
- **Microsoft:** `@azure/msal-browser` (v4.x, pinned). Singleton
  `PublicClientApplication({auth: {clientId: VITE_AZURE_CLIENT_ID,
  authority: "https://login.microsoftonline.com/common", redirectUri: window.location.origin},
  cache: {cacheLocation: "sessionStorage"}})`; await `initialize()` before use. Button
  calls `loginPopup({scopes: ["openid","profile","email"], prompt: "select_account"})` and
  posts `{ id_token: result.idToken }` to `/api/auth/microsoft`.
- On success: `setUser(user)`, navigate to `state.from ?? '/dashboard'`. Render `ApiError`
  messages (e.g. 403 account disabled) in an error paragraph.

### Dashboard page

`GET /api/dashboard` → welcome heading (`display_name ?? email`), `RoleBadge`, and the
`stats` counts as two stat cards. Admins also get a link card to `/admin/users`. A muted
"More coming soon" placeholder card.

### Admin users page

`GET /api/users` → table: Email · Name (`display_name ?? '—'`) · Providers
(`ProviderBadge` per `auth_providers` entry) · Role (`<select>` user/admin) · Active
(switch) · Created (locale date). Role change → `PATCH /api/users/{id}/role`; toggle →
`PATCH /api/users/{id}/status`. On success replace the row with the returned `UserOut`;
on error show a dismissible banner and revert the control (no optimistic commit). The
current user's own row renders both controls `disabled`
(title: "You cannot change your own role or deactivate yourself") — server enforces the
same with `CANNOT_MODIFY_SELF`.

### `types.ts` (mirror of `UserOut`)

```ts
export type Role = 'admin' | 'user';
export type Provider = 'google' | 'microsoft';
export interface User {
  id: number; email: string; display_name: string | null;
  role: Role; is_active: boolean; auth_providers: Provider[];
  created_at: string; last_login_at: string | null;
}
export interface UserList { items: User[]; total: number; }
```

### Pinned frontend dependencies

`react@18.3.1`, `react-dom@18.3.1`, `react-router-dom@6.30.1`,
`@azure/msal-browser@^4.2.1`; dev: `typescript@~5.6`, `vite@^5.4`,
`@vitejs/plugin-react@^4.3`, `eslint@^9` + `typescript-eslint@^8`.
Scripts: `dev` = `vite`; `build` = `tsc --noEmit && vite build`;
`lint` = `tsc --noEmit && eslint src`. GIS is a script tag, not an npm package. No
frontend unit tests in v1 — CI runs `npm run lint` + `npm run build`.

### `vite.config.ts`

```ts
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, port: 5173, strictPort: true,
    watch: { usePolling: process.env.CHOKIDAR_USEPOLLING === 'true' },
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8000',
        changeOrigin: false,
      },
    },
  },
});
```

## 10. Local development (Docker Compose)

`/docker-compose.yml`:

```yaml
name: app

services:
  mysql:
    image: mysql:8.0
    command: --character-set-server=utf8mb4 --collation-server=utf8mb4_0900_ai_ci
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}
      MYSQL_DATABASE: ${MYSQL_DATABASE}
      MYSQL_USER: ${MYSQL_USER}
      MYSQL_PASSWORD: ${MYSQL_PASSWORD}
    volumes:
      - mysql_data:/var/lib/mysql
    ports:
      - "127.0.0.1:${MYSQL_HOST_PORT:-3306}:3306"   # loopback-only, for GUI clients
    healthcheck:
      test: ["CMD-SHELL", "mysqladmin ping -h 127.0.0.1 -uroot -p$$MYSQL_ROOT_PASSWORD --silent"]
      interval: 5s
      timeout: 5s
      retries: 12
      start_period: 30s

  api:
    build: { context: ./backend, target: dev }
    env_file: .env
    environment:
      DATABASE_URL: mysql+pymysql://${MYSQL_USER}:${MYSQL_PASSWORD}@mysql:3306/${MYSQL_DATABASE}?charset=utf8mb4
    volumes:
      - ./backend:/app
    ports: ["8000:8000"]
    depends_on:
      mysql: { condition: service_healthy }

  web:
    build: { context: ./frontend, target: dev }
    environment:
      VITE_GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID}
      VITE_AZURE_CLIENT_ID: ${AZURE_CLIENT_ID}
      VITE_API_PROXY_TARGET: http://api:8000
      CHOKIDAR_USEPOLLING: "true"
    volumes:
      - ./frontend:/app
      - web_node_modules:/app/node_modules
    ports: ["5173:5173"]
    depends_on:
      api: { condition: service_started }

volumes:
  mysql_data:
  web_node_modules:
```

First run: `cp .env.example .env` (fill client IDs + generated secret) →
`docker compose up --build -d` → `docker compose exec api alembic upgrade head` → verify
`http://localhost:8000/api/health` returns `{"status":"ok","database":"ok"}`,
`http://localhost:8000/api/docs` renders, `http://localhost:5173` shows both sign-in
buttons, and an `ADMIN_EMAILS` account sees the Users nav item. Reset DB:
`docker compose down -v && docker compose up -d && docker compose exec api alembic upgrade head`.

## 11. Docker images

### `backend/Dockerfile`

```dockerfile
FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && curl -fsSLo /app/rds-global-bundle.pem \
       https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
COPY requirements.txt ./
RUN pip install -r requirements.txt

FROM base AS dev
COPY requirements-dev.txt ./
RUN pip install -r requirements-dev.txt
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

FROM base AS prod
COPY . .
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
```

`backend/.dockerignore` — **must include env files** (secrets must never enter an image
layer):

```
__pycache__/
*.pyc
.venv/
.pytest_cache/
.ruff_cache/
.env
.env.*
!.env.example
```

### `frontend/Dockerfile`

```dockerfile
FROM node:20-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS dev
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

FROM base AS build
COPY . .
ARG VITE_GOOGLE_CLIENT_ID
ARG VITE_AZURE_CLIENT_ID
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID \
    VITE_AZURE_CLIENT_ID=$VITE_AZURE_CLIENT_ID
RUN npm run build

FROM nginx:alpine AS prod
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
```

`frontend/nginx.conf` (SPA fallback):

```nginx
server {
  listen 80;
  root /usr/share/nginx/html;
  location / { try_files $uri /index.html; }
}
```

`frontend/.dockerignore`: `node_modules/`, `dist/`, `.env`, `.env.*`, `!.env.example`.

## 12. Production topology (EC2) & deploy files

Everything runs on one EC2 box under `/opt/app/`. Two env files, different jobs:
`/opt/app/.env` = compose interpolation (`ECR_REGISTRY`, `IMAGE_TAG`, `DOMAIN`);
`/opt/app/api.env` = app secrets written by `fetch-env.sh` from SSM. Never commit either.

`deploy/docker-compose.prod.yml`:

```yaml
services:
  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports: ["80:80", "443:443"]
    environment: { DOMAIN: ${DOMAIN} }
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data          # Let's Encrypt certs — must persist
      - caddy_config:/config
    depends_on: [api, web]

  api:
    image: ${ECR_REGISTRY}/app-api:${IMAGE_TAG}
    restart: unless-stopped
    env_file: [./api.env]
    expose: ["8000"]
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')"]
      interval: 30s
      timeout: 5s
      retries: 3

  web:
    image: ${ECR_REGISTRY}/app-web:${IMAGE_TAG}
    restart: unless-stopped
    expose: ["80"]

volumes:
  caddy_data:
  caddy_config:
```

`deploy/Caddyfile` — Caddy terminates TLS and gets/renews Let's Encrypt automatically
once DNS resolves (ACM certs **cannot** be installed on bare EC2 — do not create one):

```
{$DOMAIN} {
	encode gzip zstd
	handle /api/* {
		reverse_proxy api:8000
	}
	handle {
		reverse_proxy web:80
	}
}
```

`deploy/fetch-env.sh` (runs on the box each deploy; instance role provides SSM access):

```bash
#!/usr/bin/env bash
set -euo pipefail
aws ssm get-parameters-by-path \
  --path /app/prod --with-decryption --region us-east-1 \
  --query 'Parameters[].[Name,Value]' --output text \
| while IFS=$'\t' read -r name value; do
    echo "${name##*/}=${value}"
  done > /opt/app/api.env
chmod 600 /opt/app/api.env
```

SSM parameters (all under `/app/prod/`; names match §5 exactly):
`DATABASE_URL` (SecureString), `SESSION_JWT_SECRET` (SecureString), `APP_ENV`=`production`,
`DB_REQUIRE_TLS`=`true`, `COOKIE_SECURE`=`true`, `GOOGLE_CLIENT_ID`, `AZURE_CLIENT_ID`,
`AZURE_ADMIN_TENANT_ID`, `ADMIN_EMAILS`. (Creation commands are in `SETUP.md`.)

## 13. CI/CD pipeline — `.github/workflows/deploy.yml`

Design notes baked into the YAML below:

- **Test job runs against real MySQL 8** (service container) and runs
  `alembic upgrade head` + single-head check before pytest — the schema uses MySQL-only
  DDL, so SQLite would silently skip the migration path.
- **OIDC federation** to AWS (`id-token: write`) — no long-lived AWS keys in GitHub.
- Client IDs are GitHub **repository variables** (public identifiers): the web image build
  needs `--build-arg` values or both login buttons ship dead.
- **Deploy through AWS SSM Run Command**: no long-lived SSH key in GitHub and no port 22
  security-group opening from GitHub runners.
- Deploy runs the existing `/opt/app` remote flow, records the previous image tag **from
  the running container** (so a failed deploy can't poison the rollback pointer), pulls the
  new images, logs out of ECR, migrates **before** the swap, and smoke-tests `/api/health`
  before declaring success.
- `concurrency` serializes deploys.

```yaml
name: ci-cd

on:
  push: { branches: [main] }
  pull_request: { branches: [main] }

permissions:
  id-token: write
  contents: read

env:
  AWS_REGION: us-east-1

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      mysql:
        image: mysql:8.0
        env:
          MYSQL_ROOT_PASSWORD: root
          MYSQL_DATABASE: appdb
          MYSQL_USER: appuser
          MYSQL_PASSWORD: apppass
        ports: ["3306:3306"]
        options: >-
          --health-cmd "mysqladmin ping -uroot -proot --silent"
          --health-interval 5s --health-timeout 5s --health-retries 12
    env:
      DATABASE_URL: mysql+pymysql://appuser:apppass@127.0.0.1:3306/appdb?charset=utf8mb4
      SESSION_JWT_SECRET: ci-only-secret-0123456789abcdef0123456789abcdef
      GOOGLE_CLIENT_ID: ci-dummy
      AZURE_CLIENT_ID: ci-dummy
      APP_ENV: local
      COOKIE_SECURE: "false"
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.12", cache: pip, cache-dependency-path: backend/requirements*.txt }
      - run: pip install -r backend/requirements.txt -r backend/requirements-dev.txt
      - run: ruff check backend && ruff format --check backend
      - name: Migration smoke test (single head + upgrade)
        working-directory: backend
        run: |
          test "$(alembic heads | wc -l)" -eq 1
          alembic upgrade head
      - run: pytest backend/tests
      - uses: actions/setup-node@v4
        with: { node-version: 24.18.0, cache: npm, cache-dependency-path: frontend/package-lock.json }
      - run: npm ci
        working-directory: frontend
      - run: npm run lint
        working-directory: frontend
      - run: npm run build
        working-directory: frontend

  build-push:
    needs: test
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
          aws-region: ${{ env.AWS_REGION }}
      - uses: aws-actions/amazon-ecr-login@v2
      - name: Build and push app-api
        run: |
          REG=${{ secrets.AWS_ACCOUNT_ID }}.dkr.ecr.us-east-1.amazonaws.com
          docker build --target prod -t $REG/app-api:${{ github.sha }} -t $REG/app-api:latest backend
          docker push --all-tags $REG/app-api
      - name: Build and push app-web
        run: |
          REG=${{ secrets.AWS_ACCOUNT_ID }}.dkr.ecr.us-east-1.amazonaws.com
          docker build --target prod \
            --build-arg VITE_GOOGLE_CLIENT_ID=${{ vars.VITE_GOOGLE_CLIENT_ID }} \
            --build-arg VITE_AZURE_CLIENT_ID=${{ vars.VITE_AZURE_CLIENT_ID }} \
            -t $REG/app-web:${{ github.sha }} -t $REG/app-web:latest frontend
          docker push --all-tags $REG/app-web

  deploy:
    needs: build-push
    runs-on: ubuntu-latest
    concurrency: { group: production-deploy, cancel-in-progress: false }
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
          aws-region: ${{ env.AWS_REGION }}
      - name: Deploy through SSM
        env:
          EC2_INSTANCE_ID: ${{ secrets.EC2_INSTANCE_ID }}
          GIT_SHA: ${{ github.sha }}
        run: |
          cat > remote-deploy.sh <<'SCRIPT'
          set -euo pipefail
          cd /opt/app
          chmod +x fetch-env.sh

          aws ecr get-login-password --region us-east-1 \
            | docker login --username AWS --password-stdin \
              "$(grep '^ECR_REGISTRY=' .env | cut -d= -f2)"

          ./fetch-env.sh

          RUNNING=$(docker inspect --format '{{.Config.Image}}' \
            $(docker compose -f docker-compose.prod.yml ps -q api) 2>/dev/null | cut -d: -f2 || true)
          [ -n "$RUNNING" ] && echo "$RUNNING" > .previous_tag

          sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=__GIT_SHA__/" .env
          docker compose -f docker-compose.prod.yml pull
          docker logout "$(grep '^ECR_REGISTRY=' .env | cut -d= -f2)" || true

          docker compose -f docker-compose.prod.yml run --rm api alembic upgrade head
          docker compose -f docker-compose.prod.yml up -d

          for i in $(seq 1 30); do
            curl -fsS http://localhost/api/health && break
            sleep 2
            [ "$i" = "30" ] && { echo "smoke test failed"; exit 1; }
          done

          docker image prune -af --filter "until=72h"
          SCRIPT
          sed -i "s/__GIT_SHA__/${GIT_SHA}/g" remote-deploy.sh

          python3 - <<'PY'
          import json
          from pathlib import Path

          script = Path("remote-deploy.sh").read_text()
          command = "bash -s <<'REMOTE_DEPLOY_SCRIPT'\n" + script + "\nREMOTE_DEPLOY_SCRIPT"
          Path("ssm-commands.json").write_text(json.dumps({"commands": [command]}))
          PY

          COMMAND_ID=$(aws ssm send-command \
            --document-name AWS-RunShellScript \
            --targets "Key=instanceids,Values=${EC2_INSTANCE_ID}" \
            --parameters file://ssm-commands.json \
            --query "Command.CommandId" \
            --output text)

          aws ssm wait command-executed \
            --command-id "${COMMAND_ID}" \
            --instance-id "${EC2_INSTANCE_ID}"
```

**GitHub configuration** (exact list; setup steps in `SETUP.md`):

| Kind | Name | Value |
|---|---|---|
| secret | `AWS_ACCOUNT_ID` | 12-digit account id |
| secret | `AWS_ROLE_ARN` | `arn:aws:iam::<id>:role/app-github-deploy` |
| secret | `EC2_INSTANCE_ID` | EC2 instance id for SSM Run Command deploys |
| variable | `VITE_GOOGLE_CLIENT_ID` | Google OAuth client id |
| variable | `VITE_AZURE_CLIENT_ID` | Azure app (client) id |

True secrets (DB URL, JWT secret) never enter GitHub — they live only in SSM and are
pulled on the box.

**Rollback:** use SSM Session Manager →
`cd /opt/app && sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=$(cat .previous_tag)/" .env &&
docker compose -f docker-compose.prod.yml up -d`. Schema is never auto-downgraded; because
migrations are additive, old code runs on new schema. Only `alembic downgrade -1` manually
if a migration itself is the problem.

## 14. AWS resources (summary — full click-through walkthrough in SETUP.md)

Region `us-east-1`. Default VPC + two added private subnets (no IGW route) for RDS.

| Resource | Name | Key settings |
|---|---|---|
| SG (EC2) | `app-ec2-sg` | in: 80/443 from world; **no port-22 rule**; deploys and humans use SSM |
| SG (RDS) | `app-rds-sg` | in: 3306 from `app-ec2-sg` (SG reference, not CIDR) |
| RDS | `app-prod-mysql` | MySQL 8.0, `db.t4g.micro`, 20GB gp3, single-AZ, **Public access: No**, custom parameter group (`character_set_server=utf8mb4`, `collation_server=utf8mb4_0900_ai_ci`), backups 7d, deletion protection on |
| ECR | `app-api`, `app-web` | scan on push; lifecycle: keep last 10 images |
| IAM (EC2) | `app-ec2-role` | `AmazonEC2ContainerRegistryReadOnly`, `AmazonSSMManagedInstanceCore`, inline: `ssm:GetParameter*` on `/app/prod/*` + `kms:Decrypt` via `alias/aws/ssm` |
| IAM (CI) | `app-github-deploy` | OIDC trust scoped to `repo:<org>/<repo>:ref:refs/heads/main` + `aud=sts.amazonaws.com`; ECR push on the two repos; `ec2:AuthorizeSecurityGroupIngress`/`RevokeSecurityGroupIngress` scoped to `app-ec2-sg` |
| EC2 | t3.small | Ubuntu 24.04, 30GB gp3, instance profile `app-ec2-role`, Elastic IP, user-data installs docker + compose + awscli + mysql client + **docker log rotation** (`/etc/docker/daemon.json`: json-file, max-size 10m, max-file 3) |
| Route 53 | hosted zone | A record `<domain>` → Elastic IP, TTL 300. Do DNS **before** first deploy so Caddy's cert issuance succeeds (it retries with backoff until then) |

One-time DB bootstrap (from the EC2 box; mysql client installed by user-data):
`CREATE DATABASE appdb CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;` +
`CREATE USER 'appuser'@'%' IDENTIFIED BY '<generated>'; GRANT ALL PRIVILEGES ON appdb.* TO 'appuser'@'%';`

Rough monthly cost: EC2 ~$15 + EIP ~$4 + EBS ~$2.5 + RDS ~$14 + Route 53/ECR/transfer ~$2
≈ **$37–40/mo** (+ domain ~$14/yr).

## 15. Testing

- `backend/tests/conftest.py`: session fixture against the CI/local MySQL (Alembic-migrated
  — never `create_all`). Auth tests monkeypatch the two verifier functions to return
  canned `VerifiedIdentity` values (no live provider calls in tests).
- `test_auth.py`: first-login provisioning (role assignment incl. the tenant-gated
  Microsoft admin rule), repeat login updates `last_login_at`, disabled-account 403,
  cookie set/cleared, 401/403 contract, wrong-content-type 415.
- `test_users.py`: admin list shape `{items,total}`, role change, status change, 403 for
  non-admin, `CANNOT_MODIFY_SELF` on self-demotion and self-deactivation, 404.

## 16. Build order (milestones for prompting Codex)

| # | Deliverable | Done when |
|---|---|---|
| M0 | Repo skeleton: directory tree, `.gitignore`, `.env.example`, README stub | tree matches §3 |
| M1 | Compose + FastAPI skeleton + models + Alembic `0001` + `/api/health` | `docker compose up` → health returns ok after `alembic upgrade head` |
| M2 | Auth: verifiers, provisioning, session JWT, `/api/auth/*`, tests | real Google+Microsoft sign-in works locally; pytest green |
| M3 | RBAC + user management endpoints + dashboard endpoint + tests | admin/user behavior matches §8 exactly |
| M4 | Frontend: login, guards, dashboard, admin users page | full flows work through `localhost:5173` |
| M5 | Prod images + `deploy/` files (compose.prod, Caddyfile, nginx.conf, fetch-env.sh) | `docker build --target prod` succeeds for both images |
| M6 | `.github/workflows/deploy.yml` | test job green on a PR |
| M7 | AWS provisioning per `SETUP.md` (human), first deploy, DNS + TLS live | `https://<domain>` serves the app end-to-end |

Prompt pattern per milestone: *"Using PLAN.md as the specification, implement milestone
M<N>. Do not deviate from the decisions in §4; ask nothing — every contract you need is in
§5–§13."*

## 17. Explicitly out of scope for v1

Account linking UI, pagination, audit log, refresh tokens / sliding sessions, CSRF tokens
(posture documented in §7), multi-instance scaling, ALB/ACM, staging environment,
password auth. Revisit only when a real feature demands it.
