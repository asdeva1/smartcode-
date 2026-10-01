-- SmartCode: Phase 10D - Chart Allocation (Manager Summary export ->
-- Team Lead Login-Name allocation upload -> Coder Production visibility).
-- Forward-only: two new tables, one new enum, and one ALTER TABLE that
-- only ADDS foreign-key constraints to Chart's three pre-existing,
-- previously-unconstrained "assignedCoderId"/"assignedById" scalar
-- columns (added in Phase 10A-10B, reserved and unused until now - see
-- schema.prisma's comment on Chart). No column is dropped, renamed or
-- retyped, no existing row of any OTHER table is touched, and no existing
-- constraint or index is changed or removed.

-- CreateTable
CREATE TABLE "ChartAllocationImport" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
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

    CONSTRAINT "ChartAllocationImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChartAllocationImport_projectId_importedAt_idx" ON "ChartAllocationImport"("projectId", "importedAt");

-- CreateIndex
CREATE INDEX "ChartAllocationImport_status_idx" ON "ChartAllocationImport"("status");

-- AddForeignKey
ALTER TABLE "ChartAllocationImport" ADD CONSTRAINT "ChartAllocationImport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey (nullable, SET NULL - mirrors ChartImport.importedById's
-- own "who did this" actor-column convention)
ALTER TABLE "ChartAllocationImport" ADD CONSTRAINT "ChartAllocationImport_importedById_fkey" FOREIGN KEY ("importedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "ChartAllocationEndReason" AS ENUM ('PULLED_BACK', 'REASSIGNED');

-- CreateTable
CREATE TABLE "ChartAllocation" (
    "id" TEXT NOT NULL,
    "chartId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "coderId" TEXT NOT NULL,
    "loginNameSnapshot" TEXT NOT NULL,
    "vendorId" TEXT,
    "teamId" TEXT,
    "teamLeadId" TEXT,
    "assignedById" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceImportId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "endedAt" TIMESTAMP(3),
    "endedById" TEXT,
    "endReason" "ChartAllocationEndReason",
    "endNote" TEXT,
    "previousAllocationId" TEXT,

    CONSTRAINT "ChartAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChartAllocation_previousAllocationId_key" ON "ChartAllocation"("previousAllocationId");

-- CreateIndex (ordinary, non-unique - history/list queries)
CREATE INDEX "ChartAllocation_chartId_isActive_idx" ON "ChartAllocation"("chartId", "isActive");

-- CreateIndex
CREATE INDEX "ChartAllocation_coderId_isActive_idx" ON "ChartAllocation"("coderId", "isActive");

-- CreateIndex
CREATE INDEX "ChartAllocation_projectId_isActive_idx" ON "ChartAllocation"("projectId", "isActive");

-- CreateIndex
CREATE INDEX "ChartAllocation_teamId_isActive_idx" ON "ChartAllocation"("teamId", "isActive");

-- CreatePartialUniqueIndex: at most one ACTIVE (isActive = true) allocation
-- per chartId at any time - this is the actual database-level guarantee
-- behind "prevent duplicate active allocation" / "never silently overwrite
-- an active allocation" (docs/09-BUSINESS-RULES.md section 12). Prisma's
-- schema DSL cannot express a partial (WHERE-filtered) unique index, so -
-- exactly like ProjectTeamAssignment/VendorAssignment/LoginNameAllocation's
-- equivalent invariants above - this is enforced here, directly in SQL.
-- A concurrent commit/reassign race that would violate this raises a
-- Postgres unique-violation (code P2002 at the Prisma layer), which
-- ChartAllocationsService maps to a 409 Conflict rather than a false
-- success - the exact same pattern ChartImportsService already uses for
-- its own concurrent-duplicate-ChartID race (see chart-imports.service.ts).
CREATE UNIQUE INDEX "ChartAllocation_chartId_active_key"
    ON "ChartAllocation"("chartId")
    WHERE "isActive" = true;

-- AddForeignKey
ALTER TABLE "ChartAllocation" ADD CONSTRAINT "ChartAllocation_chartId_fkey" FOREIGN KEY ("chartId") REFERENCES "Chart"("chartId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChartAllocation" ADD CONSTRAINT "ChartAllocation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChartAllocation" ADD CONSTRAINT "ChartAllocation_coderId_fkey" FOREIGN KEY ("coderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChartAllocation" ADD CONSTRAINT "ChartAllocation_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChartAllocation" ADD CONSTRAINT "ChartAllocation_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChartAllocation" ADD CONSTRAINT "ChartAllocation_teamLeadId_fkey" FOREIGN KEY ("teamLeadId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey (actor column - a caller is always a real Team Lead in
-- application code today, but SET NULL, not RESTRICT, mirrors this
-- schema's other "who did this" actor columns)
ALTER TABLE "ChartAllocation" ADD CONSTRAINT "ChartAllocation_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChartAllocation" ADD CONSTRAINT "ChartAllocation_sourceImportId_fkey" FOREIGN KEY ("sourceImportId") REFERENCES "ChartAllocationImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChartAllocation" ADD CONSTRAINT "ChartAllocation_endedById_fkey" FOREIGN KEY ("endedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey (self-reference: the reassignment chain - the allocation
-- row a given row replaced)
ALTER TABLE "ChartAllocation" ADD CONSTRAINT "ChartAllocation_previousAllocationId_fkey" FOREIGN KEY ("previousAllocationId") REFERENCES "ChartAllocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: wires up Chart.assignedCoderId/assignedById - added in
-- Phase 10A-10B as plain, unconstrained scalar columns (reserved for this
-- phase - see schema.prisma) - to real foreign keys now that they are
-- actually written to. No existing Chart row currently has either column
-- set to anything but NULL (grep-confirmed: no service ever wrote to them
-- before this phase), so adding these constraints cannot fail against any
-- existing data.
ALTER TABLE "Chart" ADD CONSTRAINT "Chart_assignedCoderId_fkey" FOREIGN KEY ("assignedCoderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chart" ADD CONSTRAINT "Chart_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
