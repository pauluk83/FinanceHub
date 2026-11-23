/**
 * Rules for the app-generated rows older builds wrote into the budget changelog.
 *
 * Those rows are user data: they stay in the document and in every backup, but an
 * automatic entry that only says "App update" says nothing about the money that
 * moved. Each view that lists the history hides them with these rules, so the
 * Budget changelog, the monthly digest and the Notifications screen agree.
 */
const APP_UPDATE_TITLE = /^app update$/i;
const AUTO_UPDATES = /auto[\s-]?updates?/i;

/**
 * Automatic entries written before automatic changes carried a title all used the
 * bare fallback "App update", so they say nothing about the money that moved.
 */
export function isAppUpdatePlaceholder(entry: { sheetCell?: string; auto?: boolean }): boolean {
  return entry.auto === true && APP_UPDATE_TITLE.test(String(entry.sheetCell ?? '').trim());
}

/** Hide app-generated placeholder entries while keeping every named budget entry. */
export function withoutAppUpdatePlaceholders<T extends { sheetCell?: string; auto?: boolean }>(entries: T[]): T[] {
  return entries.filter((entry) => !isAppUpdatePlaceholder(entry));
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
