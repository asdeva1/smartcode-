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
COPY tsconfig.base.json tsconfig.base.json
COPY packages/types packages/types
COPY packages/config packages/config
COPY apps/api apps/api
# No separate `COPY prisma prisma` - the schema now lives at
# apps/api/prisma/ (moved during this review; see that schema file's
# header comment for why) and is already brought in by `COPY apps/api
# apps/api` above. A root-level prisma/ directory no longer exists.

# ============================================================
# TEMPORARY DIAGNOSTIC BLOCK - exact block as specified for the prior
# review pass, with its final step repointed from the now-removed
# /repo/prisma to /repo/apps/api/prisma - the schema's new location -
# since that's the actual test of whether this move fixes the
# resolution failure. REMOVE once the real cause is confirmed from
# this output; do not leave in the production Dockerfile.
# ============================================================
RUN echo "=== API PACKAGE ===" \
 && cat /repo/apps/api/package.json \
 && echo "=== API CLIENT LINK ===" \
 && ls -la /repo/apps/api/node_modules/@prisma 2>/dev/null || true \
 && ls -la /repo/apps/api/node_modules/@prisma/client 2>/dev/null || true \
 && echo "=== CLIENT REALPATH ===" \
 && readlink /repo/apps/api/node_modules/@prisma/client 2>/dev/null || true \
 && echo "=== PNPM PRISMA PACKAGES ===" \
 && find /repo/node_modules/.pnpm -maxdepth 2 -type d -name '@prisma+client*' -print \
 && find /repo/node_modules/.pnpm -maxdepth 2 -type d -name 'prisma@*' -print \
 && echo "=== PNPM LIST ===" \
 && cd /repo/apps/api \
 && pnpm list @prisma/client prisma \
 && echo "=== PNPM WHY CLIENT ===" \
 && pnpm why @prisma/client \
 && echo "=== NODE RESOLUTION FROM API ===" \
 && node -e "console.log(require.resolve('@prisma/client/package.json'))" \
 && echo "=== NODE CLIENT LOAD FROM API ===" \
 && node -e "require('@prisma/client'); console.log('CLIENT LOAD OK')" \
 && echo "=== NODE RESOLUTION FROM SCHEMA DIRECTORY (now apps/api/prisma, not /repo/prisma) ===" \
 && cd /repo/apps/api/prisma \
 && node -e "console.log(require.resolve('@prisma/client/package.json'))"
# ============================================================
# END TEMPORARY DIAGNOSTIC BLOCK
# ============================================================

# PRISMA_GENERATE_SKIP_AUTOINSTALL=true disables a Prisma CLI convenience
# feature (present in its own shipped source, prisma/build/index.js -
# see this fix's accompanying report for the exact function) that tries
# to detect whether `prisma` and `@prisma/client` are "properly
# colocated" siblings, and if its heuristic concludes they aren't, runs
# `<packageManager> add prisma@<version> -D --silent` on your behalf to
# "fix" it - which is exactly the `pnpm add prisma@5.22.0 -D --silent`
# command that was failing the build. Both packages ARE correctly
# declared as real dependencies of @smartcode/api (`pnpm --filter
# @smartcode/api why prisma` / `list prisma @prisma/client` confirm
# this, and are unchanged by this fix) - the heuristic itself is what
# misfired, not the dependency graph, so the correct fix is telling
# Prisma to trust the workspace's own declarations instead of trying to
# manage them itself mid-build.
RUN PRISMA_GENERATE_SKIP_AUTOINSTALL=true pnpm --filter @smartcode/api prisma:generate
# Sanity check the generated client actually loads before spending time
# on a full Nest build that would fail later anyway if it didn't. Must
# run from apps/api, not the default /repo WORKDIR - @prisma/client is
# correctly declared only in apps/api/package.json (see
# docker/api.Dockerfile's deps stage and apps/api/package.json), not at
# the repo root, so resolving it from /repo was never expected to work
# and isn't evidence of anything broken - it was just the wrong
# directory for this specific check.
RUN cd /repo/apps/api && node -e "require('@prisma/client'); console.log('CLIENT LOAD OK')" \
    || (echo "FATAL: 'prisma generate' did not produce a loadable @prisma/client." && exit 1)
# @smartcode/types must be built to real dist/ output BEFORE @smartcode/api,
# since apps/api now resolves it as a normal compiled package dependency
# (via its own package.json main/types fields) rather than pulling its
# .ts source directly into apps/api's compilation through a tsconfig
# `paths` override. That override was the root cause of a prior bug:
# with packages/types/src included as a direct compilation input,
# TypeScript's rootDir inference computed /repo (the lowest common
# ancestor of apps/api/src and packages/types/src) instead of
# apps/api/src alone, so `nest build` emitted to dist/apps/api/src/main.js
# instead of the flat dist/main.js this image's CMD expects. Building
# packages/types first, and consuming only its compiled output, keeps
# apps/api's own compilation - and therefore its rootDir - confined to
# apps/api/src, exactly as intended.
RUN pnpm --filter @smartcode/types build
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
