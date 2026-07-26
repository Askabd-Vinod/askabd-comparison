# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY apps/api/package.json ./
RUN npm install --omit=dev
COPY apps/api/tsconfig.json ./
COPY apps/api/src ./src
RUN npx tsc

# Production stage
FROM node:20-alpine
WORKDIR /app
RUN addgroup -g 1001 -S app && adduser -S app -u 1001 -G app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
USER app
EXPOSE 4200
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD wget --no-verbose --tries=1 --spider http://localhost:4200/health || exit 1
CMD ["node", "dist/index.js"]
