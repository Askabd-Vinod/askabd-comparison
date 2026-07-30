# Coding Standards

## Purpose
This document provides the coding conventions required for consistency, readability, and maintainability across the platform.

## Scope
Applies to TypeScript, Node.js, Next.js, and all supporting configuration and test files.

## Principles
- Clarity over cleverness.
- Consistency over personal preference.
- DRY and KISS where they improve maintainability.
- YAGNI for non-essential abstractions.

## Standards
### Folder Naming
- Use lowercase, hyphen-separated names for folders.
- Keep domain and feature boundaries visible.

### File Naming
- Use lowercase kebab-case for files.
- Use descriptive names that reflect purpose.

### Component Naming
- Use PascalCase for React components.
- Avoid generic names such as `Item` when a domain-specific name exists.

### Function Naming
- Use camelCase for functions and methods.
- Prefer verb-based names such as `calculateComparisonScore`.

### Variable Naming
- Use descriptive camelCase names.
- Avoid single-letter names except in trivial loops.

### Constants
- Use UPPER_SNAKE_CASE for constants.

### Enums
- Use PascalCase for enum names and UPPER_SNAKE_CASE for members.

### Interfaces and DTOs
- Use descriptive interfaces such as `MerchantComparisonRequest`.
- Keep DTOs narrow and explicit.

### Services
- Place orchestration logic in services.
- Keep services focused on one responsibility.

### Repositories
- Encapsulate persistence access behind repository abstractions.

### Controllers and Routes
- Keep routing thin; move business behavior to services.

### Hooks
- Use hooks for reusable stateful UI logic only.

### Utilities
- Place cross-cutting helpers in utilities with narrow, well-named responsibilities.

## Best Practices
- Keep functions small and testable.
- Prefer early return patterns for clarity.
- Use type annotations consistently.
- Avoid unused variables and dead code.

## Examples
- Good: `const merchantComparisonLimit = 100;`
- Poor: `const x = 100;`

## Do
- Write readable and explicit code.
- Keep naming consistent with domain language.

## Don't
- Use ambiguous names.
- Over-abstract code before it is needed.

## Review Checklist
- [ ] Names are clear and consistent.
- [ ] Code follows project naming conventions.
- [ ] Functions and modules remain focused and cohesive.

## References
- TypeScript style guidance
- JavaScript/TypeScript naming conventions
