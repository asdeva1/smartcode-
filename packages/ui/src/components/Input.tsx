'use client';

import React from 'react';
import TextField, { TextFieldProps } from '@mui/material/TextField';

export type InputProps = TextFieldProps;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  function Input(props, ref) {
    return (
      <TextField
        size="small"
        fullWidth
        variant="outlined"
        inputRef={ref}
        {...props}
      />
    );
  },
);

Input.displayName = 'Input';