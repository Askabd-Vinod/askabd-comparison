# AskABD Comparison API — Production Dockerfile
# Multi-stage build for minimal production image.
#
# Build context: repository root (run with -f apps/api/Dockerfile .)

# Build stage
FROM node:20-alpine AS builder
WORKDIR /app

# Copy vendor tarballs first (shared platform packages)
COPY vendor/ ./vendor/

# Copy package manifests and install
COPY apps/api/package.json apps/api/package-lock.json ./
RUN npm install --omit=dev || npm install

# Copy source and compile
COPY apps/api/tsconfig.json ./
COPY apps/api/src ./src
RUN npx tsc --skipLibCheck

# Production stage
FROM node:20-alpine
WORKDIR /app

RUN addgroup -g 1001 -S app && adduser -S app -u 1001 -G app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./

USER app
EXPOSE 4200

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4200/health || exit 1

CMD ["node", "dist/index.js"]
