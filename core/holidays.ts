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
  return typeof holiday.nights === 'number' && holiday.nights > 0;
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
    const stay = hasStay(holiday);
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
      const priced = group.rows.filter((row) => typeof read(row).totalPence === 'number');
      const headlinePence = priced.includes(headline) ? Number(read(headline).totalPence) : null;
      const extraPence = priced
        .filter((row) => row !== headline)
        .reduce((sum, row) => sum + Number(read(row).totalPence), 0);
      // Some trips store their own total already covering the cost lines (the
      // workbook's December trip carries 700.54, which is flights 633.38 +
      // parking 34.395 + insurance 32.765). Adding them again would double count,
      // so a headline that matches its cost lines within a penny or so is the
      // trip total; anything else is the booking and the lines add to it.
      const extrasIncluded = headlinePence !== null && priced.length > 1 && Math.abs(headlinePence - extraPence) <= 2;
      const totalPence = priced.length === 0
        ? null
        : extrasIncluded
          ? headlinePence
          : priced.reduce((sum, row) => sum + Number(read(row).totalPence), 0);
      const nights = read(headline).nights;
      return {
        key: group.key,
        start: group.start,
        end: group.end,
        headline,
        extras,
        rows: group.rows,
        totalPence,
        nights: typeof nights === 'number' && nights > 0 ? nights : null,
      };
    });
}
