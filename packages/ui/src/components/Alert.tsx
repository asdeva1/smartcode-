'use client';
import MuiAlert, { AlertProps as MuiAlertProps } from '@mui/material/Alert';

export type AlertProps = MuiAlertProps;

export function Alert(props: AlertProps) {
  return <MuiAlert variant="outlined" {...props} />;
}
