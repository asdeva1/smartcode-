import { z } from 'zod';
import { PasswordSchema } from './team-lead';
import type { PersonRef } from './common';

/**
 * Vendor: a first-class scoped entity. A Vendor owns Team Leads (and
 * through them their teams, coders, projects, charts, production, audits
 * and rework) and Auditors, via VendorAssignment. Vendor login accounts
 * are ordinary Users with role VENDOR linked to one Vendor. Users are
 * never duplicated - assignment links existing Team Lead / Auditor users.
 */
export const VENDOR_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{1,19}$/;

export const CreateVendorSchema = z.object({
  name: z.string().trim().min(2, 'Vendor name must be at least 2 characters').max(120, 'Vendor name must be at most 120 characters'),
  code: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .pipe(z.string().regex(VENDOR_CODE_PATTERN, 'Code: 2-20 letters, numbers, "-" or "_"')),
  contactName: z.string().trim().max(120, 'Contact name must be at most 120 characters').optional().or(z.literal('')),
  contactEmail: z.string().trim().email('Enter a valid email address').optional().or(z.literal('')),
});
export type CreateVendorInput = z.input<typeof CreateVendorSchema>;

/** Vendor code is the permanent identifier and is not editable. */
export const UpdateVendorSchema = z.object({
  name: CreateVendorSchema.shape.name.optional(),
  contactName: CreateVendorSchema.shape.contactName,
  contactEmail: CreateVendorSchema.shape.contactEmail,
});
export type UpdateVendorInput = z.input<typeof UpdateVendorSchema>;

export const VendorAssignSchema = z.object({ userId: z.string().uuid('Select a user') });
export type VendorAssignInput = z.infer<typeof VendorAssignSchema>;

/** Vendor login account created by the Manager inside a Vendor. */
export const CreateVendorAccountSchema = z
  .object({
    employeeId: z.string().trim().min(1, 'Employee ID is required'),
    fullName: z.string().trim().min(1, 'Full name is required'),
    loginName: z.string().trim().min(1, 'Login name is required'),
    email: z.string().trim().email('Enter a valid email address'),
    password: PasswordSchema,
    confirmPassword: z.string().min(1, 'Confirm your password'),
  })
  .refine((d) => d.password === d.confirmPassword, { message: 'Passwords do not match', path: ['confirmPassword'] });
export type CreateVendorAccountInput = z.infer<typeof CreateVendorAccountSchema>;

export interface Vendor {
  id: string;
  name: string;
  code: string;
  contactName: string | null;
  contactEmail: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  teamLeadCount: number;
  auditorCount: number;
  accountCount: number;
}

export interface VendorListResponse {
  data: Vendor[];
  total: number;
  page: number;
  pageSize: number;
}

export interface VendorPerson extends PersonRef {
  email: string;
  isActive: boolean;
}

export interface VendorMember {
  assignmentId: string;
  assignedAt: string;
  user: VendorPerson;
  /** Team Leads: the team they lead. */
  team: { id: string; name: string } | null;
  /** Team Leads: active coders in their team. Auditors: assigned projects. */
  coderCount: number;
  projectCount: number;
}

export interface VendorDetail extends Vendor {
  teamLeads: VendorMember[];
  auditors: VendorMember[];
  accounts: VendorPerson[];
}

export interface VendorTeamNode {
  id: string;
  name: string;
  teamLead: VendorPerson | null;
  coders: VendorPerson[];
  projects: { id: string; name: string; isActive: boolean }[];
}

export interface VendorStructure {
  vendor: { id: string; name: string; code: string; isActive: boolean };
  teams: VendorTeamNode[];
  auditors: (VendorPerson & { projects: { id: string; name: string }[] })[];
}

export interface VendorActivityEntry {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  role: string | null;
  timestamp: string;
  actor: PersonRef | null;
}

export interface VendorActivityResponse {
  data: VendorActivityEntry[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AssignableUser extends VendorPerson {
  team: { id: string; name: string } | null;
}
