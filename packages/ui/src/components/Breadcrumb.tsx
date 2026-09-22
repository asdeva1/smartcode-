'use client';
import MuiBreadcrumbs from '@mui/material/Breadcrumbs';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <MuiBreadcrumbs sx={{ fontSize: '0.8125rem' }}>
      {items.map((item, i) =>
        item.href && i < items.length - 1 ? (
          <Link key={item.label} href={item.href} underline="hover" color="text.secondary">
            {item.label}
          </Link>
        ) : (
          <Typography key={item.label} color="text.primary" fontSize="inherit">
            {item.label}
          </Typography>
        ),
      )}
    </MuiBreadcrumbs>
  );
}
