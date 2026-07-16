# M7 AWS Provisioning Runbook

M7 moves the app from local/Docker-only into AWS. The target is:

- GitHub Actions can assume an AWS deploy role from `main`.
- ECR has `app-api` and `app-web`.
- EC2 can pull images, read SSM parameters, and run Docker Compose behind Caddy.
- RDS MySQL is reachable only from the EC2 security group.
- DNS points the chosen domain at the EC2 Elastic IP.
- Caddy obtains TLS and `https://<domain>` serves the app.

## What a Human Must Do

These steps are account ownership or console identity tasks and should not be automated by
repo scripts:

1. Enable root MFA, remove root access keys, and create a budget alert.
2. Install AWS CLI v2 and authenticate with IAM Identity Center or an admin IAM user.
3. Register or choose a domain, and complete any registrant verification email.
4. Add the production Google OAuth origin: `https://<domain>`.
5. Paste GitHub Actions secrets/vars if the GitHub CLI is not available locally.

## What the Scripts Can Do

The scripts in this folder prepare the repeatable AWS foundation:

- ECR repositories and lifecycle policies.
- GitHub OIDC provider and least-privilege deploy role.
- EC2 role with SSM/ECR access.
- EC2 and RDS security groups.
- RDS MySQL parameter group.
- SSM runtime parameters when required config and environment variables exist.

The provisioning script defaults to dry-run. Add `-Apply` only after the plan looks right.

## First-Time Local Setup

Install AWS CLI v2, then authenticate:

```powershell
aws configure sso
aws sso login
aws sts get-caller-identity
```

Create a local config file:

```powershell
Copy-Item infra/m7/m7.config.example.json infra/m7/m7.config.json
notepad infra/m7/m7.config.json
```

Fill in:

- `repoOwner`: `xSnook`
- `repoName`: `oauth-oidc-demo`
- `domain`: the production apex domain, for example `example.com`
- `adminEmails`: your real Google login email
- `googleClientId`: the Google OAuth client ID
- optional network fields if you do not want the default VPC/subnet discovery

Do not commit `m7.config.json`.

## Preflight

```powershell
.\infra\m7\preflight.ps1
```

This checks local tooling, AWS auth, required config, and secret environment variables.

## Dry-Run Provisioning

```powershell
.\infra\m7\provision.ps1
```

Review the printed AWS CLI commands.

## Apply Foundation Resources

Use strong local-only passwords. Avoid URL-special characters in the app DB password because
it becomes part of `DATABASE_URL`.

```powershell
$env:M7_APP_DB_PASSWORD = "<strong-app-db-password>"
.\infra\m7\provision.ps1 -Apply
```

The script prints the values needed for GitHub:

- `AWS_ACCOUNT_ID`
- `AWS_ROLE_ARN`
- `EC2_SG_ID`
- `VITE_GOOGLE_CLIENT_ID`
- `VITE_AZURE_CLIENT_ID`

The remaining M7 work is still interactive because it depends on final human choices:

1. Launch/confirm the EC2 instance and Elastic IP per `SETUP.md`.
2. Create/confirm RDS MySQL and app user per `SETUP.md`.
3. Replace the placeholder RDS endpoint in `/app/prod/DATABASE_URL`.
4. Bootstrap `/opt/app/.env` on EC2:

   ```bash
   ECR_REGISTRY=<ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com
   IMAGE_TAG=latest
   DOMAIN=<your-domain>
   ```

5. Create the Route 53 apex `A` record to the Elastic IP.
6. Add GitHub secrets/vars.
7. Merge to `main` and watch the `ci-cd` workflow deploy.

## GitHub Actions Values

Secrets:

| Name | Value |
|---|---|
| `AWS_ACCOUNT_ID` | 12-digit AWS account ID |
| `AWS_ROLE_ARN` | `arn:aws:iam::<id>:role/app-github-deploy` |
| `EC2_HOST` | Elastic IP |
| `EC2_SSH_PRIVATE_KEY` | Full `app-deploy-key.pem` contents |
| `EC2_SG_ID` | `app-ec2-sg` security group ID |

Variables:

| Name | Value |
|---|---|
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `VITE_AZURE_CLIENT_ID` | Empty string while Azure is skipped |

## Production Verification

After the `main` deploy workflow succeeds:

```powershell
Resolve-DnsName <domain> -Type A
curl.exe -I https://<domain>
curl.exe https://<domain>/api/health
```

Then verify in the browser:

- `https://<domain>` shows the sign-in page.
- Google sign-in succeeds.
- The configured `ADMIN_EMAILS` account can see the admin Users page.
