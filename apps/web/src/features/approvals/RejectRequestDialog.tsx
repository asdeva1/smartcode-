'use client';
import * as React from 'react';
import { Alert, Button, Input, Modal, useToast } from '@smartcode/ui';
import { errorMessage } from '@/lib/format';
import { useRejectRequest } from './use-approvals';

export function RejectRequestDialog({ requestId, label, onClose }: { requestId: string | null; label: string; onClose: () => void }) {
  const { showToast } = useToast();
  const reject = useRejectRequest();
  const [reason, setReason] = React.useState('');
  const [serverError, setServerError] = React.useState<string | null>(null);

  // Resets the form when a different request is targeted - intentionally
  // keyed only on requestId, not on `reject` (a new mutation object every
  // render, which would reset the form on every keystroke).
  React.useEffect(() => {
    setReason('');
    setServerError(null);
    reject.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId]);

  if (!requestId) return null;

  const handleSubmit = () => {
    setServerError(null);
    reject.mutate(
      { id: requestId, reason },
      {
        onSuccess: () => {
          showToast('Request rejected.', 'success');
          onClose();
        },
        onError: (err) => setServerError(errorMessage(err, 'Could not reject this request.')),
      },
    );
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Reject request - ${label}`}
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button color="error" onClick={handleSubmit} disabled={reject.isPending || !reason.trim()}>
            {reject.isPending ? 'Rejecting...' : 'Reject'}
          </Button>
        </>
      }
    >
      {serverError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {serverError}
        </Alert>
      )}
      <Input
        label="Rejection reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        fullWidth
        multiline
        minRows={2}
        autoFocus
      />
    </Modal>
  );
}
