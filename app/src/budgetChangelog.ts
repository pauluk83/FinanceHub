import type { Dataset } from '../../core/engine';

/**
 * The budget changelog is user data. It records changes to the budget itself,
 * never app release notes or interface-only preferences.
 */
export const BUDGET_CHANGE_SECTIONS: [string, string][] = [
  ['settings', 'Settings'],
  ['accounts', 'Accounts'],
  ['people', 'People'],
  ['cards', 'Cards'],
  ['bills', 'Bills'],
  ['billChanges', 'Bill changes'],
  ['transactions', 'Transactions'],
  ['incomeSchedules', 'Income schedules'],
  ['providers', 'Provider ledgers'],
  ['holidays', 'Holidays'],
  ['monthLocks', 'Month locks'],
];

/**
 * Settings keys that only arrange the interface. Hiding or moving a menu item
 * changes no balance, so it must not create a budget history entry.
 */
const UI_ONLY_SETTINGS = new Set(['navLayout']);

function comparable(dataset: Dataset, key: string): unknown {
  if (key !== 'settings') return (dataset as unknown as Record<string, unknown>)[key];
  const settings = { ...(dataset.settings as unknown as Record<string, unknown>) };
  for (const name of UI_ONLY_SETTINGS) delete settings[name];
  return settings;
}

/** Sections whose budget data actually changed, in a stable order. */
export function changedBudgetSections(before: Dataset, after: Dataset): string[] {
  return BUDGET_CHANGE_SECTIONS
    .filter(([key]) => JSON.stringify(comparable(before, key)) !== JSON.stringify(comparable(after, key)))
    .map(([, label]) => label);
}

/**
 * Notes written by earlier builds that describe the app rather than the budget.
 * The data fix removes them from existing documents; the imported workbook
 * history and every real money change stay untouched.
 */
export const APP_FEATURE_NOTE_SIGNATURES = [
  'financehub-2026-11-07-unknown-accounts',
  'financehub-2026-11-07-holiday-trips',
  'financehub-2026-11-07-pseudo-accounts',
  'financehub-2026-11-07-import-safety',
  'financehub-2026-11-07-desktop-fixes',
] as const;

const APP_FEATURE_SIGNATURES = new Set<string>(APP_FEATURE_NOTE_SIGNATURES);

/** Drop app-feature notes while keeping every budget entry, including custom ones. */
export function withoutAppFeatureNotes<T extends { signature?: string }>(entries: T[]): T[] {
  return entries.filter((entry) => !entry.signature || !APP_FEATURE_SIGNATURES.has(entry.signature));
}
