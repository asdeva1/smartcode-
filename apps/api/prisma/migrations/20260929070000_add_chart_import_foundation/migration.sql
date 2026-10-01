-- SmartCode: Phase 10B - Client File Driven Chart Import foundation
-- (docs/09-BUSINESS-RULES.md section 11). Forward-only and additive: two
-- new enums and four new tables. No existing column, row, constraint or
-- index on any pre-existing table is changed, altered or removed, and
-- Chart.chartId's existing global @unique constraint is untouched - a
-- client ChartID that already exists anywhere is rejected by the
-- application layer before it ever reaches this migration's tables (see
-- ChartImportsService), not by a new DB constraint, so no migration-time
-- backfill/cleanup of Chart is required here.
--
-- CORRECTED per architecture review (superseding an earlier draft of this
-- migration that added pageCount/pageBucket/textbox9/eventTypeName2/
-- highLevelStatus/templateVersionId columns directly onto "Chart", and
-- collapsed "Template"/"TemplateVersion" into one table under Project).
-- This migration has never been applied to any database, so it is revised
-- in place rather than superseded by a second migration - see
-- docs/09-BUSINESS-RULES.md for the corrected Project -> Template ->
-- TemplateVersion -> Import -> ImportRow -> Chart lineage this now
-- implements:
--   - "ChartImportTemplate" (NEW): one row per Project, created lazily.
--   - "ChartImportTemplateVersion": now belongs to ChartImportTemplate
--     (templateId), not directly to Project.
--   - "ChartImportRow" (NEW): the actual per-import source-of-truth for a
--     chart's client-provided attribute values - INSERT-only, one row per
--     (import, chart) pair, so a later re-import of the same ChartID can
--     never overwrite or destroy a prior import's values, and a Chart's
--     production/audit/rework history is never at risk of being touched by
--     a re-import.
--   - "Chart" gains only ONE new nullable column, "sourceImportId" - a
--     lightweight, non-destructive "most recent import" pointer, refreshed
--     on every (re-)import. It is never the source of truth for historical
--     attribute values (ChartImportRow is).

-- CreateEnum
CREATE TYPE "ChartImportFileType" AS ENUM ('CSV', 'XLSX');

-- CreateEnum: PROCESSING is deliberately not a member - see this enum's
-- comment in schema.prisma for why (a commit's writes are one transaction;
-- there is no client-observable intermediate state to name).
CREATE TYPE "ChartImportStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REJECTED');

-- CreateTable
CREATE TABLE "ChartImportTemplate" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChartImportTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: one Template per Project.
CREATE UNIQUE INDEX "ChartImportTemplate_projectId_key" ON "ChartImportTemplate"("projectId");

-- AddForeignKey
ALTER TABLE "ChartImportTemplate" ADD CONSTRAINT "ChartImportTemplate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "ChartImportTemplateVersion" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "headers" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "ChartImportTemplateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChartImportTemplateVersion_templateId_version_key" ON "ChartImportTemplateVersion"("templateId", "version");

-- CreateIndex
CREATE INDEX "ChartImportTemplateVersion_templateId_isActive_idx" ON "ChartImportTemplateVersion"("templateId", "isActive");

-- AddForeignKey
ALTER TABLE "ChartImportTemplateVersion" ADD CONSTRAINT "ChartImportTemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ChartImportTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChartImportTemplateVersion" ADD CONSTRAINT "ChartImportTemplateVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "ChartImport" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "templateVersionId" TEXT,
    "fileName" TEXT NOT NULL,
    "fileType" "ChartImportFileType" NOT NULL,
    "status" "ChartImportStatus" NOT NULL DEFAULT 'PENDING',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "validRows" INTEGER NOT NULL DEFAULT 0,
    "invalidRows" INTEGER NOT NULL DEFAULT 0,
    "duplicateRows" INTEGER NOT NULL DEFAULT 0,
    "successRows" INTEGER NOT NULL DEFAULT 0,
    "failedRows" INTEGER NOT NULL DEFAULT 0,
    "errorSummary" JSONB,
    "importedById" TEXT,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChartImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChartImport_projectId_importedAt_idx" ON "ChartImport"("projectId", "importedAt");

-- CreateIndex
CREATE INDEX "ChartImport_status_idx" ON "ChartImport"("status");

-- AddForeignKey
ALTER TABLE "ChartImport" ADD CONSTRAINT "ChartImport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChartImport" ADD CONSTRAINT "ChartImport_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "ChartImportTemplateVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChartImport" ADD CONSTRAINT "ChartImport_importedById_fkey" FOREIGN KEY ("importedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: the actual per-import source-of-truth for a chart's
-- client-provided attribute values (see schema.prisma comment). INSERT-only
-- at the application layer - a re-import of the same ChartID always
-- creates a NEW row here rather than updating an existing one.
CREATE TABLE "ChartImportRow" (
    "id" TEXT NOT NULL,
    "chartImportId" TEXT NOT NULL,
    "templateVersionId" TEXT NOT NULL,
    "chartId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "pageCount" INTEGER NOT NULL,
    "pageBucket" TEXT,
    "textbox9" TEXT,
    "eventTypeName2" TEXT,
    "highLevelStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChartImportRow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChartImportRow_chartImportId_idx" ON "ChartImportRow"("chartImportId");

-- CreateIndex
CREATE INDEX "ChartImportRow_chartId_createdAt_idx" ON "ChartImportRow"("chartId", "createdAt");

-- AddForeignKey
ALTER TABLE "ChartImportRow" ADD CONSTRAINT "ChartImportRow_chartImportId_fkey" FOREIGN KEY ("chartImportId") REFERENCES "ChartImport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChartImportRow" ADD CONSTRAINT "ChartImportRow_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "ChartImportTemplateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: references Chart(chartId), not Chart(id) - mirrors the
-- existing ProductionEntry -> Chart(chartId) foreign key already used
-- elsewhere in this schema.
ALTER TABLE "ChartImportRow" ADD CONSTRAINT "ChartImportRow_chartId_fkey" FOREIGN KEY ("chartId") REFERENCES "Chart"("chartId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: Chart gains exactly ONE new nullable column - a "most recent
-- import" provenance pointer only (see schema.prisma comment on this
-- field). Existing Chart rows (created the AUTOMATIC/pre-Phase-10 way)
-- simply get NULL here, and nothing else on Chart changes.
ALTER TABLE "Chart" ADD COLUMN "sourceImportId" TEXT;

-- CreateIndex
CREATE INDEX "Chart_sourceImportId_idx" ON "Chart"("sourceImportId");

-- AddForeignKey
ALTER TABLE "Chart" ADD CONSTRAINT "Chart_sourceImportId_fkey" FOREIGN KEY ("sourceImportId") REFERENCES "ChartImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;
