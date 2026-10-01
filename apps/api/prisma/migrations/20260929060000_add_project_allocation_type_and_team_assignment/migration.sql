-- SmartCode: Phase 10A - Project Allocation Type + Project<->Team
-- assignment history (docs/09-BUSINESS-RULES.md section 11). Forward-only:
-- one new enum, one new NOT NULL DEFAULT column on the existing "Project"
-- table (see the AlterTable comment immediately below for exactly what
-- this does and does NOT change), one new table with foreign keys only to
-- existing tables ("Project", "Team", "User"). No existing column,
-- constraint or index is changed, altered or removed, and no existing row
-- of any OTHER table is touched. Project.teamId is left completely
-- untouched - every existing scope query that reads it keeps working
-- exactly as before.
--
-- CORRECTION NOTE: an earlier draft of this top comment loosely described
-- the allocationType column as "nullable-default", which was imprecise and
-- could be misread as "existing rows are untouched." That is corrected
-- here - see the AlterTable comment below for the precise, sourced
-- explanation of what actually happens to every existing Project row.

-- CreateEnum
CREATE TYPE "ProjectAllocationType" AS ENUM ('MANUAL', 'AUTOMATIC');

-- AlterTable: this DOES write a value into every existing Project row -
-- NOT NULL DEFAULT 'AUTOMATIC' means Postgres backfills the new column to
-- 'AUTOMATIC' for every row that already exists, as part of this same
-- ALTER TABLE statement. This is a factual backfill from an authoritative
-- existing source, not a guess and not an invented classification:
--
--   SOURCE: apps/api/src/modules/production/production.service.ts, the
--   `if (!chart) await tx.chart.create(...)` call (as of this migration,
--   the ONLY Chart-creation code path that has ever existed in this
--   codebase prior to this phase's own new
--   ChartImportsService.commit - grep confirms exactly these two
--   call sites repo-wide). That path is unconditional - it does not
--   branch on any project flag, because no such flag existed before this
--   migration - so every Chart row, on every existing Project, was
--   necessarily created by it. MANUAL (client-file-driven allocation, via
--   ChartImportsService) did not exist as a concept or a code path before
--   this migration, so AUTOMATIC is not an inference about existing
--   projects - it is the only value that can be historically true of any
--   of them, proven by there being no other Chart-creation path any
--   existing Project could ever have used.
--
-- No project's runtime behaviour changes as a result of this backfill -
-- see schema.prisma's comment on this enum and docs/09-BUSINESS-RULES.md
-- "Project Allocation Type" for the same sourced explanation.
ALTER TABLE "Project" ADD COLUMN "allocationType" "ProjectAllocationType" NOT NULL DEFAULT 'AUTOMATIC';

-- CreateTable
CREATE TABLE "ProjectTeamAssignment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedById" TEXT,
    "unassignedAt" TIMESTAMP(3),
    "unassignedById" TEXT,

    CONSTRAINT "ProjectTeamAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (ordinary, non-unique - for history/list queries)
CREATE INDEX "ProjectTeamAssignment_projectId_isActive_idx" ON "ProjectTeamAssignment"("projectId", "isActive");

-- CreateIndex
CREATE INDEX "ProjectTeamAssignment_teamId_isActive_idx" ON "ProjectTeamAssignment"("teamId", "isActive");

-- CreatePartialUniqueIndex: at most one ACTIVE (isActive = true) team
-- assignment per Project at any time, matching Project.teamId's own
-- "one team at a time" semantics. Prisma's schema DSL cannot express a
-- partial (WHERE-filtered) unique index, so - exactly like
-- LoginNameAllocation's and VendorAssignment's equivalent invariants -
-- this is enforced here, directly in SQL, and documented on the
-- ProjectTeamAssignment model in schema.prisma.
CREATE UNIQUE INDEX "ProjectTeamAssignment_projectId_active_key"
    ON "ProjectTeamAssignment"("projectId")
    WHERE "isActive" = true;

-- AddForeignKey
ALTER TABLE "ProjectTeamAssignment" ADD CONSTRAINT "ProjectTeamAssignment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTeamAssignment" ADD CONSTRAINT "ProjectTeamAssignment_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey ("assignedById"/"unassignedById" nullable: a caller is
-- always a real Manager in application code today, but SET NULL - not
-- RESTRICT - mirrors this schema's other "who did this" actor columns
-- (AuditLog.userId, LoginNameAllocation.allocatedById) so a later user
-- deletion, if ever implemented, can never be blocked by old history.)
ALTER TABLE "ProjectTeamAssignment" ADD CONSTRAINT "ProjectTeamAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTeamAssignment" ADD CONSTRAINT "ProjectTeamAssignment_unassignedById_fkey" FOREIGN KEY ("unassignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
