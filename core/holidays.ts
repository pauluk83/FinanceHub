/**
 * Holiday rows are stored the way the workbook stores them: one row for the
 * stay and, often, extra rows for flights, parking and insurance that share the
 * same dates and carry no nights. Group them so a view can show one headline
 * per trip without losing the individual cost lines.
 */

export interface HolidayShape {
  event?: string;
  start?: string;
  end?: string;
  nights?: number | string;
  totalPence?: number | null;
  totalText?: string;
}

/**
 * A cost line that names the stay or the travel is the booking itself, so the
 * trip row's own figure is the older total it replaced rather than a cost of
 * its own. Parking, insurance and the like never match and stay additive.
 */
const BOOKING_LINE = /hotel|flight|accommodation|apartment|villa|resort|lodge|booking/i;

/**
 * A row's amount in pounds. Imported rows keep the workbook's exact text, which
 * can carry half-pence (34.395), so it is preferred over the rounded pence; rows
 * edited in the app have no text and use their pence.
 */
function amountOf(holiday: HolidayShape): number | null {
  if (typeof holiday.totalPence !== 'number') return null;
  const text = typeof holiday.totalText === 'string' ? holiday.totalText.trim() : '';
  if (/^\d+(\.\d+)?$/.test(text)) return Number(text);
  return holiday.totalPence / 100;
}

/** Midnight UTC for a stored YYYY-MM-DD date, or null when it is unusable. */
function dayOf(value?: string): number | null {
  const date = typeof value === 'string' ? value.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const time = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(time) ? time : null;
}

/**
 * How many days the trip covers, counting the arrival and the leaving day: a
 * stay from 22 to 29 December is 8 days. Null when the dates are missing or the
 * end is before the start.
 */
export function daysBetween(start?: string, end?: string): number | null {
  const from = dayOf(start);
  const to = dayOf(end || start);
  if (from === null || to === null || to < from) return null;
  return Math.round((to - from) / 86400000) + 1;
}

/** Nights are the days less the arrival day, so 22 to 29 December is 7 nights. */
export function nightsBetween(start?: string, end?: string): number | null {
  const days = daysBetween(start, end);
  return days === null ? null : days - 1;
}

export interface HolidayTrip<T> {
  key: string;
  start: string;
  end: string;
  headline: T;
  extras: T[];
  rows: T[];
  totalPence: number | null;
  nights: number | null;
}

function rangeOf(holiday: HolidayShape): { start: string; end: string } {
  const start = typeof holiday.start === 'string' ? holiday.start : '';
  const rawEnd = typeof holiday.end === 'string' ? holiday.end : '';
  return { start, end: rawEnd && rawEnd >= start ? rawEnd : start };
}

function hasStay(holiday: HolidayShape): boolean {
  return typeof holiday.nights === 'number' && holiday.nights >= 0;
}

/**
 * A dated row with no night count at all: a trip saved before the dates worked
 * the nights out, or a row that came back from a store that drops the field.
 * Cost lines say so with "-", so a blank count is the trip itself.
 */
function isBlankNights(holiday: HolidayShape): boolean {
  if (typeof holiday.nights === 'number') return false;
  const text = holiday.nights === undefined || holiday.nights === null ? '' : String(holiday.nights).trim();
  return text === '' && typeof holiday.start === 'string' && holiday.start !== '';
}

/**
 * Older data stored a row under whatever year it was entered, so a 2027 trip
 * could sit in the 2026 bucket. Re-key every row by the year of its start date
 * (keeping its own year only when the start is missing).
 */
export function rekeyHolidaysByStartYear<T extends { start?: string }>(
  holidays: Record<string, readonly T[]>,
): Record<string, T[]> {
  const result: Record<string, T[]> = {};
  for (const [key, list] of Object.entries(holidays)) {
    for (const row of list ?? []) {
      const start = String(row.start ?? '');
      const year = /^\d{4}-\d{2}-\d{2}$/.test(start) ? start.slice(0, 4) : key;
      (result[year] ??= []).push(row);
    }
  }
  return result;
}

/**
 * Rows with a positive number of nights anchor a trip; rows without nights
 * attach to the latest matching anchor. That keeps two real trips on the same
 * dates separate while folding parking/insurance/flight lines into their stay.
 */
export function groupHolidayTrips<T>(
  rows: readonly T[],
  read: (row: T) => HolidayShape,
): HolidayTrip<T>[] {
  const groups: Array<{
    key: string;
    start: string;
    end: string;
    order: number;
    rows: T[];
    headline: T | null;
  }> = [];

  rows.forEach((row, index) => {
    const holiday = read(row);
    const { start, end } = rangeOf(holiday);
    // A blank night count anchors the trip only when it opens those dates; a
    // later row on the same dates is one of its cost lines.
    const stay = hasStay(holiday)
      || (isBlankNights(holiday) && !groups.some((candidate) => candidate.start === start && candidate.end === end));
    let group: (typeof groups)[number] | undefined;

    if (stay) {
      group = groups.find((candidate) => candidate.start === start && candidate.end === end && !candidate.headline);
    } else {
      for (let i = groups.length - 1; i >= 0; i--) {
        if (groups[i].start === start && groups[i].end === end) {
          group = groups[i];
          break;
        }
      }
    }

    if (!group) {
      const occurrence = groups.filter((candidate) => candidate.start === start && candidate.end === end).length;
      group = { key: `${start}|${end}|${occurrence}`, start, end, order: index, rows: [], headline: null };
      groups.push(group);
    }
    group.rows.push(row);
    if (stay && !group.headline) group.headline = row;
  });

  return groups
    .sort((a, b) => a.order - b.order)
    .map((group) => {
      const headline = group.headline ?? group.rows[0];
      const extras = group.rows.filter((row) => row !== headline);
      const priced = group.rows.filter((row) => amountOf(read(row)) !== null);
      const headlineAmount = amountOf(read(headline));
      const extraAmount = priced
        .filter((row) => row !== headline)
        .reduce((sum, row) => sum + (amountOf(read(row)) ?? 0), 0);
      // A trip's own figure is either its booking, which the cost lines add to,
      // or a total the lines already make up. It is the total when a cost line
      // names the stay or the travel (the amended Kn Matas trip carries 776 of
      // "flights and hotel" over an old 761), or when it matches the lines to
      // the penny (December's 700.54 is flights 633.38 + parking 34.395 +
      // insurance 32.765). Otherwise the lines are extras and are added, as with
      // Spain xmas: 450 for the stay plus 40 of parking.
      const itemised = extras.some((row) => BOOKING_LINE.test(String(read(row).event ?? '')));
      const coveredByLines = headlineAmount !== null && extras.length > 0
        && Math.abs(headlineAmount - extraAmount) <= 0.02;
      const tripAmount = extraAmount + (headlineAmount !== null && !itemised && !coveredByLines ? headlineAmount : 0);
      const totalPence = priced.length === 0 ? null : Math.round(tripAmount * 100);
      // Nights follow the dates, so a trip shows what its start and end really
      // cover; a stored figure is only used when the dates cannot be read.
      const storedNights = read(headline).nights;
      const nights = group.headline
        ? nightsBetween(group.start, group.end)
          ?? (typeof storedNights === 'number' && storedNights >= 0 ? storedNights : null)
        : null;
      return {
        key: group.key,
        start: group.start,
        end: group.end,
        headline,
        extras,
        rows: group.rows,
        totalPence,
        nights,
      };
    });
}
