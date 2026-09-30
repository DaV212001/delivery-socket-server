# ==============================================================================
# Multi-stage Dockerfile for AMN Delivery Socket.IO Server
# ==============================================================================

# Stage 1: Build TypeScript source
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json tsconfig.json ./
RUN npm ci

COPY src ./src
RUN npm run build

# Stage 2: Production runtime image
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=10000
ENV HOST=0.0.0.0

COPY package*.json ./
RUN npm ci --only=production

COPY --from=builder /app/dist ./dist

# Non-root user for security
USER node

EXPOSE 10000

CMD ["node", "dist/server.js"]
