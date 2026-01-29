# Build stage
FROM node:20-slim AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Build the application
RUN npm run build

# Production stage
FROM node:20-slim AS runner

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y openssl ca-certificates dumb-init && rm -rf /var/lib/apt/lists/*

# Copy production dependencies
COPY package*.json ./
COPY prisma ./prisma/
RUN npm install --omit=dev

# Copy build artifacts and static files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/static ./static

# Re-generate Prisma Client in the runner stage to ensure compatibility
RUN npx prisma generate

# Create a non-root user
RUN groupadd -r nodejs && useradd -r -g nodejs nestjs
USER nestjs

# Command to run the bot using dumb-init
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["sh", "-c", "npx prisma db push && npm run start:prod"]
