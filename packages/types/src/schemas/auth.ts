import { z } from 'zod';
import { ROLES } from '../roles';
import { PasswordSchema } from './team-lead';

/**
 * Phase 1 scope: login + current-user identity only.
 * Production/Audit schemas are introduced in Phase 3/4 per
 * docs/10-IMPLEMENTATION-ROADMAP.md — not created here to avoid
 * building business workflow ahead of schedule.
 */

export const LoginSchema = z.object({
  loginName: z.string().min(1, 'Login name is required'),
  password: z.string().min(1, 'Password is required'),
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const AuthUserSchema = z.object({
  id: z.string().uuid(),
  employeeId: z.string(),
  loginName: z.string(),
  email: z.string().email(),
  /** Display name from the account; optional so older tokens/tests without it stay valid. */
  fullName: z.string().nullable().optional(),
  role: z.enum(ROLES),
  teamId: z.string().uuid().nullable(),
  /**
   * The Vendor whose scope the caller operates in: a Vendor account's own
   * vendor, a Team Lead's / Auditor's active vendor assignment, or a
   * Coder's Team Lead's vendor. Null when outside any vendor. Resolved
   * server-side on every request; never accepted from the client.
   */
  vendorId: z.string().uuid().nullable().optional(),
  isActive: z.boolean(),
});
export type AuthUser = z.infer<typeof AuthUserSchema>;

export const TokenPairSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
});
export type TokenPair = z.infer<typeof TokenPairSchema>;

/**
 * Manager changes their OWN password. The new password follows the same
 * rule as every account (PasswordSchema) and must differ from the current one.
 */
export const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: PasswordSchema,
    confirmNewPassword: z.string().min(1, 'Confirm your new password'),
  })
  .refine((d) => d.newPassword === d.confirmNewPassword, { message: 'Passwords do not match', path: ['confirmNewPassword'] })
  .refine((d) => !d.currentPassword || d.newPassword !== d.currentPassword, {
    message: 'The new password must be different from the current password',
    path: ['newPassword'],
  });
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;
