variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name (staging or production)"
  type        = string
  default     = "staging"

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "Environment must be 'staging' or 'production'."
  }
}

variable "project_name" {
  description = "Project name used in resource naming"
  type        = string
  default     = "askabd"
}

variable "vpc_cidr" {
  description = "VPC CIDR block"
  type        = string
  default     = "10.0.0.0/16"
}

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.medium"
}

variable "db_multi_az" {
  description = "Enable Multi-AZ for RDS"
  type        = bool
  default     = false
}

variable "db_allocated_storage" {
  description = "RDS allocated storage in GB"
  type        = number
  default     = 50
}

variable "db_backup_retention" {
  description = "RDS backup retention in days"
  type        = number
  default     = 7
}

variable "api_desired_count" {
  description = "Desired count for API ECS tasks"
  type        = number
  default     = 2
}

variable "web_desired_count" {
  description = "Desired count for Web ECS tasks"
  type        = number
  default     = 2
}

variable "domain_name" {
  description = "Primary domain name"
  type        = string
  default     = "askabd.com"
}

variable "api_subdomain" {
  description = "API subdomain"
  type        = string
  default     = "api"
}

variable "web_subdomain" {
  description = "Web app subdomain"
  type        = string
  default     = "app"
}
