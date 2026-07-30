# Deployment Checklist

## Purpose
This checklist ensures deployments are controlled, verified, and safe.

## Scope
Applies to application deployments, infrastructure changes, and environment promotions.

## Principles
- Reliability
- Observability
- Reversibility
- Consistency

## Standards
- Validate configuration and environment variables before deployment.
- Confirm migrations, health checks, and rollback steps.
- Verify dependencies and secrets are available.
- Perform smoke tests after release.

## Best Practices
- Use staging validation before production.
- Monitor key metrics during rollout.
- Keep deployment steps explicit and repeatable.

## Examples
- Good: Confirm that database migrations complete successfully before application rollout.
- Poor: Deploy without verifying healthy services and logs.

## Do
- Verify the deployment target and version.
- Monitor the rollout for regressions.

## Don't
- Deploy without a rollback plan.
- Release changes with unresolved critical issues.

## Review Checklist
- [ ] Environment configuration is validated.
- [ ] Health checks and rollback paths are prepared.
- [ ] Post-deployment verification is planned.

## References
- Deployment operations guidance
- CI/CD and release engineering standards
