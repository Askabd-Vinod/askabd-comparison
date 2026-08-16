# AskABD Commercial Platform

## Architecture

```
CLIENT
  ↓
SERVICE SELECTION (Service Registry + Client Service Configuration)
  ↓
RECOMMENDATIONS (evidence-based: problems, gaps, compliance)
  ↓
BUNDLES (Assessment, Transformation, Optimization, Compliance, Enterprise)
  ↓
COMMERCIAL ENGAGEMENT (scope, effort, investment, expected value)
  ↓
PRICING (subtotal, discount, tax, billing model, payment terms)
  ↓
PROPOSAL (generated from platform intelligence, versioned)
  ↓
APPROVAL (audited, workflow event)
  ↓
PAYMENT METHOD (provider-agnostic, tokenized, no PAN/CVV)
  ↓
TRANSACTION (invoice, payment, refund, credit, adjustment)
  ↓
RECONCILIATION (expected vs actual, variance, exceptions)
  ↓
TRANSFORMATION (linked to engagement outcomes)
  ↓
OUTCOME MEASUREMENT (benefit realization)
```

## Engagement Lifecycle

```
draft → proposed → approved → contracted → active → completed
```

All transitions are audited. Invalid transitions are rejected.

## Proposal Lifecycle

```
draft → ready → sent → accepted
```

Proposals auto-version (v1, v2, v3...). Content generated from existing platform data:
- Client information (ASK ONCE)
- Selected services and bundles
- Problems and gaps addressed
- Financial estimates and effort
- Pricing and payment terms
- Expected outcomes

## Payment Architecture

**Security rules:**
- NEVER store PAN, CVV, PIN, passwords, or provider secrets
- Use provider token references only
- All operations client-scoped and audited
- Verification lifecycle: pending → active → disabled

**Supported types:** bank_transfer, ACH, wire_transfer, credit_card, debit_card, UPI, SEPA, SWIFT, payment_gateway

**Provider abstraction:** Ready for Stripe/Adyen/PayPal when configured.

## Reconciliation Architecture

```
Transaction Ledger
  ↓
Reconciliation Run (draft → running → completed → reviewed → approved)
  ↓
Matching Logic (exact amount, partial match, unmatched)
  ↓
Exception Management (open → investigating → resolved/waived)
  ↓
Variance Detection → Workflow Notification
```

Scheduler integration: `FINANCIAL_RECONCILIATION` job runs daily with advisory locking.

## Service Configuration

Per-client service enablement with dependency validation:
- Enable: checks required dependencies
- Disable: prevents if active dependents exist
- Service Registry is authoritative product catalog

## ASK ONCE Integration

Commercial forms reuse existing platform information:
- Industry, country, business size, criticality
- Problems, gaps, technology stack
- Financial assumptions, existing services
- Requirements already collected

Never re-ask for information already in the platform.

## API Endpoints

### Engagements
- `POST /oc/clients/:clientId/engagements` — Create
- `GET /oc/clients/:clientId/engagements` — List
- `GET /oc/engagements/:id` — Get
- `PATCH /oc/engagements/:id` — Update
- `POST /oc/engagements/:id/transition` — Status change
- `GET/POST /oc/engagements/:id/services` — Service selection
- `GET /oc/engagements/:id/summary` — Platform-aggregated summary
- `GET/POST /oc/engagements/:id/pricing` — Pricing
- `GET/POST /oc/engagements/:id/proposals` — Proposals

### Proposals
- `GET /oc/proposals/:id` — Get proposal
- `POST /oc/proposals/:id/generate` — Generate content
- `POST /oc/proposals/:id/transition` — Lifecycle

### Payment Methods
- `GET/POST /oc/clients/:clientId/payment-methods`
- `POST /oc/payment-methods/:id/verify`
- `POST /oc/payment-methods/:id/default`
- `POST /oc/payment-methods/:id/disable`

### Transactions & Reconciliation
- `GET/POST /oc/clients/:clientId/transactions`
- `POST /oc/clients/:clientId/reconciliation/run`
- `POST /oc/reconciliation/:id/execute`
- `GET /oc/clients/:clientId/reconciliation/summary`
- `GET /oc/clients/:clientId/reconciliation/exceptions`

### Platform Dashboard
- `GET /oc/platform/commercial/summary`

## AWS Compatibility

All services use:
- Environment-based configuration (no hardcoded URLs)
- Shared database pool (RDS-compatible with SSL)
- Storage abstraction (local / S3)
- Email abstraction (Mailpit / SMTP / SES)
- Secrets via environment variables (Secrets Manager in production)

DEV works without AWS. Production uses managed services.
