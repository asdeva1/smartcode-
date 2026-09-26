import { z } from 'zod';

/**
 * Password rule kept identical to what the backend actually enforces
 * (see apps/api/src/modules/users/dto/create-user.dto.ts) so a frontend
 * validation failure and a backend one always agree.
 */
const PasswordSchema = z.string().min(8, 'Password must be at least 8 characters');

export const CreateTeamLeadSchema = z
  .object({
    employeeId: z.string().trim().min(1, 'Employee ID is required'),
    fullName: z.string().trim().min(1, 'Full name is required'),
    loginName: z.string().trim().min(1, 'Login name is required'),
    email: z.string().trim().email('Enter a valid email address'),
    password: PasswordSchema,
    confirmPassword: z.string().min(1, 'Confirm your password'),
    teamId: z.string().uuid().nullable().optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });
export type CreateTeamLeadInput = z.infer<typeof CreateTeamLeadSchema>;

export const UpdateTeamLeadSchema = z.object({
  fullName: z.string().trim().min(1, 'Full name is required').optional(),
  email: z.string().trim().email('Enter a valid email address').optional(),
  employeeId: z.string().trim().min(1, 'Employee ID is required').optional(),
  teamId: z.string().uuid().nullable().optional(),
});
export type UpdateTeamLeadInput = z.infer<typeof UpdateTeamLeadSchema>;

export const TeamLeadSchema = z.object({
  id: z.string().uuid(),
  employeeId: z.string(),
  loginName: z.string(),
  email: z.string(),
  fullName: z.string().nullable(),
  role: z.literal('TEAM_LEAD'),
  isActive: z.boolean(),
  createdAt: z.string(),
  team: z.object({ id: z.string().uuid(), name: z.string() }).nullable(),
});
export type TeamLead = z.infer<typeof TeamLeadSchema>;

export const TeamLeadListResponseSchema = z.object({
  data: z.array(TeamLeadSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
export type TeamLeadListResponse = z.infer<typeof TeamLeadListResponseSchema>;
