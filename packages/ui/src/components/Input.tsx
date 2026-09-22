'use client';
import TextField, { TextFieldProps } from '@mui/material/TextField';

export type InputProps = TextFieldProps;

export function Input(props: InputProps) {
  return <TextField size="small" fullWidth variant="outlined" {...props} />;
}
