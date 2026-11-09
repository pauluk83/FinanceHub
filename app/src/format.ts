const money = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const gbp = (pence: number | null | undefined, opts: { sign?: boolean } = {}) => {
  if (pence === null || pence === undefined || Number.isNaN(pence)) return '—';
  const n = Math.abs(pence) / 100;
  const prefix = pence < 0 ? '-' : opts.sign && pence > 0 ? '+' : '';
  return `${prefix}£${money.format(n)}`;
};

export const pct = (value: number | null | undefined, digits = 1) => {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${(value * 100).toFixed(digits)}%`;
};

export const dateUk = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
};

export const dateTimeUk = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return `${date.toLocaleDateString('en-GB')} ${date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
};

export const todayIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

export const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const parseMoney = (input: string): number => {
  const cleaned = input.replace(/[£,\s]/g, '');
  if (!cleaned) return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

export const download = (filename: string, content: string, type = 'text/csv;charset=utf-8') => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/**
 * Neutralise spreadsheet formulas while keeping real numbers numeric. A text
 * cell starting with =, +, @, a tab or a non-numeric '-' becomes a literal
 * string by prefixing an apostrophe; numbers and numeric strings stay as they
 * are so Excel still sums them.
 */
export const csvCell = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return String(value);
  const raw = String(value);
  const numeric = /^[+-]?\d+(?:\.\d+)?$/.test(raw);
  const dangerous = /^[=+@\t\r]/.test(raw) || (raw.startsWith('-') && !numeric);
  const safe = dangerous ? `'${raw}` : raw;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export const toCsv = (rows: (string | number | null | undefined)[][]) =>
  rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
