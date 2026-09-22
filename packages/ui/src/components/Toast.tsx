'use client';
import * as React from 'react';
import Snackbar from '@mui/material/Snackbar';
import MuiAlert from '@mui/material/Alert';

type ToastSeverity = 'success' | 'error' | 'info' | 'warning';
interface ToastState {
  open: boolean;
  message: string;
  severity: ToastSeverity;
}

interface ToastContextValue {
  showToast: (message: string, severity?: ToastSeverity) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

/** Wraps the app once (see apps/web root layout). Call useToast() anywhere below it. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<ToastState>({
    open: false,
    message: '',
    severity: 'info',
  });

  const showToast = React.useCallback((message: string, severity: ToastSeverity = 'info') => {
    setState({ open: true, message, severity });
  }, []);

  const handleClose = () => setState((s) => ({ ...s, open: false }));

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <Snackbar
        open={state.open}
        autoHideDuration={4000}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <MuiAlert onClose={handleClose} severity={state.severity} variant="filled" sx={{ width: '100%' }}>
          {state.message}
        </MuiAlert>
      </Snackbar>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
