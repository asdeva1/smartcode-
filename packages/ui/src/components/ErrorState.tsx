'use client';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Button } from './Button';

export interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
}

export function ErrorState({
  title = 'Something went wrong',
  description = 'Please try again, or contact support if the problem persists.',
  onRetry,
}: ErrorStateProps) {
  return (
    <Box sx={{ textAlign: 'center', py: 6, px: 2 }}>
      <Typography variant="subtitle1" fontWeight={600} color="error.main">
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: onRetry ? 2 : 0 }}>
        {description}
      </Typography>
      {onRetry && (
        <Button variant="outlined" onClick={onRetry}>
          Retry
        </Button>
      )}
    </Box>
  );
}
