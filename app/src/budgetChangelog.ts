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
const UI_ONLY_SETTINGS = new Set(['navLayout', 'notificationReads', 'savedFilters', 'emailReminders']);

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

const APP_UPDATE_TITLE = /^app update$/i;
const AUTO_UPDATES = /auto[\s-]?updates?/i;

/**
 * Automatic entries written before automatic changes carried a title all used the
 * bare fallback "App update", so they say nothing about the money that moved.
 * They stay in the saved document (and in backups) but are hidden from the Budget
 * changelog; every new automatic entry names the section it changed.
 */
export function isAppUpdatePlaceholder(entry: { sheetCell?: string; auto?: boolean }): boolean {
  return entry.auto === true && APP_UPDATE_TITLE.test(String(entry.sheetCell ?? '').trim());
}

/** Hide app-generated placeholder entries while keeping every named budget entry. */
export function withoutAppUpdatePlaceholders<T extends { sheetCell?: string; auto?: boolean }>(entries: T[]): T[] {
  return entries.filter((entry) => !isAppUpdatePlaceholder(entry));
}

const AUTO_BUDGET_CHANGE_TITLE = /^budget change\b/i;

/**
 * Automatic per-save rows ("Budget change — Transactions") repeated the same
 * line for every edit and buried the real history. The app no longer writes
 * them; this removes the ones earlier builds saved. Custom notes and month-end
 * close entries are kept.
 */
export function withoutAutomaticBudgetChanges<T extends { sheetCell?: string; auto?: boolean }>(entries: T[]): T[] {
  return entries.filter((entry) => !(entry.auto === true && AUTO_BUDGET_CHANGE_TITLE.test(String(entry.sheetCell ?? '').trim())));
}

/**
 * One legacy entry used the title "App update" and the text "Auto updates".
 * Remove only that pair (in either order), not every automatic budget entry
 * whose title once fell back to "App update".
 */
export function withoutLegacyAppUpdateNotes<T extends {
  sheetCell?: string;
  description?: string;
  details?: unknown;
}>(entries: T[]): T[] {
  return entries.filter((entry) => {
    const title = String(entry.sheetCell ?? '').trim();
    const details = Array.isArray(entry.details) ? entry.details.join(' ') : '';
    const body = `${entry.description ?? ''} ${details}`.trim();
    const titleIsAppUpdate = APP_UPDATE_TITLE.test(title);
    const bodyIsAutoUpdates = AUTO_UPDATES.test(body);
    const titleIsAutoUpdates = AUTO_UPDATES.test(title);
    const bodyIsAppUpdate = APP_UPDATE_TITLE.test(body);
    return !((titleIsAppUpdate && bodyIsAutoUpdates) || (titleIsAutoUpdates && bodyIsAppUpdate));
  });
}
