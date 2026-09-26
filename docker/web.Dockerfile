# SmartCode Web - multi-stage build for the Next.js frontend.
#
# See ../.dockerignore - same reasoning as docker/api.Dockerfile's header
# comment: without it, host node_modules/ leaks into the build context
# and can clobber what the deps stage correctly installs.
#
# Deliberately no `apk add openssl` anywhere in this file: apps/web has
# no Prisma dependency, so there is no native Prisma engine here that
# needs OpenSSL.

FROM node:20-alpine AS base
WORKDIR /repo

# Install the exact pnpm version used by the repository.
RUN npm install -g pnpm@9.15.9 \
    && test "$(pnpm --version)" = "9.15.9" \
    && echo "pnpm 9.15.9 verified"

FROM base AS deps

# Copy workspace manifests first so dependency installation can use the
# existing frozen lockfile.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/ui/package.json packages/ui/package.json

RUN pnpm install --frozen-lockfile --filter @smartcode/web...

FROM base AS build

# IMPORTANT:
# NEXT_PUBLIC_API_URL is required during `next build` because
# apps/web/next.config.js uses it to generate the Next.js rewrite.
#
# The Docker service name `api` is reachable from the web container.
ARG NEXT_PUBLIC_API_URL=http://api:4000
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

COPY --from=deps /repo /repo
COPY packages/types packages/types
COPY packages/config packages/config
COPY packages/ui packages/ui
COPY apps/web apps/web

# Diagnostic output makes the build-time value explicit.
RUN echo "BUILD NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}" \
    && pnpm --filter @smartcode/web build

FROM node:20-alpine AS runner
WORKDIR /repo

ENV NODE_ENV=production

# pnpm is required by the production CMD.
RUN npm install -g pnpm@9.15.9 \
    && test "$(pnpm --version)" = "9.15.9" \
    && echo "pnpm 9.15.9 verified"

COPY --from=build /repo /repo

EXPOSE 3000

CMD ["pnpm", "--filter", "@smartcode/web", "start"]