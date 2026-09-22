# SmartCode API - multi-stage build for the NestJS backend.
# Built from the monorepo root context so pnpm workspaces resolve.
#
# See ../.dockerignore for why that file's existence matters as much as
# anything in this Dockerfile - without it, host node_modules/ leaks into
# the build context and clobbers what this file correctly installs.

FROM node:20-alpine AS base
WORKDIR /repo
# pnpm is installed via a plain `npm install -g`, NOT Corepack.
# `corepack enable && corepack prepare pnpm@9.15.9 --activate` failed the
# build outright (exit code 1) before the deps stage ever ran - Corepack
# does its own package-signature verification against npm's registry as
# a separate step from a normal package fetch, and that verification
# step is what was failing here, not dependency installation itself. A
# plain `npm install -g pnpm@<version>` is the same mechanism every other
# global CLI install in this project already relies on, needs nothing
# beyond standard registry access, and is asserted below to be the exact
# version this project is pinned to - not just installed, but confirmed.
RUN npm install -g pnpm@9.15.9 \
    && test "$(pnpm --version)" = "9.15.9" \
    && echo "pnpm 9.15.9 verified"

FROM base AS deps
# argon2 (see apps/api/src/modules/auth/providers/local-auth.provider.ts) is a
# native module. It ships prebuilt binaries for common platforms, but if none
# matches this exact node:alpine (musl) target, node-gyp-build falls back to
# compiling from source - these packages make that fallback succeed instead
# of failing the image build.
RUN apk add --no-cache python3 make g++

# Copy EVERY workspace member's package.json (not just @smartcode/api's
# dependency closure) before running install. pnpm's --frozen-lockfile
# validates the lockfile's importer list against the filesystem; copying
# only a subset of manifests is the kind of partial-copy that can produce
# a lockfile/filesystem mismatch pnpm doesn't always surface as a hard,
# obvious error. Copying all six manifests costs nothing (they're tiny)
# and removes that failure class entirely. --filter below still limits
# what's actually built to @smartcode/api's closure.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/ui/package.json packages/ui/package.json

RUN pnpm install --frozen-lockfile --filter @smartcode/api...

# Fail fast, here, with a clear message - rather than two layers later at
# `prisma generate` with a confusing "cannot find module" error. This is
# exactly the check that would have turned the original bug report into
# a one-line, unambiguous diagnosis at the deps stage instead of the build
# stage.
RUN test -e node_modules/.pnpm/prisma@*/node_modules/prisma/build/index.js \
    || (echo "FATAL: Prisma CLI was not installed correctly in the deps stage - see .dockerignore and this Dockerfile's deps stage comments." && exit 1)

FROM base AS build
COPY --from=deps /repo /repo
COPY packages/types packages/types
COPY packages/config packages/config
COPY apps/api apps/api
COPY prisma prisma

# ============================================================
# TEMPORARY DIAGNOSTIC BLOCK - added to expose the real error
# behind "prisma:generate exited 1" with no visible detail.
# Every step below is deliberately non-fatal (each ends `|| true`
# or `; true`) so ALL of them run and print in a single
# `docker compose build --no-cache api`, even if an earlier one
# fails - the whole point is maximum information in one pass.
# REMOVE this entire block once the real error has been read from
# the build log and the root cause is fixed for real.
# ============================================================
RUN echo "=== 1. pwd ===" && pwd
RUN echo "=== 2. node --version ===" && node --version
RUN echo "=== 3. npm --version ===" && npm --version
RUN echo "=== 4. pnpm --version ===" && pnpm --version
RUN echo "=== 5. workspace recognition: pnpm --filter @smartcode/api exec pwd ===" \
    && (pnpm --filter @smartcode/api exec pwd || true)
RUN echo "=== 6. prisma package resolution ===" \
    && (pnpm --filter @smartcode/api exec node -e "console.log(require.resolve('prisma/package.json'))" || true)
RUN echo "=== 7a. ls -la .../prisma@5.22.0/node_modules/prisma/ ===" \
    && (ls -la /repo/node_modules/.pnpm/prisma@5.22.0/node_modules/prisma/ || true)
RUN echo "=== 7b. ls -la .../prisma@5.22.0/node_modules/prisma/build/ ===" \
    && (ls -la /repo/node_modules/.pnpm/prisma@5.22.0/node_modules/prisma/build/ || true)
RUN echo "=== 8a. ls -la /repo/apps/api/node_modules/ ===" \
    && (ls -la /repo/apps/api/node_modules/ || true)
RUN echo "=== 8b. ls -la /repo/apps/api/node_modules/prisma ===" \
    && (ls -la /repo/apps/api/node_modules/prisma || true)
RUN echo "=== 9. where does 'prisma' resolve from? ===" \
    && (pnpm --filter @smartcode/api exec node -e "console.log(require.resolve('prisma'))" || true)
RUN echo "=== 10a. ls -la /repo/prisma/ ===" \
    && (ls -la /repo/prisma/ || true)
RUN echo "=== 10b. ls -la /repo/prisma/schema.prisma ===" \
    && (ls -la /repo/prisma/schema.prisma || true)
RUN echo "=== 11. pnpm --filter @smartcode/api exec prisma --version (full output) ===" \
    && (pnpm --filter @smartcode/api exec prisma --version; echo "--- exit code: $? ---")
RUN echo "=== 12a. pnpm --filter @smartcode/api prisma:generate (the actual failing command, full output) ===" \
    && (pnpm --filter @smartcode/api prisma:generate; echo "--- exit code: $? ---")
RUN echo "=== 12b. direct invocation, bypassing the workspace filter, in case it's hiding the real error ===" \
    && (cd /repo/apps/api && pnpm exec prisma generate --schema=../../prisma/schema.prisma; echo "--- exit code: $? ---")
RUN echo "=== END DIAGNOSTIC BLOCK ==="
# ============================================================
# END TEMPORARY DIAGNOSTIC BLOCK
# ============================================================

RUN pnpm --filter @smartcode/api prisma:generate
# Sanity check the generated client actually loads before spending time
# on a full Nest build that would fail later anyway if it didn't.
RUN node -e "require('@prisma/client')" || (echo "FATAL: 'prisma generate' did not produce a loadable @prisma/client." && exit 1)
RUN pnpm --filter @smartcode/api build

FROM node:20-alpine AS runner
WORKDIR /repo
ENV NODE_ENV=production
# No pnpm install here, deliberately: CMD below invokes `node` directly,
# never `pnpm` - installing pnpm in this stage was previously dead
# weight (and one more copy of the same Corepack failure surface this
# review just removed from the base stage). apps/web's runner stage
# still needs pnpm because its CMD does invoke it - see docker/web.Dockerfile.
COPY --from=build /repo /repo
EXPOSE 4000
CMD ["node", "apps/api/dist/main.js"]
