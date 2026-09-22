'use client';
import MuiTextField, { TextFieldProps } from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends Omit<TextFieldProps, 'select'> {
  options: SelectOption[];
}

export function Select({ options, ...props }: SelectProps) {
  return (
    <MuiTextField select size="small" fullWidth variant="outlined" {...props}>
      {options.map((opt) => (
        <MenuItem key={opt.value} value={opt.value}>
          {opt.label}
        </MenuItem>
      ))}
    </MuiTextField>
  );
}
