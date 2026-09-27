import { z } from 'zod';
import { ROLES } from '../roles';

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
  isActive: z.boolean(),
});
export type AuthUser = z.infer<typeof AuthUserSchema>;

export const TokenPairSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
});
export type TokenPair = z.infer<typeof TokenPairSchema>;
