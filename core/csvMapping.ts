/**
 * CSV column mapping (R12).
 *
 * The built-in importer and a saved bank profile run through the same mapper,
 * so a profile that describes a Starling-shaped file produces exactly the rows
 * the built-in parser would. Nothing here posts anything; the caller stages the
 * rows in the existing review grid.
 */

export type CsvDelimiter = ',' | ';' | '\t';
export type CsvDateFormat = 'iso' | 'uk' | 'us';
/** `signed` treats a negative amount as spending; `inverted` flips the sign. */
export type CsvSign = 'signed' | 'inverted';

import { isCalendarDate } from './dates.ts';

export interface CsvProfile {
  id: string;
  name: string;
  delimiter: CsvDelimiter;
  hasHeader: boolean;
  dateColumn: number;
  descriptionColumn: number;
  amountColumn: number;
  /** Null when the file has no direction column and the sign decides. */
  typeColumn: number | null;
  dateFormat: CsvDateFormat;
  sign: CsvSign;
}

export interface MappedCsvRow {
  date: string;
  description: string;
  amountPence: number;
  type: 'Income' | 'Expense';
}

export const CSV_DELIMITERS: { id: CsvDelimiter; label: string }[] = [
  { id: ',', label: 'Comma' },
  { id: ';', label: 'Semicolon' },
  { id: '\t', label: 'Tab' },
];

/** Split a delimited file, honouring quoted fields and doubled quotes. */
export function parseDelimited(text: string, delimiter: CsvDelimiter = ','): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') { field += '"'; index += 1; } else quoted = false;
      } else field += character;
    } else if (character === '"') quoted = true;
    else if (character === delimiter) { row.push(field); field = ''; }
    else if (character === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (character !== '\r') field += character;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((entry) => entry.some((cell) => cell.trim() !== ''));
}

/** Pick the delimiter that yields the most columns on the first non-empty line. */
export function guessDelimiter(text: string): CsvDelimiter {
  const line = text.split(/\r?\n/).find((entry) => entry.trim() !== '') ?? '';
  let best: CsvDelimiter = ',';
  let bestCount = 0;
  for (const delimiter of [',', ';', '\t'] as CsvDelimiter[]) {
    let count = 0;
    let quoted = false;
    for (const character of line) {
      if (character === '"') quoted = !quoted;
      else if (!quoted && character === delimiter) count += 1;
    }
    if (count > bestCount) { best = delimiter; bestCount = count; }
  }
  return best;
}

/** Matches the importer's existing money parsing: £, commas and spaces removed. */
export function parseAmountPence(input: string): number {
  const cleaned = String(input ?? '').replace(/[£,\s]/g, '');
  if (!cleaned) return 0;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return 0;
  // A value near Number.MAX_VALUE overflows when converted to pence; an
  // Infinity amount would poison every total it touches.
  const pence = Math.round(value * 100);
  return Number.isFinite(pence) ? pence : 0;
}

export function parseCsvDate(input: string, format: 'iso' | 'uk' | 'us' | 'auto' = 'auto'): string {
  const value = String(input ?? '').trim();
  if (!value) return '';

  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const date = `${iso[1]}-${iso[2]}-${iso[3]}`;
    return isCalendarDate(date) ? date : '';
  }

  if (format === 'uk' || (format === 'auto' && value.includes('/'))) {
    const uk = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (uk) {
      const date = `${uk[3]}-${uk[2].padStart(2, '0')}-${uk[1].padStart(2, '0')}`;
      return isCalendarDate(date) ? date : '';
    }
  }
  if (format === 'us' || format === 'auto') {
    const us = value.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
    if (us) {
      const date = `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
      return isCalendarDate(date) ? date : '';
    }
  }
  return '';
}

const DATE_HEADER = /date/;
const AMOUNT_HEADER = /amount/;
const DESCRIPTION_HEADER = /counter|description|reference|details|narrative/;
const TYPE_HEADER = /^type$|direction/;

interface LocatedColumns {
  date: number;
  amount: number;
  description: number;
  type: number;
}

function headerCells(grid: string[][]): string[] {
  return (grid[0] ?? []).map((cell) => cell.replace(/^\uFEFF/, '').trim().toLowerCase());
}

function locateColumns(grid: string[][]): LocatedColumns | null {
  const header = headerCells(grid);
  const find = (expression: RegExp) => header.findIndex((cell) => expression.test(cell));
  const date = find(DATE_HEADER);
  const amount = find(AMOUNT_HEADER);
  if (date < 0 || amount < 0) return null;
  return { date, amount, description: find(DESCRIPTION_HEADER), type: find(TYPE_HEADER) };
}

function directionOf(cell: string, amountPence: number): 'Income' | 'Expense' {
  const text = String(cell ?? '').toLowerCase();
  return /out|debit|expense|payment/.test(text) || amountPence < 0 ? 'Expense' : 'Income';
}

/**
 * The importer's original rule set. Kept as one function so a detected profile
 * and the built-in path cannot drift apart.
 */
export function builtInCsvRows(grid: string[][]): MappedCsvRow[] | null {
  const columns = locateColumns(grid);
  if (!columns) return null;
  const rows: MappedCsvRow[] = [];
  for (let index = 1; index < grid.length; index += 1) {
    const cells = grid[index];
    const date = parseCsvDate(cells[columns.date]);
    const amountPence = parseAmountPence(cells[columns.amount]);
    if (!date || amountPence === 0) continue;
    rows.push({
      date,
      description: cells[columns.description] || cells[columns.description + 1] || '',
      amountPence: Math.abs(amountPence),
      type: directionOf(columns.type >= 0 ? cells[columns.type] : '', amountPence),
    });
  }
  return rows;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

function detectDateFormat(grid: string[][], column: number): CsvDateFormat {
  for (let index = 1; index < grid.length; index += 1) {
    const value = String(grid[index][column] ?? '').trim();
    if (!value) continue;
    if (ISO_DATE.test(value)) return 'iso';
    if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(value)) return 'uk';
    if (/^\d{1,2}-\d{1,2}-\d{4}/.test(value)) return 'us';
  }
  return 'iso';
}

/**
 * A profile that reproduces the built-in mapping for this file. Returns null
 * when the file has no recognisable date and amount columns.
 */
export function detectCsvProfile(
  grid: string[][],
  options: { name?: string; delimiter?: CsvDelimiter; id?: string } = {},
): CsvProfile | null {
  const columns = locateColumns(grid);
  if (!columns) return null;
  return {
    id: options.id ?? `csv_${Date.now().toString(36)}`,
    name: options.name?.trim() || 'Detected columns',
    delimiter: options.delimiter ?? ',',
    hasHeader: true,
    dateColumn: columns.date,
    amountColumn: columns.amount,
    descriptionColumn: Math.max(0, columns.description),
    typeColumn: columns.type >= 0 ? columns.type : null,
    dateFormat: detectDateFormat(grid, columns.date),
    sign: 'signed',
  };
}

export function mapCsvRows(grid: string[][], profile: CsvProfile): MappedCsvRow[] {
  const rows: MappedCsvRow[] = [];
  const start = profile.hasHeader ? 1 : 0;
  for (let index = start; index < grid.length; index += 1) {
    const cells = grid[index];
    const date = parseCsvDate(cells[profile.dateColumn], profile.dateFormat);
    let amountPence = parseAmountPence(cells[profile.amountColumn]);
    if (profile.sign === 'inverted') amountPence = -amountPence;
    if (!date || amountPence === 0) continue;
    const direction = profile.typeColumn === null ? '' : cells[profile.typeColumn];
    rows.push({
      date,
      description: cells[profile.descriptionColumn] || cells[profile.descriptionColumn + 1] || '',
      amountPence: Math.abs(amountPence),
      type: directionOf(direction, amountPence),
    });
  }
  return rows;
}

export const CSV_PROFILE_LIMIT = 12;

export function normaliseProfile(profile: CsvProfile): CsvProfile {
  const column = (value: number) => Math.max(0, Math.trunc(Number(value) || 0));
  return {
    ...profile,
    id: String(profile.id ?? ''),
    name: String(profile.name ?? '').trim().slice(0, 40) || 'Bank profile',
    dateColumn: column(profile.dateColumn),
    amountColumn: column(profile.amountColumn),
    descriptionColumn: column(profile.descriptionColumn),
    typeColumn: profile.typeColumn === null ? null : column(profile.typeColumn),
    delimiter: ([';', '\t'] as CsvDelimiter[]).includes(profile.delimiter) ? profile.delimiter : ',',
    dateFormat: (['iso', 'uk', 'us'] as CsvDateFormat[]).includes(profile.dateFormat) ? profile.dateFormat : 'iso',
    sign: profile.sign === 'inverted' ? 'inverted' : 'signed',
    hasHeader: profile.hasHeader !== false,
  };
}
