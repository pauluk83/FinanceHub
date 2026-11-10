// Resolved by Vite and tsconfig: the private workbook when present, otherwise the
// committed blank seed, so a clean checkout still typechecks and builds.
import seed from '@workbook';
import { advanceAsOfToLatestTransaction, latestTransactionDate, type Dataset } from '../../core/engine';
import type { Theme } from './types';
import { HOSTED_WEB } from './runtime';
import { applyDataFixes } from './dataFixes';
import { todayIso } from './format';
import type { EncryptedVault } from './vault';

export interface AppState {
  version: 1;
  dataset: Dataset;
  theme: Theme;
  savedAt: string;
  /** End-to-end encrypted provider credentials; never contains plaintext secrets. */
  vault?: EncryptedVault | null;
}

const KEY = 'financehub.state.v1';
const OWNER_KEY = 'financehub.owner.v1';
const LAST_GOOD_SUFFIX = '.last-good.v1';
const DAMAGED_SUFFIX = '.damaged.v1';
const BROWSER_STORE_PATH = '/api/store';
const BROWSER_STORE_KEY = /^financehub\./;
export const LOCAL_USER_ID = 'local';

let browserStoreCache: Map<string, string> | null = null;
let browserHeartbeat: number | null = null;
const scopedKey = (userId: string) => `${KEY}:${userId}`;
const storageKey = (userId?: string) => userId && userId !== LOCAL_USER_ID ? scopedKey(userId) : KEY;
const lastGoodKey = (userId?: string) => `${storageKey(userId)}${LAST_GOOD_SUFFIX}`;
const damagedKey = (userId?: string) => `${storageKey(userId)}${DAMAGED_SUFFIX}`;

function nativeStorage(): DesktopSecureStorage | null {
  if (typeof window === 'undefined') return null;
  return window.financeHubDesktop?.secureStorage ?? null;
}

function requireBrowserStore(): Map<string, string> {
  if (!browserStoreCache) {
    throw new Error('The shared desktop data store is not connected. Open FinanceHub from the FinanceHub Browser shortcut.');
  }
  return browserStoreCache;
}

function postBrowserStore(key: string, value: string | null) {
  const request = new XMLHttpRequest();
  request.open('POST', BROWSER_STORE_PATH, false);
  request.setRequestHeader('Content-Type', 'text/plain;charset=UTF-8');
  request.send(JSON.stringify({ key, value }));
  if (request.status < 200 || request.status >= 300) {
    let message = request.status === 0
      ? 'The shared desktop data store is not reachable. Open FinanceHub Browser again.'
      : `The shared data store rejected the write (${request.status}).`;
    try {
      const body = JSON.parse(request.responseText) as { error?: unknown };
      if (typeof body.error === 'string' && body.error) message = body.error;
    } catch {
      /* keep the status message */
    }
    throw new Error(message);
  }
}

function startBrowserHeartbeat() {
  if (browserHeartbeat !== null || typeof window === 'undefined') return;
  const ping = () => {
    void fetch('/api/ping', { method: 'POST', keepalive: true }).catch(() => { /* the next request can reconnect */ });
  };
  ping();
  browserHeartbeat = window.setInterval(ping, 10000);
  window.addEventListener('pagehide', () => {
    if (browserHeartbeat === null) return;
    window.clearInterval(browserHeartbeat);
    browserHeartbeat = null;
  }, { once: true });
}

/** Load the browser's visible copy from the same DPAPI-backed store the desktop app uses. */
export async function hydrateBrowserStore(): Promise<void> {
  if (HOSTED_WEB) return;
  if (typeof window === 'undefined' || nativeStorage() || browserStoreCache) return;
  const response = await fetch(BROWSER_STORE_PATH, { cache: 'no-store', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`The shared data store answered ${response.status}.`);
  const payload = await response.json() as { ok?: boolean; values?: Record<string, unknown> };
  if (!payload.ok || !payload.values || typeof payload.values !== 'object') {
    throw new Error('The shared data store returned an invalid snapshot.');
  }
  const values = new Map<string, string>();
  for (const [key, value] of Object.entries(payload.values)) {
    if (BROWSER_STORE_KEY.test(key) && typeof value === 'string') values.set(key, value);
  }
  browserStoreCache = values;
  startBrowserHeartbeat();
}

function webStorage(): Storage {
  if (typeof window === 'undefined') throw new Error('Browser storage is only available in a browser.');
  try {
    return window.localStorage;
  } catch {
    throw new Error('Browser storage is unavailable. Allow site data for FinanceHub and reload.');
  }
}

function readRaw(key: string): string | null {
  const native = nativeStorage();
  if (native) return native.getItem(key);
  if (HOSTED_WEB) return webStorage().getItem(key);
  return requireBrowserStore().get(key) ?? null;
}

function writeRaw(key: string, value: string) {
  const native = nativeStorage();
  if (native) {
    native.setItem(key, value);
    return;
  }
  if (HOSTED_WEB) {
    webStorage().setItem(key, value);
    return;
  }
  postBrowserStore(key, value);
  requireBrowserStore().set(key, value);
}

function removeRaw(key: string) {
  const native = nativeStorage();
  if (native) {
    native.removeItem(key);
    return;
  }
  if (HOSTED_WEB) {
    webStorage().removeItem(key);
    return;
  }
  postBrowserStore(key, null);
  requireBrowserStore().delete(key);
}

function preserveDamaged(userId: string | undefined, raw: string) {
  try { writeRaw(damagedKey(userId), raw); } catch { /* the original remains untouched */ }
}

/** Persistence helpers for sync metadata. They use the same DPAPI-backed store. */
export function readPersistedValue(key: string): string | null {
  try { return readRaw(key); } catch { return null; }
}

export function writePersistedValue(key: string, value: string): boolean {
  try { writeRaw(key, value); return true; } catch { return false; }
}

export function removePersistedValue(key: string): void {
  try { removeRaw(key); } catch { /* storage unavailable */ }
}

/**
 * Corrections confirmed against the bank after the workbook was imported.
 * Each runs once per budget and records its id, so a row the user deliberately
 * deletes afterwards does not reappear on the next load.
 */

export function seedState(): AppState {
  return applyDataFixes(hydrateProviderPaid(hydrateRentMatched({
    version: 1,
    dataset: structuredClone(seed) as unknown as Dataset,
    theme: 'dark',
    savedAt: new Date().toISOString(),
  })));
}

const seedProviders = seed.providers as Record<string, Record<string, any>>;
const RENT_EDITABLE_FIELDS = new Set(['rentBreakdown', 'paymentPlan', 'agreement', 'monthlyRentPence', 'weeklyChargePence', 'monthlyPaymentPence']);
const WATER_EDITABLE_FIELDS = new Set(['monthlyPaymentPence']);

/** Older local states predate the provider header details and contract blocks in the seed. */
function hydrateProviderDetails(state: AppState): AppState {
  let changed = false;
  const providers = { ...state.dataset.providers };
  for (const [key, seedProvider] of Object.entries(seedProviders)) {
    const current = providers[key];
    if (!current) continue;
    const next = { ...current };
    const preserveRentEdits = key === 'rent' && current.detailsEdited === true;
    const preserveWaterEdits = key === 'water' && current.detailsEdited === true;
    let providerChanged = false;
    for (const [field, value] of Object.entries(seedProvider)) {
      if (field === 'contract' || Array.isArray(value) || (value !== null && typeof value === 'object')) continue;
      if (preserveRentEdits && RENT_EDITABLE_FIELDS.has(field)) continue;
      if (preserveWaterEdits && WATER_EDITABLE_FIELDS.has(field)) continue;
      if (next[field] !== value) {
        next[field] = value;
        providerChanged = true;
      }
    }
    const nextContract = seedProvider.contract;
    // O2/Virgin totals are derived from the ledger, so a saved contract that has
    // been recalculated must not be overwritten with the seed's original figures.
    if (nextContract && !current.contractEdited && JSON.stringify(current.contract) !== JSON.stringify(nextContract)) {
      next.contract = structuredClone(nextContract);
      providerChanged = true;
    }
    if (providerChanged) {
      providers[key] = next;
      changed = true;
    }
  }
  return changed ? { ...state, dataset: { ...state.dataset, providers } } : state;
}

function hydrateParkXmasPlan(state: AppState): AppState {
  const current = state.dataset.providers.parkXmas;
  const seedRow = seedProviders.parkXmas?.statement?.find((row: any) => row.opening === true);
  if (!current || !Array.isArray(current.statement) || !seedRow) return state;
  if (current.statement.some((row: any) => row.opening === true)) return state;
  const statement = [...current.statement];
  const sepIndex = statement.findIndex((row: any) => row.month === 'Sep' && row.status === 'Paid Off');
  statement.splice(sepIndex >= 0 ? sepIndex + 1 : statement.length, 0, structuredClone(seedRow));
  return {
    ...state,
    dataset: {
      ...state.dataset,
      providers: { ...state.dataset.providers, parkXmas: { ...current, statement } },
    },
  };
}

/** Existing Rent rows are confirmed up to the as-of date; later rows start unset. */
function hydrateRentMatched(state: AppState): AppState {
  const current = state.dataset.providers.rent;
  if (!current || !Array.isArray(current.entries)) return state;
  let changed = false;
  const entries = current.entries.map((entry: any) => {
    if (entry.matched !== undefined) return entry;
    changed = true;
    return {
      ...entry,
      matched: entry.date && entry.date <= state.dataset.settings.asOfDate ? '✓ Yes' : '',
    };
  });
  if (!changed) return state;
  return {
    ...state,
    dataset: {
      ...state.dataset,
      providers: { ...state.dataset.providers, rent: { ...current, entries } },
    },
  };
}

const PROVIDER_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PROVIDER_PAID = '✓ Yes';
const PROVIDER_ROWS_KEY: Record<string, 'statement' | 'entries'> = {
  parkXmas: 'statement',
  pureCremation: 'statement',
  o2: 'statement',
  virgin: 'statement',
};

/** Provider periods through the current month are marked Paid; later periods stay unset. */
function hydrateProviderPaid(state: AppState): AppState {
  const asOf = state.dataset.settings.asOfDate;
  const asOfYear = Number(asOf.slice(0, 4));
  const asOfMonth = Number(asOf.slice(5, 7));
  const asOfMonthStart = asOf.slice(0, 7);
  let changed = false;
  const providers = { ...state.dataset.providers };
  for (const [key, rowsKey] of Object.entries(PROVIDER_ROWS_KEY)) {
    const current = providers[key];
    if (!current || !Array.isArray(current[rowsKey])) continue;
    let providerChanged = false;
    const rows = current[rowsKey].map((row: any) => {
      const rowDate = typeof row.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.date) ? row.date : '';
      const monthIndex = PROVIDER_MONTHS.indexOf(String(row.month ?? ''));
      const year = Number(current.year ?? current.targetYear ?? state.dataset.settings.targetYear);
      const previous = rowDate
        ? rowDate.slice(0, 7) <= asOfMonthStart
        : monthIndex >= 0 && (year < asOfYear || (year === asOfYear && monthIndex + 1 <= asOfMonth));
      if (!previous) {
        if (row.paid === undefined) {
          providerChanged = true;
          return { ...row, paid: '' };
        }
        return row;
      }
      if (row.paid === PROVIDER_PAID) return row;
      providerChanged = true;
      return { ...row, paid: PROVIDER_PAID };
    });
    if (providerChanged) {
      providers[key] = { ...current, [rowsKey]: rows };
      changed = true;
    }
  }
  return changed ? { ...state, dataset: { ...state.dataset, providers } } : state;
}

/**
 * One-time repair for budgets saved before the As-Of cutoff followed new
 * transactions. The marker records the latest transaction date already handled,
 * so a deliberately historical As-Of date survives a reload while genuinely
 * newer synced data can still move the cutoff forward.
 */
function ensureAsOfCoversTransactions(state: AppState): AppState {
  const meta = (state.dataset.meta ?? {}) as { asOfAdvance?: string };
  const today = todayIso();
  const latest = latestTransactionDate(state.dataset, today);
  if (!latest || (meta.asOfAdvance && latest <= meta.asOfAdvance)) return state;
  const dataset = structuredClone(state.dataset);
  advanceAsOfToLatestTransaction(dataset, today);
  dataset.meta = { ...(state.dataset.meta ?? {}), asOfAdvance: latest };
  return { ...state, dataset };
}

function decodeState(raw: string | null): AppState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AppState;
    if (parsed?.version !== 1 || !parsed.dataset?.settings) return null;
    return ensureAsOfCoversTransactions(applyDataFixes(hydrateProviderPaid(hydrateRentMatched(hydrateParkXmasPlan(hydrateProviderDetails({ ...parsed, theme: parsed.theme === 'light' ? 'light' : 'dark' }))))));
  } catch {
    return null;
  }
}

/** Validate an object received from the sync boundary before it reaches React. */
export function decodeStoredState(value: unknown): AppState | null {
  if (!value) return null;
  try {
    return decodeState(typeof value === 'string' ? value : JSON.stringify(value));
  } catch {
    return null;
  }
}

export type LoadStatus = 'ok' | 'new' | 'recovered' | 'blocked';

export interface LoadedState {
  state: AppState;
  status: LoadStatus;
  message?: string;
}

function resolveStoredState(currentRaw: string | null, lastGoodRaw: string | null): LoadedState {
  if (!currentRaw) {
    const lastGood = decodeState(lastGoodRaw);
    if (lastGood) {
      return {
        state: lastGood,
        status: 'recovered',
        message: 'The saved budget was missing. FinanceHub recovered the last known-good copy.',
      };
    }
    return { state: seedState(), status: 'new' };
  }

  const current = decodeState(currentRaw);
  if (current) return { state: current, status: 'ok' };

  const lastGood = decodeState(lastGoodRaw);
  if (lastGood) {
    return {
      state: lastGood,
      status: 'recovered',
      message: 'The saved budget could not be read. FinanceHub recovered the last known-good copy and kept the unreadable document.',
    };
  }

  return {
    state: seedState(),
    status: 'blocked',
    message: 'The saved budget could not be read, and no last known-good copy is available. Saving is disabled so the unreadable document is not overwritten.',
  };
}

/** A safe, genuinely empty state for a second account on the same device. */
function blankState(vault?: EncryptedVault | null): AppState {
  const base = seedState();
  const today = new Date().toISOString().slice(0, 10);
  const dataset = blankDataset(base.dataset, {
    year: Number(today.slice(0, 4)) || base.dataset.settings.targetYear,
    asOf: today,
    anchor: today,
    mainAccount: 'Current account',
    openingPence: 0,
    currency: base.dataset.settings.currency || '£',
  });
  dataset.accounts = [];
  dataset.settings.primaryAccount = '';
  dataset.meta = undefined;
  return { ...base, dataset, ...(vault ? { vault } : {}) };
}

function loadFromStorage(userId?: string): LoadedState {
  const key = storageKey(userId);
  const currentRaw = readRaw(key);
  const lastGoodRaw = readRaw(lastGoodKey(userId));
  const result = resolveStoredState(currentRaw, lastGoodRaw);
  if (result.status === 'recovered' && currentRaw && !decodeState(currentRaw)) {
    preserveDamaged(userId, currentRaw);
  }
  return result;
}

export function loadStateWithStatus(userId?: string): LoadedState {
  if (!userId || userId === LOCAL_USER_ID) {
    try {
      return loadFromStorage(userId);
    } catch {
      return {
        state: seedState(),
        status: 'blocked',
        message: 'Device storage could not be read. Editing and saving are disabled so no existing budget is overwritten.',
      };
    }
  }

  try {
    const loaded = loadFromStorage(userId);
    if (loaded.status !== 'new') return loaded;

    const owner = readRaw(OWNER_KEY);
    if (!owner) {
      writeRaw(OWNER_KEY, userId);
      const initial = seedState();
      writeRaw(scopedKey(userId), JSON.stringify(initial));
      return { state: initial, status: 'new' };
    }

    const initial = owner === userId ? seedState() : blankState();
    writeRaw(scopedKey(userId), JSON.stringify(initial));
    return { state: initial, status: 'new' };
  } catch {
    return {
      state: seedState(),
      status: 'blocked',
      message: 'Device storage could not be read. Editing and saving are disabled so no existing budget is overwritten.',
    };
  }
}

export function loadState(userId?: string): AppState {
  return loadStateWithStatus(userId).state;
}

export function readStoredStateRaw(userId?: string): string | null {
  try { return readRaw(storageKey(userId)); } catch { return null; }
}

export function hasLocalBudget(): boolean {
  try {
    return Boolean(readRaw(KEY));
  } catch {
    return false;
  }
}

export function hasAccountState(userId: string): boolean {
  try {
    return Boolean(readRaw(scopedKey(userId)));
  } catch {
    return false;
  }
}

/** Copy the device-only budget into an account only after explicit consent. */
export function claimLocalBudget(userId: string): AppState | null {
  try {
    const local = decodeState(readRaw(KEY));
    if (!local) return null;
    writeRaw(scopedKey(userId), JSON.stringify(local));
    writeRaw(OWNER_KEY, userId);
    removeRaw(KEY);
    try {
      removeRaw(lastGoodKey(LOCAL_USER_ID));
      removeRaw(damagedKey(LOCAL_USER_ID));
    } catch {
      /* the imported copy is already safe in the account slot */
    }
    return local;
  } catch {
    return null;
  }
}

/**
 * Remove the device-only budget once its account copy is confirmed present.
 * The account document, its last-good copy and sync metadata are untouched.
 */
export function removeLocalBudget(): boolean {
  try {
    removeRaw(KEY);
    try {
      removeRaw(lastGoodKey(LOCAL_USER_ID));
      removeRaw(damagedKey(LOCAL_USER_ID));
    } catch {
      /* the primary local document is already gone */
    }
    return true;
  } catch {
    return false;
  }
}

/** Create a fresh account workspace without touching any local-only budget. */
export function startEmptyCloudBudget(userId: string): boolean {
  try {
    const current = decodeState(readRaw(scopedKey(userId)));
    writeRaw(scopedKey(userId), JSON.stringify(blankState(current?.vault)));
    writeRaw(OWNER_KEY, userId);
    try {
      removeRaw(lastGoodKey(userId));
      removeRaw(damagedKey(userId));
    } catch {
      /* the new empty workspace is already in place */
    }
    return true;
  } catch {
    return false;
  }
}

export type SaveResult = { ok: boolean; message?: string; savedAt?: string };

export function saveState(state: AppState, userId?: string): SaveResult {
  try {
    const key = storageKey(userId);
    const savedAt = new Date().toISOString();
    const serialized = JSON.stringify({ ...state, savedAt });
    writeRaw(key, serialized);
    try {
      // Keep a fallback even after the very first successful save.
      writeRaw(lastGoodKey(userId), serialized);
    } catch {
      /* a failed fallback write must not turn a successful save into an error */
    }
    return { ok: true, savedAt };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Local storage is unavailable.',
    };
  }
}

export function clearState(userId?: string): AppState {
  let vault: EncryptedVault | null | undefined;
  try {
    vault = decodeState(readRaw(storageKey(userId)))?.vault;
  } catch {
    /* the budget can still be reset if the old document cannot be read */
  }
  for (const key of [storageKey(userId), lastGoodKey(userId), damagedKey(userId)]) {
    try {
      removeRaw(key);
    } catch {
      /* ignore unavailable storage */
    }
  }
  const next = seedState();
  if (vault) next.vault = vault;
  return next;
}

/** A genuinely empty budget for a new person, keeping only the guide text. */
export function blankDataset(current: Dataset, opts: {
  year: number; asOf: string; anchor: string; mainAccount: string; openingPence?: number; currency?: string;
}): Dataset {
  const asOf = opts.asOf;
  const day = Number(asOf.slice(8, 10));
  const year = Number(asOf.slice(0, 4));
  const month = Number(asOf.slice(5, 7));
  const previous = month === 1 ? `${year - 1}-12-01` : `${year}-${String(month - 1).padStart(2, '0')}-01`;
  const lockCutoff = day < 3 ? previous : `${year}-${String(month).padStart(2, '0')}-01`;
  const main = opts.mainAccount.trim() || 'Current account';

  return {
    ...current,
    settings: {
      ...current.settings,
      targetYear: opts.year,
      startMonth: 1,
      monthsInYear: 12,
      asOfDate: asOf,
      lockCutoff,
      anchorDate: opts.anchor || asOf,
      primaryAccount: main,
      currency: opts.currency || current.settings.currency || '£',
      billSheets: undefined,
    },
    accounts: [{ name: main, targetPence: 0, openingPence: opts.openingPence ?? 0, sortOrder: 1, active: true }],
    people: [],
    cards: [],
    bills: [],
    billChanges: [],
    incomeSchedules: { pip: [], uc: [] },
    transactions: [],
    providers: {},
    debts: [],
    savings: [],
    holidays: {},
    changelog: [],
    audit: [],
    monthLocks: {},
    reference: undefined,
  };
}

export const newId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
