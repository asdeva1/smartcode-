'use client';
import * as React from 'react';
import { Alert, Button, Input, Modal, useToast } from '@smartcode/ui';
import { errorMessage } from '@/lib/format';
import { useChangeLoginName } from './use-change-login-name';

export interface ChangeLoginNameTarget {
  id: string;
  label: string;
  currentLoginName: string;
}

/**
 * docs/09-BUSINESS-RULES.md section 8 - a Manager's direct Login Name
 * change (Team Lead / Auditor / Vendor account). Distinct from the Team
 * Lead's request-based flow for a Coder (section 9, RequestLoginNameChangeDialog).
 */
export function ChangeLoginNameDialog({
  target,
  onClose,
  onChanged,
}: {
  target: ChangeLoginNameTarget | null;
  onClose: () => void;
  /** Called with the new Login Name after a successful change, so the caller can refresh its own list. */
  onChanged?: () => void;
}) {
  const { showToast } = useToast();
  const change = useChangeLoginName();
  const [loginName, setLoginName] = React.useState('');
  const [serverError, setServerError] = React.useState<string | null>(null);

  // Resets the form when a different user is targeted - intentionally
  // keyed only on target?.id, not on `change` (a new mutation object
  // every render) or target?.currentLoginName (stable for a given id).
  React.useEffect(() => {
    setLoginName(target?.currentLoginName ?? '');
    setServerError(null);
    change.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.id]);

  if (!target) return null;

  const handleClose = () => {
    change.reset();
    onClose();
  };

  const handleSubmit = () => {
    setServerError(null);
    change.mutate(
      { id: target.id, loginName },
      {
        onSuccess: (result) => {
          showToast(`Login Name changed to ${result.loginName}.`, 'success');
          onChanged?.();
          handleClose();
        },
        onError: (err) => setServerError(errorMessage(err, 'Could not change this Login Name.')),
      },
    );
  };

  return (
    <Modal
      open
      onClose={handleClose}
      title={`Change Login Name - ${target.label}`}
      actions={
        <>
          <Button variant="text" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={change.isPending || !loginName.trim()}>
            {change.isPending ? 'Saving...' : 'Save'}
          </Button>
        </>
      }
    >
      {serverError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {serverError}
        </Alert>
      )}
      <Input label="Login Name" value={loginName} onChange={(e) => setLoginName(e.target.value)} fullWidth autoFocus />
    </Modal>
  );
}
