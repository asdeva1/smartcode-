import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AuthUser, NotificationType } from '@smartcode/types';
import { writeAuditLog } from '../../common/audit-log';

/**
 * Rework state transitions, shared by AuditsService, ProductionService and
 * ReworkService. Every function takes the caller's transaction client so
 * the rework row, its notifications and its audit-log entries commit (or
 * roll back) together with the audit / production write that caused them.
 *
 * Notifications are written ONLY here, on the business event itself -
 * never when a dashboard reads data - and the (userId, type, entityId)
 * unique key plus skipDuplicates means an event can never notify the same
 * person twice even if it is replayed.
 */
type Tx = Prisma.TransactionClient;

/** Statuses in which a chart still has a live rework (mirrors the partial unique index). */
export const LIVE_REWORK = ['OPEN', 'IN_PROGRESS', 'RESOLVED'] as const;

/** An Auditor's "Rework" decision must say why. Used for create, update, re-audit, resolve and CSV import. */
export function reworkReasonOrThrow(remarks: string | null | undefined): string {
  const reason = remarks?.trim() ?? '';
  if (reason.length < 3) {
    throw new BadRequestException('A rework reason is required: enter it in Remarks (at least 3 characters)');
  }
  return reason;
}

export function hasReworkReason(remarks: string | null | undefined): boolean {
  return (remarks?.trim().length ?? 0) >= 3;
}

async function notify(
  tx: Tx,
  recipients: (string | null | undefined)[],
  type: NotificationType,
  reworkId: string,
  message: string,
) {
  const userIds = [...new Set(recipients.filter((r): r is string => !!r))];
  if (userIds.length === 0) return;
  await tx.notification.createMany({
    data: userIds.map((userId) => ({ userId, type, message, entity: 'Rework', entityId: reworkId })),
    skipDuplicates: true,
  });
}

/**
 * A REJECTED ("Rework") audit opens a rework on the audited version:
 * links chart, audit, version, coder, team, Team Lead, auditor and
 * project, and notifies the Coder and Team Lead. Any earlier OPEN rework
 * for the same version (a rejection that was re-audited and rejected
 * again) is withdrawn first so there is only ever one live rework.
 */
export async function openRework(
  tx: Tx,
  caller: Pick<AuthUser, 'id' | 'role'>,
  audit: { id: string; chartId: string; productionEntryId: string; auditorId: string },
  reason: string,
) {
  const production = await tx.productionEntry.findUnique({
    where: { id: audit.productionEntryId },
    select: {
      id: true,
      version: true,
      coderId: true,
      coder: { select: { teamId: true } },
      chart: { select: { projectId: true, project: { select: { teamId: true, team: { select: { teamLeadId: true } } } } } },
    },
  });
  if (!production) return null;

  await withdrawLive(tx, caller, audit.chartId, 'superseded by a newer rework decision');

  const teamId = production.chart.project.teamId ?? production.coder.teamId ?? null;
  const teamLeadId = production.chart.project.team?.teamLeadId ?? null;
  const rework = await tx.rework.create({
    data: {
      chartId: audit.chartId,
      auditEntryId: audit.id,
      originalProductionId: production.id,
      coderId: production.coderId,
      auditorId: audit.auditorId,
      teamId,
      teamLeadId,
      projectId: production.chart.projectId,
      reason,
      status: 'OPEN',
    },
  });
  await writeAuditLog(tx, caller, 'REWORK_CREATED', 'Rework', rework.id, {
    after: { chartId: audit.chartId, auditId: audit.id, version: production.version, coderId: production.coderId, teamId, reason },
  });
  await notify(
    tx,
    [production.coderId, teamLeadId],
    'REWORK_REQUESTED',
    rework.id,
    `Chart ${audit.chartId} (version ${production.version}) was sent back for rework: ${reason}`,
  );
  return rework;
}

/** Withdraws any live rework on the chart that has not been resolved yet (OPEN / IN_PROGRESS on the old version). */
async function withdrawLive(tx: Tx, caller: Pick<AuthUser, 'id' | 'role'>, chartId: string, why: string) {
  const live = await tx.rework.findMany({ where: { chartId, status: { in: ['OPEN', 'IN_PROGRESS'] } } });
  for (const r of live) {
    await tx.rework.update({ where: { id: r.id }, data: { status: 'WITHDRAWN' } });
    await writeAuditLog(tx, caller, 'REWORK_WITHDRAWN', 'Rework', r.id, { before: { status: r.status }, after: { status: 'WITHDRAWN', reason: why } });
    await notify(tx, [r.coderId, r.teamLeadId], 'REWORK_WITHDRAWN', r.id, `Rework for chart ${r.chartId} was withdrawn (${why}).`);
  }
}

/**
 * A re-audit of the SAME version that does not reject again overturns the
 * rejection: the OPEN rework raised by the earlier audit is withdrawn.
 */
export async function withdrawForOverturnedAudit(tx: Tx, caller: Pick<AuthUser, 'id' | 'role'>, rejectedAuditId: string) {
  const r = await tx.rework.findUnique({ where: { auditEntryId: rejectedAuditId } });
  if (!r || r.status !== 'OPEN') return;
  await tx.rework.update({ where: { id: r.id }, data: { status: 'WITHDRAWN' } });
  await writeAuditLog(tx, caller, 'REWORK_WITHDRAWN', 'Rework', r.id, {
    before: { status: 'OPEN' },
    after: { status: 'WITHDRAWN', reason: 're-audit overturned the rejection' },
  });
  await notify(tx, [r.coderId, r.teamLeadId], 'REWORK_WITHDRAWN', r.id, `Rework for chart ${r.chartId} is no longer needed - the re-audit accepted the original version.`);
}

/** The Coder started correcting: the new REWORK version is linked and the rework is IN_PROGRESS. */
export async function linkReworkVersion(
  tx: Tx,
  caller: Pick<AuthUser, 'id' | 'role'>,
  originalProductionId: string,
  reworkProductionId: string,
) {
  const r = await tx.rework.findFirst({ where: { originalProductionId, status: 'OPEN' } });
  if (!r) return null;
  const updated = await tx.rework.update({ where: { id: r.id }, data: { reworkProductionId, status: 'IN_PROGRESS' } });
  await writeAuditLog(tx, caller, 'REWORK_STARTED', 'Rework', r.id, {
    before: { status: 'OPEN' },
    after: { status: 'IN_PROGRESS', reworkProductionId },
  });
  return updated;
}

/**
 * The corrected version was completed: rework RESOLVED with a timestamp
 * (the original audit and version are untouched), Team Lead and Auditor
 * notified, and the chart now shows in the Auditor queue as a re-audit.
 */
export async function resolveRework(
  tx: Tx,
  caller: Pick<AuthUser, 'id' | 'role'>,
  rework: { id: string; chartId: string; teamLeadId: string | null; auditorId: string; status: string },
  resolutionNote: string | null,
) {
  const resolvedAt = new Date();
  const updated = await tx.rework.update({
    where: { id: rework.id },
    data: { status: 'RESOLVED', resolvedAt, resolvedById: caller.id, resolutionNote },
  });
  await writeAuditLog(tx, caller, 'REWORK_RESOLVED', 'Rework', rework.id, {
    before: { status: rework.status },
    after: { status: 'RESOLVED', resolvedAt: resolvedAt.toISOString(), resolutionNote },
  });
  await notify(tx, [rework.teamLeadId], 'REWORK_RESOLVED', rework.id, `Rework for chart ${rework.chartId} was resolved by the Coder.`);
  await notify(tx, [rework.auditorId], 'REWORK_READY_FOR_REAUDIT', rework.id, `Chart ${rework.chartId} was reworked and is ready for re-audit.`);
  // The Coder has acted on it - their own notification is no longer unread.
  await tx.notification.updateMany({
    where: { entity: 'Rework', entityId: rework.id, userId: caller.id, isRead: false },
    data: { isRead: true, readAt: resolvedAt },
  });
  return updated;
}

/** First audit recorded on a corrected version: the rework is REAUDITED (re-audit initiated). */
export async function markReaudited(tx: Tx, caller: Pick<AuthUser, 'id' | 'role'>, productionEntryId: string, auditId: string) {
  const r = await tx.rework.findFirst({ where: { reworkProductionId: productionEntryId, status: 'RESOLVED' } });
  if (!r) return null;
  const updated = await tx.rework.update({
    where: { id: r.id },
    data: { status: 'REAUDITED', reauditedAt: new Date(), reauditEntryId: auditId },
  });
  await writeAuditLog(tx, caller, 'REWORK_REAUDIT_INITIATED', 'Rework', r.id, {
    before: { status: 'RESOLVED' },
    after: { status: 'REAUDITED', reauditEntryId: auditId },
  });
  return updated;
}
