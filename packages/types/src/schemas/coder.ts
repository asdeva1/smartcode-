import { z } from 'zod';
import { PasswordSchema } from './team-lead';

/** Team Lead -> Coder account management. Mirrors apps/api/src/modules/users/dto/*-coder.dto.ts. */
export const CreateCoderSchema = z
  .object({
    employeeId: z.string().trim().min(1, 'Employee ID is required'),
    fullName: z.string().trim().min(1, 'Full name is required'),
    loginName: z.string().trim().min(1, 'Login name is required'),
    email: z.string().trim().email('Enter a valid email address'),
    password: PasswordSchema,
    confirmPassword: z.string().min(1, 'Confirm your password'),
    isActive: z.boolean().optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });
export type CreateCoderInput = z.infer<typeof CreateCoderSchema>;

/** Login name and role are not editable. */
export const UpdateCoderSchema = z.object({
  employeeId: z.string().trim().min(1, 'Employee ID is required').optional(),
  fullName: z.string().trim().min(1, 'Full name is required').optional(),
  email: z.string().trim().email('Enter a valid email address').optional(),
});
export type UpdateCoderInput = z.infer<typeof UpdateCoderSchema>;

export interface Coder {
  id: string;
  employeeId: string;
  loginName: string;
  email: string;
  fullName: string | null;
  role: 'CODER';
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  /** Set once at creation - whichever Vendor created/owns this Coder (Vendor Portal or a Team-Lead-under-a-vendor); null otherwise. */
  vendorId?: string | null;
  /** Same Vendor as vendorId, resolved to its display name for the Coder profile (section 10). */
  vendor?: { id: string; name: string } | null;
  /** Derived through the Coder's current team - see docs/09-BUSINESS-RULES.md "Vendor -> Team Lead -> Coder Hierarchy". */
  team?: { id: string; name: string } | null;
  teamLead?: { id: string; fullName: string | null; employeeId: string; loginName: string } | null;
  projects?: { id: string; name: string }[];
}

export interface CoderListResponse {
  data: Coder[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CoderDetail extends Coder {
  stats: {
    charts: number;
    completed: number;
    inProgress: number;
    rework: number;
    pages: number;
    dos: number;
    icds: number;
  };
}

/** CSV headers accepted by the Coder import, in template order. */
export const CODER_IMPORT_HEADERS = [
  'employeeId',
  'fullName',
  'loginName',
  'email',
  'password',
  'confirmPassword',
  'status',
] as const;
