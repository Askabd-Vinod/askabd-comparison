# AskABD IAM Module — Least-Privilege Roles

variable "name_prefix" { type = string }
variable "aws_region" { type = string }
variable "s3_bucket_arn" { type = string }
variable "secrets_prefix" { type = string }
variable "ecr_api_arn" { type = string }
variable "ecr_web_arn" { type = string }

data "aws_caller_identity" "current" {}

# ─── ECS Execution Role ──────────────────────────────────────────────────────

resource "aws_iam_role" "ecs_execution" {
  name = "${var.name_prefix}-ecs-execution"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "ecs_execution" {
  name = "${var.name_prefix}-ecs-execution-policy"
  role = aws_iam_role.ecs_execution.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ecr:GetAuthorizationToken",
          "ecr:BatchGetImage",
          "ecr:GetDownloadUrlForLayer"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/ecs/${var.name_prefix}-*:*"
      },
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = "arn:aws:secretsmanager:${var.aws_region}:${data.aws_caller_identity.current.account_id}:secret:${var.secrets_prefix}/*"
      }
    ]
  })
}

# ─── API Task Role ────────────────────────────────────────────────────────────

resource "aws_iam_role" "api_task" {
  name = "${var.name_prefix}-api-task"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "api_task" {
  name = "${var.name_prefix}-api-task-policy"
  role = aws_iam_role.api_task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"]
        Resource = [var.s3_bucket_arn, "${var.s3_bucket_arn}/*"]
      },
      {
        Effect   = "Allow"
        Action   = ["ses:SendEmail", "ses:SendRawEmail"]
        Resource = "*"
        Condition = {
          StringEquals = { "ses:FromAddress" = "noreply@askabd.com" }
        }
      }
    ]
  })
}

# ─── Web Task Role (minimal) ─────────────────────────────────────────────────

resource "aws_iam_role" "web_task" {
  name = "${var.name_prefix}-web-task"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

output "ecs_execution_role_arn" { value = aws_iam_role.ecs_execution.arn }
output "api_task_role_arn" { value = aws_iam_role.api_task.arn }
output "web_task_role_arn" { value = aws_iam_role.web_task.arn }
