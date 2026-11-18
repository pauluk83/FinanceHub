/**
 * Evidence packs (R14).
 *
 * Three printable/Excel packs built from the ledger the owner already has:
 * provider dispute, month close and benefits. Only display names, dates and
 * amounts are read; credentials, tokens and full account numbers never enter a
 * pack. Nothing here writes to the budget.
 */
import type { Dataset, Engine } from './engine.ts';
import { monthEnd, type MonthLock } from './engine.ts';
import { providerRowsKey, rowsForYear } from './providerYears.ts';
import type { ExportSheet } from './exporters.ts';
import type { PrintReport } from './exporters.ts';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export type EvidencePackId = 'provider-dispute' | 'month-close' | 'benefits';

export interface EvidencePack {
  id: EvidencePackId;
  title: string;
  subtitle: string;
  summary: [string, string][];
  sheets: ExportSheet[];
  print: PrintReport;
}

function money(pence: number): string {
  const amount = (Math.abs(pence) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${pence < 0 ? '-' : ''}£${amount}`;
}

function pounds(pence: number): number {
  return Math.round(pence) / 100;
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function periodOf(row: any): string {
  const value = String(row?.date ?? row?.month ?? row?.period ?? '');
  return value;
}

function noteOf(row: any): string {
  return String(row?.note ?? row?.notes ?? row?.description ?? row?.status ?? '').trim();
}

function providerLabel(key: string, provider: any): string {
  const label = provider?.displayName ?? provider?.name;
  return typeof label === 'string' && label.trim() ? label.trim() : key;
}

function statementSheet(rows: readonly any[]) {
  return rows.map((row) => [
    periodOf(row),
    pounds(num(row.amountPence ?? row.chargePence)),
    pounds(num(row.paymentPence)),
    pounds(num(row.balancePence)),
    noteOf(row),
  ]);
}

/**
 * Provider dispute pack: the statement lines, payments, running balance and
 * contract terms for one provider-year. Returns null when that year has no
 * statement rows so the UI can explain the empty state.
 */
export function providerDisputePack(
  ds: Dataset,
  providerKey: string,
  year: number,
): EvidencePack | null {
  const provider = ds.providers?.[providerKey];
  if (!provider) return null;
  const rowsKey = providerRowsKey(providerKey);
  const yearRows = rowsForYear(provider, rowsKey, year);
  if (!yearRows || yearRows.rows.length === 0) return null;

  const label = providerLabel(providerKey, provider);
  const rows = statementSheet(yearRows.rows);
  const first = yearRows.rows[0];
  const last = yearRows.rows[yearRows.rows.length - 1];
  const blockOpening = provider.years?.[String(year)]?.openingPence;
  const opening = typeof blockOpening === 'number'
    ? blockOpening
    : typeof provider.ledgerOpeningPence === 'number'
      ? provider.ledgerOpeningPence
      : num(first?.balancePence) - num(first?.paymentPence) + num(first?.amountPence);
  const closing = num(last?.balancePence);
  const contract = provider.contract ?? {};
  const payments = yearRows.rows.reduce((sum, row) => sum + num(row.paymentPence), 0);
  const charges = yearRows.rows.reduce((sum, row) => sum + num(row.amountPence ?? row.chargePence), 0);

  const summary: [string, string][] = [
    ['Provider', label],
    ['Year', String(year)],
    ['Statement lines', String(rows.length)],
    ['Charges', money(charges)],
    ['Payments', money(payments)],
    ['Opening balance', money(opening)],
    ['Closing balance', money(closing)],
    ['Contract end', contract.endDate ? String(contract.endDate) : '—'],
    ['Contract amount', typeof contract.contractAmountPence === 'number' ? money(contract.contractAmountPence) : '—'],
    ['Contract payments', typeof contract.paymentsPence === 'number' ? money(contract.paymentsPence) : '—'],
  ];

  const sheetRows: (string | number)[][] = [
    ['Period', `Charge (£)`, `Payment (£)`, `Balance (£)`, 'Note'],
    ...rows,
  ];

  return {
    id: 'provider-dispute',
    title: `Provider dispute pack — ${label}`,
    subtitle: `${year} statement, payments, running balance and contract terms`,
    summary,
    sheets: [
      { name: 'Summary', rows: [['Field', 'Value'], ...summary.map(([key, value]) => [key, value])] },
      { name: 'Statement', rows: sheetRows },
    ],
    print: {
      title: `Provider dispute pack — ${label}`,
      subtitle: `${year} · charges ${money(charges)} · payments ${money(payments)} · closing ${money(closing)}`,
      summary,
      head: ['Period', 'Charge', 'Payment', 'Balance', 'Note'],
      rows: rows.map((row) => row.map((cell) => String(cell))),
    },
  };
}

function lockFor(ds: Dataset, year: number, month: number): MonthLock | undefined {
  return ds.monthLocks?.[`${year}-${String(month).padStart(2, '0')}`];
}

/**
 * Month close pack. A locked month uses its frozen snapshot; an open month uses
 * the live engine figures and says so, because a pack must never present a
 * derived number as a closed one.
 */
export function monthClosePack(ds: Dataset, engine: Engine, year: number, month: number): EvidencePack {
  const key = `${year}-${String(month).padStart(2, '0')}`;
  const closeDate = monthEnd(year, month);
  const lock = lockFor(ds, year, month);
  const summaryRow = engine.monthlySummary(year, month);
  const accounts = lock?.accounts ?? engine.accountBalances(closeDate).map((account) => ({ name: account.name, balancePence: account.balancePence }));
  const cards = lock?.cards ?? engine.cardBalances(closeDate).map((card) => ({ name: card.name, balancePence: card.balancePence }));
  const people = lock?.people ?? engine.owedByPerson(closeDate).map((person) => ({ shortName: person.shortName, balancePence: person.balancePence }));
  const bills = lock?.bills ?? engine.scheduledBills(year, month).map((bill) => ({ name: bill.name, amountPence: bill.amountPence }));
  const statements = lock?.statement ?? [];

  const summary: [string, string][] = [
    ['Month', `${MONTHS[month - 1]} ${year}`],
    ['Status', lock ? 'Locked snapshot' : 'Open month (live figures)'],
    ['Income', money(lock?.incomePence ?? summaryRow.incomePence)],
    ['Expenses', money(lock?.expensesPence ?? summaryRow.expensesPence)],
    ['Net', money(lock?.netPence ?? summaryRow.netPence)],
    ['Owed to me', money(lock?.owedPence ?? summaryRow.owedPence)],
    ['Bills scheduled', money(bills.reduce((sum, bill) => sum + bill.amountPence, 0))],
    ['Closed at', lock?.lockedAt ? String(lock.lockedAt) : '—'],
    ['Reconciliation note', lock?.reconciledNote?.trim() || '—'],
  ];

  const accountRows: (string | number)[][] = [['Account', 'Balance (£)'], ...accounts.map((account) => [account.name, pounds(account.balancePence)])];
  const cardRows: (string | number)[][] = [['Card', 'Balance (£)'], ...cards.map((card) => [card.name, pounds(card.balancePence)])];
  const peopleRows: (string | number)[][] = [['Person', 'Owed (£)'], ...people.map((person) => [person.shortName, pounds(person.balancePence)])];
  const billRows: (string | number)[][] = [['Bill', 'Amount (£)'], ...bills.map((bill) => [bill.name, pounds(bill.amountPence)])];
  const statementRows: (string | number)[][] = [
    ['Account or card', 'Statement (£)', 'Calculated (£)', 'Difference (£)'],
    ...statements.map((check) => [check.name, pounds(check.statementPence), pounds(check.calculatedPence), pounds(check.differencePence)]),
  ];

  return {
    id: 'month-close',
    title: `Month close pack — ${MONTHS[month - 1]} ${year}`,
    subtitle: lock ? 'Frozen month-end snapshot with reconciliation evidence' : 'Open month: live figures, not a closed snapshot',
    summary,
    sheets: [
      { name: 'Summary', rows: [['Field', 'Value'], ...summary.map(([label, value]) => [label, value])] },
      { name: 'Accounts', rows: accountRows },
      { name: 'Cards', rows: cardRows },
      { name: 'People', rows: peopleRows },
      { name: 'Bills', rows: billRows },
      ...(statements.length ? [{ name: 'Statement checks', rows: statementRows }] : []),
    ],
    print: {
      title: `Month close pack — ${MONTHS[month - 1]} ${year}`,
      subtitle: lock ? 'Locked snapshot' : 'Open month · live figures',
      summary,
      head: ['Account', 'Balance'],
      rows: accounts.map((account) => [account.name, money(account.balancePence)]),
    },
  };
}

interface ExpectedPayment {
  kind: 'PIP' | 'Universal Credit';
  month: string;
  date: string;
  amountPence: number;
}

function expectedBenefits(ds: Dataset, year: number): ExpectedPayment[] {
  const expected: ExpectedPayment[] = [];
  const schedules: { kind: 'PIP' | 'Universal Credit'; rows: any[] }[] = [
    { kind: 'PIP', rows: ds.incomeSchedules.pip ?? [] },
    { kind: 'Universal Credit', rows: ds.incomeSchedules.uc ?? [] },
  ];
  for (const { kind, rows } of schedules) {
    for (const row of rows) {
      const hit = year === 2027 ? row.year2027 : year === 2028 ? row.year2028 : row.year2026;
      if (!hit?.date || Number(hit.date.slice(0, 4)) !== year) continue;
      expected.push({ kind, month: `${year}-${String(Number(hit.date.slice(5, 7))).padStart(2, '0')}`, date: String(hit.date), amountPence: num(hit.amountPence) });
    }
  }
  return expected;
}

function receivedBenefits(ds: Dataset, year: number): { kind: 'PIP' | 'Universal Credit'; month: string; amountPence: number }[] {
  const received: { kind: 'PIP' | 'Universal Credit'; month: string; amountPence: number }[] = [];
  for (const tx of ds.transactions) {
    if (tx.type !== 'Income') continue;
    if (Number(tx.date.slice(0, 4)) !== year) continue;
    if (tx.autoBill === true) continue;
    const text = `${tx.comments ?? ''}`.toLocaleLowerCase('en-GB');
    const kind = /personal independence|\bpip\b/.test(text)
      ? 'PIP' as const
      : /universal credit|\buc\b/.test(text)
        ? 'Universal Credit' as const
        : null;
    if (!kind) continue;
    received.push({ kind, month: tx.date.slice(0, 7), amountPence: tx.amountPence });
  }
  return received;
}

/**
 * Benefits pack: each PIP/UC schedule line against the income rows recorded in
 * the same month. A missing received row is shown as zero rather than assumed.
 */
export function benefitsPack(ds: Dataset, year: number): EvidencePack {
  const expected = expectedBenefits(ds, year);
  const received = receivedBenefits(ds, year);
  const rows: (string | number)[][] = [['Month', 'Benefit', 'Expected (£)', 'Received (£)', 'Difference (£)']];

  const keys = [...new Set([
    ...expected.map((entry) => `${entry.month}|${entry.kind}`),
    ...received.map((entry) => `${entry.month}|${entry.kind}`),
  ])].sort();

  let totalExpected = 0;
  let totalReceived = 0;
  for (const key of keys) {
    const [month, kind] = key.split('|') as [string, 'PIP' | 'Universal Credit'];
    const expectedPence = expected.filter((entry) => entry.month === month && entry.kind === kind).reduce((sum, entry) => sum + entry.amountPence, 0);
    const receivedPence = received.filter((entry) => entry.month === month && entry.kind === kind).reduce((sum, entry) => sum + entry.amountPence, 0);
    totalExpected += expectedPence;
    totalReceived += receivedPence;
    const label = `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
    rows.push([label, kind, pounds(expectedPence), pounds(receivedPence), pounds(expectedPence - receivedPence)]);
  }

  const summary: [string, string][] = [
    ['Year', String(year)],
    ['Scheduled payments', String(expected.length)],
    ['Expected', money(totalExpected)],
    ['Received', money(totalReceived)],
    ['Difference', money(totalReceived - totalExpected)],
  ];

  const scheduleRows: (string | number)[][] = [
    ['Date', 'Benefit', 'Expected (£)'],
    ...expected.sort((left, right) => left.date.localeCompare(right.date)).map((entry) => [entry.date, entry.kind, pounds(entry.amountPence)]),
  ];

  const receivedRows: (string | number)[][] = [
    ['Month', 'Benefit', 'Received (£)'],
    ...received.sort((left, right) => left.month.localeCompare(right.month)).map((entry) => [entry.month, entry.kind, pounds(entry.amountPence)]),
  ];

  return {
    id: 'benefits',
    title: `Benefits evidence pack — ${year}`,
    subtitle: 'PIP and Universal Credit schedule against income recorded in the ledger',
    summary,
    sheets: [
      { name: 'Summary', rows: [['Field', 'Value'], ...summary.map(([label, value]) => [label, value])] },
      { name: 'Benefits', rows },
      { name: 'Schedule', rows: scheduleRows },
      { name: 'Received', rows: receivedRows },
    ],
    print: {
      title: `Benefits evidence pack — ${year}`,
      subtitle: `Expected ${money(totalExpected)} · received ${money(totalReceived)} · difference ${money(totalReceived - totalExpected)}`,
      summary,
      head: ['Month', 'Benefit', 'Expected', 'Received'],
      rows: rows.slice(1).map((row) => row.slice(0, 4).map((cell) => String(cell))),
    },
  };
}
