import type { Dataset } from '../../core/engine';
import { PROVIDER_SETUP, isProviderEnabled, providerDisplayName } from './providerSetup.ts';

export const NAV_GROUPS = ['Overview', 'Ledger', 'Providers', 'Tools'] as const;
export type NavGroup = (typeof NAV_GROUPS)[number];

/** Tools is deliberately static: its items can never be hidden or moved. */
export const STATIC_GROUP: NavGroup = 'Tools';

export const NAV_GROUP_TIPS: Record<NavGroup, string> = {
  Overview: 'Where the budget stands: totals, one month in detail and the month-end close.',
  Ledger: 'The money itself: transactions, income, accounts, cards, people, bills and holidays.',
  Providers: 'Provider ledgers: statements, charges, payments and running balances.',
  Tools: 'Fixed tools: setup, statements, import, settings, the application and budget changelogs, and this guide.',
};

const PROVIDER_TIPS: Record<string, string> = {
  rent: 'Rent ledger: weekly charge, monthly payment, agreement details and running balance.',
  water: 'Water statements: bills, payments, plan and balance.',
  councilTax: 'Council Tax charges, instalments and direct debit payments.',
  parkXmas: 'Park Christmas Savings plan: payments in and withdrawals out.',
  pureCremation: 'Pure Cremation monthly plan and payment history.',
  ovo: 'Ovo Energy statements, payments and running balance.',
  o2: 'O2 contract bills, price tiers and monthly plan.',
  virgin: 'Virgin Media contract bills and price tiers.',
};

export interface NavItemDef {
  id: string;
  label: string;
  icon: string;
  group: NavGroup;
  tip: string;
}

export interface NavItem {
  id: string;
  label: string;
  icon: string;
  tip: string;
}

export interface NavSection {
  group: NavGroup;
  items: NavItem[];
}

export interface NavLayout {
  hidden?: string[];
  groups?: Record<string, string>;
}

const FIXED: NavItemDef[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '◫', group: 'Overview', tip: 'Year-to-date totals, account, card and People balances, and the model checks for the selected month.' },
  { id: 'monthly', label: 'Monthly', icon: '▤', group: 'Overview', tip: 'One month at a time: every income line, bill, provider charge and transfer. Locked months are read-only.' },
  { id: 'monthEnd', label: 'Month end', icon: '◷', group: 'Overview', tip: 'Reconcile the month, review the close summary and lock the snapshot.' },
  { id: 'transactions', label: 'Transactions', icon: '≡', group: 'Ledger', tip: 'Every movement in the budget, with transfer pairing, refunds and filters.' },
  { id: 'income', label: 'Income', icon: '£', group: 'Ledger', tip: 'PIP and Universal Credit dates, amounts and target-year totals.' },
  { id: 'accounts', label: 'Accounts', icon: '▥', group: 'Ledger', tip: 'Bank accounts, opening balances, targets and running ledger balances.' },
  { id: 'cards', label: 'Cards', icon: '▦', group: 'Ledger', tip: 'Credit limits, balances and utilisation for each card.' },
  { id: 'people', label: 'People', icon: '◉', group: 'Ledger', tip: 'Money you lent, repayments received and what is still owed.' },
  { id: 'bills', label: 'Bills', icon: '⌂', group: 'Ledger', tip: 'Scheduled bills, base amounts, overrides and one-off changes.' },
  { id: 'debts', label: 'Debts', icon: '⚖', group: 'Ledger', tip: 'Loans, credit and agreements: what is owed, the monthly payment and the due date.' },
  { id: 'savings', label: 'Savings', icon: '🏦', group: 'Ledger', tip: 'Savings and ISA accounts: balances, targets, account details and regular contributions.' },
  { id: 'holidays', label: 'Holidays', icon: '✈', group: 'Ledger', tip: 'Trips, dates, payments and booking details.' },
  { id: 'setup', label: 'Guided setup', icon: '✦', group: 'Tools', tip: 'Onboarding: budget location, accounts, people, bills, providers and your first transactions.' },
  { id: 'statements', label: 'Statements', icon: '▤', group: 'Tools', tip: 'A filtered statement for one account with opening, movement and running balances.' },
  { id: 'import', label: 'Import', icon: '⇪', group: 'Tools', tip: 'Import a bank CSV, review every row, then append — nothing posts automatically.' },
  { id: 'settings', label: 'Settings', icon: '⚙', group: 'Tools', tip: 'Accounts, people, cards, bills, provider vault, sync, backups and the sidebar menu layout.' },
  { id: 'appChangelog', label: 'Application changelog', icon: '⤴', group: 'Tools', tip: 'Release history for each build: version, build id, dates and the Windows installer download.' },
  { id: 'changelog', label: 'Budget changelog', icon: '🕘', group: 'Tools', tip: 'Your own history: bills, balances, people and month-end figures, kept with the budget and backups.' },
  { id: 'guides', label: 'Guides', icon: '?', group: 'Tools', tip: 'The full user guide for every section, plus the month-end and new-year workflows.' },
];

export function navLayout(ds: Dataset): NavLayout {
  return (ds.settings.navLayout ?? {}) as NavLayout;
}

export function defaultNavItems(ds: Dataset): NavItemDef[] {
  const providers: NavItemDef[] = PROVIDER_SETUP
    .filter((meta) => isProviderEnabled(ds, meta.key))
    .map((meta) => ({
      id: meta.key,
      label: providerDisplayName(ds, meta.key),
      icon: meta.icon,
      group: 'Providers',
      tip: PROVIDER_TIPS[meta.key] ?? `${meta.name} ledger: statements, payments and running balance.`,
    }));
  return [...FIXED, ...providers];
}

export function effectiveGroup(item: NavItemDef, layout: NavLayout): NavGroup {
  if (item.group === STATIC_GROUP) return STATIC_GROUP;
  const target = layout.groups?.[item.id];
  if (!target || target === STATIC_GROUP) return item.group;
  return (NAV_GROUPS as readonly string[]).includes(target) ? (target as NavGroup) : item.group;
}

export function buildNav(ds: Dataset, options: { hideSetup?: boolean } = {}): NavSection[] {
  const layout = navLayout(ds);
  const hidden = new Set(layout.hidden ?? []);
  const items = defaultNavItems(ds).filter((item) => !(options.hideSetup && item.id === 'setup'));

  return NAV_GROUPS
    .map((group) => ({
      group,
      items: items
        .filter((item) => {
          if (item.group === STATIC_GROUP) return group === STATIC_GROUP;
          return !hidden.has(item.id) && effectiveGroup(item, layout) === group;
        })
        .map(({ id, label, icon, tip }) => ({ id, label, icon, tip })),
    }))
    .filter((section) => section.items.length > 0);
}
