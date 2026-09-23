-- SmartCode — manually-required database constraint
-- ===================================================
-- This file is NOT a Prisma migration and must never be applied on its
-- own or placed directly inside apps/api/prisma/migrations/. It exists
-- only as a copy-paste reference for the one step in README.md's
-- "Database Setup" section that Prisma's schema.prisma DSL cannot
-- express. (Lives alongside schema.prisma under apps/api/prisma/ - see
-- that file's header comment for why the schema moved here from the
-- repo root during the Phase 1 Docker review.)
--
-- WHY THIS CONSTRAINT EXISTS
-- --------------------------
-- Per docs/11-SCHEMA-DECISIONS.md (Question 1, approved): a Chart may have
-- multiple ProductionEntry versions (created via the rework flow - see
-- docs/09-BUSINESS-RULES.md), but at any moment exactly ONE version may be
-- marked isCurrent = true. Prisma's schema.prisma can express a unique
-- constraint on a column, or on a fixed combination of columns, but not a
-- *conditional* ("partial") unique constraint - "unique WHERE isCurrent =
-- true" - so this has to be added as raw SQL. This is the same database
-- rule Prisma's own docs point to for anything a partial index is needed
-- for: generate the migration normally, then hand-edit the generated
-- migration.sql to add this statement before applying it.
--
-- HOW TO APPLY THIS (see README.md "Database Setup" for the full sequence)
-- --------------------------------------------------------------------
--   1. pnpm --filter @smartcode/api exec prisma migrate dev --schema=./prisma/schema.prisma --name init --create-only
--   2. Open the generated apps/api/prisma/migrations/<timestamp>_init/migration.sql
--   3. Paste the statement below at the END of that file
--   4. pnpm --filter @smartcode/api exec prisma migrate dev --schema=./prisma/schema.prisma
--      (applies the now-edited migration)
--
-- INDEX NAME: ProductionEntry_chartId_current_unique
-- TABLE:      "ProductionEntry"
-- COLUMNS:    "chartId", filtered on "isCurrent" = true

CREATE UNIQUE INDEX "ProductionEntry_chartId_current_unique"
  ON "ProductionEntry" ("chartId")
  WHERE "isCurrent" = true;

-- This has not been executed against a live database in this review - no
-- Postgres instance was available in the sandbox this was written in.
-- Its syntax matches standard PostgreSQL partial-index DDL (CREATE [UNIQUE]
-- INDEX ... ON table (columns) WHERE condition); verify it applies cleanly
-- as the final step of your local "Database Setup" and treat that as part
-- of Phase 1 sign-off, not an assumption.
