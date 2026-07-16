param(
    [string]$ConfigPath = "$PSScriptRoot\m7.config.json"
)

$ErrorActionPreference = "Stop"

function Write-Check {
    param(
        [string]$Name,
        [bool]$Passed,
        [string]$Detail = ""
    )

    $status = if ($Passed) { "OK" } else { "MISSING" }
    $line = "[$status] $Name"
    if ($Detail) {
        $line = "$line - $Detail"
    }
    Write-Output $line
}

function Test-Command {
    param([string]$Name)
    return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

$hasAws = Test-Command "aws"
$hasGit = Test-Command "git"
$hasDocker = Test-Command "docker"

Write-Check "git CLI" $hasGit
Write-Check "docker CLI" $hasDocker
Write-Check "AWS CLI v2" $hasAws "Install from https://aws.amazon.com/cli/ if missing."

if (Test-Path $ConfigPath) {
    $config = Get-Content -Raw $ConfigPath | ConvertFrom-Json
    Write-Check "M7 config" $true $ConfigPath
    Write-Check "region" ([bool]$config.region) $config.region
    Write-Check "repo owner/name" ([bool]$config.repoOwner -and [bool]$config.repoName) "$($config.repoOwner)/$($config.repoName)"
    Write-Check "domain" ([bool]$config.domain) $config.domain
    Write-Check "admin emails" ([bool]$config.adminEmails) $config.adminEmails
    Write-Check "Google client ID" ([bool]$config.googleClientId) $config.googleClientId
} else {
    Write-Check "M7 config" $false "Copy infra/m7/m7.config.example.json to infra/m7/m7.config.json."
}

if ($hasAws) {
    try {
        $identity = aws sts get-caller-identity --output json | ConvertFrom-Json
        Write-Check "AWS credentials" $true "Account $($identity.Account), ARN $($identity.Arn)"
        Write-Check "non-root AWS identity" (-not $identity.Arn.EndsWith(":root")) "Do not provision from the root account; use IAM Identity Center or an admin IAM user."
    } catch {
        Write-Check "AWS credentials" $false "Run aws configure sso, aws sso login, or aws configure."
    }
}

$secretNames = @(
    "M7_DB_MASTER_PASSWORD",
    "M7_APP_DB_PASSWORD"
)

foreach ($name in $secretNames) {
    Write-Check "env:$name" ([bool][Environment]::GetEnvironmentVariable($name)) "Required only when applying RDS/SSM changes."
}

Write-Output ""
Write-Output "Human-owned before first deploy:"
Write-Output "- AWS account root MFA and billing budget."
Write-Output "- Domain registration and registrant email verification."
Write-Output "- Google OAuth production origin: https://<domain>."
Write-Output "- GitHub Actions secrets/vars, unless you set them through the GitHub UI while following the runbook."
