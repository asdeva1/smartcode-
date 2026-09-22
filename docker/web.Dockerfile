# SmartCode Web - multi-stage build for the Next.js frontend.
#
# See ../.dockerignore - same reasoning as docker/api.Dockerfile's header
# comment: without it, host node_modules/ leaks into the build context
# and can clobber what the deps stage correctly installs.

FROM node:20-alpine AS base
WORKDIR /repo
# pnpm installed via plain `npm install -g`, not Corepack - see
# docker/api.Dockerfile's base stage comment for why Corepack's
# `prepare`/`activate` step failed outright here and was replaced.
RUN npm install -g pnpm@9.15.9 \
    && test "$(pnpm --version)" = "9.15.9" \
    && echo "pnpm 9.15.9 verified"

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
# pnpm IS needed here - CMD below invokes it directly (unlike the API
# runner, which calls `node` directly and needs no pnpm at all).
RUN npm install -g pnpm@9.15.9 \
    && test "$(pnpm --version)" = "9.15.9" \
    && echo "pnpm 9.15.9 verified"
COPY --from=build /repo /repo
EXPOSE 3000
CMD ["pnpm", "--filter", "@smartcode/web", "start"]
