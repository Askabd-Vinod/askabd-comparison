# AskABD Web — Production Dockerfile
# Multi-stage build for Next.js standalone output.
# Build context: repository root (run with -f apps/web/Dockerfile .)

# Build stage
FROM node:20.18-alpine AS builder
WORKDIR /app

# Install dependencies
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm install

# Copy source and build
COPY apps/web/ ./
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Production stage — standalone output (minimal)
FROM node:20.18-alpine
WORKDIR /app

RUN addgroup -g 1001 -S app && adduser -S app -u 1001 -G app

# Copy standalone Next.js output (includes server + node_modules subset)
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

USER app
EXPOSE 3001

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3001
ENV HOSTNAME=0.0.0.0

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/ || exit 1

CMD ["node", "server.js"]
