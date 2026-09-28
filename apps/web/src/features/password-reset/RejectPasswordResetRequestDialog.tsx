'use client';
import * as React from 'react';
import { Alert, Button, Input, Modal, useToast } from '@smartcode/ui';
import { errorMessage } from '@/lib/format';
import { useRejectPasswordResetRequest } from './use-password-reset-requests';

/**
 * Manager rejects a password reset request (docs/09-BUSINESS-RULES.md
 * section 8, Phase 8) - a reason is required, and no reset link is ever
 * generated for a rejected request. Mirrors
 * features/approvals/RejectRequestDialog.tsx exactly.
 */
export function RejectPasswordResetRequestDialog({
  requestId,
  label,
  onClose,
}: {
  requestId: string | null;
  label: string;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const reject = useRejectPasswordResetRequest();
  const [reason, setReason] = React.useState('');
  const [serverError, setServerError] = React.useState<string | null>(null);

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
          showToast('Password reset request rejected.', 'success');
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
      title={`Reject password reset - ${label}`}
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
