# AskABD — AWS Infrastructure (Staging/Production)
# Orchestrates all modules in correct dependency order.

locals {
  name_prefix = "${var.project_name}-${var.environment}"
  api_port    = 4200
  web_port    = 3001
}

# ─── Networking ─────────────────────────────────────────────────────────────

module "networking" {
  source = "./modules/networking"

  name_prefix = local.name_prefix
  vpc_cidr    = var.vpc_cidr
  aws_region  = var.aws_region
}

# ─── ECR ────────────────────────────────────────────────────────────────────

module "ecr" {
  source = "./modules/ecr"

  name_prefix = local.name_prefix
}

# ─── IAM ────────────────────────────────────────────────────────────────────

module "iam" {
  source = "./modules/iam"

  name_prefix    = local.name_prefix
  aws_region     = var.aws_region
  s3_bucket_arn  = module.s3.documents_bucket_arn
  secrets_prefix = "askabd/${var.environment}"
  ecr_api_arn    = module.ecr.api_repository_arn
  ecr_web_arn    = module.ecr.web_repository_arn
}

# ─── RDS ────────────────────────────────────────────────────────────────────

module "rds" {
  source = "./modules/rds"

  name_prefix       = local.name_prefix
  vpc_id            = module.networking.vpc_id
  subnet_ids        = module.networking.private_data_subnet_ids
  app_sg_id         = module.networking.app_sg_id
  instance_class    = var.db_instance_class
  multi_az          = var.db_multi_az
  allocated_storage = var.db_allocated_storage
  backup_retention  = var.db_backup_retention
  environment       = var.environment
}

# ─── S3 ─────────────────────────────────────────────────────────────────────

module "s3" {
  source = "./modules/s3"

  name_prefix = local.name_prefix
  environment = var.environment
}

# ─── Secrets Manager ────────────────────────────────────────────────────────

module "secrets" {
  source = "./modules/secrets"

  name_prefix  = local.name_prefix
  environment  = var.environment
  database_url = module.rds.connection_url
}

# ─── ALB ────────────────────────────────────────────────────────────────────

module "alb" {
  source = "./modules/alb"

  name_prefix = local.name_prefix
  vpc_id      = module.networking.vpc_id
  subnet_ids  = module.networking.public_subnet_ids
  alb_sg_id   = module.networking.alb_sg_id
  api_port    = local.api_port
  web_port    = local.web_port
}

# ─── ECS ────────────────────────────────────────────────────────────────────

module "ecs" {
  source = "./modules/ecs"

  name_prefix          = local.name_prefix
  aws_region           = var.aws_region
  vpc_id               = module.networking.vpc_id
  private_subnet_ids   = module.networking.private_app_subnet_ids
  api_sg_id            = module.networking.api_sg_id
  web_sg_id            = module.networking.web_sg_id
  execution_role_arn   = module.iam.ecs_execution_role_arn
  api_task_role_arn    = module.iam.api_task_role_arn
  web_task_role_arn    = module.iam.web_task_role_arn
  api_target_group_arn = module.alb.api_target_group_arn
  web_target_group_arn = module.alb.web_target_group_arn
  api_image            = "${module.ecr.api_repository_url}:latest"
  web_image            = "${module.ecr.web_repository_url}:latest"
  api_port             = local.api_port
  web_port             = local.web_port
  api_desired_count    = var.api_desired_count
  web_desired_count    = var.web_desired_count
  environment          = var.environment
  secrets_arn_prefix   = module.secrets.secrets_arn_prefix
  s3_bucket            = module.s3.documents_bucket_name
  domain_name          = var.domain_name
  api_subdomain        = var.api_subdomain
}

# ─── Monitoring ─────────────────────────────────────────────────────────────

module "monitoring" {
  source = "./modules/monitoring"

  name_prefix       = local.name_prefix
  api_service_name  = module.ecs.api_service_name
  web_service_name  = module.ecs.web_service_name
  cluster_name      = module.ecs.cluster_name
  alb_arn_suffix    = module.alb.alb_arn_suffix
  api_tg_arn_suffix = module.alb.api_tg_arn_suffix
  rds_identifier    = module.rds.db_identifier
}
