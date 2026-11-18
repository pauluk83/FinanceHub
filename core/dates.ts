/**
 * A real calendar date in ISO form. The regex checks the shape, the month length
 * checks the calendar: 2026-02-31 and 2026-13-01 are rejected.
 */
export function isCalendarDate(value: unknown): boolean {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (year < 1000 || month < 1 || month > 12 || day < 1) return false;
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}
