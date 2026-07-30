# Architecture Rules

## Purpose
This document defines the structural expectations for the AskABD platform so that the system remains modular, maintainable, and evolvable.

## Scope
Applies to all application services, routes, domain logic, shared libraries, UI components, data access layers, and integrations.

## Principles
- Modular Architecture
- Clean Architecture
- SOLID Principles
- Separation of Concerns
- Domain-Driven Design
- Reusable Components
- Make dependencies explicit and directionally correct

## Standards
- Keep domain logic independent from transport and framework concerns.
- Use layers such as presentation, application, domain, and infrastructure.
- Prefer interfaces and abstractions over hard-coded implementations.
- Keep feature modules self-contained where possible.
- Use shared utilities only for truly cross-cutting concerns.
- Avoid circular dependencies.

## Best Practices
- Split large features into smaller modules with clear responsibilities.
- Use services for orchestration and repositories for data access.
- Keep UI components focused on rendering and interaction.
- Keep business rules in domain services rather than route handlers.

## Examples
- Good: A comparison engine service receives normalized input and returns a domain-specific result.
- Poor: Route handlers contain database queries, business rules, and formatting logic in one place.

## Do
- Preserve existing module boundaries.
- Favor composition over inheritance.
- Keep dependencies pointing inward toward the domain.

## Don't
- Create monolithic files for unrelated concerns.
- Mix persistence logic with UI logic.
- Introduce architectural shortcuts that increase long-term debt.

## Review Checklist
- [ ] Responsibilities are clearly separated.
- [ ] Key abstractions are reusable and explicit.
- [ ] Domain rules are not coupled to transport concerns.
- [ ] Module boundaries are understandable.

## References
- Clean Architecture
- Domain-Driven Design
- Modular monolith and service-oriented design guidance
