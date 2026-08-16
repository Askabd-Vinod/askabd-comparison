output "vpc_id" {
  description = "VPC ID"
  value       = module.networking.vpc_id
}

output "alb_dns_name" {
  description = "ALB DNS name"
  value       = module.alb.alb_dns_name
}

output "ecr_api_url" {
  description = "ECR API repository URL"
  value       = module.ecr.api_repository_url
}

output "ecr_web_url" {
  description = "ECR Web repository URL"
  value       = module.ecr.web_repository_url
}

output "rds_endpoint" {
  description = "RDS endpoint"
  value       = module.rds.endpoint
  sensitive   = true
}

output "s3_bucket" {
  description = "S3 documents bucket name"
  value       = module.s3.documents_bucket_name
}

output "ecs_cluster" {
  description = "ECS cluster name"
  value       = module.ecs.cluster_name
}
