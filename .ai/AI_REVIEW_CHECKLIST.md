# AI Review Checklist

## Purpose
This checklist ensures every change is reviewed for correctness, safety, maintainability, and governance compliance.

## Scope
Use this checklist for code reviews, design reviews, pull request reviews, and AI-generated change assessments.

## Principles
- Review the change as if it were released to production.
- Focus on correctness, risk, and maintainability.
- Verify that business and technical expectations are preserved.

## Standards
Every change must answer:
- What changed?
- Why was it changed?
- What is the risk?
- Which files were modified?
- What testing was performed?
- What is the rollback plan?

## Best Practices
- Review both functional and non-functional impact.
- Confirm compatibility with APIs, databases, and UI expectations.
- Check whether observability and security are preserved.
- Ensure docs and release notes are updated when necessary.

## Examples
- Appropriate review note: "This change updates the merchant comparison service to normalize product IDs and adds API tests."
- Inadequate review note: "Looks fine."

## Do
- Verify the change against the intended requirement.
- Check test coverage and validation evidence.
- Highlight any unresolved risk.

## Don't
- Approve changes without understanding their effect.
- Ignore missing tests or insufficient documentation.
- Approve breaking changes without mitigation.

## Review Checklist
- [ ] Requirements are clear and met.
- [ ] Architecture boundaries are preserved.
- [ ] Security concerns are addressed.
- [ ] Performance impact is acceptable.
- [ ] Tests are present and relevant.
- [ ] Rollback is feasible.

## References
- Pull request review guidance
- Software change management standards
