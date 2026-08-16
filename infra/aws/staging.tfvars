# AskABD Staging Environment
environment          = "staging"
aws_region           = "us-east-1"
vpc_cidr             = "10.0.0.0/16"
db_instance_class    = "db.t3.medium"
db_multi_az          = false
db_allocated_storage = 50
db_backup_retention  = 7
api_desired_count    = 2
web_desired_count    = 2
domain_name          = "askabd.com"
api_subdomain        = "api"
web_subdomain        = "app"
