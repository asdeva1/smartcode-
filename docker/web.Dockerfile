# SmartCode Web - multi-stage build for the Next.js frontend.
#
# See ../.dockerignore - same reasoning as docker/api.Dockerfile's header
# comment: without it, host node_modules/ leaks into the build context
# and can clobber what the deps stage correctly installs.

FROM node:20-alpine AS base
WORKDIR /repo
# Pinned to the exact patch version verified working on the reference
# Windows dev machine - see docker/api.Dockerfile for why floating
# "pnpm@9" was a real, unverified variable worth removing.
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

FROM base AS deps
# Copy every workspace member's package.json, not just @smartcode/web's
# dependency closure - see docker/api.Dockerfile's deps stage comment
# for why a partial manifest copy is risky with --frozen-lockfile.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN pnpm install --frozen-lockfile --filter @smartcode/web...

FROM base AS build
COPY --from=deps /repo /repo
COPY packages/types packages/types
COPY packages/config packages/config
COPY packages/ui packages/ui
COPY apps/web apps/web
RUN pnpm --filter @smartcode/web build

FROM node:20-alpine AS runner
WORKDIR /repo
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
COPY --from=build /repo /repo
EXPOSE 3000
CMD ["pnpm", "--filter", "@smartcode/web", "start"]
