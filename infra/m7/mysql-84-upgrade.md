# RDS MySQL 8.4 Upgrade Runbook

AWS RDS for MySQL 8.0 reaches end of standard support on July 31, 2026.
Upgrade `app-prod-mysql` to MySQL 8.4 before that date to avoid Extended Support charges.

Current production state checked on July 18, 2026:

- DB instance: `app-prod-mysql`
- Current engine: `8.0.46-rds.20260624`
- Recommended target in `us-east-1`: `8.4.10`
- Parameter group for MySQL 8.4: `app-mysql84`

The major version upgrade restarts the database and causes application downtime. Use the
maintenance-window command if you want AWS to apply it during the configured RDS window.

## 1. Create A Manual Snapshot

```powershell
$snapshotId = "app-prod-mysql-pre-mysql84-$(Get-Date -Format yyyyMMddHHmmss)"

aws rds create-db-snapshot `
  --region us-east-1 `
  --db-instance-identifier app-prod-mysql `
  --db-snapshot-identifier $snapshotId

aws rds wait db-snapshot-available `
  --region us-east-1 `
  --db-snapshot-identifier $snapshotId
```

## 2. Create The MySQL 8.4 Parameter Group

```powershell
aws rds create-db-parameter-group `
  --region us-east-1 `
  --db-parameter-group-name app-mysql84 `
  --db-parameter-group-family mysql8.4 `
  --description "OAuth OIDC demo MySQL 8.4 parameter group"

aws rds modify-db-parameter-group `
  --region us-east-1 `
  --db-parameter-group-name app-mysql84 `
  --parameters `
    "ParameterName=character_set_server,ParameterValue=utf8mb4,ApplyMethod=pending-reboot" `
    "ParameterName=collation_server,ParameterValue=utf8mb4_0900_ai_ci,ApplyMethod=pending-reboot"
```

If `app-mysql84` already exists, keep it and only rerun the `modify-db-parameter-group`
command.

## 3. Upgrade During The Maintenance Window

```powershell
aws rds modify-db-instance `
  --region us-east-1 `
  --db-instance-identifier app-prod-mysql `
  --engine-version 8.4.10 `
  --allow-major-version-upgrade `
  --db-parameter-group-name app-mysql84 `
  --no-apply-immediately
```

For an immediate upgrade instead, replace `--no-apply-immediately` with
`--apply-immediately`.

## 4. Verify After Upgrade

```powershell
aws rds wait db-instance-available `
  --region us-east-1 `
  --db-instance-identifier app-prod-mysql

aws rds describe-db-instances `
  --region us-east-1 `
  --db-instance-identifier app-prod-mysql `
  --query "DBInstances[0].{EngineVersion:EngineVersion,Status:DBInstanceStatus,ParameterGroups:DBParameterGroups}" `
  --output json

curl.exe -fsS https://xsnook-oauth-oidc.com/api/health
```

If the parameter group shows `pending-reboot` after the upgrade, reboot the DB instance
during a planned window:

```powershell
aws rds reboot-db-instance `
  --region us-east-1 `
  --db-instance-identifier app-prod-mysql
```
