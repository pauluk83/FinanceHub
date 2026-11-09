/**
 * Year rollover moves the budget's configured year forward without rewriting
 * history. Month locks, transactions, bills and provider year blocks are left
 * exactly as they are; only the target year and the as-of/cutoff anchors move
 * to the first day of the new year. The balance anchor is deliberately kept,
 * because recalibrating it changes every cumulative balance.
 *
 * Carry-over is opt-in. It records a year-opening checkpoint for accounts,
 * people and cards, and rotates each provider's next-year block into its live
 * ledger (archiving the finished year), so the new year starts from the
 * previous close while the old year stays readable.
 */
import { buildEngine, type Dataset, type YearOpeningBalances } from './engine.ts';
import { providerRowsKey, rowsForYear } from './providerYears.ts';

export interface YearRolloverOptions {
  carryBalances?: boolean;
}

export interface CarryOverPlan {
  /** The date whose closing balances are carried. */
  through: string;
  accountNames: string[];
  accountTotalPence: number;
  cardCount: number;
  personCount: number;
  providerNames: string[];
  billNames: string[];
}

export interface YearRolloverPlan {
  from: number;
  to: number;
  asOfDate: string;
  lockCutoff: string;
  /** What the rollover leaves alone, shown in the confirmation dialog. */
  preserved: string[];
  /** Present only when the caller asked to carry balances over. */
  carry?: CarryOverPlan;
}

export interface YearRolloverResult {
  ok: boolean;
  plan?: YearRolloverPlan;
  reason?: string;
}

/** Same rule as `Settings!C11`: month start, previous month when day < 3. */
function cutoffFor(year: number): string {
  return `${year - 1}-12-01`;
}

function closingRows(ds: Dataset, from: number): CarryOverPlan {
  const through = `${from}-12-31`;
  const engine = buildEngine(ds);
  const accounts = engine.accountBalances(through);
  const cards = engine.cardBalances(through);
  const people = engine.owedByPerson(through);
  const providers = Object.keys(ds.providers ?? {});
  return {
    through,
    accountNames: accounts.map((account) => account.name),
    accountTotalPence: accounts.reduce((total, account) => total + account.balancePence, 0),
    cardCount: cards.length,
    personCount: people.length,
    providerNames: providers,
    billNames: (ds.bills ?? []).filter((bill) => bill.name).map((bill) => bill.name),
  };
}

export function planYearRollover(ds: Dataset, year: number, options: YearRolloverOptions = {}): YearRolloverResult {
  const current = ds.settings.targetYear;
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return { ok: false, reason: 'Choose a year between 2000 and 2100.' };
  }
  if (year === current) {
    return { ok: false, reason: `${current} is already the target year.` };
  }
  if (year < current) {
    return { ok: false, reason: `The budget is already on ${current}; history is viewed with the year selector rather than by rolling backwards.` };
  }
  const carry = options.carryBalances === true ? closingRows(ds, current) : undefined;
  return {
    ok: true,
    plan: {
      from: current,
      to: year,
      asOfDate: `${year}-01-01`,
      lockCutoff: cutoffFor(year),
      preserved: carry
        ? [
          'Every month lock and its snapshot',
          'All transactions and bill changes',
          `${current} provider rows (kept as a read-only year block)`,
          `The balance anchor date (${ds.settings.anchorDate || 'not set'})`,
        ]
        : [
          'Every month lock and its snapshot',
          'All transactions, bills and bill changes',
          'Provider year blocks and their opening balances',
          `The balance anchor date (${ds.settings.anchorDate || 'not set'})`,
        ],
      carry,
    },
  };
}

/** Years the app can display: the target year plus imported blocks, locks and rows. */
export function availableYears(ds: Dataset): number[] {
  const years = new Set<number>();
  const add = (value: number) => {
    if (Number.isInteger(value) && value >= 2000 && value <= 2100) years.add(value);
  };
  add(ds.settings.targetYear);
  add(Number(ds.settings.asOfDate?.slice(0, 4)));
  for (const provider of Object.values(ds.providers ?? {})) {
    for (const key of Object.keys((provider as any)?.years ?? {})) add(Number(key));
  }
  for (const key of Object.keys(ds.monthLocks ?? {})) add(Number(key.slice(0, 4)));
  for (const row of ds.transactions ?? []) add(Number(row.date?.slice(0, 4)));
  return [...years].sort((a, b) => a - b);
}

function lastBalance(rows: any[]): number | null {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    if (typeof rows[index]?.balancePence === 'number') return rows[index].balancePence;
  }
  return null;
}

function openingRow(rowsKey: 'entries' | 'statement', year: number, balancePence: number) {
  if (rowsKey === 'entries') {
    return {
      date: `${year}-01-01`,
      ref: 'Brought Forward',
      description: 'Balance brought forward',
      amountPence: 0,
      balancePence,
    };
  }
  return {
    month: 'Opening Balance',
    opening: true,
    balancePence,
    paymentPence: 0,
    billAmountPence: 0,
    amountPence: 0,
    totalPaidPence: 0,
    status: balancePence < 0 ? 'Owing' : balancePence > 0 ? 'Credit' : '',
  };
}

/**
 * Rotate one provider's ledger into the new year. A next-year block becomes
 * the live sheet; its rows are kept intact and the finished live sheet is
 * archived as its own year block. If there is no next-year block, a single
 * opening row starts the new ledger at the carried balance.
 */
function rotateProvider(p: any, key: string, from: number, to: number, carried: number, opening: number) {
  const rowsKey = providerRowsKey(key);
  const liveRows = Array.isArray(p[rowsKey]) ? p[rowsKey] : [];
  const years = p.years && typeof p.years === 'object' ? { ...p.years } : {};
  const nextBlock = years[String(to)];
  const fromBlock = years[String(from)];

  if (!fromBlock) {
    years[String(from)] = {
      year: from,
      openingPence: typeof p.ledgerOpeningPence === 'number' ? p.ledgerOpeningPence : 0,
      closingPence: carried,
      rows: liveRows,
    };
  }
  p.years = years;

  if (nextBlock && Array.isArray(nextBlock.rows)) {
    p[rowsKey] = nextBlock.rows;
    p.ledgerOpeningPence = typeof nextBlock.openingPence === 'number' ? nextBlock.openingPence : opening;
    delete p.years[String(to)];
  } else {
    p[rowsKey] = [openingRow(rowsKey, to, carried)];
    p.ledgerOpeningPence = carried;
  }
  p.year = to;
}

function carryBalances(ds: Dataset, from: number, to: number): YearOpeningBalances {
  const through = `${from}-12-31`;
  const engine = buildEngine(ds);
  const accounts = Object.fromEntries(engine.accountBalances(through).map((account) => [account.name, account.balancePence]));
  const cards = Object.fromEntries(engine.cardBalances(through).map((card) => [card.name, card.balancePence]));
  const people = Object.fromEntries(engine.owedByPerson(through).map((person) => [person.shortName, person.balancePence]));
  const providers: NonNullable<YearOpeningBalances['providers']> = {};
  const bills: NonNullable<YearOpeningBalances['bills']> = {};

  for (const [key, provider] of Object.entries(ds.providers ?? {})) {
    const p = provider as any;
    const rowsKey = providerRowsKey(key);
    const fromRows = rowsForYear(p, rowsKey, from)?.rows ?? [];
    const existing = p.years?.[String(to)];
    const priorClosing = lastBalance(fromRows) ?? (typeof p.closingBalancePence === 'number' ? p.closingBalancePence : 0);
    const opening = typeof existing?.openingPence === 'number' ? existing.openingPence : priorClosing;
    const closing = typeof existing?.closingPence === 'number'
      ? existing.closingPence
      : lastBalance(Array.isArray(existing?.rows) ? existing.rows : []) ?? opening;

    providers[key] = {
      openingPence: opening,
      closingPence: closing,
      rows: Array.isArray(existing?.rows) ? existing.rows.length : 0,
      source: key === 'rent' ? 'continuous' : existing ? 'existing' : 'carried',
    };
    rotateProvider(p, key, from, to, priorClosing, opening);
  }

  for (const bill of ds.bills ?? []) {
    if (!bill.name) continue;
    bills[bill.name] = {
      amountPence: bill.amountPence,
      dueDay: bill.dueDay,
      active: bill.active,
      latestBalancePence: bill.latestBalancePence,
    };
  }

  const snapshot: YearOpeningBalances = { accounts, people, cards, providers, bills };
  ds.settings.yearOpenings = { ...(ds.settings.yearOpenings ?? {}), [String(to)]: snapshot };
  return snapshot;
}

/**
 * Apply the rollover in place. The caller owns saving and syncing; this only
 * changes the dataset and records the budget-changelog entry.
 */
export function rolloverYear(
  ds: Dataset,
  year: number,
  today: string,
  options: YearRolloverOptions = {},
): YearRolloverResult {
  const result = planYearRollover(ds, year, options);
  if (!result.ok) return result;
  const { plan } = result;
  const carried = options.carryBalances === true ? carryBalances(ds, plan.from, plan.to) : null;
  ds.settings.targetYear = plan.to;
  ds.settings.asOfDate = plan.asOfDate;
  ds.settings.lockCutoff = plan.lockCutoff;
  if (!ds.changelog) ds.changelog = [];

  const carryDetails = carried
    ? [
      `Carried accounts — ${Object.keys(carried.accounts).length} balances, ${(Object.values(carried.accounts).reduce((total, value) => total + value, 0) / 100).toFixed(2)} total`,
      `Carried cards — ${Object.keys(carried.cards).length}`,
      `Carried people — ${Object.keys(carried.people).length}`,
      `Carried providers — ${Object.keys(carried.providers ?? {}).join(', ') || 'none'}`,
      `Carried bills — ${Object.keys(carried.bills ?? {}).length} continue with their current amounts`,
    ]
    : [];

  ds.changelog.unshift({
    date: today,
    sheetCell: 'Year rollover',
    description: carried
      ? `Target year rolled from ${plan.from} to ${plan.to}. Balances were carried into ${plan.to}; the new year starts from the previous close while earlier rows stay readable. As-of and lock cutoff reset to 1 January ${plan.to}.`
      : `Target year rolled from ${plan.from} to ${plan.to}. As-of and lock cutoff reset to 1 January ${plan.to}; ${plan.preserved.length} categories were left untouched, including month locks and provider year blocks. The balance anchor date was kept.`,
    details: [
      `As-of date — ${plan.asOfDate}`,
      `Lock cutoff — ${plan.lockCutoff}`,
      `Balance anchor — ${ds.settings.anchorDate || 'not set'} (unchanged)`,
      ...carryDetails,
      ...plan.preserved.map((entry) => `Preserved — ${entry}`),
    ],
    signature: `year-rollover:${plan.to}`,
    auto: true,
    at: new Date().toISOString(),
  });
  return result;
}
