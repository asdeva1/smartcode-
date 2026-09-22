'use client';
import MuiButton, { ButtonProps as MuiButtonProps } from '@mui/material/Button';

export type ButtonProps = MuiButtonProps;

/** Thin wrapper so every button in the app goes through one place. */
export function Button(props: ButtonProps) {
  return <MuiButton variant="contained" size="medium" {...props} />;
}
