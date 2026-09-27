'use client';
import * as React from 'react';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Typography from '@mui/material/Typography';
import { Alert, Button, ConfirmDialog, Input, Modal, useToast } from '@smartcode/ui';
import { useResetPassword, type ResetPasswordResult } from './use-reset-password';

export interface ResetPasswordTarget {
  id: string;
  /** Display name shown in the confirmation prompt (e.g. the person's full name). */
  label: string;
}

/**
 * Two-step password reset (docs/09-BUSINESS-RULES.md section 6/7):
 * confirm, then a one-time display of the generated temporary password.
 * Shared by every screen that can reset a password (Manager's Team
 * Lead/Auditor/Vendor-account screens, Team Lead's own-team Coder
 * screen) - the backend alone decides who is authorized for a given
 * target; this component just drives the confirm -> result flow.
 */
export function ResetPasswordDialog({ target, onClose }: { target: ResetPasswordTarget | null; onClose: () => void }) {
  const { showToast } = useToast();
  const resetPassword = useResetPassword();
  const [result, setResult] = React.useState<ResetPasswordResult | null>(null);

  const handleClose = () => {
    setResult(null);
    resetPassword.reset();
    onClose();
  };

  const handleConfirm = () => {
    if (!target) return;
    resetPassword.mutate(target.id, {
      onSuccess: (data) => setResult(data),
      onError: () => showToast('Could not reset this password.', 'error'),
    });
  };

  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.temporaryPassword);
      showToast('Temporary password copied.', 'success');
    } catch {
      showToast('Could not copy automatically - please copy it manually.', 'error');
    }
  };

  if (result) {
    return (
      <Modal open onClose={handleClose} title="Password reset" actions={<Button onClick={handleClose}>Done</Button>}>
        <Alert severity="warning" sx={{ mb: 2 }}>
          This temporary password is shown only once. Share it with {result.loginName} out of band - it cannot be
          retrieved again once this dialog is closed.
        </Alert>
        <Input
          label="Temporary password"
          value={result.temporaryPassword}
          fullWidth
          InputProps={{
            readOnly: true,
            endAdornment: (
              <InputAdornment position="end">
                <IconButton aria-label="Copy temporary password" onClick={copy} edge="end">
                  <ContentCopyIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            ),
          }}
        />
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          Their existing sessions have been signed out; they must sign in again with this password.
        </Typography>
      </Modal>
    );
  }

  return (
    <ConfirmDialog
      open={!!target}
      title="Reset password"
      description={`Generate a new one-time password for ${target?.label ?? 'this user'}? This immediately signs them out of every existing session.`}
      confirmLabel={resetPassword.isPending ? 'Resetting...' : 'Reset Password'}
      onConfirm={handleConfirm}
      onCancel={handleClose}
    />
  );
}
