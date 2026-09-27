import { z } from 'zod';
import type { PersonRef } from './common';

/** Manager-owned project setup: clients, projects (team scoping) and Auditor -> Project assignment. */
export const CreateClientSchema = z.object({
  name: z.string().trim().min(1, 'Client name is required').max(120),
});
export type CreateClientInput = z.infer<typeof CreateClientSchema>;

export const CreateProjectSchema = z.object({
  clientId: z.string().uuid('Select a client'),
  name: z.string().trim().min(1, 'Project name is required').max(120),
  teamId: z.string().uuid().nullable().optional(),
});
export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;

export const UpdateProjectSchema = z.object({
  name: z.string().trim().min(1, 'Project name is required').max(120).optional(),
  teamId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateProjectInput = z.infer<typeof UpdateProjectSchema>;

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
