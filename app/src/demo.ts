import type { Dataset } from '../../core/engine';
import { blankDataset, seedState, type AppState } from './store';

export const DEMO_USER_ID = 'demo';
export const DEMO_MAIN_ACCOUNT = 'Everyday Current';

const SAVINGS = 'Rainy Day Savings';
const CARD = 'Everyday Visa';
const ALEX = 'Alex';
const SAM = 'Sam';
const MONTHS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11'];

/** A deliberately fictional budget for the public “look around” preview. */
export function demoState(): AppState {
  const base = seedState();
  const dataset = blankDataset(base.dataset, {
    year: 2026,
    asOf: '2026-11-07',
    anchor: '2026-11-07',
    mainAccount: DEMO_MAIN_ACCOUNT,
    openingPence: 180_000,
    currency: '£',
  });

  // Do not carry the source workbook's metadata or any other imported context.
  dataset.meta = undefined;
  dataset.accounts = [
    { name: DEMO_MAIN_ACCOUNT, targetPence: 150_000, openingPence: 180_000, sortOrder: 1, active: true },
    { name: SAVINGS, targetPence: 500_000, openingPence: 420_000, sortOrder: 2, active: true },
  ];
  dataset.settings.primaryAccount = DEMO_MAIN_ACCOUNT;

  dataset.people = [
    { shortName: ALEX, fullName: 'Alex Morgan', openingPence: 0, sortOrder: 1, active: true },
    { shortName: SAM, fullName: 'Sam Taylor', openingPence: 0, sortOrder: 2, active: true },
  ];
  dataset.cards = [
    { name: CARD, limitPence: 200_000, openingPence: 0, sortOrder: 1, active: true },
  ];

  const rows: Dataset['transactions'] = [];
  let row = 1;
  const add = (date: string, account: string, type: 'Income' | 'Expense', amountPence: number, comments: string) => {
    rows.push({ row: row++, date, account, type, amountPence, comments, status: '', budgetTreatment: '' });
  };

  for (const month of MONTHS) {
    add(`2026-${month}-01`, DEMO_MAIN_ACCOUNT, 'Income', 240_000, 'Monthly salary');
    add(`2026-${month}-02`, DEMO_MAIN_ACCOUNT, 'Expense', 95_000, 'Rent');
    add(`2026-${month}-04`, DEMO_MAIN_ACCOUNT, 'Expense', 18_500, 'Groceries');
    add(`2026-${month}-06`, DEMO_MAIN_ACCOUNT, 'Expense', 3_000, 'Gym');
    add(`2026-${month}-08`, DEMO_MAIN_ACCOUNT, 'Expense', 1_099, 'Streaming');
    add(`2026-${month}-10`, DEMO_MAIN_ACCOUNT, 'Expense', 9_800, 'Energy');
    add(`2026-${month}-12`, DEMO_MAIN_ACCOUNT, 'Expense', 1_800, 'Mobile');
    add(`2026-${month}-18`, DEMO_MAIN_ACCOUNT, 'Expense', 14_200, 'Groceries');
    add(`2026-${month}-20`, DEMO_MAIN_ACCOUNT, 'Expense', 6_500, 'Transport');
    add(`2026-${month}-22`, CARD, 'Expense', 4_500, 'Card purchase');
    add(`2026-${month}-25`, CARD, 'Expense', 2_500, 'Card purchase');
  }

  add('2026-03-14', ALEX, 'Expense', 10_000, 'Lent for a car repair');
  add('2026-06-12', ALEX, 'Income', 4_000, 'Repayment');
  add('2026-09-09', SAM, 'Expense', 2_500, 'Concert tickets');

  dataset.transactions = rows;
  dataset.bills = [
    { name: 'Rent', amountPence: 95_000, dueDay: 2, linkedSheet: '', frequency: 'Monthly', latestBalancePence: 0, latestPaymentPence: 0, sortOrder: 1, active: true, effectiveFrom: '', paymentMethod: 'Standing Order', baseAmountPence: 95_000, baseDueDay: 2 },
    { name: 'Energy', amountPence: 9_800, dueDay: 10, linkedSheet: '', frequency: 'Monthly', latestBalancePence: 0, latestPaymentPence: 0, sortOrder: 2, active: true, effectiveFrom: '', paymentMethod: 'Direct Debit', baseAmountPence: 9_800, baseDueDay: 10 },
    { name: 'Water', amountPence: 3_500, dueDay: 14, linkedSheet: '', frequency: 'Monthly', latestBalancePence: 0, latestPaymentPence: 0, sortOrder: 3, active: true, effectiveFrom: '', paymentMethod: 'Direct Debit', baseAmountPence: 3_500, baseDueDay: 14 },
    { name: 'Mobile', amountPence: 1_800, dueDay: 12, linkedSheet: '', frequency: 'Monthly', latestBalancePence: 0, latestPaymentPence: 0, sortOrder: 4, active: true, effectiveFrom: '', paymentMethod: 'Direct Debit', baseAmountPence: 1_800, baseDueDay: 12 },
    { name: 'Streaming', amountPence: 1_099, dueDay: 8, linkedSheet: '', frequency: 'Monthly', latestBalancePence: 0, latestPaymentPence: 0, sortOrder: 5, active: true, effectiveFrom: '', paymentMethod: 'Continuous Card Authority', baseAmountPence: 1_099, baseDueDay: 8 },
    { name: 'Gym', amountPence: 3_000, dueDay: 6, linkedSheet: '', frequency: 'Monthly', latestBalancePence: 0, latestPaymentPence: 0, sortOrder: 6, active: true, effectiveFrom: '', paymentMethod: 'Direct Debit', baseAmountPence: 3_000, baseDueDay: 6 },
  ];
  dataset.billChanges = [];
  dataset.incomeSchedules = { pip: [], uc: [] };
  dataset.providers = {};
  dataset.debts = [
    { id: 'demo-debt-car', name: 'Car finance', creditor: 'Example Finance', agreementType: 'Car finance', balancePence: 480_000, monthlyPaymentPence: 21_000, dueDay: 5, interestRatePct: 7.9, active: true },
    { id: 'demo-debt-card', name: 'Credit card', creditor: 'Example Bank', agreementType: 'Credit card', balancePence: 82_000, monthlyPaymentPence: 5_000, dueDay: 20, interestRatePct: 21.9, active: true },
  ];
  dataset.savings = [
    { id: 'demo-savings-isa', name: 'Cash ISA', provider: 'Example Bank', type: 'Cash ISA', sortCode: '00-00-00', accountNumber: '12345678', balancePence: 320_000, targetPence: 500_000, monthlyContributionPence: 10_000, contributionDay: 1, interestRatePct: 3.1, active: true },
    { id: 'demo-savings-easy', name: SAVINGS, provider: 'Example Bank', type: 'Easy access savings', sortCode: '00-00-00', accountNumber: '87654321', balancePence: 420_000, targetPence: 500_000, monthlyContributionPence: 5_000, contributionDay: 1, active: true },
  ];
  dataset.holidays = {};
  dataset.changelog = [];
  dataset.audit = [];
  dataset.monthLocks = {};
  dataset.reference = undefined;

  return {
    version: 1,
    dataset,
    theme: 'dark',
    savedAt: new Date().toISOString(),
  };
}
