# AskABD ECS Module — Fargate Cluster + Services

variable "name_prefix" { type = string }
variable "aws_region" { type = string }
variable "vpc_id" { type = string }
variable "private_subnet_ids" { type = list(string) }
variable "api_sg_id" { type = string }
variable "web_sg_id" { type = string }
variable "execution_role_arn" { type = string }
variable "api_task_role_arn" { type = string }
variable "web_task_role_arn" { type = string }
variable "api_target_group_arn" { type = string }
variable "web_target_group_arn" { type = string }
variable "api_image" { type = string }
variable "web_image" { type = string }
variable "api_port" { type = number }
variable "web_port" { type = number }
variable "api_desired_count" { type = number }
variable "web_desired_count" { type = number }
variable "environment" { type = string }
variable "secrets_arn_prefix" { type = string }
variable "s3_bucket" { type = string }
variable "domain_name" { type = string }
variable "api_subdomain" { type = string }

resource "aws_ecs_cluster" "main" {
  name = "${var.name_prefix}-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = { Name = "${var.name_prefix}-cluster" }
}

# ─── CloudWatch Log Groups ────────────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/${var.name_prefix}-api"
  retention_in_days = 30
}

resource "aws_cloudwatch_log_group" "web" {
  name              = "/ecs/${var.name_prefix}-web"
  retention_in_days = 30
}

# ─── API Task Definition ──────────────────────────────────────────────────────

resource "aws_ecs_task_definition" "api" {
  family                   = "${var.name_prefix}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = var.execution_role_arn
  task_role_arn            = var.api_task_role_arn

  container_definitions = jsonencode([{
    name         = "api"
    image        = var.api_image
    portMappings = [{ containerPort = var.api_port, protocol = "tcp" }]
    environment = [
      { name = "NODE_ENV", value = "production" },
      { name = "PORT", value = tostring(var.api_port) },
      { name = "HOST", value = "0.0.0.0" },
      { name = "LOG_LEVEL", value = var.environment == "production" ? "info" : "debug" },
      { name = "EMAIL_PROVIDER", value = "ses" },
      { name = "STORAGE_PROVIDER", value = "s3" },
      { name = "S3_BUCKET", value = var.s3_bucket },
      { name = "S3_REGION", value = var.aws_region },
      { name = "SES_REGION", value = var.aws_region },
      { name = "SES_DOMAIN", value = var.domain_name },
    ]
    secrets = [
      { name = "DATABASE_URL", valueFrom = "${var.secrets_arn_prefix}/database-url" },
      { name = "JWT_SECRET", valueFrom = "${var.secrets_arn_prefix}/jwt-secret" },
      { name = "CORS_ORIGIN", valueFrom = "${var.secrets_arn_prefix}/cors-origin" },
      { name = "SCHEDULER_AUTH_TOKEN", valueFrom = "${var.secrets_arn_prefix}/scheduler-auth-token" },
    ]
    healthCheck = {
      command     = ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:${var.api_port}/health || exit 1"]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 15
    }
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.api.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "api"
      }
    }
  }])

  tags = { Name = "${var.name_prefix}-api" }
}

# ─── Web Task Definition ──────────────────────────────────────────────────────

resource "aws_ecs_task_definition" "web" {
  family                   = "${var.name_prefix}-web"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = var.execution_role_arn
  task_role_arn            = var.web_task_role_arn

  container_definitions = jsonencode([{
    name         = "web"
    image        = var.web_image
    portMappings = [{ containerPort = var.web_port, protocol = "tcp" }]
    environment = [
      { name = "NODE_ENV", value = "production" },
      { name = "PORT", value = tostring(var.web_port) },
      { name = "HOSTNAME", value = "0.0.0.0" },
      { name = "NEXT_PUBLIC_API_URL", value = "https://${var.api_subdomain}.${var.domain_name}" },
    ]
    healthCheck = {
      command     = ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:${var.web_port}/ || exit 1"]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 20
    }
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.web.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "web"
      }
    }
  }])

  tags = { Name = "${var.name_prefix}-web" }
}

# ─── ECS Services ─────────────────────────────────────────────────────────────

resource "aws_ecs_service" "api" {
  name            = "${var.name_prefix}-api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = var.api_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [var.api_sg_id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = var.api_target_group_arn
    container_name   = "api"
    container_port   = var.api_port
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  tags = { Name = "${var.name_prefix}-api" }

  lifecycle { ignore_changes = [task_definition] }
}

resource "aws_ecs_service" "web" {
  name            = "${var.name_prefix}-web"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.web.arn
  desired_count   = var.web_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [var.web_sg_id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = var.web_target_group_arn
    container_name   = "web"
    container_port   = var.web_port
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  tags = { Name = "${var.name_prefix}-web" }

  lifecycle { ignore_changes = [task_definition] }
}

output "cluster_name" { value = aws_ecs_cluster.main.name }
output "api_service_name" { value = aws_ecs_service.api.name }
output "web_service_name" { value = aws_ecs_service.web.name }
