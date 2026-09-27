import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { AuthUser } from '@smartcode/types';
import { auditScope, chartScope, productionScope } from './scope';
import { assertAuditorFitsProject, assertProjectAuditorsFit, auditorProjectWhere, vendorProjectWhere } from './vendor-scope';

const base: AuthUser = { id: 'u', employeeId: 'E', loginName: 'u', email: 'u@x.local', role: 'MANAGER', teamId: null, isActive: true };
const V = 'vendor-a';
const vendorAccount: AuthUser = { ...base, id: 'va', role: 'VENDOR', vendorId: V };
const inVendor = { some: { vendorId: V, isActive: true } };

describe('vendor scope (database query builders)', () => {
  it('a Vendor account sees charts, production and audits only through its own vendor', () => {
    expect(chartScope(vendorAccount)).toEqual({ project: { team: { teamLead: { vendorAssignments: inVendor } } } });
    expect(productionScope(vendorAccount)).toEqual({ coder: { team: { teamLead: { vendorAssignments: inVendor } } } });
    expect(auditScope(vendorAccount)).toEqual({ productionEntry: { chart: { project: { team: { teamLead: { vendorAssignments: inVendor } } } } } });
  });

  it('a Vendor account without a vendor fails closed (403) instead of seeing everything', () => {
    const broken: AuthUser = { ...vendorAccount, vendorId: null };
    expect(() => chartScope(broken)).toThrow(ForbiddenException);
    expect(() => productionScope(broken)).toThrow(ForbiddenException);
    expect(() => auditScope(broken)).toThrow(ForbiddenException);
  });

  it('an Auditor in a vendor is limited to that vendor\'s projects; an in-house Auditor keeps the existing rule', () => {
    const inHouse: AuthUser = { ...base, id: 'a', role: 'AUDITOR' };
    expect(auditorProjectWhere(inHouse)).toEqual({ auditorAssignments: { some: { auditorId: 'a' } } });
    expect(auditorProjectWhere({ ...inHouse, vendorId: V })).toEqual({ auditorAssignments: { some: { auditorId: 'a' } }, ...vendorProjectWhere(V) });
    expect(chartScope({ ...inHouse, vendorId: V })).toEqual({ project: { auditorAssignments: { some: { auditorId: 'a' } }, team: { teamLead: { vendorAssignments: inVendor } } } });
  });
});

describe('cross-vendor consistency checks', () => {
  const db = (over: Record<string, any> = {}) => ({
    vendorAssignment: { findFirst: jest.fn().mockResolvedValue(null) },
    project: { findUnique: jest.fn().mockResolvedValue({ teamId: 'team-1' }) },
    team: { findUnique: jest.fn().mockResolvedValue({ teamLeadId: 'tl-1' }) },
    auditorProjectAssignment: { findMany: jest.fn().mockResolvedValue([]) },
    ...over,
  });
  const vendorOf = (map: Record<string, string>) =>
    jest.fn(async ({ where }: any) => (map[where.userId] ? { vendorId: map[where.userId] } : null));

  it('in-house Auditors may be assigned to any project', async () => {
    const d = db();
    await expect(assertAuditorFitsProject(d, 'aud', 'p')).resolves.toBeUndefined();
  });

  it('a vendor Auditor may only be assigned to that vendor\'s projects', async () => {
    const same = db({ vendorAssignment: { findFirst: vendorOf({ aud: V, 'tl-1': V }) } });
    await expect(assertAuditorFitsProject(same, 'aud', 'p')).resolves.toBeUndefined();
    const other = db({ vendorAssignment: { findFirst: vendorOf({ aud: V, 'tl-1': 'vendor-b' }) } });
    await expect(assertAuditorFitsProject(other, 'aud', 'p')).rejects.toThrow(ConflictException);
    const none = db({ vendorAssignment: { findFirst: vendorOf({ aud: V }) } });
    await expect(assertAuditorFitsProject(none, 'aud', 'p')).rejects.toThrow(/project is in no vendor/);
  });

  it('refuses to move projects into a vendor while another vendor\'s Auditor is assigned to them', async () => {
    const assignments = [
      { project: { name: 'Cardio' }, auditor: { fullName: 'Ben', loginName: 'ben', vendorAssignments: [{ vendorId: 'vendor-b' }] } },
      { project: { name: 'Cardio' }, auditor: { fullName: 'Ina', loginName: 'ina', vendorAssignments: [] } },
    ];
    const d = db({ auditorProjectAssignment: { findMany: jest.fn().mockResolvedValue(assignments) } });
    await expect(assertProjectAuditorsFit(d, ['p'], V, 'Cannot assign')).rejects.toThrow(/Ben on Cardio/);
    await expect(assertProjectAuditorsFit(d, ['p'], 'vendor-b', 'Cannot assign')).resolves.toBeUndefined();
    // nothing to check -> no query at all
    const empty = db();
    await assertProjectAuditorsFit(empty, [], V, 'x');
    expect(empty.auditorProjectAssignment.findMany).not.toHaveBeenCalled();
  });
});
