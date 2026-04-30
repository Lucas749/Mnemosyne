FROM node:22-slim

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace config
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY shared/ ./shared/
COPY packages/storage/ ./packages/storage/
COPY packages/compute/ ./packages/compute/
COPY packages/identity/ ./packages/identity/
COPY packages/payments/ ./packages/payments/
COPY packages/api/ ./packages/api/

# Install all workspace deps
RUN pnpm install --frozen-lockfile

EXPOSE 3000

CMD ["pnpm", "--filter", "@mnemosyne/api", "start"]
