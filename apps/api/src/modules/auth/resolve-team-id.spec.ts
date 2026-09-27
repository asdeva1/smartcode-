import { resolveTeamId } from './resolve-team-id';
import { JwtStrategy } from './strategies/jwt.strategy';
import { SESSION_USER_INCLUDE } from './session-user';

describe('resolveTeamId', () => {
  it('uses the team a Team Lead leads (Team.teamLeadId), since their own User.teamId is not set', () => {
    expect(resolveTeamId({ role: 'TEAM_LEAD', teamId: null, leadsTeam: { id: 'team-1' } })).toBe('team-1');
  });

  it('returns null for a Team Lead without a team, so team-scoped checks fail closed', () => {
    expect(resolveTeamId({ role: 'TEAM_LEAD', teamId: null, leadsTeam: null })).toBeNull();
  });

  it('keeps User.teamId for every other role', () => {
    expect(resolveTeamId({ role: 'CODER', teamId: 'team-2', leadsTeam: { id: 'ignored' } })).toBe('team-2');
    expect(resolveTeamId({ role: 'MANAGER', teamId: null })).toBeNull();
  });
});

describe('JwtStrategy.validate', () => {
  const config = { get: () => 'test-access-secret-0123456789' } as any;

  it('returns the Team Lead\'s resolved team and full name on every request', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'tl', employeeId: 'E', loginName: 'tl', email: 't@x.local', fullName: 'Tina Lead', role: 'TEAM_LEAD', teamId: null, isActive: true, leadsTeam: { id: 'team-9' },
        }),
      },
    } as any;
    const user = await new JwtStrategy(config, prisma).validate({ sub: 'tl', role: 'TEAM_LEAD' });
    expect(user).toMatchObject({ id: 'tl', teamId: 'team-9', fullName: 'Tina Lead' });
    // One query resolves team AND vendor scope for the session.
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'tl' }, include: SESSION_USER_INCLUDE });
    expect(SESSION_USER_INCLUDE.leadsTeam).toEqual({ select: { id: true } });
  });

  it('still rejects inactive users', async () => {
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue({ id: 'x', isActive: false }) } } as any;
    await expect(new JwtStrategy(config, prisma).validate({ sub: 'x', role: 'CODER' })).rejects.toThrow('inactive');
  });
});
