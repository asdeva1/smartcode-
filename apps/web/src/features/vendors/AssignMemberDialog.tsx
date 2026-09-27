'use client';
import * as React from 'react';
import Typography from '@mui/material/Typography';
import { Alert, Button, LoadingState, Modal, Select, useToast } from '@smartcode/ui';
import { errorMessage, personName } from '@/lib/format';
import { useAssignMember, useAssignable } from './use-vendors';

const WORD = { TEAM_LEAD: 'Team Lead', AUDITOR: 'Auditor' } as const;

/**
 * Assigns an existing Team Lead / Auditor to the vendor. Only active people
 * not in any vendor are offered; the server re-validates everything
 * (existence, role, active, duplicates, cross-vendor conflicts).
 */
export function AssignMemberDialog({ vendorId, vendorName, role, onClose }: { vendorId: string; vendorName: string; role: 'TEAM_LEAD' | 'AUDITOR'; onClose: () => void }) {
  const { showToast } = useToast();
  const candidates = useAssignable(vendorId, role, true);
  const assign = useAssignMember();
  const [userId, setUserId] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  const submit = () => {
    if (!userId) return setError(`Select a ${WORD[role]}`);
    setError(null);
    const person = candidates.data?.find((c) => c.id === userId);
    assign.mutate(
      { vendorId, role, userId },
      {
        onSuccess: () => {
          showToast(`${personName(person)} assigned to ${vendorName}.`, 'success');
          onClose();
        },
        onError: (err) => setError(errorMessage(err, 'Could not assign.')),
      },
    );
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Assign ${WORD[role]} to ${vendorName}`}
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={assign.isPending || candidates.isLoading}>
            {assign.isPending ? 'Assigning...' : 'Assign'}
          </Button>
        </>
      }
    >
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {candidates.isLoading ? (
        <LoadingState />
      ) : (candidates.data ?? []).length === 0 ? (
        <Alert severity="info">Every active {WORD[role]} is already assigned to a vendor.</Alert>
      ) : (
        <>
          <Select
            label={WORD[role]}
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            options={[
              { value: '', label: `Select a ${WORD[role]}` },
              ...(candidates.data ?? []).map((c) => ({
                value: c.id,
                label: `${personName(c)} (${c.employeeId})${role === 'TEAM_LEAD' ? ` - ${c.team?.name ?? 'no team'}` : ''}`,
              })),
            ]}
          />
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
            {role === 'TEAM_LEAD'
              ? "The Team Lead's team, coders, projects and their work move into this vendor's scope."
              : "The Auditor will only see this vendor's projects."}{' '}
            A person can belong to one vendor at a time.
          </Typography>
        </>
      )}
    </Modal>
  );
}
