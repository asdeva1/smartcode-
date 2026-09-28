'use client';
import * as React from 'react';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Typography from '@mui/material/Typography';
import type { PasswordResetRequestRow } from '@smartcode/types';
import { Alert, Button, ConfirmDialog, Input, Modal, useToast } from '@smartcode/ui';
import { personName } from '@/lib/format';
import { useApprovePasswordResetRequest } from './use-password-reset-requests';

/**
 * Manager approves a password reset request (docs/09-BUSINESS-RULES.md
 * section 8, Phase 8): confirm, then a one-time display of the generated
 * reset link - mirrors features/users/ResetPasswordDialog.tsx's
 * confirm -> one-time-result pattern, but for a URL instead of a
 * temporary password. The link is never shown again once this dialog is
 * closed; the Manager must copy/send it now.
 */
export function ApprovePasswordResetRequestDialog({
  target,
  onClose,
}: {
  target: PasswordResetRequestRow | null;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const approve = useApprovePasswordResetRequest();
  const [resetUrl, setResetUrl] = React.useState<string | null>(null);

  const handleClose = () => {
    setResetUrl(null);
    approve.reset();
    onClose();
  };

  const handleConfirm = () => {
    if (!target) return;
    approve.mutate(target.id, {
      onSuccess: (data) => setResetUrl(data.resetUrl),
      onError: () => showToast('Could not approve this request.', 'error'),
    });
  };

  const copy = async () => {
    if (!resetUrl) return;
    try {
      await navigator.clipboard.writeText(resetUrl);
      showToast('Reset link copied.', 'success');
    } catch {
      showToast('Could not copy automatically - please copy it manually.', 'error');
    }
  };

  if (resetUrl) {
    return (
      <Modal open onClose={handleClose} title="Password reset approved" actions={<Button onClick={handleClose}>Done</Button>}>
        <Alert severity="warning" sx={{ mb: 2 }}>
          This reset link is shown only once. Send it to {target ? personName(target.targetUser) : 'the user'} out of
          band - it cannot be retrieved again once this dialog is closed.
        </Alert>
        <Input
          label="Reset link"
          value={resetUrl}
          fullWidth
          InputProps={{
            readOnly: true,
            endAdornment: (
              <InputAdornment position="end">
                <IconButton aria-label="Copy reset link" onClick={copy} edge="end">
                  <ContentCopyIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            ),
          }}
        />
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          The link is single-use and expires; it stops working once used, once revoked, or once it expires.
        </Typography>
      </Modal>
    );
  }

  return (
    <ConfirmDialog
      open={!!target}
      title="Approve password reset"
      description={`Generate a single-use reset link for ${target ? personName(target.targetUser) : 'this user'}? You will need to send it to them yourself.`}
      confirmLabel={approve.isPending ? 'Approving...' : 'Approve'}
      onConfirm={handleConfirm}
      onCancel={handleClose}
    />
  );
}
