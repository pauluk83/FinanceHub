/**
 * Accountant / tax-year pack.
 *
 * A single Excel file the owner can hand to an accountant: the monthly summary
 * exactly as the engine computes it, the year's transactions, the locked months
 * with their notes, and a reconciliation sheet that says what the pack is and is
 * not. Nothing is recalculated here and no target or report setting leaks in.
 */
import type { Dataset, Engine } from './engine.ts';
import type { ExportSheet } from './exporters.ts';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function pounds(pence: number): number {
  return Math.round(pence) / 100;
}

export function buildAccountantPack(dataset: Dataset, engine: Engine, year: number): ExportSheet[] {
  const monthly = MONTH_NAMES.map((label, index) => {
    const summary = engine.monthlySummary(year, index + 1);
    return [
      label,
      pounds(summary.incomePence),
      pounds(summary.expensesPence),
      pounds(summary.netPence),
      summary.locked ? 'Locked' : 'Open',
    ];
  });

  const transactions = dataset.transactions
    .filter((transaction) => transaction.date.startsWith(`${year}-`))
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.row - b.row)
    .map((transaction) => [
      transaction.date,
      transaction.account,
      transaction.type,
      pounds(transaction.amountPence),
      transaction.category ?? '',
      (transaction.tags ?? []).join(' '),
      transaction.status ?? '',
      transaction.comments ?? '',
    ]);

  const locks = Object.entries(dataset.monthLocks ?? {})
    .filter(([key]) => key.startsWith(`${year}-`))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, lock]) => [
      `${MONTH_NAMES[Number(key.slice(5, 7)) - 1] ?? key} ${year}`,
      lock.lockedAt,
      pounds(lock.incomePence),
      pounds(lock.expensesPence),
      pounds(lock.netPence),
      pounds(lock.owedPence),
      lock.note ?? '',
    ]);

  return [
    {
      name: 'Reconciliation',
      rows: [
        ['FinanceHub accountant pack'],
        ['Year', year],
        ['As of', dataset.settings.asOfDate],
        ['Currency', dataset.settings.currency],
        ['Transactions in year', transactions.length],
        ['Locked months', locks.length],
        ['Prepared', new Date().toISOString().slice(0, 10)],
        [],
        ['Note', 'Figures come from the live budget engine, in whole pence. Locked months are stored snapshots and are not recomputed.'],
        ['Note', 'People accounts, cards and provider balances are part of the budget but only the monthly summary, transactions and locks are listed here.'],
        ['Note', 'This pack is not an audit: it has not been reviewed by an accountant or HMRC.'],
      ],
    },
    {
      name: 'Monthly summary',
      rows: [['Month', 'Income (£)', 'Expenses (£)', 'Net (£)', 'Lock state'], ...monthly],
    },
    {
      name: 'Transactions',
      rows: [['Date', 'Account', 'Type', 'Amount (£)', 'Category', 'Tags', 'Status', 'Comments'], ...transactions],
    },
    {
      name: 'Month locks',
      rows: [['Month', 'Locked at', 'Income (£)', 'Expenses (£)', 'Net (£)', 'Owed (£)', 'Note'], ...locks],
    },
  ];
}
