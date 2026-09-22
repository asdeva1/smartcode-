# SmartCode API - multi-stage build for the NestJS backend.
# Built from the monorepo root context so pnpm workspaces resolve.
FROM node:20-alpine AS base
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@9 --activate

FROM base AS deps
# argon2 (see apps/api/src/modules/auth/providers/local-auth.provider.ts) is a
# native module. It ships prebuilt binaries for common platforms, but if none
# matches this exact node:alpine (musl) target, node-gyp-build falls back to
# compiling from source - these packages make that fallback succeed instead
# of failing the image build.
RUN apk add --no-cache python3 make g++
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/types/package.json packages/types/package.json
COPY packages/config/package.json packages/config/package.json
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --frozen-lockfile --filter @smartcode/api...

FROM base AS build
COPY --from=deps /repo /repo
COPY packages/types packages/types
COPY packages/config packages/config
COPY apps/api apps/api
COPY prisma prisma
RUN pnpm --filter @smartcode/api prisma:generate
RUN pnpm --filter @smartcode/api build

FROM node:20-alpine AS runner
WORKDIR /repo
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@9 --activate
COPY --from=build /repo /repo
EXPOSE 4000
CMD ["node", "apps/api/dist/main.js"]
