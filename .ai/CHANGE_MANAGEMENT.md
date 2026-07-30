# Change Management

## Purpose
This document defines the expected process for planning, approving, implementing, and reviewing changes.

## Scope
Applies to code changes, configuration changes, infrastructure changes, and release-related changes.

## Principles
- Controlled change
- Traceability
- Risk awareness
- Safe rollout and rollback

## Standards
- Document the problem, solution, impact, and rollback plan before implementation.
- Assess risk for each change, especially for shared services or production systems.
- Use change review and approval for high-impact work.
- Keep changes small and targeted when feasible.

## Best Practices
- Link changes to requirements, tickets, or incident records.
- Communicate planned changes to affected stakeholders.
- Review downstream impact before rollout.

## Examples
- Good: A database migration is reviewed for compatibility, timing, and rollback.
- Poor: A production deployment occurs without a rollback procedure.

## Do
- Prepare for change with clear impact analysis.
- Maintain rollback readiness.

## Don't
- Make unmanaged or undocumented production changes.
- Merge large, vaguely described changes without review.

## Review Checklist
- [ ] Change intent and impact are documented.
- [ ] Risk and rollback are considered.
- [ ] Stakeholders are informed where needed.

## References
- Change management best practices
- IT service management guidance
