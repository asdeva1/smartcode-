import { z } from 'zod';
import { PasswordSchema } from './team-lead';

/**
 * Password Reset Request workflow (docs/09-BUSINESS-RULES.md section 8 /
 * Phase 8): a Vendor/Team Lead REQUESTs a reset for one of their own-scope
 * Coders; only a Manager can Approve (generating a single-use reset link)
 * or Reject it. Manager keeps the existing direct reset elsewhere - this
 * is the request/approval/link path added for Vendor/Team Lead.
 */
export const PASSWORD_RESET_REQUEST_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'COMPLETED'] as const;
export type PasswordResetRequestStatus = (typeof PASSWORD_RESET_REQUEST_STATUSES)[number];

export interface PasswordResetPerson {
  id: string;
  fullName: string | null;
  employeeId: string;
  loginName: string;
}

export interface PasswordResetTargetPerson extends PasswordResetPerson {
  email: string;
  role: string;
  vendor: { id: string; name: string } | null;
  team: { id: string; name: string } | null;
}

export interface PasswordResetRequestRow {
  id: string;
  status: PasswordResetRequestStatus;
  reason: string | null;
  targetUser: PasswordResetTargetPerson;
  requestedBy: PasswordResetPerson;
  requestedAt: string;
  reviewedBy: PasswordResetPerson | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  resetLink: { status: 'ACTIVE' | 'EXPIRED' | 'USED' | 'INVALIDATED' | null; expiresAt: string | null };
}

export interface PasswordResetRequestListResponse {
  data: PasswordResetRequestRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PasswordResetApproveResponse {
  request: PasswordResetRequestRow;
  resetUrl: string;
}

/** The public "set new password" page - same password rule every account uses. */
export const CompletePasswordResetSchema = z
  .object({
    token: z.string().min(1, 'Reset token is required'),
    newPassword: PasswordSchema,
    confirmNewPassword: z.string().min(1, 'Confirm your new password'),
  })
  .refine((d) => d.newPassword === d.confirmNewPassword, { message: 'Passwords do not match', path: ['confirmNewPassword'] });
export type CompletePasswordResetInput = z.infer<typeof CompletePasswordResetSchema>;
