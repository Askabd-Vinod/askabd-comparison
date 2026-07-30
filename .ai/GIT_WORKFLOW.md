# Git Workflow

## Purpose
This document defines the expected Git workflow for the AskABD platform so that changes remain traceable, reviewable, and safe.

## Scope
Applies to all repository changes, branching, commits, tags, releases, hotfixes, and rollbacks.

## Principles
- Small, reviewable changes
- Clear history
- Safe release practices
- Traceability

## Standards
### Branch Strategy
- Use short-lived feature branches.
- Name branches clearly and consistently.
- Prefer branch names such as `feature/merchant-comparison`, `fix/catalog-normalization`, or `hotfix/auth-token-refresh`.

### Commit Standards
- Write clear commit messages.
- Keep commits focused and atomic.
- Prefer conventional-style messages such as `feat:`, `fix:`, `docs:`, `refactor:`, and `chore:`.

### Release Strategy
- Prepare releases from stable branches.
- Validate changes before merging to release branches.

### Tagging
- Use semantic version tags for releases where appropriate.

### Hotfix
- Apply urgent fixes through a dedicated hotfix branch and review them quickly.

### Rollback
- Preserve a known-good deployment or release point for rollback.
- Document rollback steps before production release.

## Best Practices
- Rebase or merge carefully to avoid messy histories.
- Keep branches up to date before opening a pull request.
- Review changes before merge.

## Examples
- Good: `fix: normalize merchant identifiers before comparison`
- Poor: `updates`

## Do
- Keep history useful and explicit.
- Link work to issues or tickets when possible.

## Don't
- Merge unreviewed or poorly understood changes.
- Commit unrelated files together.

## Review Checklist
- [ ] Branch naming is clear.
- [ ] Commits are focused and meaningful.
- [ ] Release and rollback paths are understood.

## References
- Git flow and branch management guidance
- Conventional commits guidance
