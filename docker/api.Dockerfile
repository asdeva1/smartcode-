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

# Prisma's query engine is a native binary that dynamically links against
# OpenSSL to detect the correct engine variant for this platform. The
# base `node:20-alpine` image does not include OpenSSL, and without it
# Prisma fails with "Please manually install OpenSSL and try installing
# Prisma again." - confirmed as the real error from the Windows Docker
# build log. Installed once here, in `base`, so every stage that derives
# FROM base (deps AND build) has it; `prisma generate` runs in the build
# stage, and pnpm's own install-time scripts in the deps stage may also
# probe for it, so both need it rather than just the one that seemed to
# fail. The separate `runner` stage below is NOT derived from `base` and
# gets its own explicit install for the same reason, at runtime.
RUN apk add --no-cache openssl

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
RUN pnpm --filter @smartcode/api prisma:generate
# Sanity check the generated client actually loads before spending time
# on a full Nest build that would fail later anyway if it didn't.
RUN node -e "require('@prisma/client')" || (echo "FATAL: 'prisma generate' did not produce a loadable @prisma/client." && exit 1)
RUN pnpm --filter @smartcode/api build

FROM node:20-alpine AS runner
WORKDIR /repo
ENV NODE_ENV=production
# Prisma Client's query engine binary runs HERE, at request time, not
# just at generate-time in the build stage - this is a fresh `FROM
# node:20-alpine`, so it needs its own OpenSSL install too, or the
# container will build fine and then crash on its first database query.
RUN apk add --no-cache openssl
# No pnpm install here, deliberately: CMD below invokes `node` directly,
# never `pnpm` - installing pnpm in this stage was previously dead
# weight (and one more copy of the Corepack failure surface removed
# from the base stage in an earlier fix). apps/web's runner stage still
# needs pnpm because its CMD does invoke it - see docker/web.Dockerfile.
COPY --from=build /repo /repo
EXPOSE 4000
CMD ["node", "apps/api/dist/main.js"]
