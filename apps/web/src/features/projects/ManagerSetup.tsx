'use client';
import * as React from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import { Plus } from 'lucide-react';
import type { AuditorAssignment, Project } from '@smartcode/types';
import { Alert, Button, ConfirmDialog, DataTable, ErrorState, Input, Modal, Select, Tabs, useToast } from '@smartcode/ui';
import { useTeams } from '@/features/team-leads/use-teams';
import { errorMessage, formatDate, personName } from '@/lib/format';
import {
  useActiveAuditors,
  useAssignments,
  useClients,
  useCreateAssignment,
  useCreateClient,
  useCreateProject,
  useCreateTeam,
  useDeleteAssignment,
  useProjects,
  useTeamLeadPicker,
  useUpdateProject,
} from './use-projects';

type Tab = 'teams' | 'projects' | 'assignments';

/**
 * Manager setup the workflow depends on: Teams (who codes), Projects
 * (which team works which client project - charts belong to projects) and
 * Auditor -> Project assignments (what each Auditor may audit).
 */
export function ManagerSetup() {
  const [tab, setTab] = React.useState<Tab>('teams');
  return (
    <>
      <Tabs
        value={tab}
        onChange={(v) => setTab(v as Tab)}
        items={[
          { value: 'teams', label: 'Teams' },
          { value: 'projects', label: 'Projects' },
          { value: 'assignments', label: 'Auditor Assignments' },
        ]}
      />
      <Box sx={{ mt: 2 }}>
        {tab === 'teams' && <TeamsTab />}
        {tab === 'projects' && <ProjectsTab />}
        {tab === 'assignments' && <AssignmentsTab />}
      </Box>
    </>
  );
}

function TeamsTab() {
  const { showToast } = useToast();
  const teams = useTeams();
  const leads = useTeamLeadPicker();
  const create = useCreateTeam();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [lead, setLead] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const freeLeads = (leads.data?.data ?? []).filter((l) => !l.team);

  const submit = () => {
    if (!name.trim()) return setError('Team name is required');
    create.mutate(
      { name: name.trim(), teamLeadId: lead || undefined },
      {
        onSuccess: () => {
          showToast('Team created.', 'success');
          setOpen(false);
          setName('');
          setLead('');
          setError(null);
        },
        onError: (err) => setError(errorMessage(err, 'Could not create team.')),
      },
    );
  };

  if (teams.isError) return <ErrorState onRetry={() => teams.refetch()} description="Could not load teams." />;
  return (
    <>
      <Stack direction="row" justifyContent="flex-end" sx={{ mb: 1 }}>
        <Button startIcon={<Plus size={16} />} onClick={() => setOpen(true)}>
          Create Team
        </Button>
      </Stack>
      <DataTable
        isLoading={teams.isLoading}
        rows={teams.data ?? []}
        rowKey={(t) => t.id}
        emptyTitle="No teams yet"
        emptyDescription="Create a team, then assign it a Team Lead and projects."
        columns={[
          { key: 'name', header: 'Team', render: (t) => t.name },
          { key: 'lead', header: 'Team Lead', render: (t) => (t.teamLead ? `${t.teamLead.loginName} (${t.teamLead.employeeId})` : '—') },
        ]}
      />
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Create Team"
        actions={
          <>
            <Button variant="text" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={create.isPending}>
              Create Team
            </Button>
          </>
        }
      >
        <Stack spacing={2}>
          {error && <Alert severity="error">{error}</Alert>}
          <Input label="Team Name" value={name} onChange={(e) => setName(e.target.value)} />
          <Select
            label="Team Lead (optional)"
            value={lead}
            onChange={(e) => setLead(e.target.value)}
            options={[{ value: '', label: 'Assign later' }, ...freeLeads.map((l) => ({ value: l.id, label: `${l.fullName ?? l.loginName} (${l.employeeId})` }))]}
          />
        </Stack>
      </Modal>
    </>
  );
}

function ProjectsTab() {
  const { showToast } = useToast();
  const projects = useProjects();
  const clients = useClients();
  const teams = useTeams();
  const createClient = useCreateClient();
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({ clientId: '', newClient: '', name: '', teamId: '' });
  const [error, setError] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<Project | null>(null);
  const [editTeam, setEditTeam] = React.useState('');

  const teamOptions = [{ value: '', label: 'No team' }, ...(teams.data ?? []).map((t) => ({ value: t.id, label: t.name }))];

  const submit = async () => {
    setError(null);
    if (!form.name.trim()) return setError('Project name is required');
    try {
      let clientId = form.clientId;
      if (!clientId) {
        if (!form.newClient.trim()) return setError('Choose a client or enter a new client name');
        clientId = (await createClient.mutateAsync({ name: form.newClient.trim() })).id;
      }
      await createProject.mutateAsync({ clientId, name: form.name.trim(), teamId: form.teamId || null });
      showToast('Project created.', 'success');
      setOpen(false);
      setForm({ clientId: '', newClient: '', name: '', teamId: '' });
    } catch (err) {
      setError(errorMessage(err, 'Could not create project.'));
    }
  };

  const toggleActive = (p: Project) =>
    updateProject.mutate(
      { id: p.id, input: { isActive: !p.isActive } },
      {
        onSuccess: () => showToast(`${p.name} ${p.isActive ? 'deactivated' : 'activated'}.`, 'success'),
        onError: (err) => showToast(errorMessage(err, 'Could not update project.'), 'error'),
      },
    );

  const saveTeam = () => {
    if (!editing) return;
    updateProject.mutate(
      { id: editing.id, input: { teamId: editTeam || null } },
      {
        onSuccess: () => {
          showToast('Project team updated.', 'success');
          setEditing(null);
        },
        onError: (err) => showToast(errorMessage(err, 'Could not update project.'), 'error'),
      },
    );
  };

  if (projects.isError) return <ErrorState onRetry={() => projects.refetch()} description="Could not load projects." />;
  return (
    <>
      <Stack direction="row" justifyContent="flex-end" sx={{ mb: 1 }}>
        <Button startIcon={<Plus size={16} />} onClick={() => setOpen(true)}>
          Create Project
        </Button>
      </Stack>
      <DataTable<Project>
        isLoading={projects.isLoading}
        rows={projects.data ?? []}
        rowKey={(p) => p.id}
        emptyTitle="No projects yet"
        emptyDescription="Coders can only enter charts for projects assigned to their team."
        columns={[
          { key: 'name', header: 'Project', render: (p) => p.name },
          { key: 'client', header: 'Client', render: (p) => p.client.name },
          { key: 'team', header: 'Team', render: (p) => p.team?.name ?? '—' },
          { key: 'charts', header: 'Charts', align: 'right', render: (p) => p.chartCount },
          { key: 'auditors', header: 'Auditors', align: 'right', render: (p) => p.auditorCount },
          { key: 'status', header: 'Status', render: (p) => <Chip size="small" label={p.isActive ? 'Active' : 'Inactive'} color={p.isActive ? 'success' : 'default'} /> },
          {
            key: 'actions',
            header: 'Actions',
            align: 'right',
            render: (p) => (
              <Stack direction="row" spacing={1} justifyContent="flex-end">
                <Button
                  size="small"
                  variant="text"
                  onClick={() => {
                    setEditing(p);
                    setEditTeam(p.team?.id ?? '');
                  }}
                >
                  Change team
                </Button>
                <Button size="small" variant="text" onClick={() => toggleActive(p)}>
                  {p.isActive ? 'Deactivate' : 'Activate'}
                </Button>
              </Stack>
            ),
          },
        ]}
      />
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Create Project"
        actions={
          <>
            <Button variant="text" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={createProject.isPending || createClient.isPending}>
              Create Project
            </Button>
          </>
        }
      >
        <Stack spacing={2}>
          {error && <Alert severity="error">{error}</Alert>}
          <Select
            label="Client"
            value={form.clientId}
            onChange={(e) => setForm({ ...form, clientId: e.target.value })}
            options={[{ value: '', label: 'New client...' }, ...(clients.data ?? []).map((c) => ({ value: c.id, label: c.name }))]}
          />
          {!form.clientId && <Input label="New client name" value={form.newClient} onChange={(e) => setForm({ ...form, newClient: e.target.value })} />}
          <Input label="Project name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Select label="Team" value={form.teamId} onChange={(e) => setForm({ ...form, teamId: e.target.value })} options={teamOptions} />
        </Stack>
      </Modal>
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={`Change team - ${editing?.name ?? ''}`}
        actions={
          <>
            <Button variant="text" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={saveTeam} disabled={updateProject.isPending}>
              Save
            </Button>
          </>
        }
      >
        <Select label="Team" value={editTeam} onChange={(e) => setEditTeam(e.target.value)} options={teamOptions} />
      </Modal>
    </>
  );
}

function AssignmentsTab() {
  const { showToast } = useToast();
  const assignments = useAssignments();
  const projects = useProjects();
  const auditors = useActiveAuditors();
  const create = useCreateAssignment();
  const remove = useDeleteAssignment();
  const [open, setOpen] = React.useState(false);
  const [auditorId, setAuditorId] = React.useState('');
  const [projectId, setProjectId] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [confirm, setConfirm] = React.useState<AuditorAssignment | null>(null);

  const submit = () => {
    if (!auditorId || !projectId) return setError('Choose an Auditor and a project');
    create.mutate(
      { auditorId, projectId },
      {
        onSuccess: () => {
          showToast('Auditor assigned.', 'success');
          setOpen(false);
          setAuditorId('');
          setProjectId('');
          setError(null);
        },
        onError: (err) => setError(errorMessage(err, 'Could not assign Auditor.')),
      },
    );
  };

  if (assignments.isError) return <ErrorState onRetry={() => assignments.refetch()} description="Could not load assignments." />;
  return (
    <>
      <Stack direction="row" justifyContent="flex-end" sx={{ mb: 1 }}>
        <Button startIcon={<Plus size={16} />} onClick={() => setOpen(true)}>
          Assign Auditor
        </Button>
      </Stack>
      <DataTable<AuditorAssignment>
        isLoading={assignments.isLoading}
        rows={assignments.data ?? []}
        rowKey={(a) => a.id}
        emptyTitle="No Auditor assignments"
        emptyDescription="An Auditor can only audit charts in projects they are assigned to."
        columns={[
          { key: 'auditor', header: 'Auditor', render: (a) => `${personName(a.auditor)} (${a.auditor.employeeId})` },
          { key: 'project', header: 'Project', render: (a) => `${a.project.name} (${a.project.client.name})` },
          { key: 'assignedAt', header: 'Assigned', render: (a) => formatDate(a.assignedAt) },
          {
            key: 'actions',
            header: 'Actions',
            align: 'right',
            render: (a) => (
              <Button size="small" variant="text" color="error" onClick={() => setConfirm(a)}>
                Remove
              </Button>
            ),
          },
        ]}
      />
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Assign Auditor to Project"
        actions={
          <>
            <Button variant="text" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={create.isPending}>
              Assign
            </Button>
          </>
        }
      >
        <Stack spacing={2}>
          {error && <Alert severity="error">{error}</Alert>}
          <Select
            label="Auditor"
            value={auditorId}
            onChange={(e) => setAuditorId(e.target.value)}
            options={[
              { value: '', label: 'Select Auditor' },
              ...(auditors.data?.data ?? []).filter((a) => a.isActive).map((a) => ({ value: a.id, label: `${a.fullName ?? a.loginName} (${a.employeeId})` })),
            ]}
          />
          <Select
            label="Project"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            options={[{ value: '', label: 'Select project' }, ...(projects.data ?? []).filter((p) => p.isActive).map((p) => ({ value: p.id, label: `${p.name} (${p.client.name})` }))]}
          />
        </Stack>
      </Modal>
      <ConfirmDialog
        open={!!confirm}
        title="Remove assignment"
        description={confirm ? `${personName(confirm.auditor)} will no longer see or audit charts in ${confirm.project.name}. Existing audits are kept.` : ''}
        confirmLabel="Remove"
        destructive
        onConfirm={() => {
          if (confirm)
            remove.mutate(confirm.id, {
              onSuccess: () => showToast('Assignment removed.', 'success'),
              onError: (err) => showToast(errorMessage(err, 'Could not remove assignment.'), 'error'),
            });
          setConfirm(null);
        }}
        onCancel={() => setConfirm(null)}
      />
    </>
  );
}
