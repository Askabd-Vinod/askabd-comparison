terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Remote state — uncomment after S3 state bucket is created
  # backend "s3" {
  #   bucket         = "askabd-terraform-state"
  #   key            = "staging/terraform.tfstate"
  #   region         = "us-east-1"
  #   dynamodb_table = "askabd-terraform-locks"
  #   encrypt        = true
  # }
}
