FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy workspace config
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages ./packages
COPY apps ./apps

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build all packages
RUN pnpm build

# Production image
FROM node:20-alpine

WORKDIR /app

RUN npm install -g pnpm

# Copy lock file
COPY pnpm-lock.yaml ./

# Copy built apps and packages
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps ./apps
COPY --from=builder /app/node_modules ./node_modules

# Default to API server
EXPOSE 3000
CMD ["node", "apps/api/dist/index.js"]
