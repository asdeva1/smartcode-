# SmartCode

Medical Coding Production, Audit and Consolidation Platform — SmartClues Technologies LLP.

**Status: Phase 1 (Foundation) complete.** Production/Audit business workflow is not yet implemented — see `docs/10-IMPLEMENTATION-ROADMAP.md` for the phased plan and `docs/` for the full approved architecture.

## Architecture

Full architecture, RBAC matrix, API design, and the approved schema decisions live in [`docs/`](./docs/README.md) — start there. Summary:

- **Frontend:** Next.js (App Router) · React · TypeScript · Tailwind · MUI · TanStack Query · Zustand · React Hook Form · Zod
- **Backend:** NestJS · TypeScript · REST · Swagger/OpenAPI
- **Database:** PostgreSQL via Prisma (versioned Production/Audit schema — see `docs/11-SCHEMA-DECISIONS.md`)
- **Cache/Queues:** Redis · BullMQ (wired for Phase 1 health checks; queues introduced with Reports/Notifications in later phases)
- **Auth:** Native JWT in v1, behind an `AuthProvider` interface so Keycloak can be swapped in later without touching business logic (see `docs/06-BACKEND-ARCHITECTURE.md` and `docs/07-SECURITY-ARCHITECTURE.md`)

## Monorepo Structure

```
smartcode/
├── apps/
│   ├── web/            Next.js frontend
│   └── api/             NestJS backend
├── packages/
│   ├── types/           Shared roles, status enums, Zod schemas (source of truth for both apps)
│   ├── config/          Shared navigation config
│   └── ui/               Design system (21 components, MUI-based, token-driven)
├── prisma/
│   ├── schema.prisma     Approved, versioned database schema
│   └── seed.ts           Seeds one Manager account
├── docker/                Dockerfiles for api/web
├── docs/                  Approved architecture & business-rules documentation
├── docker-compose.yml
└── .env.example
```

## Prerequisites

- Node.js ≥ 20
- pnpm ≥ 9 (`corepack enable && corepack prepare pnpm@9 --activate`)
- Docker + Docker Compose (for local Postgres/Redis, or the full containerized stack)

## Installation

```bash
pnpm install
```

> **Note on `prisma generate`:** the Prisma CLI downloads its query-engine binary from `binaries.prisma.sh` on first `generate`/`migrate`. This is a genuine outbound request your network must allow (it is *not* optional or skippable) — if you're behind a restrictive proxy/firewall, allowlist that host. Until `prisma generate` has been run successfully once, `@prisma/client` resolves to an untyped stub (`any`), so `apps/api` will build and run but without compile-time checking against the real schema — run generate before relying on that type safety.

## Environment Configuration

```bash
cp .env.example .env
# Fill in DATABASE_URL, REDIS_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET at minimum for local dev.
# Never commit .env.
```

## Docker Setup (recommended for local dev)

```bash
docker compose up --build
```

Starts `postgres`, `redis`, `api` (port 4000), and `web` (port 3000), in dependency order with health checks. First run: apply the database migration and seed a Manager account (see below) once `api` is healthy.

## Database Setup

```bash
# Generate the Prisma client (see network note above)
pnpm --filter @smartcode/api prisma:generate

# Create and apply the initial migration against a running Postgres
pnpm --filter @smartcode/api prisma:migrate

# Seed one Manager account (login: manager.admin)
SEED_MANAGER_PASSWORD='<choose a password>' pnpm --filter @smartcode/api exec ts-node ../../prisma/seed.ts
```

The migration must also add a partial unique index enforcing exactly one `isCurrent = true` `ProductionEntry` row per chart — Postgres partial indexes aren't expressible in the Prisma schema DSL, so add this to the generated migration's SQL before applying it:

```sql
CREATE UNIQUE INDEX "ProductionEntry_chartId_current_unique"
  ON "ProductionEntry" ("chartId")
  WHERE "isCurrent" = true;
```

## Development Commands

```bash
pnpm dev:api      # NestJS in watch mode (http://localhost:4000, Swagger at /api/docs)
pnpm dev:web      # Next.js dev server (http://localhost:3000)
```

## Testing Commands

```bash
pnpm --filter @smartcode/api test           # unit tests (RBAC hierarchy, etc. — no DB required)
pnpm --filter @smartcode/api test:e2e       # e2e tests (requires Postgres + Redis running)
```

## Build Commands

```bash
pnpm build        # builds every workspace package/app
pnpm typecheck    # strict TypeScript across the whole monorepo
pnpm lint         # ESLint across the whole monorepo
```

## First Login

After seeding, sign in at `http://localhost:3000/login` with the `manager.admin` login name and the password you set via `SEED_MANAGER_PASSWORD`. From there: Manager creates a Team Lead → Team Lead creates a Coder, per the approved hierarchy in `docs/03-RBAC-PERMISSIONS.md`.
