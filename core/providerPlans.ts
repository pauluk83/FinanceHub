/**
 * Repeat a provider sheet's newest year through a plan year.
 *
 * The imported sheets stop at their 2027/2028 blocks, so a trip, a bill or a
 * balance beyond that had no rows to read. The next year's figures are the best
 * picture of the future the budget has, so every missing year copies them and
 * chains from the year before. O2, Virgin Media and Pure Cremation are contracts
 * with their own end dates and are deliberately left alone.
 *
 * Pure: no I/O, no clock reads, integer pence only.
 */
import type { Dataset } from './engine.ts';
import type { LedgerSpec } from './providerLedger.ts';
import { carryForwardProviderYears } from './providerCarry.ts';

/** Every year the provider sheets are kept up to. */
export const PLAN_LAST_YEAR = 2040;

/** The sheets that follow a monthly or annual pattern and can be repeated. */
export const PLAN_PROVIDERS: Record<string, LedgerSpec> = {
  water: { rowsKey: 'statement', formula: 'cashflow', monthly: true },
  ovo: { rowsKey: 'statement', formula: 'cashflow', monthly: true },
  parkXmas: { rowsKey: 'statement', formula: 'savings', monthly: true },
  councilTax: { rowsKey: 'entries', formula: 'amount', monthly: false },
  rent: { rowsKey: 'entries', formula: 'amount', monthly: false },
};

const DAY = 86_400_000;
const dayOf = (date: unknown) => Date.parse(`${String(date ?? '')}T00:00:00Z`);
const isoOf = (time: number) => new Date(time).toISOString().slice(0, 10);

/** Rows of one kind seven days apart: the rent's weekly charge series. */
function weeklyAt(rows: readonly { date?: string; ref?: string; description?: string }[], index: number): boolean {
  const label = (row?: { ref?: string; description?: string }) => `${row?.ref ?? ''}|${row?.description ?? ''}`;
  const time = dayOf(rows[index]?.date);
  if (!Number.isFinite(time)) return false;
  return [index - 1, index + 1].some((other) => {
    const neighbour = rows[other];
    const neighbourTime = dayOf(neighbour?.date);
    return Number.isFinite(neighbourTime)
      && label(neighbour) === label(rows[index])
      && Math.round(Math.abs(neighbourTime - time) / DAY) === 7;
  });
}

/**
 * The template's dates moved into another year. A row that sits in a weekly
 * series (the rent charges) keeps its weekday, so the rent stays on Mondays; a
 * monthly or annual row (council tax, a 27th payment) keeps its day of the month.
 */
export function repeatedDates(rows: readonly { date?: string; ref?: string; description?: string }[], year: number): string[] {
  return rows.map((row, index) => {
    const time = dayOf(row.date);
    if (!Number.isFinite(time)) return String(row.date ?? '');
    const source = new Date(time);
    const base = Date.UTC(year, source.getUTCMonth(), source.getUTCDate());
    if (!weeklyAt(rows, index)) return isoOf(base);
    const drift = (source.getUTCDay() - new Date(base).getUTCDay() + 7) % 7;
    return isoOf(base + (drift > 3 ? drift - 7 : drift) * DAY);
  });
}

function highestRowNumber(provider: any): number {
  const numbers: number[] = [];
  const collect = (rows: unknown) => {
    if (!Array.isArray(rows)) return;
    for (const row of rows) if (Number.isFinite(row?.row)) numbers.push(Number(row.row));
  };
  collect(provider?.statement);
  collect(provider?.entries);
  for (const block of Object.values(provider?.years ?? {})) collect((block as any)?.rows);
  return Math.max(0, ...numbers);
}

/** One year of rows: the template's amounts with the year's dates and fresh row numbers. */
export function repeatYear(rows: any[], year: number, spec: LedgerSpec, nextRow: () => number): any[] {
  const copy = rows.map((row) => {
    const next = { ...row, balancePence: 0, row: nextRow() };
    delete next.balanceOverridePence;
    delete next.totalPaidOverridePence;
    return next;
  });
  if (!spec.monthly) {
    const dates = repeatedDates(rows, year);
    copy.forEach((row, index) => {
      row.date = dates[index];
      if ('matched' in row) row.matched = '';
    });
    copy.sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')));
  }
  return copy;
}

/**
 * Fill every missing year up to `lastYear` from the newest block and chain the
 * balances. Returns the years it created, so a caller can report or test them.
 */
export function extendProviderYears(provider: any, spec: LedgerSpec, lastYear = PLAN_LAST_YEAR): number[] {
  const years = provider?.years;
  if (!provider || !years || typeof years !== 'object') return [];
  const known = Object.keys(years).map(Number).filter((year) => Number.isInteger(year)).sort((a, b) => a - b);
  const templateYear = known.at(-1);
  if (templateYear === undefined) return [];
  const template = years[String(templateYear)]?.rows;
  if (!Array.isArray(template) || template.length === 0) return [];

  let rowNumber = highestRowNumber(provider) + 1;
  const created: number[] = [];
  for (let year = templateYear + 1; year <= lastYear; year += 1) {
    const existing = years[String(year)];
    if (Array.isArray(existing?.rows) && existing.rows.length > 0) continue;
    years[String(year)] = {
      year,
      openingPence: 0,
      closingPence: 0,
      rows: repeatYear(template, year, spec, () => {
        rowNumber += 1;
        return rowNumber;
      }),
    };
    created.push(year);
  }
  if (created.length > 0) {
    // Each new year starts where the year before it closed.
    carryForwardProviderYears(provider, spec, templateYear, template, years[String(templateYear)]?.openingPence);
  }
  return created;
}

/** Extend every plan provider on the dataset; excluded sheets are never touched. */
/**
 * Pure Cremation is paid off in December 2027, so the plan stops there.
 *
 * The bill is removed with an ordinary dated bill change from 2028 onwards, so
 * the Bills page hides it for that year and later, the engine stops scheduling
 * it, and Bill changes can bring it back if the plan is ever reopened.
 */
export function endPureCremationPlan(dataset: Dataset) {
  const provider = dataset.providers?.pureCremation as { paymentsRemaining?: number } | undefined;
  if (provider) provider.paymentsRemaining = 0;
  const bill = (dataset.bills ?? []).find((entry) => /pure\s*cremation/i.test(entry.name));
  if (!bill) return;
  const changes = dataset.billChanges ?? [];
  if (changes.some((change) => change.bill === bill.name && change.skip === true && !change.appliesTo)) return;
  dataset.billChanges = [...changes, {
    bill: bill.name,
    appliesFrom: '2028-01-01',
    appliesTo: '',
    amountOverridePence: null,
    dueDateOverride: '',
    dueDayOverride: null,
    changeType: 'Plan paid off',
    note: 'Paid off in December 2027',
    skip: true,
  }];
}

/**
 * Re-align a later block's month and bill period to the sheet it repeats.
 *
 * An early carry forward copied the wrong labels into the future blocks, so a
 * year could show January's bill period on March's row. Position is the month
 * order, so labels only ever move — a balance never does.
 */
export function alignMonthsToTemplate(rows: any[], template: any[]): boolean {
  if (!Array.isArray(rows) || !Array.isArray(template) || rows.length !== template.length) return false;
  let changed = false;
  rows.forEach((row, index) => {
    const source = template[index];
    if (!source) return;
    if (source.month && row.month !== source.month) {
      row.month = source.month;
      changed = true;
    }
    if (source.billPeriod && row.billPeriod !== source.billPeriod) {
      row.billPeriod = source.billPeriod;
      changed = true;
    }
  });
  return changed;
}

export function extendProvidersToPlanYear(
  dataset: { providers?: Record<string, any> },
  lastYear = PLAN_LAST_YEAR,
): Record<string, number[]> {
  const created: Record<string, number[]> = {};
  for (const [key, spec] of Object.entries(PLAN_PROVIDERS)) {
    const provider = dataset.providers?.[key];
    if (!provider) continue;
    created[key] = extendProviderYears(provider, spec, lastYear);
  }
  return created;
}
