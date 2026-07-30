# AskABD AI Governance Framework

## Purpose
This directory defines the mandatory engineering governance framework for the AskABD Comparison Platform. It is intended for every AI coding assistant and human engineer before making changes to code, documentation, infrastructure, or configuration.

## Scope
This framework applies to all work in the repository, including application code, APIs, databases, tests, deployment assets, and release operations.

## Core Principles
- Modular Architecture
- Clean Architecture
- SOLID Principles
- DRY, KISS, YAGNI
- Separation of Concerns
- Reusable Components
- Domain-Driven Design
- Security First
- Performance First
- Documentation First
- Testing First

## Document Index
- [AI_ENGINEERING_GUIDELINES.md](AI_ENGINEERING_GUIDELINES.md)
- [AI_REVIEW_CHECKLIST.md](AI_REVIEW_CHECKLIST.md)
- [ARCHITECTURE_RULES.md](ARCHITECTURE_RULES.md)
- [CODING_STANDARDS.md](CODING_STANDARDS.md)
- [API_DESIGN_STANDARDS.md](API_DESIGN_STANDARDS.md)
- [DATABASE_STANDARDS.md](DATABASE_STANDARDS.md)
- [SECURITY_GUIDELINES.md](SECURITY_GUIDELINES.md)
- [PERFORMANCE_GUIDELINES.md](PERFORMANCE_GUIDELINES.md)
- [UI_UX_GUIDELINES.md](UI_UX_GUIDELINES.md)
- [TESTING_GUIDELINES.md](TESTING_GUIDELINES.md)
- [ERROR_HANDLING.md](ERROR_HANDLING.md)
- [LOGGING_GUIDELINES.md](LOGGING_GUIDELINES.md)
- [GIT_WORKFLOW.md](GIT_WORKFLOW.md)
- [PULL_REQUEST_TEMPLATE.md](PULL_REQUEST_TEMPLATE.md)
- [DOCUMENTATION_STANDARD.md](DOCUMENTATION_STANDARD.md)
- [CHANGE_MANAGEMENT.md](CHANGE_MANAGEMENT.md)
- [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md)
- [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md)
- [AI_PROMPTING_RULES.md](AI_PROMPTING_RULES.md)

## Mandatory AI Rules
Before modifying code, an AI assistant must:
1. Explain the problem.
2. Identify the root cause.
3. List affected files.
4. Explain the impact.
5. Propose a solution.
6. Wait for approval for major architectural changes.

## Review Checklist
- Does the change preserve modular boundaries?
- Does it avoid breaking APIs or data contracts?
- Are tests updated and passing?
- Is security and performance addressed?
- Is rollback feasible?

## References
- Enterprise software engineering best practices
- OWASP secure coding guidance
- Next.js, Fastify, PostgreSQL, and Docker engineering standards
