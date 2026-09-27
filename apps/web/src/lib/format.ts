/** The user's local calendar date as YYYY-MM-DD (used for "today" figures and date defaults). */
export function todayLocal(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Renders a YYYY-MM-DD or ISO timestamp as a short local date. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

export function personName(p: { fullName: string | null; loginName: string } | null | undefined): string {
  if (!p) return '—';
  return p.fullName ?? p.loginName;
}

export const PRODUCTION_STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'REWORK', label: 'Rework' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

export const AUDIT_STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'REVIEW_REQUIRED', label: 'Review Required' },
  { value: 'REJECTED', label: 'Rejected' },
];

export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

/**
 * @smartcode/ui DatePicker is a plain function component (no forwardRef),
 * so react-hook-form's `ref` must be routed to MUI's `inputRef` or the
 * form never reads the input's value.
 */
export function asInputRef<T extends { ref: unknown }>(registration: T): Omit<T, 'ref'> & { inputRef: T['ref'] } {
  const { ref, ...rest } = registration;
  return { ...rest, inputRef: ref };
}
