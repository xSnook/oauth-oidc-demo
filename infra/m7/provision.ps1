param(
    [string]$ConfigPath = "$PSScriptRoot\m7.config.json",
    [switch]$Apply
)

$ErrorActionPreference = "Stop"

if (!(Test-Path $ConfigPath)) {
    throw "Missing config file. Copy infra/m7/m7.config.example.json to infra/m7/m7.config.json first."
}

if ($Apply -and $null -eq (Get-Command aws -ErrorAction SilentlyContinue)) {
    throw "AWS CLI is not installed or not on PATH."
}

if (!$Apply -and $null -eq (Get-Command aws -ErrorAction SilentlyContinue)) {
    Write-Output "AWS CLI is not installed; continuing because this is a dry run."
}

$config = Get-Content -Raw $ConfigPath | ConvertFrom-Json
$region = if ($config.region) { $config.region } else { "us-east-1" }
$repoFullName = "$($config.repoOwner)/$($config.repoName)"

function Invoke-Aws {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Args,
        [switch]$Json,
        [switch]$AllowFailure
    )

    $commandText = "aws " + ($Args -join " ")
    if (!$Apply) {
        Write-Host "[dry-run] $commandText"
        return $null
    }

    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $output = & aws @Args 2>&1
    $ErrorActionPreference = $previousErrorActionPreference
    if ($LASTEXITCODE -ne 0) {
        if ($AllowFailure) {
            return $null
        }
        throw "$commandText failed:`n$output"
    }

    if ($Json -and $output) {
        return ($output | Out-String | ConvertFrom-Json)
    }

    return $output
}

function Write-Step {
    param([string]$Message)
    Write-Output ""
    Write-Output "==> $Message"
}

function Get-AccountId {
    $identity = Invoke-Aws @("sts", "get-caller-identity", "--output", "json") -Json
    if ($identity) {
        if ($Apply -and $identity.Arn.EndsWith(":root")) {
            throw "Refusing to apply AWS changes as the root account. Configure IAM Identity Center or an admin IAM user, then rerun."
        }
        return $identity.Account
    }
    return "<ACCOUNT_ID>"
}

function Ensure-EcrRepository {
    param([string]$Name)

    $repo = Invoke-Aws @(
        "ecr", "describe-repositories",
        "--repository-names", $Name,
        "--region", $region,
        "--output", "json"
    ) -Json -AllowFailure

    if (!$repo) {
        Invoke-Aws @(
            "ecr", "create-repository",
            "--repository-name", $Name,
            "--image-scanning-configuration", "scanOnPush=true",
            "--region", $region
        )
    }

    $policy = @{
        rules = @(
            @{
                rulePriority = 1
                description = "Keep last 10 images"
                selection = @{
                    tagStatus = "any"
                    countType = "imageCountMoreThan"
                    countNumber = 10
                }
                action = @{
                    type = "expire"
                }
            }
        )
    } | ConvertTo-Json -Depth 10 -Compress

    $policyPath = Join-Path $env:TEMP "app-$Name-ecr-lifecycle.json"
    Set-Content -Path $policyPath -Value $policy -NoNewline
    Invoke-Aws @(
        "ecr", "put-lifecycle-policy",
        "--repository-name", $Name,
        "--lifecycle-policy-text", "file://$policyPath",
        "--region", $region
    )
}

function Ensure-OidcProvider {
    param([string]$AccountId)

    $arn = "arn:aws:iam::${AccountId}:oidc-provider/token.actions.githubusercontent.com"
    $existing = Invoke-Aws @("iam", "get-open-id-connect-provider", "--open-id-connect-provider-arn", $arn) -AllowFailure
    if (!$existing) {
        Invoke-Aws @(
            "iam", "create-open-id-connect-provider",
            "--url", "https://token.actions.githubusercontent.com",
            "--client-id-list", "sts.amazonaws.com"
        ) | Out-Null
    }
    return $arn
}

function Ensure-Role {
    param(
        [string]$RoleName,
        [string]$TrustPolicyJson
    )

    $trustPath = Join-Path $env:TEMP "$RoleName-trust.json"
    Set-Content -Path $trustPath -Value $TrustPolicyJson -NoNewline

    $role = Invoke-Aws @("iam", "get-role", "--role-name", $RoleName, "--output", "json") -Json -AllowFailure
    if (!$role) {
        Invoke-Aws @(
            "iam", "create-role",
            "--role-name", $RoleName,
            "--assume-role-policy-document", "file://$trustPath"
        )
    } else {
        Invoke-Aws @(
            "iam", "update-assume-role-policy",
            "--role-name", $RoleName,
            "--policy-document", "file://$trustPath"
        )
    }
}

function Put-RolePolicy {
    param(
        [string]$RoleName,
        [string]$PolicyName,
        [string]$PolicyJson
    )

    $policyPath = Join-Path $env:TEMP "$RoleName-$PolicyName.json"
    Set-Content -Path $policyPath -Value $PolicyJson -NoNewline
    Invoke-Aws @(
        "iam", "put-role-policy",
        "--role-name", $RoleName,
        "--policy-name", $PolicyName,
        "--policy-document", "file://$policyPath"
    )
}

function Get-DefaultVpcId {
    if ($config.vpcId) {
        return $config.vpcId
    }

    $vpcs = Invoke-Aws @(
        "ec2", "describe-vpcs",
        "--filters", "Name=is-default,Values=true",
        "--region", $region,
        "--output", "json"
    ) -Json
    if ($vpcs -and $vpcs.Vpcs -and $vpcs.Vpcs.Count -gt 0) {
        return $vpcs.Vpcs[0].VpcId
    }
    return "<VPC_ID>"
}

function Ensure-SecurityGroup {
    param(
        [string]$Name,
        [string]$Description,
        [string]$VpcId
    )

    $groups = Invoke-Aws @(
        "ec2", "describe-security-groups",
        "--filters", "Name=group-name,Values=$Name", "Name=vpc-id,Values=$VpcId",
        "--region", $region,
        "--output", "json"
    ) -Json

    if ($groups -and $groups.SecurityGroups.Count -gt 0) {
        return $groups.SecurityGroups[0].GroupId
    }

    $created = Invoke-Aws @(
        "ec2", "create-security-group",
        "--group-name", $Name,
        "--description", $Description,
        "--vpc-id", $VpcId,
        "--region", $region,
        "--output", "json"
    ) -Json
    if ($created) {
        return $created.GroupId
    }
    return "<$Name>"
}

function Authorize-Ingress {
    param(
        [string]$GroupId,
        [string]$Protocol,
        [string]$Port,
        [string]$Cidr,
        [string]$SourceGroupId
    )

    $args = @(
        "ec2", "authorize-security-group-ingress",
        "--group-id", $GroupId,
        "--protocol", $Protocol,
        "--port", $Port,
        "--region", $region
    )

    if ($Cidr) {
        $args += @("--cidr", $Cidr)
    } else {
        $args += @("--source-group", $SourceGroupId)
    }

    Invoke-Aws $args -AllowFailure | Out-Null
}

function Ensure-InstanceProfile {
    param([string]$RoleName)

    $profile = Invoke-Aws @("iam", "get-instance-profile", "--instance-profile-name", $RoleName, "--output", "json") -Json -AllowFailure
    if (!$profile) {
        Invoke-Aws @("iam", "create-instance-profile", "--instance-profile-name", $RoleName)
        Invoke-Aws @("iam", "add-role-to-instance-profile", "--instance-profile-name", $RoleName, "--role-name", $RoleName) -AllowFailure
    }
}

function Ensure-RdsParameterGroup {
    $name = "app-mysql84"
    $existing = Invoke-Aws @(
        "rds", "describe-db-parameter-groups",
        "--db-parameter-group-name", $name,
        "--region", $region,
        "--output", "json"
    ) -Json -AllowFailure

    if (!$existing) {
        Invoke-Aws @(
            "rds", "create-db-parameter-group",
            "--db-parameter-group-name", $name,
            "--db-parameter-group-family", "mysql8.4",
            "--description", "OAuth OIDC demo MySQL 8.4 parameter group",
            "--region", $region
        )
    }

    Invoke-Aws @(
        "rds", "modify-db-parameter-group",
        "--db-parameter-group-name", $name,
        "--parameters", "ParameterName=character_set_server,ParameterValue=utf8mb4,ApplyMethod=pending-reboot", "ParameterName=collation_server,ParameterValue=utf8mb4_0900_ai_ci,ApplyMethod=pending-reboot",
        "--region", $region
    )
    return $name
}

Write-Step "Preflight identity"
$accountId = Get-AccountId
$vpcId = Get-DefaultVpcId
Write-Output "Account: $accountId"
Write-Output "Region:  $region"
Write-Output "Repo:    $repoFullName"
Write-Output "VPC:     $vpcId"

Write-Step "ECR repositories"
Ensure-EcrRepository "app-api"
Ensure-EcrRepository "app-web"

Write-Step "Security groups"
$ec2SgId = Ensure-SecurityGroup "app-ec2-sg" "OAuth OIDC demo EC2 web ingress" $vpcId
$rdsSgId = Ensure-SecurityGroup "app-rds-sg" "OAuth OIDC demo RDS ingress from EC2 only" $vpcId
Authorize-Ingress $ec2SgId "tcp" "80" "0.0.0.0/0" $null
Authorize-Ingress $ec2SgId "tcp" "443" "0.0.0.0/0" $null
Authorize-Ingress $rdsSgId "tcp" "3306" $null $ec2SgId
Write-Output "EC2 SG: $ec2SgId"
Write-Output "RDS SG: $rdsSgId"

Write-Step "IAM OIDC and roles"
$oidcArn = Ensure-OidcProvider $accountId
$deployTrust = @{
    Version = "2012-10-17"
    Statement = @(
        @{
            Effect = "Allow"
            Principal = @{ Federated = $oidcArn }
            Action = "sts:AssumeRoleWithWebIdentity"
            Condition = @{
                StringEquals = @{
                    "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
                    "token.actions.githubusercontent.com:sub" = "repo:${repoFullName}:ref:refs/heads/main"
                }
            }
        }
    )
} | ConvertTo-Json -Depth 10

Ensure-Role "app-github-deploy" $deployTrust
$deployPolicy = @{
    Version = "2012-10-17"
    Statement = @(
        @{ Sid = "EcrLogin"; Effect = "Allow"; Action = "ecr:GetAuthorizationToken"; Resource = "*" },
        @{
            Sid = "EcrPush"
            Effect = "Allow"
            Action = @("ecr:BatchCheckLayerAvailability", "ecr:GetDownloadUrlForLayer", "ecr:BatchGetImage", "ecr:PutImage", "ecr:InitiateLayerUpload", "ecr:UploadLayerPart", "ecr:CompleteLayerUpload")
            Resource = @("arn:aws:ecr:${region}:${accountId}:repository/app-api", "arn:aws:ecr:${region}:${accountId}:repository/app-web")
        },
        @{
            Sid = "TemporarySshWindow"
            Effect = "Allow"
            Action = @("ec2:AuthorizeSecurityGroupIngress", "ec2:RevokeSecurityGroupIngress")
            Resource = "arn:aws:ec2:${region}:${accountId}:security-group/${ec2SgId}"
        },
        @{ Sid = "DescribeSgs"; Effect = "Allow"; Action = "ec2:DescribeSecurityGroups"; Resource = "*" }
    )
} | ConvertTo-Json -Depth 10
Put-RolePolicy "app-github-deploy" "app-github-deploy-policy" $deployPolicy

$ec2Trust = @{
    Version = "2012-10-17"
    Statement = @(
        @{
            Effect = "Allow"
            Principal = @{ Service = "ec2.amazonaws.com" }
            Action = "sts:AssumeRole"
        }
    )
} | ConvertTo-Json -Depth 10
Ensure-Role "app-ec2-role" $ec2Trust
Invoke-Aws @("iam", "attach-role-policy", "--role-name", "app-ec2-role", "--policy-arn", "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore") -AllowFailure
Invoke-Aws @("iam", "attach-role-policy", "--role-name", "app-ec2-role", "--policy-arn", "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly") -AllowFailure
$ssmPolicy = @{
    Version = "2012-10-17"
    Statement = @(
        @{
            Sid = "ReadProdParameters"
            Effect = "Allow"
            Action = @("ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath")
            Resource = @("arn:aws:ssm:${region}:${accountId}:parameter/app/prod", "arn:aws:ssm:${region}:${accountId}:parameter/app/prod/*")
        }
    )
} | ConvertTo-Json -Depth 10
Put-RolePolicy "app-ec2-role" "app-ssm-params-read" $ssmPolicy
Ensure-InstanceProfile "app-ec2-role"

Write-Step "RDS parameter group"
$dbParamGroup = Ensure-RdsParameterGroup
Write-Output "DB parameter group: $dbParamGroup"

Write-Step "Runtime SSM parameters"
$bytes = [byte[]]::new(32)
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$rng.Dispose()
$sessionSecret = -join ($bytes | ForEach-Object { $_.ToString('x2') })
$appDbPassword = [Environment]::GetEnvironmentVariable("M7_APP_DB_PASSWORD")
if ($appDbPassword -and $config.domain -and $config.googleClientId) {
    $databaseUrl = "mysql+pymysql://appuser:${appDbPassword}@<RDS_ENDPOINT>:3306/appdb?charset=utf8mb4"
    Invoke-Aws @("ssm", "put-parameter", "--name", "/app/prod/DATABASE_URL", "--type", "SecureString", "--value", $databaseUrl, "--overwrite", "--region", $region)
    Invoke-Aws @("ssm", "put-parameter", "--name", "/app/prod/SESSION_JWT_SECRET", "--type", "SecureString", "--value", $sessionSecret, "--overwrite", "--region", $region)
    Invoke-Aws @("ssm", "put-parameter", "--name", "/app/prod/APP_ENV", "--type", "String", "--value", "production", "--overwrite", "--region", $region)
    Invoke-Aws @("ssm", "put-parameter", "--name", "/app/prod/DB_REQUIRE_TLS", "--type", "String", "--value", "true", "--overwrite", "--region", $region)
    Invoke-Aws @("ssm", "put-parameter", "--name", "/app/prod/COOKIE_SECURE", "--type", "String", "--value", "true", "--overwrite", "--region", $region)
    Invoke-Aws @("ssm", "put-parameter", "--name", "/app/prod/GOOGLE_CLIENT_ID", "--type", "String", "--value", $config.googleClientId, "--overwrite", "--region", $region)
    Invoke-Aws @("ssm", "put-parameter", "--name", "/app/prod/AZURE_CLIENT_ID", "--type", "String", "--value", $config.azureClientId, "--overwrite", "--region", $region)
    Invoke-Aws @("ssm", "put-parameter", "--name", "/app/prod/AZURE_ADMIN_TENANT_ID", "--type", "String", "--value", $config.azureAdminTenantId, "--overwrite", "--region", $region)
    Invoke-Aws @("ssm", "put-parameter", "--name", "/app/prod/ADMIN_EMAILS", "--type", "String", "--value", $config.adminEmails, "--overwrite", "--region", $region)
    Invoke-Aws @("ssm", "put-parameter", "--name", "/app/prod/TRUSTED_PROXY_CIDRS", "--type", "String", "--value", "172.16.0.0/12", "--overwrite", "--region", $region)
} else {
    Write-Output "Skipping SSM app parameters. Set M7_APP_DB_PASSWORD and fill domain/googleClientId before applying."
}

Write-Step "Manual outputs for GitHub"
Write-Output "AWS_ACCOUNT_ID=$accountId"
Write-Output "AWS_ROLE_ARN=arn:aws:iam::${accountId}:role/app-github-deploy"
Write-Output "EC2_SG_ID=$ec2SgId"
Write-Output "VITE_GOOGLE_CLIENT_ID=$($config.googleClientId)"
Write-Output "VITE_AZURE_CLIENT_ID=$($config.azureClientId)"
Write-Output ""
Write-Output "This script provisions the AWS foundation. EC2/RDS launch and Route 53 are intentionally left in the runbook until a real domain, subnet choice, and DB password are confirmed."
