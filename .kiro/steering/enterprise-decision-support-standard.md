# Enterprise Decision Support Standard

Every page, module, dashboard, report, assessment, recommendation, proposal, incident, deployment, audit, consulting workspace, and AI insight must follow this standard.

The platform must never simply display information. Every screen must help decision-makers (executives, architects, managers, consultants, engineers, auditors) make informed decisions.

## Core Principle

Every output must answer:
- What happened
- Why it happened
- How we know (evidence)
- Business impact
- Technical impact
- Risk
- Recommendation
- Implementation steps
- Validation
- Expected outcome
- Confidence level
- Limitations

## 20-Section Enterprise Output Standard

### Section 1: Executive Summary
Business Summary, Technical Summary, Current Health, Overall Status, Overall Risk, Overall Priority, Business/Operational/Financial/Customer/Security/Compliance Impact, Executive Recommendation

### Section 2: Evidence
Collected Information, Monitoring, Logs, Metrics, Reports, Audit Records, Incidents, Deployments, Configurations, Architecture, Business Documents. Every conclusion must reference evidence. Evidence must include Source, Owner, Timestamp, Quality, Completeness, Reliability.

### Section 3: Assessment
Current State, Target State, Strengths, Weaknesses, Observations. Dimensions: Business, Technical, Security, Operations, Architecture, Cloud, Infrastructure, Support, Compliance, Documentation.

### Section 4: Gap Analysis
Missing: Information, Monitoring, Documentation, Architecture, Security Controls, Processes, Governance, Automation, Ownership, Testing, Compliance, Backups, DR, Business/Technical Information. Every gap must explain: Why it matters, Business impact, Technical impact, Priority, Risk, Recommendation.

### Section 5: Business Impact
Revenue, Operational, Customer, Compliance, Financial, Security, Architecture, Technology, Future Impact.

### Section 6: Technical Impact
Applications, Services, Infrastructure, Cloud, API, Database, Monitoring, Performance, Scalability, Availability, Reliability.

### Section 7: Risk Assessment
Risk, Likelihood, Impact, Severity, Trend, Mitigation, Residual Risk, Business Owner, Technical Owner.

### Section 8: Recommendations
Every recommendation includes: Business Reason, Technical Reason, Industry Best Practice, Priority, Estimated Effort/Duration, Business/Technical Value, Dependencies, Expected Benefits, Owner, Timeline, Success Criteria.

### Section 9: Implementation Guide
Current Problem → Root Cause → Implementation Steps → Prerequisites → Dependencies → Validation → Expected Result → Rollback Procedure → Post-Implementation Activities.

### Section 10: Validation
How success is measured, Acceptance Criteria, Validation Checklist, Regression Checklist, Smoke Test, Performance/Security/Business Validation.

### Section 11: Limitations
Never hide uncertainty. Explain: What cannot be concluded, Why, What information/evidence is missing, How confidence is affected, What additional information is required.

### Section 12: Confidence
Very High / High / Medium / Low / Very Low. Depends on: Evidence, Data Quality, Data Completeness, Information Freshness, Source Reliability.

### Section 13: Industry Standards
Compare against (where applicable): Microsoft/AWS/Google Well-Architected, ITIL, COBIT, TOGAF, BABOK, PMBOK, ISO 27001, SOC2, NIST, OWASP, CIS Controls, Cloud Native/DevOps Best Practices, DORA Metrics. Show: Current State, Target State, Gap, Recommendation.

### Section 14: Defect Resolution
Executive Summary, Problem Statement, Observed/Expected Behaviour, Evidence, RCA, Business/Technical Impact, Severity, Priority, Affected Components, Dependencies, Recommended/Alternative Solutions, Step-by-Step Resolution, Validation, Regression Testing, Rollback, Preventive Actions, Lessons Learned, Related Entities, Industry Reference.

### Section 15: Downloads
PDF, Word, Excel, CSV, JSON. Report types: Executive, Technical, Architecture, Risk, Audit, Proposal, Roadmap, Implementation Plan.

### Section 16: Sharing
Share Link, Email, Presentation Mode. Views: Executive, Technical, Consultant, Customer.

### Section 17: Visual Standards
Charts, Tables, Heat Maps, Trends, Timelines, Dependency Graphs, Business Capability Maps, Legends, Tooltips, Icons, Status Indicators, Color Meaning.

### Section 18: Navigation
Every item clickable. Every relationship opens correct page. Every breadcrumb works. Every drill-down works. Zero dead hyperlinks.

### Section 19: Evidence Policy
- Never generate unsupported conclusions
- Never guess or fabricate
- Clearly distinguish: Observed Fact, Evidence, Inference, Recommendation, Assumption, Limitation

### Section 20: Consistency
Same terminology, report structure, colors, priorities, confidence model, recommendation format, implementation format, validation format, export format — across every module.

## Technical Implementation

- Types: `@/lib/assessment-standard.ts` (AssessmentReport, Evidence, GapItem, Recommendation, ConfidenceLevel)
- Component: `@/components/assessment-report.tsx` (AssessmentReportView)
- Every analysis page should use these shared types and components

## Absolute Rules

- Never generate conclusions without evidence
- Never recommend unsupported actions
- Never hide uncertainty
- Always explain limitations
- Always identify missing information
- Always provide implementation guidance
- Always provide validation steps
- Always provide rollback guidance where applicable
- Platform must behave like a trusted Enterprise Consulting Platform
