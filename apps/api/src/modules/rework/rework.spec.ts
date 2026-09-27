import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '@smartcode/types';
import { ReworkService } from './rework.service';
import { linkReworkVersion, markReaudited, openRework, reworkReasonOrThrow, resolveRework, withdrawForOverturnedAudit } from './rework.workflow';

const auditor: AuthUser = { id: 'aud-1', employeeId: 'A', loginName: 'aud', email: 'a@x.local', role: 'AUDITOR', teamId: null, isActive: true };
const coder: AuthUser = { ...auditor, id: 'coder-1', role: 'CODER', teamId: 'team-1' };
const otherCoder: AuthUser = { ...coder, id: 'coder-2' };
const teamLead: AuthUser = { ...auditor, id: 'tl-1', role: 'TEAM_LEAD', teamId: 'team-1' };
const manager: AuthUser = { ...auditor, id: 'm', role: 'MANAGER' };
const vendor: AuthUser = { ...auditor, id: 'v', role: 'VENDOR', vendorId: 'vendor-a' };

function txMock() {
  return {
    $queryRaw: jest.fn().mockResolvedValue([]),
    productionEntry: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'p-1', version: 1, coderId: 'coder-1', coder: { teamId: 'team-1' },
        chart: { projectId: 'proj-1', project: { teamId: 'team-1', team: { teamLeadId: 'tl-1' } } },
      }),
      update: jest.fn().mockResolvedValue({}),
      create: jest.fn(async ({ data }) => ({ id: 'p-2', ...data })),
    },
    rework: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(async ({ data }) => ({ id: 'rw-1', ...data })),
      update: jest.fn(async ({ where, data }) => ({ id: where.id, ...data })),
    },
    notification: { createMany: jest.fn().mockResolvedValue({ count: 2 }), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
}
const logged = (tx: any) => tx.auditLog.create.mock.calls.map((c: any) => c[0].data.action);

describe('rework workflow (runs inside the audit / production transaction)', () => {
  it('requires a real rework reason', () => {
    expect(() => reworkReasonOrThrow(undefined)).toThrow(BadRequestException);
    expect(() => reworkReasonOrThrow('  ok ')).toThrow(/at least 3 characters/);
    expect(reworkReasonOrThrow('  Missing ICD  ')).toBe('Missing ICD');
  });

  it('opens a rework linked to chart, audit, version, coder, team, Team Lead, auditor and project; notifies Coder + Team Lead once', async () => {
    const tx: any = txMock();
    await openRework(tx, auditor, { id: 'au-1', chartId: 'CH-1', productionEntryId: 'p-1', auditorId: 'aud-1' }, 'Missing ICD');
    expect(tx.rework.create.mock.calls[0][0].data).toEqual({
      chartId: 'CH-1', auditEntryId: 'au-1', originalProductionId: 'p-1', coderId: 'coder-1', auditorId: 'aud-1',
      teamId: 'team-1', teamLeadId: 'tl-1', projectId: 'proj-1', reason: 'Missing ICD', status: 'OPEN',
    });
    const notes = tx.notification.createMany.mock.calls[0][0];
    expect(notes.skipDuplicates).toBe(true); // unique (userId, type, entityId) - replays can never double-notify
    expect(notes.data).toEqual([
      expect.objectContaining({ userId: 'coder-1', type: 'REWORK_REQUESTED', entity: 'Rework', entityId: 'rw-1' }),
      expect.objectContaining({ userId: 'tl-1', type: 'REWORK_REQUESTED', entity: 'Rework', entityId: 'rw-1' }),
    ]);
    expect(notes.data[0].message).toMatch(/Chart CH-1 \(version 1\) was sent back for rework: Missing ICD/);
    expect(logged(tx)).toEqual(['REWORK_CREATED']);
  });

  it('withdraws an earlier live rework on the chart before opening a new one (one live rework per chart)', async () => {
    const tx: any = txMock();
    tx.rework.findMany.mockResolvedValueOnce([{ id: 'old', chartId: 'CH-1', status: 'OPEN', coderId: 'coder-1', teamLeadId: 'tl-1' }]);
    await openRework(tx, auditor, { id: 'au-2', chartId: 'CH-1', productionEntryId: 'p-1', auditorId: 'aud-1' }, 'Still wrong');
    expect(tx.rework.update).toHaveBeenCalledWith({ where: { id: 'old' }, data: { status: 'WITHDRAWN' } });
    expect(logged(tx)).toEqual(['REWORK_WITHDRAWN', 'REWORK_CREATED']);
    expect(tx.rework.update.mock.invocationCallOrder[0]).toBeLessThan(tx.rework.create.mock.invocationCallOrder[0]);
  });

  it('links the Coder\'s new version and marks the rework IN_PROGRESS', async () => {
    const tx: any = txMock();
    tx.rework.findFirst.mockResolvedValueOnce({ id: 'rw-1', status: 'OPEN' });
    await linkReworkVersion(tx, coder, 'p-1', 'p-2');
    expect(tx.rework.findFirst).toHaveBeenCalledWith({ where: { originalProductionId: 'p-1', status: 'OPEN' } });
    expect(tx.rework.update).toHaveBeenCalledWith({ where: { id: 'rw-1' }, data: { reworkProductionId: 'p-2', status: 'IN_PROGRESS' } });
    expect(logged(tx)).toEqual(['REWORK_STARTED']);
  });

  it('resolves with a timestamp, notifies Team Lead (resolution) and Auditor (ready for re-audit), and clears the Coder\'s unread', async () => {
    const tx: any = txMock();
    await resolveRework(tx, coder, { id: 'rw-1', chartId: 'CH-1', teamLeadId: 'tl-1', auditorId: 'aud-1', status: 'IN_PROGRESS' }, 'Fixed ICD');
    const data = tx.rework.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ status: 'RESOLVED', resolvedById: 'coder-1', resolutionNote: 'Fixed ICD' });
    expect(data.resolvedAt).toBeInstanceOf(Date);
    const [tl, aud] = tx.notification.createMany.mock.calls.map((c: any) => c[0].data[0]);
    expect(tl).toMatchObject({ userId: 'tl-1', type: 'REWORK_RESOLVED' });
    expect(aud).toMatchObject({ userId: 'aud-1', type: 'REWORK_READY_FOR_REAUDIT' });
    expect(tx.notification.updateMany.mock.calls[0][0].where).toEqual({ entity: 'Rework', entityId: 'rw-1', userId: 'coder-1', isRead: false });
    expect(logged(tx)).toEqual(['REWORK_RESOLVED']);
  });

  it('marks REAUDITED when the corrected version gets its first audit, and withdraws when a re-audit overturns the rejection', async () => {
    const tx: any = txMock();
    tx.rework.findFirst.mockResolvedValueOnce({ id: 'rw-1', status: 'RESOLVED' });
    await markReaudited(tx, auditor, 'p-2', 'au-9');
    expect(tx.rework.update.mock.calls[0][0].data).toMatchObject({ status: 'REAUDITED', reauditEntryId: 'au-9' });
    tx.rework.findUnique.mockResolvedValueOnce({ id: 'rw-2', status: 'OPEN', chartId: 'CH-2', coderId: 'coder-1', teamLeadId: 'tl-1' });
    await withdrawForOverturnedAudit(tx, auditor, 'au-rejected');
    expect(tx.rework.update.mock.calls[1][0]).toEqual({ where: { id: 'rw-2' }, data: { status: 'WITHDRAWN' } });
    expect(logged(tx)).toEqual(['REWORK_REAUDIT_INITIATED', 'REWORK_WITHDRAWN']);
  });
});

describe('ReworkService', () => {
  let prisma: any;
  let tx: any;
  let service: ReworkService;
  const row = (over: Record<string, unknown> = {}) => ({
    id: 'rw-1', chartId: 'CH-1', status: 'OPEN', reason: 'Missing ICD', resolutionNote: null, createdAt: new Date(), updatedAt: new Date(),
    resolvedAt: null, reauditedAt: null, coderId: 'coder-1', auditorId: 'aud-1', teamLeadId: 'tl-1', originalProductionId: 'p-1', reworkProductionId: null,
    coder: { id: 'coder-1', fullName: 'Cody', employeeId: 'E1', loginName: 'cody' },
    auditor: { id: 'aud-1', fullName: 'Ava', employeeId: 'E2', loginName: 'ava' },
    teamLead: { id: 'tl-1', fullName: 'Tina', employeeId: 'E3', loginName: 'tina' }, resolvedBy: null,
    team: { id: 'team-1', name: 'Team One' }, project: { id: 'proj-1', name: 'Cardio', client: { id: 'cl', name: 'Acme' } },
    auditEntry: { id: 'au-1', status: 'REJECTED', auditDate: new Date('2026-09-02'), totalErrors: 3 },
    originalProduction: { id: 'p-1', version: 1, pageCount: 10, totalICDs: 4, totalDOS: 2, codedDate: new Date('2026-09-01'), remarks: null },
    reworkProduction: null,
    ...over,
  });

  beforeEach(() => {
    tx = txMock();
    tx.rework.findUnique.mockResolvedValue(row());
    tx.productionEntry.findUnique.mockImplementation(async ({ where }: any) =>
      where.id === 'p-1'
        ? { id: 'p-1', chartId: 'CH-1', coderId: 'coder-1', version: 1, isCurrent: true, status: 'COMPLETED', auditEntries: [{ status: 'REJECTED' }] }
        : { id: where.id, chartId: 'CH-1', version: 2, isCurrent: true, status: 'REWORK', pageCount: 10, totalICDs: 4, totalDOS: 2, codedDate: new Date('2026-09-01') },
    );
    prisma = {
      rework: {
        findMany: jest.fn().mockResolvedValue([row()]),
        findFirst: jest.fn().mockResolvedValue(row()),
        findUnique: jest.fn().mockResolvedValue(row()),
        count: jest.fn().mockResolvedValue(1),
      },
      notification: {
        findMany: jest.fn().mockResolvedValue([{ entityId: 'rw-1' }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn(),
        createMany: jest.fn(),
      },
      $transaction: jest.fn(async (fn: any) => fn(tx)),
    };
    service = new ReworkService(prisma);
  });

  it('scopes rework per role (backend-enforced)', () => {
    expect(service.scope(manager)).toEqual({});
    expect(service.scope(teamLead)).toEqual({ teamId: 'team-1' });
    expect(service.scope(coder)).toEqual({ coderId: 'coder-1' });
    expect(service.scope(auditor)).toEqual({ OR: [{ auditorId: 'aud-1' }, { project: { auditorAssignments: { some: { auditorId: 'aud-1' } } } }] });
    expect(service.scope(vendor)).toEqual({ project: { team: { teamLead: { vendorAssignments: { some: { vendorId: 'vendor-a', isActive: true } } } } } });
    expect(() => service.scope({ ...teamLead, teamId: null })).toThrow(ForbiddenException);
  });

  it('dashboard summary returns counts, unread and latest items - and never creates notifications', async () => {
    const s = await service.summary(teamLead);
    expect(s).toMatchObject({ open: 1, inProgress: 1, resolved: 1, reaudited: 1, unread: 1 });
    expect(s.recent[0]).toMatchObject({ chartId: 'CH-1', reason: 'Missing ICD', status: 'OPEN', unread: true, coder: { fullName: 'Cody' } });
    expect(prisma.notification.create).not.toHaveBeenCalled();
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
    expect(prisma.notification.findMany.mock.calls[0][0].where).toEqual({ userId: 'tl-1', isRead: false, entity: 'Rework' });
    // counts are always inside the caller's scope
    for (const [args] of prisma.rework.count.mock.calls) expect(args.where.AND[0].AND[0]).toEqual({ teamId: 'team-1' });
  });

  it('lists with pending/status/search filters AND-ed onto the scope', async () => {
    await service.list(coder, { page: 1, pageSize: 25, status: 'pending', search: ' CH ' } as any);
    expect(prisma.rework.findMany.mock.calls[0][0].where).toEqual({
      AND: [{ coderId: 'coder-1' }, { status: { in: ['OPEN', 'IN_PROGRESS'] } }, { chartId: { contains: 'CH', mode: 'insensitive' } }],
    });
  });

  it('404s outside scope and marks only the caller\'s own notifications read', async () => {
    prisma.rework.findFirst.mockResolvedValueOnce(null);
    await expect(service.get(otherCoder, 'rw-1')).rejects.toThrow(NotFoundException);
    await service.markRead(teamLead, 'rw-1');
    expect(prisma.notification.updateMany.mock.calls[0][0].where).toEqual({ userId: 'tl-1', entity: 'Rework', entityId: 'rw-1', isRead: false });
  });

  describe('resolve (Coder)', () => {
    const dto = { pageCount: 11, totalICDs: 5, totalDOS: 2, codedDate: '2026-09-01', remarks: '', resolutionNote: ' Added the missing ICD ' };

    it('only the owning Coder, only while OPEN / IN_PROGRESS, with a real resolution note', async () => {
      await expect(service.resolve(teamLead, 'rw-1', dto)).rejects.toThrow(ForbiddenException);
      await expect(service.resolve(otherCoder, 'rw-1', dto)).rejects.toThrow(NotFoundException);
      prisma.rework.findUnique.mockResolvedValueOnce(row({ status: 'RESOLVED' }));
      await expect(service.resolve(coder, 'rw-1', dto)).rejects.toThrow(ConflictException);
      await expect(service.resolve(coder, 'rw-1', { ...dto, resolutionNote: '   ' })).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('OPEN: creates the corrected version (audited version kept as history) and resolves', async () => {
      await service.resolve(coder, 'rw-1', dto);
      expect(tx.productionEntry.update).toHaveBeenCalledWith({ where: { id: 'p-1' }, data: { isCurrent: false } });
      expect(tx.productionEntry.update.mock.calls[0][0].data).not.toHaveProperty('status');
      expect(tx.productionEntry.create.mock.calls[0][0].data).toMatchObject({ chartId: 'CH-1', coderId: 'coder-1', version: 2, isCurrent: true, status: 'COMPLETED', pageCount: 11, totalICDs: 5, remarks: null });
      expect(tx.rework.update.mock.calls[0][0]).toEqual({ where: { id: 'rw-1' }, data: { reworkProductionId: 'p-2' } });
      expect(tx.rework.update.mock.calls[1][0].data).toMatchObject({ status: 'RESOLVED', resolutionNote: 'Added the missing ICD', resolvedById: 'coder-1' });
      expect(logged(tx)).toEqual(['REWORK_INITIATED', 'REWORK_RESOLVED', 'REWORK_RESOLVED']);
    });

    it('IN_PROGRESS: completes the existing correction version', async () => {
      tx.rework.findUnique.mockResolvedValueOnce(row({ status: 'IN_PROGRESS', reworkProductionId: 'p-2' }));
      prisma.rework.findUnique.mockResolvedValueOnce(row({ status: 'IN_PROGRESS', reworkProductionId: 'p-2' }));
      await service.resolve(coder, 'rw-1', dto);
      expect(tx.productionEntry.create).not.toHaveBeenCalled();
      expect(tx.productionEntry.update.mock.calls[0][0]).toMatchObject({ where: { id: 'p-2' }, data: { status: 'COMPLETED', pageCount: 11 } });
      expect(logged(tx)).toEqual(['PRODUCTION_UPDATED', 'REWORK_RESOLVED', 'REWORK_RESOLVED']);
    });

    it('refuses when the audited version is no longer current (someone else moved on)', async () => {
      tx.productionEntry.findUnique.mockResolvedValueOnce({ id: 'p-1', isCurrent: false, status: 'COMPLETED', auditEntries: [] });
      await expect(service.resolve(coder, 'rw-1', dto)).rejects.toThrow(/no longer current/);
    });
  });
});
