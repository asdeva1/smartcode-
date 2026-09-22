'use client';
import TextField, { TextFieldProps } from '@mui/material/TextField';

/**
 * Phase 1: native date input styled to match the design system.
 * A calendar-popover date picker (@mui/x-date-pickers) can replace
 * this without changing the component's public props if the team
 * wants richer UX later - deferred to keep the Phase 1 dependency
 * surface smaller.
 */
export interface DatePickerProps extends Omit<TextFieldProps, 'type'> {}

export function DatePicker(props: DatePickerProps) {
  return (
    <TextField
      type="date"
      size="small"
      fullWidth
      variant="outlined"
      InputLabelProps={{ shrink: true }}
      {...props}
    />
  );
}
