/**
 * Report period utility - the ONE place report date ranges and period
 * buckets are calculated, shared by the API (authoritative) and the web
 * (to show the resolved range before running a report).
 *
 * Timezone safety: every calculation works on calendar dates
 * ("YYYY-MM-DD") using UTC arithmetic only, so the host timezone can
 * never shift a day. The caller supplies its own local "today" (the web
 * sends the browser's local date, exactly as the dashboard already does);
 * when it doesn't, the API derives it with todayInTimeZone() for an
 * explicit IANA zone. Production codedDate / audit auditDate are stored
 * as UTC midnight of their calendar date, so bucketing them by their
 * ISO date string is exact.
 *
 * Conventions: weeks start on Monday (ISO-8601). "This week/month/
 * quarter/year" run from the period start to today (period-to-date);
 * "Last ..." periods are the complete previous period.
 */

export const REPORT_PERIODS = [
  'today',
  'yesterday',
  'this_week',
  'last_week',
  'this_month',
  'last_month',
  'this_quarter',
  'last_quarter',
  'this_year',
  'custom',
] as const;
export type ReportPeriod = (typeof REPORT_PERIODS)[number];

export const REPORT_PERIOD_LABELS: Record<ReportPeriod, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  this_week: 'This Week',
  last_week: 'Last Week',
  this_month: 'This Month',
  last_month: 'Last Month',
  this_quarter: 'This Quarter',
  last_quarter: 'Last Quarter',
  this_year: 'This Year',
  custom: 'Custom Date Range',
};

/** Report grouping. "custom" = one row for the whole selected range (no bucketing). */
export const REPORT_GROUPINGS = ['week', 'month', 'quarter', 'year', 'custom'] as const;
export type ReportGrouping = (typeof REPORT_GROUPINGS)[number];

export const REPORT_GROUPING_LABELS: Record<ReportGrouping, string> = {
  week: 'Weekly',
  month: 'Monthly',
  quarter: 'Quarterly',
  year: 'Yearly',
  custom: 'Custom (whole range)',
};

export interface DateRange {
  from: string;
  to: string;
}

export interface PeriodBucket {
  key: string;
  label: string;
  from: string;
  to: string;
}

/** Guards against a runaway weekly grouping over many years. */
export const MAX_PERIOD_BUCKETS = 400;

export class PeriodError extends Error {}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Parses a real calendar date (rejects 2026-02-30) into a UTC-midnight Date. */
function parse(value: string, label = 'date'): Date {
  const m = DATE_RE.exec(value);
  if (!m) throw new PeriodError(`${label} must be YYYY-MM-DD`);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (d.getUTCFullYear() !== Number(m[1]) || d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) {
    throw new PeriodError(`${label} is not a real calendar date`);
  }
  return d;
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));

export function addDays(value: string, days: number): string {
  const d = parse(value);
  return fmt(utc(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days));
}

/** Monday of the ISO week containing the date. */
export function startOfWeek(value: string): string {
  const d = parse(value);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0 ... Sunday = 6
  return addDays(value, -dow);
}

function startOfMonth(d: Date): Date {
  return utc(d.getUTCFullYear(), d.getUTCMonth(), 1);
}
function endOfMonth(d: Date): Date {
  return utc(d.getUTCFullYear(), d.getUTCMonth() + 1, 0);
}
function quarterOf(d: Date): number {
  return Math.floor(d.getUTCMonth() / 3);
}
function startOfQuarter(d: Date): Date {
  return utc(d.getUTCFullYear(), quarterOf(d) * 3, 1);
}
function endOfQuarter(d: Date): Date {
  return utc(d.getUTCFullYear(), quarterOf(d) * 3 + 3, 0);
}

/**
 * The inclusive date range for a named period relative to `today`
 * (the caller's local calendar date). Custom requires a valid from <= to.
 */
export function resolvePeriod(period: ReportPeriod, today: string, custom: Partial<DateRange> = {}): DateRange {
  const t = parse(today, 'today');
  switch (period) {
    case 'today':
      return { from: today, to: today };
    case 'yesterday': {
      const y = addDays(today, -1);
      return { from: y, to: y };
    }
    case 'this_week':
      return { from: startOfWeek(today), to: today };
    case 'last_week': {
      const from = addDays(startOfWeek(today), -7);
      return { from, to: addDays(from, 6) };
    }
    case 'this_month':
      return { from: fmt(startOfMonth(t)), to: today };
    case 'last_month': {
      const prev = utc(t.getUTCFullYear(), t.getUTCMonth() - 1, 1);
      return { from: fmt(prev), to: fmt(endOfMonth(prev)) };
    }
    case 'this_quarter':
      return { from: fmt(startOfQuarter(t)), to: today };
    case 'last_quarter': {
      const prev = utc(t.getUTCFullYear(), quarterOf(t) * 3 - 3, 1);
      return { from: fmt(prev), to: fmt(endOfQuarter(prev)) };
    }
    case 'this_year':
      return { from: `${t.getUTCFullYear()}-01-01`, to: today };
    case 'custom': {
      if (!custom.from || !custom.to) throw new PeriodError('A custom date range needs both a from and a to date');
      const from = parse(custom.from, 'from');
      const to = parse(custom.to, 'to');
      if (from > to) throw new PeriodError('from must be on or before to');
      return { from: custom.from, to: custom.to };
    }
    default:
      throw new PeriodError(`Unknown period "${String(period)}"`);
  }
}

/** The bucket a calendar date falls into for a grouping. */
export function periodBucket(value: string, grouping: ReportGrouping, range?: DateRange): PeriodBucket {
  const d = parse(value);
  switch (grouping) {
    case 'week': {
      const from = startOfWeek(value);
      return { key: from, label: `Week of ${from}`, from, to: addDays(from, 6) };
    }
    case 'month': {
      const from = startOfMonth(d);
      return {
        key: fmt(from).slice(0, 7),
        label: `${MONTHS[from.getUTCMonth()]} ${from.getUTCFullYear()}`,
        from: fmt(from),
        to: fmt(endOfMonth(d)),
      };
    }
    case 'quarter': {
      const from = startOfQuarter(d);
      const key = `${from.getUTCFullYear()}-Q${quarterOf(d) + 1}`;
      return { key, label: `Q${quarterOf(d) + 1} ${from.getUTCFullYear()}`, from: fmt(from), to: fmt(endOfQuarter(d)) };
    }
    case 'year': {
      const y = d.getUTCFullYear();
      return { key: String(y), label: String(y), from: `${y}-01-01`, to: `${y}-12-31` };
    }
    case 'custom':
    default: {
      const from = range?.from ?? value;
      const to = range?.to ?? value;
      return { key: 'range', label: `${from} to ${to}`, from, to };
    }
  }
}

/** Every bucket intersecting [from, to], in order (so empty periods still show as zero rows). */
export function enumerateBuckets(range: DateRange, grouping: ReportGrouping): PeriodBucket[] {
  const start = parse(range.from, 'from');
  const end = parse(range.to, 'to');
  if (start > end) throw new PeriodError('from must be on or before to');
  if (grouping === 'custom') return [periodBucket(range.from, 'custom', range)];
  const out: PeriodBucket[] = [];
  let cursor = range.from;
  while (cursor <= range.to) {
    const b = periodBucket(cursor, grouping);
    out.push(b);
    if (out.length > MAX_PERIOD_BUCKETS) {
      throw new PeriodError(`This range has more than ${MAX_PERIOD_BUCKETS} ${REPORT_GROUPING_LABELS[grouping].toLowerCase()} periods - choose a shorter range or a larger grouping`);
    }
    cursor = addDays(b.to, 1);
  }
  return out;
}

/** Today's calendar date in an explicit IANA timezone (never the host's implicit zone). */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
