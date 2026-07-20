# SETUP.md — Human Setup Walkthroughs

> Companion to `PLAN.md`. The coding agent builds everything in the repo; **you** do the
> steps in this file — they involve consoles, installers, and accounts an agent can't
> (and shouldn't) touch. Names here match `PLAN.md` §5/§13/§14 exactly.
>
> Order that works well: **1 (dev machine) → 2 (identity consoles) → 3 (GitHub) → 4 (AWS)
> → 5 (domain/DNS) → first deploy.** You can do 2 and 4 in either order; GitHub step 3.3
> needs values from 4.

---

## 1. Windows dev environment (once, ~60–90 min incl. reboots)

The app runs inside Linux containers — Windows just hosts Docker, Git, and your editor.

### 1.1 Enable WSL2 (required — Windows 11 Home has no Hyper-V)

1. Right-click Start → **Terminal (Admin)** and run `wsl --install`. Reboot when prompted.
2. After reboot, if an Ubuntu window asks for a UNIX username/password, pick anything
   (separate from your Windows login; rarely used).
3. Verify: `wsl --status` and `wsl -l -v` — default version **2**, Ubuntu at VERSION 2.
4. If WSL predates this setup: `wsl --update` then `wsl --set-default-version 2`.
5. If `wsl --install` complains about virtualization, enable it in BIOS/UEFI
   (**Intel VT-x** / **AMD SVM**), then retry.

### 1.2 Docker Desktop (WSL2 backend)

1. Install from `https://www.docker.com/products/docker-desktop/`. Keep the WSL2 backend
   option checked (on Home it's the only backend and may be greyed out — fine).
2. Launch it; accept the service agreement (free for small businesses under the published
   thresholds). Enable **Settings → General → Start Docker Desktop when you sign in** —
   containers only run while the app is running.
3. Verify: `docker run hello-world`.

### 1.3 Git for Windows

1. Install from `https://git-scm.com/download/win` (defaults fine), then:
   ```powershell
   git config --global core.autocrlf input
   git config --global user.name "Your Name"
   git config --global user.email "<your-email>"
   ```
   `core.autocrlf=input` matters: this repo builds Linux images, and CRLF line endings in
   scripts copied into an image produce classic failures like
   `env: 'python\r': No such file or directory`.

### 1.4 Node LTS + Python 3.12 (editor tooling only — the app runs in containers)

1. Node LTS `.msi` from `https://nodejs.org` (plain installer; nvm unnecessary for one version).
2. Python 3.12 from `https://www.python.org/downloads/` — **check "Add python.exe to PATH"**.
3. Optional IDE-IntelliSense niceties after cloning: `npm ci` in `frontend\`. Backend
   Python dependencies are installed in Linux containers from the committed hashed locks.
   If you want a native Windows `.venv`, generate a local platform lock in `backend\` with
   `python -m piptools compile --generate-hashes --output-file requirements-dev.windows.lock requirements-dev.in`,
   then install it with `pip install --require-hashes -r requirements-dev.windows.lock`.
   Do not commit the Windows-only lock. Nothing breaks without these editor niceties.

### 1.5 VS Code + extensions

Python, Pylance, ESLint, Prettier, and Microsoft's Docker/Container Tools extension.

### 1.6 Clone the repo — NOT inside OneDrive

```powershell
mkdir C:\dev
cd C:\dev
git clone https://github.com/<you>/<repo>.git
cd <repo>
code .
```

Your Documents folder is OneDrive-synced; a repo there means OneDrive fighting Docker
bind mounts and file watchers — laggy hot reload, locked files mid-build, endless sync
churn. Keep code under `C:\dev` (or any non-synced path). If you cloned into OneDrive by
accident: re-clone to `C:\dev`, copy your `.env` over, delete the OneDrive copy.

### 1.7 Create `.env` and start the stack

1. `Copy-Item .env.example .env`, then fill in (canonical table in `PLAN.md` §5):
   - `SESSION_JWT_SECRET` — generate: `python -c "import secrets; print(secrets.token_hex(32))"`
   - `GOOGLE_CLIENT_ID` + `AZURE_CLIENT_ID` — from section 2 below (placeholders OK until then;
     the stack starts, you just can't sign in yet)
   - `ADMIN_EMAILS=<the email you will sign in with>`
   - Leave `DATABASE_URL` as shipped — inside compose the host is the service name `mysql`,
     never `localhost`.
2. `docker compose up --build` (first run 5–10 min). Watch for: MySQL "ready for
   connections", Uvicorn on 8000, Vite printing `http://localhost:5173/`.
3. Second terminal: `docker compose exec api alembic upgrade head` (rerun whenever new
   migrations land).
4. Open `http://localhost:5173` (app) and `http://localhost:8000/api/docs` (API docs).
   After pasting real client IDs into `.env`, restart the stack — env changes need it.

### Troubleshooting

- **"WSL 2 installation is incomplete" / virtualization errors** → `wsl --update` (admin),
  reboot, check BIOS VT-x/SVM.
- **"port is already allocated"** (usually 3306 — an old MySQL Windows service):
  `netstat -ano | findstr ":3306"` → `Get-Process -Id <PID>` → stop the service, or remap
  the host port in `docker-compose.yml` (e.g. `3307:3306`).
- **Vite loads, API calls fail** → check api container logs; most common cause is a bad
  `DATABASE_URL` (localhost instead of `mysql`) crash-looping the api.
- **Nothing starts today** → Docker Desktop isn't running.

---

## 2. Google & Microsoft sign-in consoles (~30 min)

At the end you'll have **two client IDs** (public identifiers, not secrets). Do this
before you have the domain — only `http://localhost:5173` is needed for local dev; you'll
make two "return trips" after DNS (noted at the end).

### 2A. Google Cloud — consent screen + OAuth Web client

1. `https://console.cloud.google.com` → project selector → **New Project** → name
   `team-portal` → Create → **make sure it's selected** in the top bar (classic trip-up).
2. **OAuth consent screen** (nav: "Google Auth Platform", or APIs & Services → OAuth
   consent screen — same place). App name (users see it on the popup), support email.
3. **User type**:
   - **Internal** — only if you have Google Workspace; skips test-user management entirely. Pick it if available.
   - **External** — otherwise. App starts in **Testing** mode: **only listed test users can
     sign in** (others get "access_denied"). Add every staff Google email under
     Audience/Test users — "works for me, not my coworker" is almost always this list.
   - Later, **Publish app** to leave Testing. Basic identity scopes (`openid email profile`)
     need no Google verification review; your app's own DB roles/`ADMIN_EMAILS` do the real
     gatekeeping anyway.
4. **Create the client**: Clients / Credentials → **Create credentials → OAuth client ID**
   → type **Web application** → name `team-portal-web`.
5. **Authorized JavaScript origins** — add:
   - `http://localhost:5173`
   - `http://localhost`
   - `https://<your-domain>` (return trip if not bought yet)

   **Leave "Authorized redirect URIs" empty** — the GIS button flow validates the page
   *origin*, not a redirect URI. `Error 400: origin_mismatch` in the console = fix this
   list (exact scheme/host/port, no trailing slash). Origin edits can take 5 min–few hours
   to propagate.
6. Copy the **Client ID** (`....apps.googleusercontent.com`). The client *secret* shown
   alongside is **unused** in this architecture — never put it in any env file.

→ goes into **both** `VITE_GOOGLE_CLIENT_ID` (frontend) and `GOOGLE_CLIENT_ID` (backend).

### 2B. Microsoft Entra ID — SPA app registration

Any Azure account works (free tier; app registrations cost nothing).

1. `https://portal.azure.com` → search **Microsoft Entra ID** → **App registrations** →
   **+ New registration**. Name `team-portal-web`.
2. **Supported account types** — pick the third option: **"Accounts in any organizational
   directory and personal Microsoft accounts"**. It's the only one matching the app's
   `common` authority (stricter registration + `common` authority =
   `AADSTS50194` errors). Locking to your own tenant later is a coordinated three-place
   change (registration `signInAudience`, MSAL authority, backend issuer check) — note it
   in a runbook, don't do it now.
3. **Platform: Single-page application** (Authentication → Add a platform → **SPA**), with
   redirect URIs `http://localhost:5173` and later `https://<your-domain>`.
   **Not "Web"** — MSAL.js redeems the PKCE code cross-origin, which Entra only allows for
   SPA-registered URIs. The error `AADSTS9002326: Cross-origin token redemption...` always
   means a URI is under the wrong platform.
4. Leave defaults: implicit-grant boxes unchecked, "Allow public client flows" No,
   API permissions at the default `User.Read`. **No client secret** — a SPA is a public
   client; the backend verifies tokens against Microsoft's public keys.
5. From **Overview** copy **two GUIDs**:
   - **Application (client) ID** → `VITE_AZURE_CLIENT_ID` (frontend) + `AZURE_CLIENT_ID` (backend)
   - **Directory (tenant) ID** → `AZURE_ADMIN_TENANT_ID` (backend) — this is your company
     tenant; it gates which Microsoft sign-ins can be auto-promoted to admin via
     `ADMIN_EMAILS` (PLAN.md §4.3). Leave the env var empty to disable Microsoft-based
     admin bootstrap entirely.

### Cheat sheet + return trips

| Console value | Env var(s) |
|---|---|
| Google OAuth Client ID | `VITE_GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_ID` |
| Entra Application (client) ID | `VITE_AZURE_CLIENT_ID`, `AZURE_CLIENT_ID` |
| Entra Directory (tenant) ID | `AZURE_ADMIN_TENANT_ID` |

**After the domain exists, two return trips:** add `https://<your-domain>` to (1) Google's
Authorized JavaScript origins, (2) the Entra SPA redirect URI list. "Login works locally
but not in production" is almost always one of these.

---

## 3. GitHub repository & Actions (~15 min)

### 3.1 Create the private repo and push

1. github.com → **+** → **New repository** → name e.g. `team-portal`, **Private**, no
   initialization options (the skeleton already has README/.gitignore).
2. From the project folder:
   ```powershell
   git init
   git add .
   git commit -m "Initial monorepo skeleton"
   git branch -M main
   git remote add origin https://github.com/<you>/team-portal.git
   git push -u origin main
   ```
   Git Credential Manager pops a browser sign-in once.

### 3.2 Confirm Actions is enabled

Settings → Actions → General → "Allow all actions and reusable workflows". Leave
Workflow permissions read-only — the workflow file itself requests `id-token: write`.

### 3.3 Secrets and variables (Settings → Secrets and variables → Actions)

Create exactly these (matches `PLAN.md` §13; values from section 4 of this file):

| Name | Tab | Value |
|---|---|---|
| `AWS_ACCOUNT_ID` | Secret | 12-digit account ID |
| `AWS_ROLE_ARN` | Secret | `arn:aws:iam::<id>:role/app-github-deploy` |
| `EC2_INSTANCE_ID` | Secret | EC2 instance id, for SSM Run Command deploys |
| `VITE_GOOGLE_CLIENT_ID` | **Variable** | Google client ID (public identifier) |
| `VITE_AZURE_CLIENT_ID` | **Variable** | Entra application (client) ID |

Do **not** create `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` — CI authenticates via OIDC
role assumption; tutorials that say otherwise are the old pattern this plan deliberately
avoids. Runtime backend secrets (`DATABASE_URL`, `SESSION_JWT_SECRET`, ...) never go in
GitHub — they live in SSM (section 4.7).

### 3.4 Branch protection (optional but cheap)

After the first workflow run exists: Settings → Branches (or Rules → Rulesets) → rule on
`main` → require the `test` status check. Solo dev: skip "require a pull request".
Heads-up: on the GitHub **Free** plan, protection rules on **private** repos aren't
enforced (needs Pro, ~$4/mo) — the red X on a failing commit is still your signal.

### 3.5 Watching and re-running

Actions tab → click a run → click a job to stream logs. Re-run: **Re-run failed jobs**
reuses already-pushed images and is safe — `compose pull && up -d` converges, and
`alembic upgrade head` no-ops if already applied. If the failure was a code bug, push a
fix instead of re-running.

---

## 4. AWS account, IAM & infrastructure (~60–90 min, in this order)

Region: **us-east-1** everywhere (ARNs too). Install AWS CLI v2 on Windows
(MSI from `https://aws.amazon.com/cli/`; verify `aws --version`). Keep a scratch file for:
account ID, deploy role ARN, EC2 instance ID + SG ID, Elastic IP, RDS endpoint, domain.

### 4.1 Account hygiene

1. **Root MFA**: sign in as root → Security credentials → assign MFA (authenticator app).
   Confirm root has **no access keys**; delete any that exist.
2. **Daily-use admin identity** — pick ONE:
   - *Option A — IAM Identity Center (recommended)*: enable it, add user
     `admin-<you>` (your email), create the **AdministratorAccess**
     permission set, assign it to your account. Then `aws configure sso` in PowerShell
     (profile name `default`); refresh sessions later with `aws sso login`.
   - *Option B — IAM user (fastest)*: IAM → Users → create `admin-<you>` with console
     access + AdministratorAccess, add MFA, create a CLI access key, `aws configure`.
3. Sign out of root permanently. Verify: `aws sts get-caller-identity` → note `Account`
   = `<ACCOUNT_ID>`.
4. **Budget**: Billing → Budgets → Create → Monthly cost budget template → `monthly-50`,
   $50, alerts to your email. (Expected steady-state spend ≈ $37–40/mo.)

### 4.2 GitHub OIDC provider + deploy role `app-github-deploy`

1. IAM → Identity providers → **Add provider** → OpenID Connect →
   URL `https://token.actions.githubusercontent.com`, audience `sts.amazonaws.com`.
2. IAM → Roles → **Create role** → Web identity → that provider + audience → name
   **`app-github-deploy`**. Then edit its **trust policy** to exactly:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
        "token.actions.githubusercontent.com:sub": "repo:<ORG>/<REPO>:ref:refs/heads/main"
      }
    }
  }]
}
```

   The `sub` condition is the security boundary — only `main` of your repo can assume it.

3. Inline permissions policy `app-github-deploy-policy` (replace `<ACCOUNT_ID>`; fill
   `<INSTANCE_ID>` after step 4.5):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Sid": "EcrLogin", "Effect": "Allow",
      "Action": "ecr:GetAuthorizationToken", "Resource": "*" },
    { "Sid": "EcrPush", "Effect": "Allow",
      "Action": ["ecr:BatchCheckLayerAvailability","ecr:GetDownloadUrlForLayer",
                 "ecr:BatchGetImage","ecr:PutImage","ecr:InitiateLayerUpload",
                 "ecr:UploadLayerPart","ecr:CompleteLayerUpload"],
      "Resource": ["arn:aws:ecr:us-east-1:<ACCOUNT_ID>:repository/app-api",
                   "arn:aws:ecr:us-east-1:<ACCOUNT_ID>:repository/app-web"] },
    { "Sid": "RunDeployCommand", "Effect": "Allow",
      "Action": "ssm:SendCommand",
      "Resource": [
        "arn:aws:ssm:us-east-1::document/AWS-RunShellScript",
        "arn:aws:ec2:us-east-1:<ACCOUNT_ID>:instance/<INSTANCE_ID>"
      ] },
    { "Sid": "ReadDeployCommandResult", "Effect": "Allow",
      "Action": "ssm:GetCommandInvocation", "Resource": "*" }
  ]
}
```

4. Copy the **role ARN** → GitHub secret `AWS_ROLE_ARN`.

### 4.3 ECR repositories

ECR → Private registry → create **`app-api`** and **`app-web`** (private, defaults;
enable scan-on-push). On each: Lifecycle policy → "expire when image count exceeds 10".

### 4.4 EC2 instance role `app-ec2-role`

1. IAM → Roles → Create role → AWS service → **EC2** → attach managed policies
   **AmazonSSMManagedInstanceCore** (Session Manager access — your day-to-day shell, no
   SSH keys) and **AmazonEC2ContainerRegistryReadOnly**. Name **`app-ec2-role`**.
2. Inline policy `app-ssm-params-read` — note the Resource is a **two-element array**;
   `GetParametersByPath` authorizes against the *path* ARN (no trailing `/*`), and the
   deploy script uses exactly that call:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "ReadProdParameters",
    "Effect": "Allow",
    "Action": ["ssm:GetParameter","ssm:GetParameters","ssm:GetParametersByPath"],
    "Resource": [
      "arn:aws:ssm:us-east-1:<ACCOUNT_ID>:parameter/app/prod",
      "arn:aws:ssm:us-east-1:<ACCOUNT_ID>:parameter/app/prod/*"
    ]
  }]
}
```

   (SecureStrings under the default AWS-managed SSM key need no explicit KMS grant.)

### 4.5 EC2 instance + Elastic IP

1. EC2 → Launch instance. Name `app-server`. AMI **Ubuntu Server 24.04 LTS, 64-bit x86**
   (not Arm — CI builds amd64 images). Type **t3.small**. Storage **30 GiB gp3**.
2. **Key pair**: proceed without an SSH key pair if you are comfortable using Session
   Manager for all interactive access. If you create a break-glass key, do not store it in
   GitHub.
3. Network: default VPC, auto-assign public IP **Enable**. Create SG **`app-ec2-sg`** with
   **only** HTTP 80 and HTTPS 443 from Anywhere. **No port 22 rule** — deploys and
   interactive access use SSM, not SSH.
4. Advanced details → IAM instance profile **`app-ec2-role`**; paste this **User data**
   (installs Docker + compose, AWS CLI v2 via the official zip — *not* snap, which breaks
   under cloud-init and puts `aws` off the default PATH — a MySQL client for the one-time
   DB bootstrap, and Docker log rotation so logs can't fill the disk):

```bash
#!/bin/bash
set -euo pipefail
mkdir -p /opt/app && chown ubuntu:ubuntu /opt/app
apt-get update -y
apt-get install -y ca-certificates curl unzip mysql-client-core-8.0 amazon-ecr-credential-helper
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<'EOF'
{"log-driver":"json-file","log-opts":{"max-size":"10m","max-file":"3"}}
EOF
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu noble stable" > /etc/apt/sources.list.d/docker.list
apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
usermod -aG docker ubuntu
curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip
unzip -q /tmp/awscliv2.zip -d /tmp && /tmp/aws/install
```

5. Launch. Note the **Instance ID** (→ GitHub secret `EC2_INSTANCE_ID`; also paste into
   the deploy role policy from 4.2.3).
6. **Verify SSM**: wait ~3 min → instance → Connect → **Session Manager** → Connect →
   `docker --version`, `docker compose version`, `aws --version`. If Session Manager says
   unavailable, the instance profile is usually missing (Actions → Security → Modify IAM role).
7. **Elastic IP**: EC2 → Elastic IPs → Allocate → Associate with `app-server`. Note it
   for the DNS A record later.
8. **Bootstrap `/opt/app/.env`** (compose interpolation values the deploy job updates):
   in a Session Manager shell:
   ```bash
   cat > /opt/app/.env <<'EOF'
   ECR_REGISTRY=<ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com
   IMAGE_TAG=latest
   DOMAIN=<your-domain>
   EOF
   chown ubuntu:ubuntu /opt/app/.env
   ```

### 4.6 RDS MySQL `app-prod-mysql`

1. **DB security group**: EC2 → Security Groups → create **`app-rds-sg`**, inbound one
   rule: **MYSQL/Aurora 3306**, Source = **`app-ec2-sg`** (type the SG name, select the
   `sg-...`). SG-chaining: only the app server can reach the DB.
2. **Parameter group**: RDS → Parameter groups → Create (family `mysql8.4`) → name
   `app-mysql84` → edit: `character_set_server=utf8mb4`,
   `collation_server=utf8mb4_0900_ai_ci`.
3. **Create database**: Standard create → MySQL 8.4.x → template Dev/Test →
   **Single-AZ** → identifier **`app-prod-mysql`** → master user `appadmin`,
   **self-managed** strong password (20+ chars, letters+digits only — URL-special chars
   like `@ : / ? #` complicate `DATABASE_URL`) → instance **db.t4g.micro** → storage
   20 GiB gp3, autoscale max 50 → Connectivity: default VPC, **Public access: No**,
   existing SG **`app-rds-sg`** only → Additional configuration: **initial database name
   `appdb`** (don't skip — nothing creates it otherwise), DB parameter group `app-mysql84`,
   automated backups **7 days**, encryption on, Performance Insights off, **deletion
   protection on**.
4. When Available, copy the **Endpoint**. Verify the SG chain from a Session Manager shell:
   ```bash
   timeout 5 bash -c 'cat < /dev/null > /dev/tcp/<RDS_ENDPOINT>/3306' && echo OK || echo FAIL
   ```
5. **Create the app's DB user** (the app never uses `appadmin`) — from the same shell:
   ```bash
   mysql -h <RDS_ENDPOINT> -u appadmin -p
   ```
   ```sql
   CREATE USER 'appuser'@'%' IDENTIFIED BY '<generated-password>';
   GRANT ALL PRIVILEGES ON appdb.* TO 'appuser'@'%';
   FLUSH PRIVILEGES;
   ```

### 4.7 SSM parameters (runtime config → `/app/prod/*`)

From PowerShell as your admin identity (`aws sso login` first if using Identity Center).
Names must match `PLAN.md` §5 exactly — the server writes them verbatim into `api.env`:

```powershell
# the two true secrets
aws ssm put-parameter --name /app/prod/DATABASE_URL --type SecureString --value 'mysql+pymysql://appuser:<APP_DB_PASSWORD>@<RDS_ENDPOINT>:3306/appdb?charset=utf8mb4'
aws ssm put-parameter --name /app/prod/SESSION_JWT_SECRET --type SecureString --value '<64-hex — python -c "import secrets; print(secrets.token_hex(32))">'

# plain config
aws ssm put-parameter --name /app/prod/APP_ENV --type String --value 'production'
aws ssm put-parameter --name /app/prod/DB_REQUIRE_TLS --type String --value 'true'
aws ssm put-parameter --name /app/prod/COOKIE_SECURE --type String --value 'true'
aws ssm put-parameter --name /app/prod/GOOGLE_CLIENT_ID --type String --value '<...>.apps.googleusercontent.com'
aws ssm put-parameter --name /app/prod/AZURE_CLIENT_ID --type String --value '<application-client-id-guid>'
aws ssm put-parameter --name /app/prod/AZURE_ADMIN_TENANT_ID --type String --value '<directory-tenant-id-guid>'
aws ssm put-parameter --name /app/prod/ADMIN_EMAILS --type String --value '<your-sign-in-email>'
aws ssm put-parameter --name /app/prod/TRUSTED_PROXY_CIDRS --type String --value '172.16.0.0/12'
```

(Update later with `--overwrite`. Comma-separate additional admin emails, no spaces.)

Verify from your machine **and** from the instance — the instance check must use the same
API the deploy uses:

```bash
# in a Session Manager shell on app-server:
aws ssm get-parameters-by-path --path /app/prod --with-decryption --region us-east-1 --query 'Parameters[].Name'
```

All ten names should print. AccessDenied here = the 4.4.2 policy is missing the
no-trailing-slash path ARN.

---

## 5. Route 53: domain, hosted zone, A record

Do this **before** the first production deploy — Caddy can only obtain its Let's Encrypt
certificate once the domain resolves to the Elastic IP (it retries with backoff until then).

**Path A — buy in Route 53 (simplest):** Route 53 → Registered domains → Register.
`.com` ≈ $14–15/yr. Keep privacy protection + auto-renew on. **Click the verification
email** if one arrives (unverified registrants get suspended). The hosted zone is created
automatically.

**Path B — domain at another registrar:** Route 53 → Hosted zones → Create (public zone,
~$0.50/mo) → copy the four `NS` values into the registrar's nameserver settings → wait for
delegation (`Resolve-DnsName <domain> -Type NS` shows awsdns servers).

**Both:** open the zone → Create record → name **blank** (apex), type **A**, value =
**Elastic IP**, TTL 300. Verify: `Resolve-DnsName <domain> -Type A` returns the Elastic IP.

**Skip `www` in v1.** A `www` record without a matching Caddy site + OAuth origins is a
half-broken door (TLS error or `origin_mismatch`). If you want it later: add
`www.<domain>` to the Caddyfile as a redirect to the apex — Caddy then gets a cert for it
and no OAuth console changes are needed.

Then make the **two return trips** from section 2 (Google origins, Entra redirect URIs),
and update `DOMAIN=` in `/opt/app/.env`.

---

## 6. First deploy checklist

- [ ] Root MFA on, no root keys; admin identity works (`aws sts get-caller-identity`); $50 budget set
- [ ] `app-github-deploy` role: trust scoped to `repo:<org>/<repo>:ref:refs/heads/main`, policy has the **real `sg-` id**
- [ ] ECR `app-api` + `app-web` exist (lifecycle: keep 10)
- [ ] `app-server` running: role `app-ec2-role`, SG `app-ec2-sg` (80/443 only, **no 22**), Docker + compose + AWS CLI verified via Session Manager, Elastic IP attached, `/opt/app/.env` bootstrapped
- [ ] `app-prod-mysql` Available: Public access No, SG `app-rds-sg` ← `app-ec2-sg`, initial DB `appdb`, param group `app-mysql84`, backups 7d; `appuser` created; port test says OK
- [ ] All ten `/app/prod/*` params exist; instance `get-parameters-by-path` works
- [ ] GitHub: 3 secrets + 2 variables set (section 3.3)
- [ ] Domain resolves to the Elastic IP; Google origins + Entra redirect URIs updated
- [ ] Push to `main` → watch Actions: test → build-push → deploy → smoke test green →
      `https://<domain>` shows the sign-in page, and your `ADMIN_EMAILS` account lands on
      the dashboard with the Users nav item

**Day-2 notes:** interactive server access = Session Manager (no SSH keys). Rollback =
`PLAN.md` §13. RDS restore gotcha: restoring a snapshot creates a **new** instance with a
new endpoint and **default** SG/subnet/parameter group — re-attach `app-rds-sg` +
`app-mysql84` via `--vpc-security-group-ids`/`--db-subnet-group-name`, then update
`/app/prod/DATABASE_URL` and redeploy.
