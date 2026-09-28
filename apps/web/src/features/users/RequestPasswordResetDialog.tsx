'use client';
import * as React from 'react';
import { Alert, Button, Input, Modal, useToast } from '@smartcode/ui';
import { errorMessage } from '@/lib/format';
import { useRequestPasswordReset } from './use-request-password-reset';

export interface RequestPasswordResetTarget {
  id: string;
  /** Display name shown in the confirmation prompt. */
  label: string;
}

/**
 * Vendor/Team Lead side of the password-reset workflow (docs/09-BUSINESS-
 * RULES.md section 8, Phase 8): this only FILES a request - it never
 * resets anything directly, and never shows a password or a link. A
 * Manager must approve the request (on /manager/password-reset-requests)
 * before a reset link is generated and handed to the Coder. Shared by
 * every screen that can request a reset (Vendor's own-vendor Coder
 * screen, Team Lead's own-team Coder screen) - the backend alone decides
 * who is authorized for a given target.
 */
export function RequestPasswordResetDialog({ target, onClose }: { target: RequestPasswordResetTarget | null; onClose: () => void }) {
  const { showToast } = useToast();
  const request = useRequestPasswordReset();
  const [reason, setReason] = React.useState('');
  const [serverError, setServerError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setReason('');
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
      { id: target.id, reason: reason.trim() || undefined },
      {
        onSuccess: () => {
          showToast('Password reset requested - awaiting Manager approval.', 'success');
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
      title={`Request password reset - ${target.label}`}
      actions={
        <>
          <Button variant="text" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={request.isPending}>
            {request.isPending ? 'Submitting...' : 'Request Password Reset'}
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
        A Manager will review this and, if approved, generate a secure one-time reset link - you will not see or set the password yourself.
      </Alert>
      <Input
        label="Reason (optional)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        fullWidth
        multiline
        minRows={2}
      />
    </Modal>
  );
}
