'use client';
import MuiPagination from '@mui/material/Pagination';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, pageSize, total, onPageChange }: PaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 2 }}>
      <Typography variant="body2" color="text.secondary">
        {total === 0 ? 'No results' : `Showing ${from}-${to} of ${total}`}
      </Typography>
      <MuiPagination
        count={pageCount}
        page={page}
        onChange={(_, value) => onPageChange(value)}
        size="small"
        shape="rounded"
      />
    </Stack>
  );
}
