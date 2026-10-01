import { z } from 'zod';
import type { PersonRef } from './common';

/** Manager-owned project setup: clients, projects (team scoping) and Auditor -> Project assignment. */
export const CreateClientSchema = z.object({
  name: z.string().trim().min(1, 'Client name is required').max(120),
});
export type CreateClientInput = z.infer<typeof CreateClientSchema>;

/**
 * Phase 10A: how a Project acquires its Charts (docs/09-BUSINESS-RULES.md
 * section 11). MANUAL = client-file-driven import (Phase 10B); AUTOMATIC =
 * the pre-existing behaviour where a Coder enters a Chart ID/Page Count
 * directly in Production. AUTOMATIC is the default so no existing
 * project's behaviour changes unless a Manager opts it into MANUAL.
 */
export const PROJECT_ALLOCATION_TYPES = ['MANUAL', 'AUTOMATIC'] as const;
export type ProjectAllocationType = (typeof PROJECT_ALLOCATION_TYPES)[number];

export const CreateProjectSchema = z.object({
  clientId: z.string().uuid('Select a client'),
  name: z.string().trim().min(1, 'Project name is required').max(120),
  teamId: z.string().uuid().nullable().optional(),
  allocationType: z.enum(PROJECT_ALLOCATION_TYPES).optional(),
});
export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;

export const UpdateProjectSchema = z.object({
  name: z.string().trim().min(1, 'Project name is required').max(120).optional(),
  teamId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
  allocationType: z.enum(PROJECT_ALLOCATION_TYPES).optional(),
});
export type UpdateProjectInput = z.infer<typeof UpdateProjectSchema>;

export const AssignProjectTeamSchema = z.object({
  teamId: z.string().uuid('Select a team'),
});
export type AssignProjectTeamInput = z.infer<typeof AssignProjectTeamSchema>;

export const CreateAuditorAssignmentSchema = z.object({
  auditorId: z.string().uuid('Select an Auditor'),
  projectId: z.string().uuid('Select a project'),
});
export type CreateAuditorAssignmentInput = z.infer<typeof CreateAuditorAssignmentSchema>;

export interface Client {
  id: string;
  name: string;
  isActive: boolean;
}

export interface Project {
  id: string;
  name: string;
  isActive: boolean;
  allocationType: ProjectAllocationType;
  client: { id: string; name: string };
  team: { id: string; name: string } | null;
  chartCount: number;
  auditorCount: number;
}

export interface AuditorAssignment {
  id: string;
  assignedAt: string;
  auditor: PersonRef;
  project: { id: string; name: string; client: { id: string; name: string } };
}

/** Phase 10A: Project<->Team assignment history row (docs/09-BUSINESS-RULES.md section 11). */
export interface ProjectTeamAssignmentRow {
  id: string;
  project: { id: string; name: string };
  team: { id: string; name: string };
  isActive: boolean;
  assignedAt: string;
  assignedBy: PersonRef | null;
  unassignedAt: string | null;
  unassignedBy: PersonRef | null;
}
