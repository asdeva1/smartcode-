'use client';
import * as React from 'react';
import { Alert, Button, Input, Modal, useToast } from '@smartcode/ui';
import { errorMessage } from '@/lib/format';
import { useRequestLoginNameChange } from './use-request-login-name-change';

export interface LoginNameChangeTarget {
  id: string;
  label: string;
  currentLoginName: string;
}

/**
 * docs/09-BUSINESS-RULES.md section 9 - the Team Lead side of the
 * Login Name change workflow. This only files a request; a Manager
 * must Approve it (on /manager/approvals) before the Login Name
 * actually changes, so this dialog never shows a success state beyond
 * "submitted for approval".
 */
export function RequestLoginNameChangeDialog({ target, onClose }: { target: LoginNameChangeTarget | null; onClose: () => void }) {
  const { showToast } = useToast();
  const request = useRequestLoginNameChange();
  const [loginName, setLoginName] = React.useState('');
  const [serverError, setServerError] = React.useState<string | null>(null);

  // Resets the form when a different Coder is targeted - intentionally
  // keyed only on target?.id, not on `request` (a new mutation object
  // every render, which would reset the form on every keystroke).
  React.useEffect(() => {
    setLoginName('');
    setServerError(null);
    request.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.id]);

  if (!target) return null;

  const handleClose = () => {
    request.reset();
    onClose();
  };

  const handleSubmit = () => {
    setServerError(null);
    request.mutate(
      { id: target.id, loginName },
      {
        onSuccess: () => {
          showToast('Login Name change requested - awaiting Manager approval.', 'success');
          handleClose();
        },
        onError: (err) => setServerError(errorMessage(err, 'Could not submit this request.')),
      },
    );
  };

  return (
    <Modal
      open
      onClose={handleClose}
      title={`Request Login Name change - ${target.label}`}
      actions={
        <>
          <Button variant="text" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={request.isPending || !loginName.trim()}>
            {request.isPending ? 'Submitting...' : 'Submit for Approval'}
          </Button>
        </>
      }
    >
      {serverError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {serverError}
        </Alert>
      )}
      <Alert severity="info" sx={{ mb: 2 }}>
        This does not change the Login Name directly - a Manager must approve it first.
      </Alert>
      <Input
        label="Current Login Name"
        value={target.currentLoginName}
        fullWidth
        disabled
        sx={{ mb: 2 }}
      />
      <Input
        label="Requested Login Name"
        value={loginName}
        onChange={(e) => setLoginName(e.target.value)}
        fullWidth
        autoFocus
      />
    </Modal>
  );
}
