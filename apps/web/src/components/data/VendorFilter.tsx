'use client';
import * as React from 'react';
import { Select } from '@smartcode/ui';
import { useVendorOptions } from '@/features/vendors/use-vendors';

/**
 * Manager-only "Vendor" filter for list and report screens. The chosen id
 * is sent to the API, which AND-s it onto the caller's scope - it can only
 * narrow what the Manager already sees.
 */
export function VendorFilter({ value, onChange, minWidth = 190 }: { value: string; onChange: (vendorId: string) => void; minWidth?: number }) {
  const { data } = useVendorOptions();
  return (
    <Select
      label="Vendor"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      options={[{ value: '', label: 'All vendors' }, ...(data ?? []).map((v) => ({ value: v.id, label: v.isActive ? v.name : `${v.name} (inactive)` }))]}
      sx={{ minWidth }}
    />
  );
}
