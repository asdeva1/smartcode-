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
│       └── prisma/       Approved, versioned database schema (moved here
│                          from the repo root during Phase 1's Docker
│                          review - see schema.prisma's header comment)
│           ├── schema.prisma
│           ├── seed.ts
│           └── manual-constraints.sql
├── packages/
│   ├── types/           Shared roles, status enums, Zod schemas (source of truth for both apps)
│   ├── config/          Shared navigation config
│   └── ui/               Design system (21 components, MUI-based, token-driven)
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

**Configuration verified statically; runtime Docker test requires a local Docker environment.** No Docker daemon was available in the Phase 1 build sandbox, so `docker compose up` has never actually been run against this configuration. What *was* done instead: a careful manual line-by-line review of `docker-compose.yml`, `docker/api.Dockerfile`, and `docker/web.Dockerfile` for internal consistency — service names used correctly in inter-container URLs (`postgres`, `redis`, `api`, not `localhost`), `DATABASE_URL`/`REDIS_URL` correctly overridden per-container in `docker-compose.yml` versus their host-facing values in `.env.example`, health check commands matching the real routes (`/health` is excluded from the API's global `/api` prefix — see `apps/api/src/main.ts` — so the compose healthcheck hitting `http://localhost:4000/health` directly is correct, not a mismatch), `depends_on: condition: service_healthy` chains matching the intended startup order (postgres/redis → api → web), and `NEXT_PUBLIC_API_URL` correctly resolving server-side inside the `web` container via Next.js's rewrite proxy rather than being baked into the client bundle at build time (the browser never talks to `NEXT_PUBLIC_API_URL` directly — see `apps/web/src/lib/api-client.ts`, which only ever calls a same-origin `/api/backend/...` path). This review did catch one real, previously-unverified bug — `docker/api.Dockerfile`'s dependency stage had no fallback build toolchain for `argon2`'s native module if no prebuilt binary matches Alpine's musl libc — since fixed. Treat the whole Docker path as unverified until you've actually run `docker compose up --build` once.

## Verifying this schema (Prisma)

**Why this section exists:** the Phase 1 build environment could not reach `binaries.prisma.sh`, which every Prisma CLI subcommand — including `generate`, `validate`, `format`, `migrate`, and even `--help` — contacts unconditionally to verify/fetch its query- and schema-engine binaries before doing anything else. No Prisma CLI command ran successfully there, at all. `apps/api/prisma/schema.prisma` was instead reviewed **manually**, field by field: every relation's `fields`/`references` pairing and cardinality, foreign-key presence and direction (with one deliberate non-FK denormalization, documented inline on `AuditEntry.chartId`), index redundancy (two duplicate single-column indexes on `User` were found and removed this way), enum-default validity, and required/optional consistency between scalar FK columns and their relations. That review is documented in the schema file's own header comment and in this project's Phase 1 review history — but it is not a substitute for the compiler actually checking it, which is why the commands below matter.

Run these locally, in order, on a machine with normal internet access:

```bash
# 1. Generates the Prisma Client from schema.prisma and, as a side effect,
#    is the fastest way to catch any syntax/relation error the manual
#    review above might have missed.
pnpm --filter @smartcode/api prisma:generate
```

**Expected output:** a few lines ending with something like
`✔ Generated Prisma Client (5.22.0) to ./node_modules/.pnpm/@prisma+client@.../node_modules/@prisma/client in NNNms`, exit code 0. If the schema had a real error (bad relation, unknown field, etc.), this fails loudly with a specific line-numbered message instead — that would mean the manual review above missed something and needs to be revisited before continuing.

```bash
# 2. Creates the migration SQL from schema.prisma WITHOUT applying it yet,
#    so the partial-index statement can be added first (see next step).
pnpm --filter @smartcode/api exec prisma migrate dev --schema=./prisma/schema.prisma --name init --create-only
```

**Expected output:** `Prisma Migrate created the following migration without applying it: apps/api/prisma/migrations/<timestamp>_init/`, exit code 0.

```bash
# 3. Open the generated migration.sql it just created and paste the
#    contents of apps/api/prisma/manual-constraints.sql onto the end of it.
#    (See that file for the exact statement, its name, and why it's
#    needed — it enforces "exactly one current Production version per
#    Chart" at the database level, not just in application code.)
```

```bash
# 4. Apply the (now hand-edited) migration against your running Postgres.
pnpm --filter @smartcode/api exec prisma migrate dev --schema=./prisma/schema.prisma
```

**Expected output:** `Your database is now in sync with your schema`, plus a list of the tables created (`User`, `Team`, `Client`, `Project`, `AuditorProjectAssignment`, `Chart`, `ProductionEntry`, `AuditEntry`, `Notification`, `ActivityLog`, `AuditLog`), exit code 0. If the partial index from step 3 has a syntax error, this step is where it will fail — that's the real, compiler/database-verified check that step never got in this review.

```bash
# 5. Seed one Manager account (login: manager.admin)
SEED_MANAGER_PASSWORD='<choose a password>' pnpm --filter @smartcode/api exec ts-node ./prisma/seed.ts
```

**Expected output:** `Seeded Manager: manager.admin (EMP0001)`.

Until step 1 above has actually been run once, `@prisma/client` resolves to an untyped stub (Prisma's own fallback, not something this build added) and `apps/api` will still build and run, but without real compile-time checking against the schema — treat that as an open item until you've run it, not as "probably fine."

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

## Local Windows Verification Guide

Exact commands for a Windows development machine, in order. Run these in **PowerShell**.

**Prerequisites:**
- Node.js ≥ 20 LTS — [nodejs.org](https://nodejs.org)
- pnpm ≥ 9 — enable via Node's bundled Corepack (next step covers it)
- Docker Desktop for Windows (with WSL2 backend) — [docker.com](https://www.docker.com/products/docker-desktop/)

**1. Clone the repository**
```powershell
git clone <your-repo-url> smartcode
cd smartcode
```

**2. Install dependencies**
```powershell
corepack enable
corepack prepare pnpm@9 --activate
pnpm install
```

**3. Copy `.env.example` to `.env`**
```powershell
Copy-Item .env.example .env
notepad .env   # fill in DATABASE_URL, REDIS_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET at minimum
```

**4. Start Docker Compose**
```powershell
docker compose up -d --build
docker compose ps   # confirm postgres and redis show "healthy" before continuing
```

**5. Run Prisma generate**
```powershell
pnpm --filter @smartcode/api prisma:generate
```
Expect: `✔ Generated Prisma Client ...`. If this fails on a network/checksum error the way it did in the review sandbox, your network is blocking `binaries.prisma.sh` — allowlist it and retry; this step cannot be skipped.

**6. Run the Prisma migration**
```powershell
pnpm --filter @smartcode/api exec prisma migrate dev --schema=./prisma/schema.prisma --name init --create-only
```
Open the generated `apps\api\prisma\migrations\<timestamp>_init\migration.sql` in your editor and paste the contents of `apps\api\prisma\manual-constraints.sql` onto the end of it. Then:
```powershell
pnpm --filter @smartcode/api exec prisma migrate dev --schema=./prisma/schema.prisma
```
Expect: `Your database is now in sync with your schema`.

**7. Seed development data**
```powershell
$env:SEED_MANAGER_PASSWORD = "ChooseAPassword123!"
pnpm --filter @smartcode/api exec ts-node ./prisma/seed.ts
```
Expect: `Seeded Manager: manager.admin (EMP0001)`.

**8. Start the development environment**
```powershell
# If you started the full stack with Docker Compose in step 4, api and web
# are already running - skip to step 9. Otherwise, in two separate
# PowerShell windows:
pnpm dev:api
pnpm dev:web
```

**9. Open the web application**
```powershell
start http://localhost:3000
```
Expect: redirected to `/login`, showing the SmartCode login form with the SmartClues logo.

**10. Test API health**
```powershell
curl http://localhost:4000/health
```
Expect JSON: `{"status":"ok","services":{"api":"ok","postgres":"ok","redis":"ok"}}`.

**11. Test login**
In the browser, sign in with login name `manager.admin` and the password you set in step 7. Expect: redirected to `/manager` with the Manager dashboard shell (sidebar, top nav with your employee ID, metric cards showing `—`).

**12. Test RBAC**
Still signed in as `manager.admin`, open a new tab to `http://localhost:3000/coder` directly. Expect: immediately redirected back to `/manager` — the frontend `RoleGuard` blocking cross-role navigation. Then, with a REST client (Postman/curl/Swagger UI at `http://localhost:4000/api/docs`), call `POST /api/team-leads/coders` **while authenticated as the Manager** (not a Team Lead). Expect: `403 Forbidden` — this is the backend's independent enforcement, the check that actually matters, confirming the hierarchy rule holds even when the frontend guard is bypassed entirely.

## First Login

After seeding, sign in at `http://localhost:3000/login` with the `manager.admin` login name and the password you set via `SEED_MANAGER_PASSWORD`. From there: Manager creates a Team Lead → Team Lead creates a Coder, per the approved hierarchy in `docs/03-RBAC-PERMISSIONS.md`.
