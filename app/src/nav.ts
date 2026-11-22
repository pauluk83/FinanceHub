import type { Dataset } from '../../core/engine';
import { PROVIDER_SETUP, isProviderEnabled, providerDisplayName } from './providerSetup.ts';

export const NAV_GROUPS = ['Overview', 'Ledger', 'Providers', 'Tools'] as const;
export type NavGroup = (typeof NAV_GROUPS)[number];

/** Settings is the one item that always stays visible in Tools: every other item can be hidden or moved. */
export const PINNED_NAV_IDS: readonly string[] = ['settings'];

export function isPinnedItem(item: { id: string }): boolean {
  return PINNED_NAV_IDS.includes(item.id);
}

export const NAV_GROUP_TIPS: Record<NavGroup, string> = {
  Overview: 'Where the budget stands: totals, one month in detail and the month-end close.',
  Ledger: 'The money itself: transactions, income, accounts, cards, people, bills and holidays.',
  Providers: 'Provider ledgers: statements, charges, payments and running balances.',
  Tools: 'Setup, statements, import, data health, settings, the application and budget changelogs, and this guide.',
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
  { id: 'netWorth', label: 'Net worth', icon: '◈', group: 'Overview', tip: 'Bank accounts, savings, manual assets, cards and debts in one total, with a recorded trend.' },
  { id: 'calendar', label: 'Calendar', icon: '▦', group: 'Overview', tip: 'Bills, income, debt payments and holidays by day, plus safe-to-spend and .ics export.' },
  { id: 'forecast', label: 'Forecast', icon: '↗', group: 'Overview', tip: 'Twelve months of cash forward from scheduled bills, PIP/UC, debt and savings, with a temporary what-if.' },
  { id: 'progress', label: 'Progress', icon: '◐', group: 'Overview', tip: 'Debt snowball and avalanche, savings targets and year-over-year comparisons.' },
  { id: 'reports', label: 'Reports', icon: '◔', group: 'Overview', tip: 'Category and tag spending, a twelve-month trend and report-only monthly targets.' },
  { id: 'transactions', label: 'Transactions', icon: '≡', group: 'Ledger', tip: 'Every movement in the budget, with transfer pairing, refunds and filters.' },
  { id: 'income', label: 'Income', icon: '£', group: 'Ledger', tip: 'PIP and Universal Credit dates, amounts and target-year totals.' },
  { id: 'accounts', label: 'Accounts', icon: '▥', group: 'Ledger', tip: 'Bank accounts, opening balances, targets and running ledger balances.' },
  { id: 'cards', label: 'Cards', icon: '▦', group: 'Ledger', tip: 'Credit limits, balances and utilisation for each card.' },
  { id: 'people', label: 'People', icon: '◉', group: 'Ledger', tip: 'Money you lent, repayments received and what is still owed.' },
  { id: 'bills', label: 'Bills', icon: '⌂', group: 'Ledger', tip: 'Bill definitions, link sheets, overrides and one-off changes; each month\'s scheduled run is on Monthly.' },
  { id: 'debts', label: 'Debts', icon: '⚖', group: 'Ledger', tip: 'Loans, credit and agreements: what is owed, the monthly payment and the due date.' },
  { id: 'savings', label: 'Savings', icon: '🏦', group: 'Ledger', tip: 'Savings and ISA accounts: balances, targets, account details and regular contributions.' },
  { id: 'holidays', label: 'Holidays', icon: '✈', group: 'Ledger', tip: 'Trips, dates, payments and booking details.' },
  { id: 'setup', label: 'Guided setup', icon: '✦', group: 'Tools', tip: 'Onboarding: budget location, accounts, people, bills, providers and your first transactions.' },
  { id: 'statements', label: 'Statements', icon: '▤', group: 'Tools', tip: 'A filtered statement for one account with opening, movement and running balances.' },
  { id: 'evidence', label: 'Evidence packs', icon: '⎙', group: 'Tools', tip: 'Printable and Excel packs for a provider dispute, a month close or benefits evidence.' },
  { id: 'import', label: 'Import', icon: '⇪', group: 'Tools', tip: 'Import a bank CSV, review every row, then append — nothing posts automatically.' },
  { id: 'rules', label: 'Import rules', icon: '⌁', group: 'Tools', tip: 'Review-only merchant rules: suggest a category and tags during import without moving any total.' },
  { id: 'alerts', label: 'Notifications', icon: '🔔', group: 'Tools', tip: 'Bills due soon, low account balances and high card use, with a read state stored in this budget.' },
  { id: 'health', label: 'Data health', icon: '✚', group: 'Tools', tip: 'Read-only integrity checks for account names, duplicates, provider year chains, bill links, locked months, dormant accounts, sync and backups.' },
  { id: 'settings', label: 'Settings', icon: '⚙', group: 'Tools', tip: 'Accounts, people, cards, bills, provider vault, sync, backups and the sidebar menu layout.' },
  { id: 'appChangelog', label: 'Application changelog', icon: '⤴', group: 'Tools', tip: 'Release history for each build: version, build id, dates and the Windows installer download.' },
  { id: 'changelog', label: 'Budget changelog', icon: '🕘', group: 'Tools', tip: 'Your own history: bills, balances, people and month-end figures, kept with the budget and backups.' },
  { id: 'guides', label: 'Guides', icon: '?', group: 'Tools', tip: 'One help page: the full user guide for every section, then the month-end and new-year workflows.' },
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
  if (isPinnedItem(item)) return item.group;
  const target = layout.groups?.[item.id];
  if (!target) return item.group;
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
          if (isPinnedItem(item)) return group === item.group;
          return !hidden.has(item.id) && effectiveGroup(item, layout) === group;
        })
        .map(({ id, label, icon, tip }) => ({ id, label, icon, tip })),
    }))
    .filter((section) => section.items.length > 0);
}
