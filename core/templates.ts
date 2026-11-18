/**
 * Budget templates (R12).
 *
 * A template is structure only: accounts, bills, categories, savings and debts
 * with example amounts and zero balances. It never seeds transactions, never
 * creates provider ledgers (those carry statements and running balances), and
 * refuses to run over a budget that already has money recorded.
 */
import type { Dataset } from './engine.ts';

export type TemplateId = 'ukHousehold' | 'single' | 'benefits';

export interface TemplateBill {
  name: string;
  amountPence: number;
  dueDay: number;
  paymentMethod: string;
}

export interface BudgetTemplate {
  id: TemplateId;
  name: string;
  description: string;
  bestFor: string;
  accounts: { name: string; targetPence?: number }[];
  people: { shortName: string; fullName: string }[];
  cards: { name: string; limitPence: number }[];
  bills: TemplateBill[];
  savings: { name: string; type: string; targetPence: number; monthlyContributionPence: number }[];
  debts: { name: string; agreementType: string; monthlyPaymentPence: number; annualRatePct?: number }[];
  categories: string[];
}

const DIRECT_DEBIT = 'Direct Debit';
const STANDING_ORDER = 'Standing Order';

export const BUDGET_TEMPLATES: BudgetTemplate[] = [
  {
    id: 'ukHousehold',
    name: 'UK household',
    description: 'Two earners, a joint account, a credit card and the usual household bills.',
    bestFor: 'A couple running one home budget with shared bills.',
    accounts: [
      { name: 'Current account', targetPence: 100_000 },
      { name: 'Joint account' },
    ],
    people: [],
    cards: [{ name: 'Credit card', limitPence: 200_000 }],
    bills: [
      { name: 'Rent', amountPence: 95_000, dueDay: 1, paymentMethod: STANDING_ORDER },
      { name: 'Council Tax', amountPence: 14_500, dueDay: 5, paymentMethod: DIRECT_DEBIT },
      { name: 'Water', amountPence: 4_200, dueDay: 8, paymentMethod: DIRECT_DEBIT },
      { name: 'Energy', amountPence: 12_000, dueDay: 12, paymentMethod: DIRECT_DEBIT },
      { name: 'Broadband', amountPence: 3_200, dueDay: 15, paymentMethod: DIRECT_DEBIT },
      { name: 'Mobile phones', amountPence: 3_600, dueDay: 20, paymentMethod: DIRECT_DEBIT },
      { name: 'TV Licence', amountPence: 1_325, dueDay: 25, paymentMethod: DIRECT_DEBIT },
      { name: 'Contents insurance', amountPence: 1_200, dueDay: 28, paymentMethod: DIRECT_DEBIT },
    ],
    savings: [
      { name: 'Emergency fund', type: 'Easy access savings', targetPence: 300_000, monthlyContributionPence: 10_000 },
    ],
    debts: [],
    categories: ['Bills', 'Housing', 'Food', 'Transport', 'Shopping', 'Family', 'Savings', 'Entertainment', 'Income', 'Other'],
  },
  {
    id: 'single',
    name: 'Single person',
    description: 'One account, the essential bills and a small monthly saving.',
    bestFor: 'A single-person household starting from scratch.',
    accounts: [{ name: 'Current account', targetPence: 50_000 }],
    people: [],
    cards: [{ name: 'Credit card', limitPence: 100_000 }],
    bills: [
      { name: 'Rent', amountPence: 65_000, dueDay: 1, paymentMethod: STANDING_ORDER },
      { name: 'Council Tax', amountPence: 9_500, dueDay: 5, paymentMethod: DIRECT_DEBIT },
      { name: 'Water', amountPence: 2_800, dueDay: 8, paymentMethod: DIRECT_DEBIT },
      { name: 'Energy', amountPence: 7_500, dueDay: 12, paymentMethod: DIRECT_DEBIT },
      { name: 'Broadband', amountPence: 2_800, dueDay: 15, paymentMethod: DIRECT_DEBIT },
      { name: 'Mobile phone', amountPence: 1_200, dueDay: 20, paymentMethod: DIRECT_DEBIT },
      { name: 'TV Licence', amountPence: 1_325, dueDay: 25, paymentMethod: DIRECT_DEBIT },
    ],
    savings: [
      { name: 'Rainy day fund', type: 'Easy access savings', targetPence: 100_000, monthlyContributionPence: 5_000 },
    ],
    debts: [
      { name: 'Credit card balance', agreementType: 'Credit card', monthlyPaymentPence: 5_000, annualRatePct: 22.9 },
    ],
    categories: ['Bills', 'Housing', 'Food', 'Transport', 'Shopping', 'Health', 'Savings', 'Entertainment', 'Income', 'Other'],
  },
  {
    id: 'benefits',
    name: 'Benefits household',
    description: 'A lower-rent household with the bills usually covered by PIP or Universal Credit.',
    bestFor: 'A budget where PIP or Universal Credit is the main income.',
    accounts: [{ name: 'Current account', targetPence: 30_000 }],
    people: [],
    cards: [],
    bills: [
      { name: 'Rent', amountPence: 52_000, dueDay: 1, paymentMethod: STANDING_ORDER },
      { name: 'Council Tax', amountPence: 6_000, dueDay: 5, paymentMethod: DIRECT_DEBIT },
      { name: 'Water', amountPence: 3_200, dueDay: 8, paymentMethod: DIRECT_DEBIT },
      { name: 'Energy', amountPence: 9_500, dueDay: 12, paymentMethod: DIRECT_DEBIT },
      { name: 'Broadband', amountPence: 2_500, dueDay: 15, paymentMethod: DIRECT_DEBIT },
      { name: 'Mobile phone', amountPence: 1_500, dueDay: 20, paymentMethod: DIRECT_DEBIT },
    ],
    savings: [],
    debts: [],
    categories: ['Bills', 'Housing', 'Food', 'Transport', 'Health', 'Family', 'Income', 'Other'],
  },
];

export function findTemplate(id: string): BudgetTemplate | undefined {
  return BUDGET_TEMPLATES.find((template) => template.id === id);
}

/**
 * A template may only start an empty budget. Anything with money recorded is
 * refused rather than overwritten, which is the plan's acceptance rule.
 */
export function templateProblem(ds: Dataset): string | null {
  if (ds.transactions.length > 0) {
    return 'This budget already has transactions. Use a template only on a new, empty budget.';
  }
  if (ds.bills.length > 0) {
    return 'This budget already has bills. Use a template only on a new, empty budget.';
  }
  if ((ds.debts ?? []).length > 0 || (ds.savings ?? []).length > 0) {
    return 'This budget already has savings or debts. Use a template only on a new, empty budget.';
  }
  return null;
}

export interface TemplateOptions {
  year: number;
  asOf: string;
  anchor: string;
  currency?: string;
}

/** Build the template's dataset over the current one, keeping guides and preferences. */
export function applyTemplate(current: Dataset, id: string, options: TemplateOptions): Dataset | null {
  const template = findTemplate(id);
  if (!template) return null;
  const previousMonth = Number(options.asOf.slice(5, 7)) === 1
    ? `${Number(options.asOf.slice(0, 4)) - 1}-12-01`
    : `${options.asOf.slice(0, 4)}-${String(Number(options.asOf.slice(5, 7)) - 1).padStart(2, '0')}-01`;
  const lockCutoff = Number(options.asOf.slice(8, 10)) < 3 ? previousMonth : `${options.asOf.slice(0, 7)}-01`;

  return {
    ...current,
    settings: {
      ...current.settings,
      targetYear: options.year,
      startMonth: 1,
      monthsInYear: 12,
      asOfDate: options.asOf,
      lockCutoff,
      anchorDate: options.anchor || options.asOf,
      primaryAccount: template.accounts[0].name,
      currency: options.currency || current.settings.currency || '£',
      billSheets: undefined,
    },
    accounts: template.accounts.map((account, index) => ({
      name: account.name,
      targetPence: account.targetPence ?? 0,
      openingPence: 0,
      sortOrder: index + 1,
      active: true,
    })),
    people: template.people.map((person, index) => ({
      shortName: person.shortName,
      fullName: person.fullName,
      openingPence: 0,
      sortOrder: index + 1,
      active: true,
    })),
    cards: template.cards.map((card, index) => ({
      name: card.name,
      limitPence: card.limitPence,
      openingPence: 0,
      sortOrder: index + 1,
      active: true,
    })),
    bills: template.bills.map((bill, index) => ({
      name: bill.name,
      amountPence: bill.amountPence,
      dueDay: bill.dueDay,
      linkedSheet: '',
      frequency: 'Monthly',
      latestBalancePence: 0,
      latestPaymentPence: 0,
      sortOrder: index + 1,
      active: true,
      effectiveFrom: '',
      paymentMethod: bill.paymentMethod,
      baseAmountPence: bill.amountPence,
      baseDueDay: bill.dueDay,
    })),
    billChanges: [],
    incomeSchedules: { pip: [], uc: [] },
    transactions: [],
    providers: {},
    savings: template.savings.map((account, index) => ({
      id: `savings_template_${index + 1}`,
      name: account.name,
      provider: '',
      type: account.type,
      balancePence: 0,
      targetPence: account.targetPence,
      monthlyContributionPence: account.monthlyContributionPence,
      contributionDay: 1,
      interestRatePct: 0,
      notes: 'Template starting point — add the current balance.',
      active: true,
    })),
    debts: template.debts.map((debt, index) => ({
      id: `debt_template_${index + 1}`,
      name: debt.name,
      creditor: '',
      agreementType: debt.agreementType,
      agreementRef: '',
      balancePence: 0,
      monthlyPaymentPence: debt.monthlyPaymentPence,
      dueDay: 1,
      interestRatePct: debt.annualRatePct ?? 0,
      startDate: '',
      notes: 'Template starting point — add the amount still owed.',
      active: true,
    })),
    assets: [],
    importRules: [],
    importBatches: [],
    csvProfiles: [],
    recurringDismissed: [],
    categories: template.categories,
    holidays: {},
    changelog: [],
    audit: [],
    monthLocks: {},
    reference: undefined,
  };
}
