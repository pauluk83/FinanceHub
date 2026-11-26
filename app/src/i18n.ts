/**
 * The translation layer. Every user-facing string that has been moved over
 * lives in the catalogue below, keyed by a dotted name, and is read through
 * `t()`. Adding a language means adding a locale to `LOCALES`, a catalogue of
 * the same keys, and `setLocale()` calls that catalogue in.
 *
 * This is deliberately small to begin with: the tour, the skip link and the
 * settings labels use it so the pattern is in place, and the rest of the views
 * can move over a screen at a time without this module changing.
 */
export type Locale = 'en-GB';

export const LOCALES: { id: Locale; label: string }[] = [
  { id: 'en-GB', label: 'English (United Kingdom)' },
];

const EN_GB = {
  'app.name': 'FinanceHub',
  'a11y.skip': 'Skip to main content',
  'theme.system': 'Follow system',
  'tour.progress': 'Step {step} of {total}',
  'tour.skip': 'Skip the tour',
  'tour.back': 'Back',
  'tour.next': 'Next',
  'tour.done': 'Start using FinanceHub',
  'tour.sample': 'Open the sample workspace',
  'tour.welcome.title': 'Welcome to FinanceHub',
  'tour.welcome.body':
    'This two-minute tour points out where everything lives. Nothing here changes your budget, and you can skip it at any time.',
  'tour.nav.title': 'Four places to look',
  'tour.nav.body':
    'Overview is the month you are in. Ledger holds transactions, accounts, people and cards. Providers holds rent, council tax and the household bills. Tools holds imports, backups, guides and settings.',
  'tour.entry.title': 'Everything starts as one row',
  'tour.entry.body':
    'Add a transaction in Transactions with its month, account, category and amount. Balances, reports, forecasts and progress are all computed from those rows, so no total is ever typed twice.',
  'tour.bills.title': 'Bills are scheduled once',
  'tour.bills.body':
    'A bill carries its amount, due day, method and link sheet. Link it to a provider and the provider statement takes its payment from the bill, so the same money is entered in one place only.',
  'tour.ready.title': 'That is the whole layout',
  'tour.ready.body':
    'Your own figures only appear once you add them. If you would rather look around first, the sample workspace is stock full of example data and saves nothing.',
} as const;

export type MessageKey = keyof typeof EN_GB;

const CATALOGUES: Record<Locale, Record<MessageKey, string>> = {
  'en-GB': EN_GB,
};

let active: Locale = 'en-GB';

/** The locale the interface is currently rendered in. */
export const locale = (): Locale => active;

/** Switch the interface language, and tell assistive technology which one it is. */
export function setLocale(next: Locale): void {
  if (!(next in CATALOGUES)) return;
  active = next;
  if (typeof document !== 'undefined') document.documentElement.lang = next;
}

/**
 * Look up a message and fill in `{name}` placeholders. An unknown key returns
 * the key itself, so a missing translation is visible rather than blank.
 */
export function t(key: MessageKey, vars: Record<string, string | number> = {}): string {
  const template = CATALOGUES[active][key];
  if (!template) return key;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match,
  );
}
