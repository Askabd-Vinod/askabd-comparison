# AI Engineering Guidelines

## Purpose
These guidelines define how AI assistants must work within the AskABD Comparison Platform repository. They exist to protect architecture integrity, delivery quality, and operational safety.

## Scope
Applies to all AI-assisted changes involving code, tests, configuration, infrastructure, documentation, and release activities.

## Principles
- Respect modular boundaries.
- Prefer small, explicit changes over large rewrites.
- Preserve existing contracts, interfaces, and behavior.
- Use security, performance, and observability as first-class concerns.
- Document intent where the code is not self-evident.

## Standards
- Before changes, explain the problem and affected scope.
- Identify root cause before proposing a fix.
- List impacted files and services.
- Explain risk and rollback impact.
- Avoid architecture changes without approval.
- Do not delete code without explanation.
- Do not introduce breaking changes.
- Do not rename files unnecessarily.
- Do not modify unrelated modules.

## Best Practices
- Investigate the current implementation before editing.
- Reuse existing services, abstractions, and patterns.
- Align changes with existing domain boundaries.
- Add or adjust tests when behavior changes.
- Keep commits atomic and purposeful.

## Examples
- Good: "The bug appears in the catalog comparison service; I will update the normalization step and add a regression test."
- Poor: "I changed several files and refactored the service without reviewing dependencies."

## Do
- State the issue clearly.
- Confirm the scope of impact.
- Propose a minimal change.
- Verify behavior with tests or validation commands.

## Don't
- Change architecture without approval.
- Make speculative rewrites.
- Break API contracts.
- Ignore failing tests.

## Review Checklist
- [ ] Problem and root cause are explained.
- [ ] Impacted files are identified.
- [ ] Risk and rollback plan are considered.
- [ ] Tests or validation were performed.
- [ ] Documentation updated where required.

## References
- Clean Architecture
- SOLID principles
- OWASP secure coding practices
