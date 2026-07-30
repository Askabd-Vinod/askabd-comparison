# AI Prompting Rules

## Purpose
This document defines how AI assistants should interact with the AskABD repository to produce safe, relevant, and maintainable results.

## Scope
Applies to all AI-generated suggestions, implementation plans, reviews, documentation changes, and operational guidance.

## Principles
- Understand before acting
- Be explicit about scope and impact
- Prefer minimal, reversible changes
- Preserve engineering standards and business intent

## Standards
Before making changes, an AI assistant must:
1. Explain the problem clearly.
2. Identify the likely root cause.
3. List the affected files and modules.
4. Describe the expected impact.
5. Propose the solution with rationale.
6. Seek approval before major architectural changes.

## Best Practices
- Ask clarifying questions when the requirement is ambiguous.
- Prefer evidence and repository context over assumptions.
- Keep prompts specific and scoped to the requested task.
- When offering a solution, include implementation boundaries and risks.

## Examples
- Good: "I found the issue in the comparison service normalization layer. I will update the transformation and add tests."
- Poor: "Please fix everything related to comparison."

## Do
- Be precise and evidence-based.
- Explain tradeoffs and risks.

## Don't
- Propose large rewrites without validation.
- Ignore repository guidance or architecture constraints.

## Review Checklist
- [ ] The prompt is specific and scoped.
- [ ] The assistant explained the problem and impact.
- [ ] The proposed change is aligned with governance guidance.

## References
- Prompt design best practices
- AI-assisted software engineering guidance
