# AskABD Enterprise Operations Centre — Local Development

## Quick Start

### Prerequisites
- Node.js 20+
- Docker Desktop (running)
- npm

### 1. Start Infrastructure (PostgreSQL + Mailpit)
```bash
docker compose up -d
```

This starts:
- **PostgreSQL** on `localhost:5442` (user: comp_user, pass: comp_local_pass, db: comparison)
- **Mailpit** SMTP on `localhost:1025`, Web UI on `http://localhost:8025`

### 2. Start Backend API
```bash
cd apps/api
npm run dev
```
API runs on `http://localhost:4200`

### 3. Start Frontend
```bash
cd apps/web
npm run dev
```
Frontend runs on `http://localhost:3001`

### 4. Access the Platform
- **AskABD Platform**: http://localhost:3001
- **Email Inbox (Mailpit)**: http://localhost:8025
- **API Health**: http://localhost:4200/health

## UAT Demo Flow

1. Open http://localhost:3001/clients/onboard
2. Complete all 6 onboarding steps
3. Click "Complete Onboarding"
4. Navigate to http://localhost:3001/verify
5. Enter OTP: `123456` (demo mode)
6. Client activates and lifecycle progresses
7. Check http://localhost:8025 for verification emails (when SMTP is running)

## Environment Variables (apps/api/.env)
```
DATABASE_URL=postgresql://comp_user:comp_local_pass@localhost:5442/comparison
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_FROM=noreply@askabd.com
NODE_ENV=development
PORT=4200
```

## Troubleshooting

### "Cannot reach localhost:3001"
The frontend dev server isn't running. Run: `cd apps/web && npm run dev`

### "Cannot reach localhost:4200"
The API isn't running. Run: `cd apps/api && npm run dev`

### "Database connection refused"
PostgreSQL isn't running. Run: `docker compose up -d`

### "Email not delivered"
Mailpit isn't running. Run: `docker compose up -d`
Then check http://localhost:8025
