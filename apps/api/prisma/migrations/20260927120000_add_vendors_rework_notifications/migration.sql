-- SmartCode: Vendors, Vendor assignments, Rework tracking, notification
-- links and password-change session invalidation.
--
-- Forward-only and additive: new enum value, new enum, new tables,
-- nullable columns on existing tables and new indexes. No existing
-- column, row, constraint or index is changed or removed, so it applies
-- to a populated database without a reset.

-- AlterEnum
ALTER TYPE "RoleName" ADD VALUE 'VENDOR';

-- CreateEnum
CREATE TYPE "ReworkStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'REAUDITED', 'WITHDRAWN');

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "entity" TEXT,
ADD COLUMN     "entityId" TEXT,
ADD COLUMN     "readAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "passwordChangedAt" TIMESTAMP(3),
ADD COLUMN     "vendorId" TEXT;

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorAssignment" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "RoleName" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedById" TEXT,
    "removedAt" TIMESTAMP(3),
    "removedById" TEXT,

    CONSTRAINT "VendorAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rework" (
    "id" TEXT NOT NULL,
    "chartId" TEXT NOT NULL,
    "auditEntryId" TEXT NOT NULL,
    "originalProductionId" TEXT NOT NULL,
    "reworkProductionId" TEXT,
    "reauditEntryId" TEXT,
    "coderId" TEXT NOT NULL,
    "auditorId" TEXT NOT NULL,
    "teamId" TEXT,
    "teamLeadId" TEXT,
    "projectId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ReworkStatus" NOT NULL DEFAULT 'OPEN',
    "resolutionNote" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "reauditedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rework_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_name_key" ON "Vendor"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_code_key" ON "Vendor"("code");

-- CreateIndex
CREATE INDEX "VendorAssignment_vendorId_isActive_idx" ON "VendorAssignment"("vendorId", "isActive");

-- CreateIndex
CREATE INDEX "VendorAssignment_userId_isActive_idx" ON "VendorAssignment"("userId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Rework_auditEntryId_key" ON "Rework"("auditEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "Rework_reworkProductionId_key" ON "Rework"("reworkProductionId");

-- CreateIndex
CREATE INDEX "Rework_status_idx" ON "Rework"("status");

-- CreateIndex
CREATE INDEX "Rework_coderId_status_idx" ON "Rework"("coderId", "status");

-- CreateIndex
CREATE INDEX "Rework_teamId_status_idx" ON "Rework"("teamId", "status");

-- CreateIndex
CREATE INDEX "Rework_auditorId_status_idx" ON "Rework"("auditorId", "status");

-- CreateIndex
CREATE INDEX "Rework_chartId_idx" ON "Rework"("chartId");

-- CreateIndex
CREATE INDEX "Rework_originalProductionId_idx" ON "Rework"("originalProductionId");

-- CreateIndex
CREATE INDEX "Rework_createdAt_idx" ON "Rework"("createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_userId_type_entityId_key" ON "Notification"("userId", "type", "entityId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorAssignment" ADD CONSTRAINT "VendorAssignment_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorAssignment" ADD CONSTRAINT "VendorAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorAssignment" ADD CONSTRAINT "VendorAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorAssignment" ADD CONSTRAINT "VendorAssignment_removedById_fkey" FOREIGN KEY ("removedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rework" ADD CONSTRAINT "Rework_chartId_fkey" FOREIGN KEY ("chartId") REFERENCES "Chart"("chartId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rework" ADD CONSTRAINT "Rework_auditEntryId_fkey" FOREIGN KEY ("auditEntryId") REFERENCES "AuditEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rework" ADD CONSTRAINT "Rework_originalProductionId_fkey" FOREIGN KEY ("originalProductionId") REFERENCES "ProductionEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rework" ADD CONSTRAINT "Rework_reworkProductionId_fkey" FOREIGN KEY ("reworkProductionId") REFERENCES "ProductionEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rework" ADD CONSTRAINT "Rework_reauditEntryId_fkey" FOREIGN KEY ("reauditEntryId") REFERENCES "AuditEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rework" ADD CONSTRAINT "Rework_coderId_fkey" FOREIGN KEY ("coderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rework" ADD CONSTRAINT "Rework_auditorId_fkey" FOREIGN KEY ("auditorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rework" ADD CONSTRAINT "Rework_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rework" ADD CONSTRAINT "Rework_teamLeadId_fkey" FOREIGN KEY ("teamLeadId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rework" ADD CONSTRAINT "Rework_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rework" ADD CONSTRAINT "Rework_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- SmartCode (manual, not expressible in the Prisma DSL - same approach as
-- 20260926111717_add_current_production_unique_index):
-- a user can hold at most ONE active vendor assignment, so a Team Lead or
-- Auditor can never be active in two vendors at once. Ended assignments
-- (isActive = false) are kept as history and are not constrained.
CREATE UNIQUE INDEX "VendorAssignment_userId_active_unique"
  ON "VendorAssignment" ("userId")
  WHERE "isActive" = true;

-- SmartCode (manual): at most one live rework (open, in progress or
-- awaiting re-audit) per chart.
CREATE UNIQUE INDEX "Rework_chartId_live_unique"
  ON "Rework" ("chartId")
  WHERE "status" IN ('OPEN', 'IN_PROGRESS', 'RESOLVED');
