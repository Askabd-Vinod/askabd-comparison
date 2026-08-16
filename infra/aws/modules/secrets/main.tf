# AskABD Secrets Module — AWS Secrets Manager

variable "name_prefix" {
  type = string
}

variable "environment" {
  type = string
}

variable "database_url" {
  type      = string
  sensitive = true
}

resource "aws_secretsmanager_secret" "database_url" {
  name = "askabd/${var.environment}/database-url"
  tags = { Name = "${var.name_prefix}-db-url" }
}

resource "aws_secretsmanager_secret_version" "database_url" {
  secret_id     = aws_secretsmanager_secret.database_url.id
  secret_string = var.database_url
}

resource "aws_secretsmanager_secret" "jwt_secret" {
  name = "askabd/${var.environment}/jwt-secret"
  tags = { Name = "${var.name_prefix}-jwt" }
}

resource "aws_secretsmanager_secret_version" "jwt_secret" {
  secret_id     = aws_secretsmanager_secret.jwt_secret.id
  secret_string = "PLACEHOLDER_CHANGE_BEFORE_PRODUCTION"

  lifecycle { ignore_changes = [secret_string] }
}

resource "aws_secretsmanager_secret" "cors_origin" {
  name = "askabd/${var.environment}/cors-origin"
  tags = { Name = "${var.name_prefix}-cors" }
}

resource "aws_secretsmanager_secret_version" "cors_origin" {
  secret_id     = aws_secretsmanager_secret.cors_origin.id
  secret_string = "https://app.askabd.com"

  lifecycle { ignore_changes = [secret_string] }
}

resource "aws_secretsmanager_secret" "scheduler_token" {
  name = "askabd/${var.environment}/scheduler-auth-token"
  tags = { Name = "${var.name_prefix}-scheduler-token" }
}

resource "aws_secretsmanager_secret_version" "scheduler_token" {
  secret_id     = aws_secretsmanager_secret.scheduler_token.id
  secret_string = "PLACEHOLDER_CHANGE_BEFORE_PRODUCTION"

  lifecycle { ignore_changes = [secret_string] }
}

output "secrets_arn_prefix" {
  value = "arn:aws:secretsmanager:*:*:secret:askabd/${var.environment}"
}

output "database_url_secret_arn" {
  value = aws_secretsmanager_secret.database_url.arn
}
