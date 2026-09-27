import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import type { AuthUser } from '@smartcode/types';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { passwordStamp, resolveVendorId, tokenMatchesPassword } from './session-user';

const manager: AuthUser = { id: 'm', employeeId: 'E1', loginName: 'manager', email: 'm@x.local', role: 'MANAGER', teamId: null, isActive: true };

describe('session vendor resolution', () => {
  it('derives the vendor for every role from one query shape', () => {
    expect(resolveVendorId({ role: 'VENDOR', vendorId: 'v1' } as any)).toBe('v1');
    expect(resolveVendorId({ role: 'TEAM_LEAD', vendorAssignments: [{ vendorId: 'v2' }] } as any)).toBe('v2');
    expect(resolveVendorId({ role: 'AUDITOR', vendorAssignments: [] } as any)).toBeNull();
    expect(resolveVendorId({ role: 'CODER', team: { teamLead: { vendorAssignments: [{ vendorId: 'v3' }] } } } as any)).toBe('v3');
    expect(resolveVendorId({ role: 'CODER', team: null } as any)).toBeNull();
    expect(resolveVendorId({ role: 'MANAGER', vendorId: 'ignored', vendorAssignments: [{ vendorId: 'x' }] } as any)).toBeNull();
  });
});

describe('JwtStrategy.validate - vendor accounts and password changes', () => {
  const config = { get: () => 'test-access-secret-0123456789' } as any;
  const row = (over: Record<string, unknown>) => ({
    id: 'u', employeeId: 'E', loginName: 'u', email: 'u@x.local', fullName: null, role: 'VENDOR', teamId: null, isActive: true,
    passwordChangedAt: null, vendorId: 'v1', vendor: { id: 'v1', isActive: true }, vendorAssignments: [], leadsTeam: null, team: null, ...over,
  });
  const strategy = (user: unknown) => new JwtStrategy(config, { user: { findUnique: jest.fn().mockResolvedValue(user) } } as any);

  it('puts the vendor on the session for a Vendor account', async () => {
    await expect(strategy(row({})).validate({ sub: 'u', role: 'VENDOR' })).resolves.toMatchObject({ role: 'VENDOR', vendorId: 'v1' });
  });

  it('locks out Vendor accounts of a deactivated (or missing) vendor on every request', async () => {
    await expect(strategy(row({ vendor: { id: 'v1', isActive: false } })).validate({ sub: 'u', role: 'VENDOR' })).rejects.toThrow(UnauthorizedException);
    await expect(strategy(row({ vendorId: null, vendor: null })).validate({ sub: 'u', role: 'VENDOR' })).rejects.toThrow(UnauthorizedException);
  });

  it('rejects any token issued before the last password change', async () => {
    const changedAt = new Date('2026-09-27T10:00:00.000Z');
    const user = row({ role: 'MANAGER', vendorId: null, vendor: null, passwordChangedAt: changedAt });
    await expect(strategy(user).validate({ sub: 'u', role: 'MANAGER' })).rejects.toThrow('password was changed');
    await expect(strategy(user).validate({ sub: 'u', role: 'MANAGER', pwd: changedAt.getTime() - 1 })).rejects.toThrow(UnauthorizedException);
    await expect(strategy(user).validate({ sub: 'u', role: 'MANAGER', pwd: changedAt.getTime() })).resolves.toMatchObject({ id: 'u' });
  });

  it('keeps tokens valid for accounts that never changed their password (no pwd claim yet)', () => {
    expect(tokenMatchesPassword({}, null)).toBe(true);
    expect(tokenMatchesPassword({ pwd: 0 }, undefined)).toBe(true);
    expect(passwordStamp(new Date(5))).toBe(5);
  });
});

describe('AuthService.changePassword (Manager own password only)', () => {
  let prisma: any;
  let provider: any;
  let service: AuthService;

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'm', isActive: true, passwordHash: await argon2.hash('OldPassword1') }),
        update: jest.fn().mockResolvedValue({}),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    provider = { issueTokens: jest.fn().mockResolvedValue({ accessToken: 'a2', refreshToken: 'r2' }) };
    service = new AuthService(provider, prisma);
  });
  const dto = (over: Record<string, string> = {}) => ({ currentPassword: 'OldPassword1', newPassword: 'NewPassword1', confirmNewPassword: 'NewPassword1', ...over });

  it.each(['TEAM_LEAD', 'AUDITOR', 'CODER', 'VENDOR'] as const)('refuses a %s (defence in depth behind the route guard)', async (role) => {
    await expect(service.changePassword({ ...manager, role }, dto())).rejects.toThrow(ForbiddenException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('verifies the current password and audit-logs the failure without secrets', async () => {
    await expect(service.changePassword(manager, dto({ currentPassword: 'wrong' }))).rejects.toThrow(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();
    const log = prisma.auditLog.create.mock.calls[0][0].data;
    expect(log).toMatchObject({ action: 'PASSWORD_CHANGE_FAILED', entity: 'User', entityId: 'm' });
    expect(JSON.stringify(log)).not.toMatch(/wrong|NewPassword1|OldPassword1/);
  });

  it('rejects a mismatched confirmation and reusing the current password', async () => {
    await expect(service.changePassword(manager, dto({ confirmNewPassword: 'Other12345' }))).rejects.toThrow('Passwords do not match');
    await expect(service.changePassword(manager, dto({ newPassword: 'OldPassword1', confirmNewPassword: 'OldPassword1' }))).rejects.toThrow(/must be different/);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('stores only an argon2 hash, stamps passwordChangedAt (revoking older sessions), logs, and issues new tokens', async () => {
    const tokens = await service.changePassword(manager, dto());
    const data = prisma.user.update.mock.calls[0][0].data;
    expect(prisma.user.update.mock.calls[0][0].where).toEqual({ id: 'm' });
    expect(data.passwordHash).not.toContain('NewPassword1');
    expect(await argon2.verify(data.passwordHash, 'NewPassword1')).toBe(true);
    expect(data.passwordChangedAt).toBeInstanceOf(Date);
    const log = prisma.auditLog.create.mock.calls.at(-1)[0].data;
    expect(log).toMatchObject({ action: 'PASSWORD_CHANGED', entity: 'User', entityId: 'm', userId: 'm', role: 'MANAGER' });
    expect(JSON.stringify(log)).not.toMatch(/NewPassword1|OldPassword1|\$argon2/);
    expect(provider.issueTokens).toHaveBeenCalledWith(manager);
    expect(tokens).toEqual({ accessToken: 'a2', refreshToken: 'r2' });
  });
});
