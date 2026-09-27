import {
  MAX_PERIOD_BUCKETS,
  PeriodError,
  REPORT_PERIODS,
  addDays,
  enumerateBuckets,
  periodBucket,
  resolvePeriod,
  startOfWeek,
  todayInTimeZone,
} from '@smartcode/types';

/**
 * The shared report period utility (@smartcode/types period.ts) is the one
 * place report ranges are calculated for every role. These cases pin the
 * calendar edges where off-by-one-day errors usually hide.
 */
describe('report period calculations', () => {
  describe('resolvePeriod', () => {
    // 2026-09-27 is a Sunday.
    const today = '2026-09-27';

    it('today / yesterday, including across month and year boundaries', () => {
      expect(resolvePeriod('today', today)).toEqual({ from: today, to: today });
      expect(resolvePeriod('yesterday', today)).toEqual({ from: '2026-09-26', to: '2026-09-26' });
      expect(resolvePeriod('yesterday', '2026-03-01')).toEqual({ from: '2026-02-28', to: '2026-02-28' });
      expect(resolvePeriod('yesterday', '2024-03-01')).toEqual({ from: '2024-02-29', to: '2024-02-29' });
      expect(resolvePeriod('yesterday', '2027-01-01')).toEqual({ from: '2026-12-31', to: '2026-12-31' });
    });

    it('weeks start on Monday (ISO) - a Sunday belongs to the week that began six days earlier', () => {
      expect(resolvePeriod('this_week', today)).toEqual({ from: '2026-09-21', to: today });
      expect(resolvePeriod('this_week', '2026-09-21')).toEqual({ from: '2026-09-21', to: '2026-09-21' });
      expect(resolvePeriod('last_week', today)).toEqual({ from: '2026-09-14', to: '2026-09-20' });
      // A week spanning New Year.
      expect(resolvePeriod('last_week', '2026-01-07')).toEqual({ from: '2025-12-29', to: '2026-01-04' });
    });

    it('months: this month to date, last month complete (incl. February and leap years)', () => {
      expect(resolvePeriod('this_month', today)).toEqual({ from: '2026-09-01', to: today });
      expect(resolvePeriod('last_month', today)).toEqual({ from: '2026-08-01', to: '2026-08-31' });
      expect(resolvePeriod('last_month', '2026-03-31')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
      expect(resolvePeriod('last_month', '2024-03-15')).toEqual({ from: '2024-02-01', to: '2024-02-29' });
      expect(resolvePeriod('last_month', '2026-01-10')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
    });

    it('quarters: this quarter to date, last quarter complete (Q1 -> previous year Q4)', () => {
      expect(resolvePeriod('this_quarter', today)).toEqual({ from: '2026-07-01', to: today });
      expect(resolvePeriod('last_quarter', today)).toEqual({ from: '2026-04-01', to: '2026-06-30' });
      expect(resolvePeriod('this_quarter', '2026-03-31')).toEqual({ from: '2026-01-01', to: '2026-03-31' });
      expect(resolvePeriod('last_quarter', '2026-02-14')).toEqual({ from: '2025-10-01', to: '2025-12-31' });
      expect(resolvePeriod('last_quarter', '2026-12-31')).toEqual({ from: '2026-07-01', to: '2026-09-30' });
    });

    it('this year runs from 1 January to today', () => {
      expect(resolvePeriod('this_year', today)).toEqual({ from: '2026-01-01', to: today });
    });

    it('custom range must be complete, real and ordered', () => {
      expect(resolvePeriod('custom', today, { from: '2026-02-01', to: '2026-02-28' })).toEqual({ from: '2026-02-01', to: '2026-02-28' });
      expect(() => resolvePeriod('custom', today, { from: '2026-02-01' })).toThrow(PeriodError);
      expect(() => resolvePeriod('custom', today, { from: '2026-03-01', to: '2026-02-01' })).toThrow('from must be on or before to');
      expect(() => resolvePeriod('custom', today, { from: '2026-02-30', to: '2026-03-01' })).toThrow('not a real calendar date');
    });

    it('rejects an invalid "today" and covers every advertised period', () => {
      expect(() => resolvePeriod('today', '27-09-2026')).toThrow(PeriodError);
      for (const p of REPORT_PERIODS.filter((x) => x !== 'custom')) {
        const r = resolvePeriod(p, today);
        expect(r.from <= r.to).toBe(true);
        expect(r.to <= today).toBe(true); // never reaches into the future
      }
    });

    it('does not depend on the host timezone (pure calendar arithmetic)', () => {
      const original = process.env.TZ;
      try {
        for (const tz of ['UTC', 'Asia/Kolkata', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
          process.env.TZ = tz;
          expect(resolvePeriod('last_month', '2026-03-01')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
          expect(startOfWeek('2026-01-01')).toBe('2025-12-29');
          expect(addDays('2026-03-29', 1)).toBe('2026-03-30'); // across a DST change in many zones
        }
      } finally {
        process.env.TZ = original;
      }
    });
  });

  describe('grouping buckets', () => {
    it('labels weekly, monthly, quarterly, yearly and custom buckets', () => {
      expect(periodBucket('2026-01-01', 'week')).toEqual({ key: '2025-12-29', label: 'Week of 2025-12-29', from: '2025-12-29', to: '2026-01-04' });
      expect(periodBucket('2026-02-14', 'month')).toEqual({ key: '2026-02', label: 'Feb 2026', from: '2026-02-01', to: '2026-02-28' });
      expect(periodBucket('2026-11-30', 'quarter')).toEqual({ key: '2026-Q4', label: 'Q4 2026', from: '2026-10-01', to: '2026-12-31' });
      expect(periodBucket('2026-06-01', 'year')).toEqual({ key: '2026', label: '2026', from: '2026-01-01', to: '2026-12-31' });
      expect(periodBucket('2026-06-01', 'custom', { from: '2026-05-01', to: '2026-06-30' }).label).toBe('2026-05-01 to 2026-06-30');
    });

    it('enumerates every bucket in the range, including empty ones', () => {
      expect(enumerateBuckets({ from: '2026-01-15', to: '2026-04-02' }, 'month').map((b) => b.key)).toEqual(['2026-01', '2026-02', '2026-03', '2026-04']);
      expect(enumerateBuckets({ from: '2025-12-31', to: '2026-01-12' }, 'week').map((b) => b.key)).toEqual(['2025-12-29', '2026-01-05', '2026-01-12']);
      expect(enumerateBuckets({ from: '2025-11-01', to: '2026-02-01' }, 'quarter').map((b) => b.key)).toEqual(['2025-Q4', '2026-Q1']);
      expect(enumerateBuckets({ from: '2026-01-01', to: '2026-12-31' }, 'custom')).toHaveLength(1);
    });

    it('refuses runaway groupings instead of producing thousands of rows', () => {
      expect(() => enumerateBuckets({ from: '2000-01-01', to: '2026-01-01' }, 'week')).toThrow(`more than ${MAX_PERIOD_BUCKETS}`);
      expect(() => enumerateBuckets({ from: '2026-02-01', to: '2026-01-01' }, 'month')).toThrow(PeriodError);
    });
  });

  describe('todayInTimeZone', () => {
    it('uses the explicit zone, not the host clock zone', () => {
      const instant = new Date('2026-09-26T20:00:00.000Z'); // 01:30 on the 27th in India, 13:00 on the 26th in California
      expect(todayInTimeZone('Asia/Kolkata', instant)).toBe('2026-09-27');
      expect(todayInTimeZone('America/Los_Angeles', instant)).toBe('2026-09-26');
      expect(todayInTimeZone('UTC', instant)).toBe('2026-09-26');
    });
  });
});
