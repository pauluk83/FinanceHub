import { MONTHS, type Dataset } from '../../core/engine.ts';

export type IncomeScheme = 'pip' | 'uc';

type ScheduleYearKey = 'year2026' | 'year2027' | 'year2028';

const scheduleYearKey = (year: number): ScheduleYearKey =>
  year === 2027 ? 'year2027' : year === 2028 ? 'year2028' : 'year2026';

const monthIndex = (month: string) => MONTHS.indexOf(month as (typeof MONTHS)[number]);

/**
 * The payments an effective-dated rate change reaches: every month from
 * `fromMonth` onward that holds a dated payment in `year`. Months without a
 * payment, or with a date outside `year`, are skipped; earlier months keep the
 * amount they were paid.
 */
export function incomeRateTargets(ds: Dataset, scheme: IncomeScheme, year: number, fromMonth: string) {
  const from = monthIndex(fromMonth);
  if (from < 0) return [];
  const key = scheduleYearKey(year);
  return ds.incomeSchedules[scheme].filter((row) => {
    const cell = row[key];
    // The income engine only counts a payment whose date is in the year it is
    // shown under; a mismatched cell must not be rewritten behind that check.
    return monthIndex(row.month) >= from && !!cell?.date && cell.date.startsWith(`${year}-`);
  });
}

/**
 * Apply an effective-dated rate to those payments in place and return how many
 * changed. A duplicate month (PIP can pay twice in December) keeps both rows.
 */
export function applyIncomeRateChange(
  ds: Dataset,
  scheme: IncomeScheme,
  year: number,
  fromMonth: string,
  amountPence: number,
): number {
  const key = scheduleYearKey(year);
  const targets = incomeRateTargets(ds, scheme, year, fromMonth);
  for (const row of targets) {
    const cell = row[key];
    if (cell) cell.amountPence = amountPence;
  }
  return targets.length;
}
