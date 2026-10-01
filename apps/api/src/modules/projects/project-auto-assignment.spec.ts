import { Test } from '@nestjs/testing';
import type { AuthUser } from '@smartcode/types';
import { ProjectsService } from './projects.service';
import { VendorsService } from '../vendors/vendors.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * docs/09-BUSINESS-RULES.md "Project Auto-Assignment" (section 18's test
 * items 7-10). The business rule is: Manager -> Project -> Team Lead ->
 * every active Coder under that Team Lead - and it is intentionally NOT
 * a new/duplicate structure. Project.teamId (already in the schema) IS
 * the assignment; a Coder inherits it purely by having that same teamId
 * (see common/scope.ts chartScope/productionScope/auditScope and
 * ProjectsService.mine()) - nothing is ever copied onto the Coder row.
 * These tests prove that chain end-to-end rather than re-testing
 * mine()/chartScope in isolation (already covered elsewhere).
 */
const manager: AuthUser = { id: 'm', employeeId: 'E', loginName: 'm', email: 'm@x.local', role: 'MANAGER', teamId: null, isActive: true };
const TEAM = 'team-tl01';
const V = 'vendor-a';

describe('Project auto-assignment: Manager -> Project -> Team Lead -> every active Coder', () => {
  let projects: ProjectsService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      client: { findUnique: jest.fn().mockResolvedValue({ id: 'cl' }) },
      project: {
        findUnique: jest.fn().mockResolvedValue({ id: 'p-001', teamId: null }),
        update: jest.fn(async ({ data }) => ({ id: 'p-001', name: 'Project 001', isActive: true, client: { id: 'cl', name: 'Client ABC' }, team: { id: TEAM, name: 'TL-01 Team' }, _count: { charts: 0, auditorAssignments: 0 }, ...data })),
        findMany: jest.fn().mockResolvedValue([{ id: 'p-001', name: 'Project 001', client: { id: 'cl', name: 'Client ABC' } }]),
      },
      team: { findUnique: jest.fn().mockResolvedValue({ id: TEAM }) },
      vendorAssignment: { findFirst: jest.fn().mockResolvedValue(null) },
      auditorProjectAssignment: { findMany: jest.fn().mockResolvedValue([]) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      // ProjectsService.updateProject() now wraps a team-changing assignment
      // in a Prisma transaction (Phase 10A ProjectTeamAssignment history) via
      // closeAndOpenTeamAssignment(), which reads/writes
      // projectTeamAssignment and calls tx.project.update - $transaction
      // here runs the callback against this same `prisma` object (tx ===
      // prisma), matching the pattern used elsewhere in this codebase.
      projectTeamAssignment: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'pta-1' }),
        update: jest.fn(),
      },
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(prisma)),
    };
    const moduleRef = await Test.createTestingModule({ providers: [ProjectsService, { provide: PrismaService, useValue: prisma }] }).compile();
    projects = moduleRef.get(ProjectsService);
  });

  it('[item 7] Manager assigns Project 001 to Team Lead TL-01 (Project.teamId = TL-01\'s team) - idempotent, no duplicate row created', async () => {
    const result = await projects.updateProject(manager, 'p-001', { teamId: TEAM } as any);
    expect(prisma.project.update.mock.calls[0][0]).toMatchObject({ where: { id: 'p-001' }, data: { teamId: TEAM } });
    expect(result.team).toEqual({ id: TEAM, name: 'TL-01 Team' });

    // Running the exact same assignment again is a no-op update, not a second row -
    // there is no assignment table to accumulate duplicates in.
    const crossVendorChecksAfterFirstAssign = prisma.auditorProjectAssignment.findMany.mock.calls.length;
    const projectUpdateCallsAfterFirstAssign = prisma.project.update.mock.calls.length;
    prisma.project.findUnique.mockResolvedValueOnce({ id: 'p-001', teamId: TEAM });
    await projects.updateProject(manager, 'p-001', { teamId: TEAM } as any);
    // The repeat call's team is unchanged, so it skips
    // closeAndOpenTeamAssignment (and therefore its own internal
    // tx.project.update call) entirely - only updateProject's own single
    // tx.project.update call happens this time, one more than before.
    expect(prisma.project.update.mock.calls.length).toBe(projectUpdateCallsAfterFirstAssign + 1);
    // Team unchanged on the repeat call -> the cross-vendor re-check is skipped entirely, not re-run.
    expect(prisma.auditorProjectAssignment.findMany.mock.calls.length).toBe(crossVendorChecksAfterFirstAssign);
  });

  it("[item 8] every one of TL-01's existing active Coders sees Project 001 through their own teamId - not because of anything written onto the Coder row", async () => {
    await projects.updateProject(manager, 'p-001', { teamId: TEAM } as any);
    for (const coderId of ['coder-1', 'coder-2', 'coder-3']) {
      const coder: AuthUser = { id: coderId, employeeId: `E-${coderId}`, loginName: coderId, email: `${coderId}@x.local`, role: 'CODER', teamId: TEAM, isActive: true };
      const seen = await projects.mine(coder);
      expect(prisma.project.findMany.mock.calls.at(-1)[0].where).toEqual({ teamId: TEAM, isActive: true });
      expect(seen.map((p) => p.id)).toContain('p-001');
    }
  });

  it('[item 9] a Coder 4 created AFTER the Project was assigned still sees it - same query, no backfill step required', async () => {
    await projects.updateProject(manager, 'p-001', { teamId: TEAM } as any);
    // "Created after" is simulated by the mere fact that Coder 4's session carries teamId=TEAM;
    // no per-coder project row is ever written, so there is nothing to backfill.
    const coder4: AuthUser = { id: 'coder-4', employeeId: 'E4', loginName: 'coder4', email: 'c4@x.local', role: 'CODER', teamId: TEAM, isActive: true };
    const seen = await projects.mine(coder4);
    expect(seen.map((p) => p.id)).toContain('p-001');
  });

  it('[item 10] a Coder created by the Vendor Portal, once cascaded onto TL-01\'s team, automatically inherits Project 001 too', async () => {
    await projects.updateProject(manager, 'p-001', { teamId: TEAM } as any);

    // Phase 1's cascade (VendorsService.assignTeamLead) is what gives a
    // vendor-created Coder teamId=TEAM in the first place - re-verify that
    // wiring here so this test fails if that cascade ever regresses.
    const vendorPrisma: any = {
      vendor: { findUnique: jest.fn().mockResolvedValue({ id: V, isActive: true }) },
      vendorAssignment: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn(async ({ data }: any) => ({ id: 'asg', assignedAt: new Date(), ...data })) },
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'tl-01', role: 'TEAM_LEAD', isActive: true, fullName: 'TL 01', loginName: 'tl01', leadsTeam: { id: TEAM, projects: [] } }),
        // Coder 5 (created via the Vendor Portal) is the sole active Coder
        // under this vendor at cascade time.
        findMany: jest.fn().mockResolvedValue([{ id: 'coder-5', teamId: null }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      team: { create: jest.fn() },
      auditorProjectAssignment: { findMany: jest.fn().mockResolvedValue([]) },
      // Same TeamMembership-ledger transaction wiring as ProjectsService's
      // own $transaction above (tx === vendorPrisma).
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(vendorPrisma)),
      teamMembership: { updateMany: jest.fn().mockResolvedValue({ count: 0 }), createMany: jest.fn().mockResolvedValue({ count: 0 }) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const vendors = new VendorsService(vendorPrisma, {} as any);
    await vendors.assignTeamLead(manager, V, 'tl-01');
    expect(vendorPrisma.user.findMany.mock.calls[0][0].where).toEqual({ role: 'CODER', vendorId: V, isActive: true });
    expect(vendorPrisma.user.updateMany.mock.calls[0][0]).toEqual({ where: { id: { in: ['coder-5'] } }, data: { teamId: TEAM } });

    // With teamId=TEAM now set (by the cascade above), Coder 5 sees Project 001 - the same
    // derivation every other Coder on the team uses; no vendor-specific project logic exists.
    const coder5: AuthUser = { id: 'coder-5', employeeId: 'E5', loginName: 'coder5', email: 'c5@x.local', role: 'CODER', teamId: TEAM, vendorId: V, isActive: true };
    const seen = await projects.mine(coder5);
    expect(seen.map((p) => p.id)).toContain('p-001');
  });

  it('a second Project (002) assigned to the same Team Lead is ALSO immediately visible to every Coder on that team - no per-project Coder bookkeeping', async () => {
    prisma.project.findMany.mockResolvedValueOnce([
      { id: 'p-001', name: 'Project 001', client: { id: 'cl', name: 'Client ABC' } },
      { id: 'p-002', name: 'Project 002', client: { id: 'cl', name: 'Client ABC' } },
    ]);
    const coder: AuthUser = { id: 'coder-1', employeeId: 'E1', loginName: 'coder1', email: 'c1@x.local', role: 'CODER', teamId: TEAM, isActive: true };
    const seen = await projects.mine(coder);
    expect(seen.map((p) => p.id).sort()).toEqual(['p-001', 'p-002']);
  });
});
