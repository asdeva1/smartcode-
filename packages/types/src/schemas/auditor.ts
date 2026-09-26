import { z } from 'zod';
import { PasswordSchema } from './team-lead';

/**
 * Auditor accounts are ordinary Users with role AUDITOR. These schemas
 * mirror the backend DTOs (apps/api/src/modules/users/dto/*-auditor.dto.ts)
 * so frontend and backend validation always agree. The password rule is
 * the same shared one used for Team Leads - not redefined here.
 */
export const CreateAuditorSchema = z
  .object({
    employeeId: z.string().trim().min(1, 'Employee ID is required'),
    fullName: z.string().trim().min(1, 'Full name is required'),
    loginName: z.string().trim().min(1, 'Login name is required'),
    email: z.string().trim().email('Enter a valid email address'),
    password: PasswordSchema,
    confirmPassword: z.string().min(1, 'Confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });
export type CreateAuditorInput = z.infer<typeof CreateAuditorSchema>;

/** Login name and role are deliberately not editable here. */
export const UpdateAuditorSchema = z.object({
  employeeId: z.string().trim().min(1, 'Employee ID is required').optional(),
  fullName: z.string().trim().min(1, 'Full name is required').optional(),
  email: z.string().trim().email('Enter a valid email address').optional(),
});
export type UpdateAuditorInput = z.infer<typeof UpdateAuditorSchema>;

export const AuditorSchema = z.object({
  id: z.string().uuid(),
  employeeId: z.string(),
  loginName: z.string(),
  email: z.string(),
  fullName: z.string().nullable(),
  role: z.literal('AUDITOR'),
  isActive: z.boolean(),
  createdAt: z.string(),
});
export type Auditor = z.infer<typeof AuditorSchema>;

export const AuditorListResponseSchema = z.object({
  data: z.array(AuditorSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
export type AuditorListResponse = z.infer<typeof AuditorListResponseSchema>;
