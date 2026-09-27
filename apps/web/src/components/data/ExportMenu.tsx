'use client';
import * as React from 'react';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { Download } from 'lucide-react';
import type { ExportFormat } from '@smartcode/types';
import { Button, useToast } from '@smartcode/ui';
import { apiDownload, toQuery } from '@/lib/api-client';
import { errorMessage } from '@/lib/format';

const FORMATS: { format: ExportFormat; label: string }[] = [
  { format: 'pdf', label: 'Export PDF' },
  { format: 'xlsx', label: 'Export Excel' },
  { format: 'csv', label: 'Export CSV' },
];

/**
 * Export button with PDF / Excel / CSV. Always calls the backend export
 * endpoint with the screen's current filters, so the file contains exactly
 * what the caller is authorised to see - never client-assembled data.
 */
export function ExportMenu({
  path,
  params = {},
  disabled,
}: {
  path: string;
  params?: Record<string, string | number | boolean | null | undefined>;
  disabled?: boolean;
}) {
  const { showToast } = useToast();
  const [anchor, setAnchor] = React.useState<HTMLElement | null>(null);
  const [busy, setBusy] = React.useState(false);

  const run = async (format: ExportFormat) => {
    setAnchor(null);
    setBusy(true);
    try {
      const fileName = await apiDownload(`${path}?${toQuery({ ...params, format })}`);
      showToast(`Downloaded ${fileName}`, 'success');
    } catch (err) {
      showToast(errorMessage(err, 'Export failed.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        variant="outlined"
        startIcon={<Download size={16} />}
        onClick={(e) => setAnchor(e.currentTarget)}
        disabled={disabled || busy}
        aria-haspopup="menu"
      >
        {busy ? 'Exporting...' : 'Export'}
      </Button>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        {FORMATS.map((f) => (
          <MenuItem key={f.format} onClick={() => run(f.format)}>
            {f.label}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
