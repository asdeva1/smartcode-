# SmartCode API - multi-stage build for the NestJS backend.
# Built from the monorepo root context so pnpm workspaces resolve.
#
# See ../.dockerignore for why that file's existence matters as much as
# anything in this Dockerfile - without it, host node_modules/ leaks into
# the build context and clobbers what this file correctly installs.

FROM node:20-alpine AS base
WORKDIR /repo

# pnpm is installed via a plain `npm install -g`, NOT Corepack.
RUN npm install -g pnpm@9.15.9 \
    && test "$(pnpm --version)" = "9.15.9" \
    && echo "pnpm 9.15.9 verified"

# Prisma requires OpenSSL.
RUN apk add --no-cache openssl

FROM base AS deps

# argon2 native-module build dependencies.
RUN apk add --no-cache python3 make g++

# Copy workspace manifests.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/ui/package.json packages/ui/package.json

RUN pnpm install --frozen-lockfile --filter @smartcode/api...

# Verify Prisma CLI exists.
RUN test -e node_modules/.pnpm/prisma@*/node_modules/prisma/build/index.js \
    || (echo "FATAL: Prisma CLI was not installed correctly in the deps stage." && exit 1)

FROM base AS build

COPY --from=deps /repo /repo
COPY tsconfig.base.json tsconfig.base.json
COPY packages/types packages/types
COPY packages/config packages/config
COPY apps/api apps/api

# Prisma generate.
RUN PRISMA_GENERATE_SKIP_AUTOINSTALL=true pnpm --filter @smartcode/api prisma:generate

# Verify generated Prisma client loads.
RUN cd /repo/apps/api && node -e "require('@prisma/client'); console.log('CLIENT LOAD OK')" \
    || (echo "FATAL: 'prisma generate' did not produce a loadable @prisma/client." && exit 1)

# Build shared types first.
RUN pnpm --filter @smartcode/types build

# Build API.
RUN pnpm --filter @smartcode/api build

FROM node:20-alpine AS runner

WORKDIR /repo
ENV NODE_ENV=production

# Prisma runtime dependency.
RUN apk add --no-cache openssl

# Copy completed application from build stage.
COPY --from=build /repo /repo

EXPOSE 4000

# IMPORTANT:
# Nest currently generates main.js under dist/src/main.js.
CMD ["node", "apps/api/dist/src/main.js"]