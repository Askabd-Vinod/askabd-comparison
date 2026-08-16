provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "askabd"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
