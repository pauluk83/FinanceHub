/**
 * Keep provider year blocks chained. Editing the live year (or any future
 * block) changes that year's close; every later block starts from the new
 * close and recalculates its own rows.
 */
import type { LedgerSpec } from './providerLedger.ts';
import { baselineFor, recalculate } from './providerLedger.ts';

function lastBalance(rows: any[]): number | null {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    if (typeof rows[index]?.balancePence === 'number') return rows[index].balancePence;
  }
  return null;
}

/** Recalculate every later year block from the edited year's closing balance. */
export function carryForwardProviderYears(
  provider: any,
  spec: LedgerSpec,
  fromYear: number,
  fromRows: any[],
  fromOpeningPence?: number,
): number {
  let close = lastBalance(fromRows) ?? (typeof fromOpeningPence === 'number' ? fromOpeningPence : 0);
  const laterYears = Object.keys(provider?.years ?? {})
    .map(Number)
    .filter((year) => Number.isInteger(year) && year > fromYear)
    .sort((a, b) => a - b);

  for (const year of laterYears) {
    const block = provider.years[String(year)];
    if (!block || !Array.isArray(block.rows)) continue;
    // Savings plans keep a running "total paid" that belongs to that plan, not
    // to the balance chain. Preserve it while the balance moves.
    const totalPaid = spec.formula === 'savings'
      ? block.rows.map((row: any) => row.totalPaidPence)
      : null;
    block.openingPence = close;
    const baseline = baselineFor(spec, block.rows, close);
    recalculate(spec, block.rows, baseline);
    if (totalPaid) {
      block.rows.forEach((row: any, index: number) => {
        if (totalPaid[index] !== undefined) row.totalPaidPence = totalPaid[index];
      });
    }
    block.closingPence = lastBalance(block.rows) ?? close;
    close = block.closingPence;
  }
  return close;
}