/**
 * Provider balances captured with a month-end lock.
 *
 * A snapshot is intentionally a copy of the last dated row at or before the
 * close date, plus a human-readable statement reference. The provider ledger is
 * never rewritten by taking a snapshot.
 */
import type { Dataset } from './engine.ts';
import { providerRowsKey, rowsForYear } from './providerYears.ts';

export interface ProviderBalanceSnapshot {
  key: string;
  name: string;
  balancePence: number;
  statementDate: string;
  statementRef: string;
  source: string;
}

function rowDate(row: any, year: number): string {
  if (typeof row?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.date)) return row.date;
  const month = String(row?.month ?? '').trim();
  const index = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(month);
  return index >= 0 ? `${year}-${String(index + 1).padStart(2, '0')}-01` : '';
}

function rowLabel(row: any): string {
  for (const key of ['description', 'comments', 'bill', 'period', 'type']) {
    const value = row?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return typeof row?.month === 'string' ? row.month : 'statement';
}

export function providerBalancesForYear(ds: Dataset, year: number, through: string): ProviderBalanceSnapshot[] {
  const snapshots: ProviderBalanceSnapshot[] = [];
  for (const [key, provider] of Object.entries(ds.providers ?? {})) {
    if (!provider || typeof provider !== 'object') continue;
    const rows = rowsForYear(provider, providerRowsKey(key), year)?.rows ?? [];
    let chosen: any = null;
    let chosenDate = '';
    for (const row of rows) {
      const date = rowDate(row, year);
      if (!date || date > through) continue;
      if (!chosen || date >= chosenDate) {
        if (typeof row?.balancePence === 'number') {
          chosen = row;
          chosenDate = date;
        }
      }
    }
    // A provider can expose a closing balance without a dated final row.
    if (!chosen && typeof provider.closingBalancePence === 'number') {
      chosen = { balancePence: provider.closingBalancePence, description: 'Closing balance' };
      chosenDate = through;
    }
    if (!chosen || typeof chosen.balancePence !== 'number') continue;
    const label = typeof provider.displayName === 'string' && provider.displayName.trim()
      ? provider.displayName.trim()
      : typeof provider.name === 'string' && provider.name.trim()
        ? provider.name.trim()
        : key;
    snapshots.push({
      key,
      name: label,
      balancePence: chosen.balancePence,
      statementDate: chosenDate,
      statementRef: `${chosenDate || 'undated'} · ${rowLabel(chosen)}`,
      source: key,
    });
  }
  return snapshots.sort((a, b) => a.name.localeCompare(b.name, 'en-GB'));
}
