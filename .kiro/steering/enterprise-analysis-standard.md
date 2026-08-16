# Enterprise Analysis, Evidence & Reporting Standard

Every analysis output in the AskABD Enterprise Intelligence Platform must conform to this standard.

## Core Principles

- Never present unsupported conclusions
- Every analysis must be explainable
- Every recommendation must be traceable
- Every output must be backed by evidence
- Clearly separate: Evidence, Analysis, Assumptions, Missing Information, Recommendations, Limitations, Confidence

## Standard Output Sections

1. **Executive Summary** — Business summary, Technical summary, Current health, Status, Risk, Priority, Impact
2. **Evidence** — Collected information, data sources, quality, completeness, date, owner
3. **Current State Assessment** — Business, Technical, Operational, Security, Compliance, Architecture, Cloud, Infrastructure, Application, Support, Documentation
4. **Gap Analysis** — Missing information with business impact, technical impact, priority, risk
5. **What We Can Conclude** — Only conclusions supported by evidence
6. **What We Cannot Conclude** — Information unavailable, evidence unavailable, blocked assessments
7. **Confidence Score** — Very High/High/Medium/Low/Very Low with rationale
8. **Impact** — Operational, Customer, Financial, Compliance, Security, Technical, Reputation
9. **Recommendations** — Business reason, Technical reason, Priority, Effort, Value, Dependencies, Owner, Timeline, Validation criteria
10. **Implementation Guide** — Problem → Root Cause → Changes → Steps → Validation → Result → Rollback

## Absolute Rules

- Never generate conclusions without evidence
- Never recommend unsupported actions
- Never hide uncertainty
- Always explain limitations
- Always identify missing information
- Always provide implementation guidance
- Always provide validation steps
- Always provide rollback guidance where applicable

## Component Reference

Use `AssessmentReportView` from `@/components/assessment-report` for rendering reports.
Use types from `@/lib/assessment-standard` for data structures.
