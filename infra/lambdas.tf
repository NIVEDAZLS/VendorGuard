# ─────────────────────────────────────────────────────────────────────────────
# VendorGuard Scheduled Lambdas
#
# Three functions triggered by EventBridge Scheduler:
#   vg-seed-logs        — every 20 min  → inserts ~10 in-progress logs/vendor
#   vg-pre-breach       — every 25 min  → sends warning emails for ≥80% elapsed logs
#   vg-breach-detection — daily 01:00 UTC (06:30 IST) → breach detection + Agent 2
#
# Cost: $0 (all within AWS Free Tier — uses SSM Parameter Store, not Secrets Manager)
#
# Deploy steps:
#   1. bash infra/build_lambda.sh          # creates infra/lambda_package.zip
#   2. cd infra && terraform init
#   3. terraform apply                     # follow prompts for sensitive vars
# ─────────────────────────────────────────────────────────────────────────────

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
    local = {
      source  = "hashicorp/local"
      version = "~> 2.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# ── Variables ─────────────────────────────────────────────────────────────────

variable "aws_region" {
  description = "AWS region (ap-south-1 = Mumbai)"
  default     = "ap-south-1"
}

variable "ssm_prefix" {
  description = "SSM Parameter Store path prefix"
  default     = "/vendorguard"
}

variable "app_base_url" {
  description = "Public URL of VendorGuard frontend (used in magic links)"
  default     = "http://localhost:3000"
}

variable "jwt_secret" {
  description = "JWT signing secret — same value as JWT_SECRET in your .env.local"
  sensitive   = true
}

variable "smtp_host" { default = "smtp.gmail.com" }
variable "smtp_port" { default = "587" }
variable "smtp_user" { description = "Gmail/SMTP address" }
variable "smtp_from" { default = "noreply@vendorguard.io" }

variable "smtp_password" {
  description = "Gmail App Password"
  sensitive   = true
}

variable "db_host" { description = "RDS endpoint (DB_HOST from .env.local)" }
variable "db_port" { default = "5432" }
variable "db_name" { default = "vendorguard" }
variable "db_user" { description = "DB username" }

variable "db_password" {
  description = "DB password"
  sensitive   = true
}

variable "lambda_zip_path" {
  default = "lambda_package.zip"
}

variable "logs_per_rule" {
  description = "In-progress logs per SLA rule per seed run (~3 × rules = ~15 per vendor)"
  default     = "5"
}

# ── SSM Parameters (free) ─────────────────────────────────────────────────────

resource "aws_ssm_parameter" "db_host" {
  name  = "${var.ssm_prefix}/db_host"
  type  = "String"
  value = var.db_host
}

resource "aws_ssm_parameter" "db_port" {
  name  = "${var.ssm_prefix}/db_port"
  type  = "String"
  value = var.db_port
}

resource "aws_ssm_parameter" "db_name" {
  name  = "${var.ssm_prefix}/db_name"
  type  = "String"
  value = var.db_name
}

resource "aws_ssm_parameter" "db_user" {
  name  = "${var.ssm_prefix}/db_user"
  type  = "String"
  value = var.db_user
}

resource "aws_ssm_parameter" "db_password" {
  name  = "${var.ssm_prefix}/db_password"
  type  = "SecureString"   # encrypted at rest, still free
  value = var.db_password
}

# ── IAM role shared by all three Lambdas ──────────────────────────────────────

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "vg_lambda" {
  name               = "vg-lambda-execution-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy_attachment" "basic_exec" {
  role       = aws_iam_role.vg_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# SSM read permission
data "aws_iam_policy_document" "ssm_read" {
  statement {
    effect  = "Allow"
    actions = ["ssm:GetParameters", "ssm:GetParameter"]
    resources = [
      "arn:aws:ssm:${var.aws_region}:*:parameter${var.ssm_prefix}/*"
    ]
  }
  # needed to decrypt SecureString parameters
  statement {
    effect    = "Allow"
    actions   = ["kms:Decrypt"]
    resources = ["*"]
  }
}

resource "aws_iam_policy" "ssm_read" {
  name   = "vg-lambda-ssm-read"
  policy = data.aws_iam_policy_document.ssm_read.json
}

resource "aws_iam_role_policy_attachment" "ssm_read" {
  role       = aws_iam_role.vg_lambda.name
  policy_arn = aws_iam_policy.ssm_read.arn
}

# Bedrock — needed by vg-breach-detection for Agent 2
data "aws_iam_policy_document" "bedrock" {
  statement {
    effect    = "Allow"
    actions   = ["bedrock:InvokeModel"]
    resources = ["*"]
  }
}

resource "aws_iam_policy" "bedrock" {
  name   = "vg-lambda-bedrock"
  policy = data.aws_iam_policy_document.bedrock.json
}

resource "aws_iam_role_policy_attachment" "bedrock" {
  role       = aws_iam_role.vg_lambda.name
  policy_arn = aws_iam_policy.bedrock.arn
}

# ── Common environment variables passed to all Lambdas ───────────────────────

locals {
  common_env = {
    SSM_PREFIX    = var.ssm_prefix
    VG_AWS_REGION = var.aws_region
    JWT_SECRET    = var.jwt_secret
    APP_BASE_URL  = var.app_base_url
    SMTP_HOST     = var.smtp_host
    SMTP_PORT     = var.smtp_port
    SMTP_USER     = var.smtp_user
    SMTP_PASSWORD = var.smtp_password
    SMTP_FROM     = var.smtp_from
    DRY_RUN_EMAIL = "false"
    GMAIL_SENDER      = var.smtp_user
    GMAIL_APP_PASSWORD = var.smtp_password
  }
}

# ── Lambda 1 — vg-seed-logs (every 20 minutes) ───────────────────────────────

resource "aws_lambda_function" "seed_logs" {
  function_name    = "vg-seed-logs"
  role             = aws_iam_role.vg_lambda.arn
  handler          = "backend.lambda.handler_seed_logs.handler"
  runtime          = "python3.12"
  filename         = var.lambda_zip_path
  source_code_hash = filebase64sha256(var.lambda_zip_path)
  timeout          = 60
  memory_size      = 256

  environment {
    variables = merge(local.common_env, {
      LOGS_PER_RULE = var.logs_per_rule
    })
  }
}

resource "aws_cloudwatch_log_group" "seed_logs" {
  name              = "/aws/lambda/vg-seed-logs"
  retention_in_days = 7
}

resource "aws_scheduler_schedule" "seed_logs" {
  name       = "vg-seed-logs-every-20min"
  group_name = "default"

  flexible_time_window { mode = "OFF" }
  schedule_expression = "rate(20 minutes)"

  target {
    arn      = aws_lambda_function.seed_logs.arn
    role_arn = aws_iam_role.scheduler.arn
  }
}

# ── Lambda 2 — vg-pre-breach (every 15 minutes) ──────────────────────────────

resource "aws_lambda_function" "pre_breach" {
  function_name    = "vg-pre-breach"
  role             = aws_iam_role.vg_lambda.arn
  handler          = "backend.lambda.handler_pre_breach.handler"
  runtime          = "python3.12"
  filename         = var.lambda_zip_path
  source_code_hash = filebase64sha256(var.lambda_zip_path)
  timeout          = 120
  memory_size      = 256

  environment {
    variables = local.common_env
  }
}

resource "aws_cloudwatch_log_group" "pre_breach" {
  name              = "/aws/lambda/vg-pre-breach"
  retention_in_days = 7
}

resource "aws_scheduler_schedule" "pre_breach" {
  name       = "vg-pre-breach-every-25min"
  group_name = "default"

  # Set to ENABLED when ready to re-enable pre-breach emails
  state = "DISABLED"

  flexible_time_window { mode = "OFF" }
  schedule_expression = "rate(25 minutes)"

  target {
    arn      = aws_lambda_function.pre_breach.arn
    role_arn = aws_iam_role.scheduler.arn
  }
}

# ── Lambda 3 — vg-breach-detection (daily 01:00 UTC = 06:30 IST) ─────────────

resource "aws_lambda_function" "breach_detection" {
  function_name    = "vg-breach-detection"
  role             = aws_iam_role.vg_lambda.arn
  handler          = "backend.lambda.handler_breach_detection.handler"
  runtime          = "python3.12"
  filename         = var.lambda_zip_path
  source_code_hash = filebase64sha256(var.lambda_zip_path)
  timeout          = 900
  memory_size      = 512

  environment {
    variables = merge(local.common_env, {
      LOOKBACK_HOURS = "25"
      LOG_LIMIT      = "5000"
    })
  }
}

resource "aws_cloudwatch_log_group" "breach_detection" {
  name              = "/aws/lambda/vg-breach-detection"
  retention_in_days = 14
}

resource "aws_scheduler_schedule" "breach_detection" {
  name       = "vg-breach-detection-daily"
  group_name = "default"

  flexible_time_window { mode = "OFF" }
  schedule_expression          = "cron(0 1 * * ? *)"
  schedule_expression_timezone = "UTC"

  target {
    arn      = aws_lambda_function.breach_detection.arn
    role_arn = aws_iam_role.scheduler.arn
  }
}

# ── IAM role for EventBridge Scheduler ───────────────────────────────────────

data "aws_iam_policy_document" "scheduler_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["scheduler.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "scheduler" {
  name               = "vg-eventbridge-scheduler-role"
  assume_role_policy = data.aws_iam_policy_document.scheduler_assume.json
}

data "aws_iam_policy_document" "scheduler_invoke" {
  statement {
    effect  = "Allow"
    actions = ["lambda:InvokeFunction"]
    resources = [
      aws_lambda_function.seed_logs.arn,
      aws_lambda_function.pre_breach.arn,
      aws_lambda_function.breach_detection.arn,
    ]
  }
}

resource "aws_iam_role_policy" "scheduler_invoke" {
  role   = aws_iam_role.scheduler.name
  policy = data.aws_iam_policy_document.scheduler_invoke.json
}

# ── Outputs ───────────────────────────────────────────────────────────────────

output "seed_logs_arn"        { value = aws_lambda_function.seed_logs.arn }
output "pre_breach_arn"       { value = aws_lambda_function.pre_breach.arn }
output "breach_detection_arn" { value = aws_lambda_function.breach_detection.arn }
