import { canCreateRole } from '@smartcode/types';

/**
 * Covers the hierarchy rules from docs/03-RBAC-PERMISSIONS.md /
 * docs/09-BUSINESS-RULES.md, independent of any database - this is
 * the RBAC foundation's most safety-critical unit, so it's tested
 * exhaustively rather than spot-checked.
 */
describe('Account creation hierarchy', () => {
  it('allows MANAGER to create TEAM_LEAD', () => {
    expect(canCreateRole('MANAGER', 'TEAM_LEAD')).toBe(true);
  });

  it('allows MANAGER to create AUDITOR', () => {
    expect(canCreateRole('MANAGER', 'AUDITOR')).toBe(true);
  });

  it('does NOT allow MANAGER to create CODER directly', () => {
    expect(canCreateRole('MANAGER', 'CODER')).toBe(false);
  });

  it('does NOT allow MANAGER to create another MANAGER', () => {
    expect(canCreateRole('MANAGER', 'MANAGER')).toBe(false);
  });

  it('allows TEAM_LEAD to create CODER', () => {
    expect(canCreateRole('TEAM_LEAD', 'CODER')).toBe(true);
  });

  it('does NOT allow TEAM_LEAD to create another TEAM_LEAD', () => {
    expect(canCreateRole('TEAM_LEAD', 'TEAM_LEAD')).toBe(false);
  });

  it('does NOT allow TEAM_LEAD to create AUDITOR', () => {
    expect(canCreateRole('TEAM_LEAD', 'AUDITOR')).toBe(false);
  });

  it('does NOT allow CODER to create any user', () => {
    expect(canCreateRole('CODER', 'CODER')).toBe(false);
    expect(canCreateRole('CODER', 'TEAM_LEAD')).toBe(false);
    expect(canCreateRole('CODER', 'AUDITOR')).toBe(false);
    expect(canCreateRole('CODER', 'MANAGER')).toBe(false);
  });

  it('does NOT allow AUDITOR to create any user', () => {
    expect(canCreateRole('AUDITOR', 'CODER')).toBe(false);
    expect(canCreateRole('AUDITOR', 'TEAM_LEAD')).toBe(false);
    expect(canCreateRole('AUDITOR', 'AUDITOR')).toBe(false);
    expect(canCreateRole('AUDITOR', 'MANAGER')).toBe(false);
  });
});
