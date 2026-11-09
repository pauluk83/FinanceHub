import { useEffect, useMemo, useRef, useState } from 'react';
import { buildEngine } from '../../core/engine';
import { availableYears } from '../../core/yearRollover';
import { syncBillTransactions } from '../../core/billTransactions';
import type { Dataset, MonthLock } from '../../core/engine';
import {
  LOCAL_USER_ID,
  claimLocalBudget,
  hasAccountState,
  hasLocalBudget,
  loadStateWithStatus,
  removeLocalBudget,
  saveState,
  startEmptyCloudBudget,
  type LoadedState,
} from './store';
import { useCloudSync } from './useCloudSync';
import type { LocalAccountControls, ViewProps } from './types';
import { MONTHS, MONTH_LONG, gbp, todayIso } from './format';
import { NAV_GROUP_TIPS, buildNav } from './nav';
import { providerDisplayName } from './providerSetup';
import { Badge } from './components';
import { APP_VERSION } from './version';
import { GITHUB_REPO_URL } from './installer';
import { Dashboard, Income, MonthEnd, Monthly } from './views/overview';
import { Accounts, Bills, Cards, People, Transactions } from './views/money';
import { Debts } from './views/debts';
import { Savings } from './views/savings';
import { ProviderView, Rent, Statements } from './views/providers';
import { ChangelogView, GuidesView, ImportView, SettingsView } from './views/tools';
import { AppChangelogPage, AppChangelogView } from './views/appChangelog';
import { Holidays } from './views/holidays';
import { OnboardingView } from './views/onboarding';
import { DataHealthView } from './views/health';
import { NotificationsView } from './views/notifications';
import { PeoplePortalPage } from './views/peoplePortal';
import { FeedbackDialog } from './views/feedback';
import { PORTAL_FEEDBACK_EVENT, readFeedbackForOwner, refreshPortalStatements, type PortalFeedback } from './portal';
import { authClient, authConfigured, endSession, type Session } from './auth';
import { LegalPage } from './views/legal';
import { legalRouteFromHash, type LegalDocId } from './legal';
import { AuthLoading, LocalImportPrompt, LoginPage, ModeChooser, RecoveryPage } from './views/login';
import { BlockedStatePage } from './views/recovery';
import { HOSTED_WEB } from './runtime';
import { DEMO_USER_ID, demoState } from './demo';
import type { EncryptedVault, UnlockedVault } from './vault';
import { readAppLock, writeAppLock } from './appLockStore';
import { shouldAutoLock, type AppLockConfig } from './appLock';
import { changedBudgetSections } from './budgetChangelog';
import { appendAudit, diffRecords } from '../../core/audit';
import { buildBudgetNotifications, unreadBudgetNotifications } from '../../core/notifications';
import { AppLockScreen } from './views/appLock';

const SUBTITLES: Record<string, string> = {
  setup: 'Onboarding and clean-start help — ongoing changes live in Settings',
  dashboard: 'Year-to-date position, balances and model checks',
  monthly: 'One month at a time — locked months are read-only',
  income: 'PIP and Universal Credit dates, amounts and target-year totals',
  monthEnd: 'Confirm the month, reconcile balances and lock the snapshot',
  transactions: 'Every movement, with transfer and refund treatment',
  accounts: 'Bank accounts, targets and ledger balances',
  cards: 'Credit limits, balances and utilisation',
  people: 'Lent, repaid and owed to you',
  bills: 'Scheduled bills, overrides and one-off changes',
  debts: 'Loans, credit and agreements: balances, payments and due dates',
  savings: 'Savings and ISA accounts: balances, targets and regular contributions',
  holidays: 'Trips, dates, payments and booking details',
  rent: 'Weekly charges, monthly payment, running balance',
  water: 'Thames Water statement and payment plan',
  councilTax: 'Council Tax charges and direct debits',
  parkXmas: 'Park Xmas savings plan',
  pureCremation: 'Pure Cremation plan',
  ovo: 'Ovo Energy statements and payments',
  o2: 'O2 contract history',
  virgin: 'Virgin Media contract history',
  statements: 'Filtered account statement with running balance',
  import: 'Bank CSV → review → append (never auto-post)',
  health: 'Read-only integrity checks across accounts, imports, providers, bills, locks, sync and backups',
  alerts: 'In-app bill and balance alerts, with read state kept in the budget',
  settings: 'The single source of truth for every screen',
  changelog: 'Your budget history — bills, balances, people and month-end figures',
  appChangelog: 'What changed in each build, with the build id and installer download',
  guides: 'Month-End and New-Year workflows',
};

type ChangeSummary = {
  signature: string;
  description: string;
  title?: string;
  details?: string[];
};

function monthLockLabel(key: string) {
  const [year, month] = key.split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return key;
  return `${MONTH_LONG[month - 1]} ${year}`;
}

function monthLockDetails(lock: MonthLock): string[] {
  const accounts = lock.accounts ?? [];
  const cards = lock.cards ?? [];
  const people = lock.people ?? [];
  const bills = lock.bills;
  const details = [
    `Totals — Income ${gbp(lock.incomePence)} · Expenses ${gbp(lock.expensesPence)} · Net ${gbp(lock.netPence, { sign: true })} · Owed ${gbp(lock.owedPence)}`,
    `Accounts — ${accounts.length ? accounts.map((account) => `${account.name} ${gbp(account.balancePence)}`).join(' · ') : 'none'}`,
    `Card balances — ${cards.length ? cards.map((card) => `${card.name} ${gbp(card.balancePence)}`).join(' · ') : 'none'}`,
    `Owed by people — ${people.length ? people.map((person) => `${person.shortName} ${gbp(person.balancePence)}`).join(' · ') : 'none'}`,
  ];
  if (!bills) details.push('Bills — not recorded in this snapshot');
  else if (bills.length === 0) details.push('Bills — none scheduled');
  else {
    const total = bills.reduce((sum, bill) => sum + bill.amountPence, 0);
    details.push(`Bills — ${gbp(total)} total: ${bills.map((bill) => `${bill.name} ${gbp(bill.amountPence)}`).join(' · ')}`);
  }
  if (!lock.providers) details.push('Provider balances — not recorded in this snapshot');
  else if (lock.providers.length === 0) details.push('Provider balances — none loaded');
  else {
    details.push(`Provider balances — ${lock.providers.map((provider) => `${provider.name} ${gbp(provider.balancePence)} (${provider.statementRef})`).join(' · ')}`);
  }
  if (lock.note?.trim()) details.push(`Note — ${lock.note.trim()}`);
  return details;
}

function detailedMonthLockChange(before: Dataset, after: Dataset): ChangeSummary | null {
  const beforeLocks = before.monthLocks ?? {};
  const afterLocks = after.monthLocks ?? {};
  const changed = Object.keys(afterLocks).filter((key) => JSON.stringify(beforeLocks[key]) !== JSON.stringify(afterLocks[key]));
  const removed = Object.keys(beforeLocks).filter((key) => !afterLocks[key]);
  if (changed.length + removed.length !== 1) return null;
  const key = changed[0] ?? removed[0];
  if (!key) return null;
  const label = monthLockLabel(key);
  const lock = (changed.length ? afterLocks[key] : beforeLocks[key]) as MonthLock | undefined;
  if (changed.length) {
    return {
      signature: `Month locks:${key}:${lock?.lockedAt ?? 'locked'}`,
      title: `Month end closed — ${label}`,
      description: 'Balances, accounts and bills were recorded with the lock.',
      details: lock ? monthLockDetails(lock) : undefined,
    };
  }
  return {
    signature: `Month locks:${key}:unlock`,
    title: `Month end reopened — ${label}`,
    description: 'The saved month-end snapshot was removed; the month recalculates live.',
    details: lock ? monthLockDetails(lock) : undefined,
  };
}

function changeSummary(before: Dataset, after: Dataset): ChangeSummary | null {
  const labels = changedBudgetSections(before, after);
  if (labels.length === 0) return null;
  if (labels.length === 1 && labels[0] === 'Month locks') {
    const detailed = detailedMonthLockChange(before, after);
    if (detailed) return detailed;
  }
  const affectsBalances = labels.some((label) => ['Settings', 'Accounts', 'People', 'Cards', 'Bills', 'Bill changes', 'Transactions', 'Income schedules', 'Provider ledgers'].includes(label));
  return {
    signature: labels.join('|'),
    description: `Updated ${labels.join(', ')}${affectsBalances ? '; balances recalculated' : ''}.`,
  };
}

function appendChangeLog(dataset: Dataset, summary: ChangeSummary) {
  if (!dataset.changelog) dataset.changelog = [];
  const at = Date.now();
  const previous = dataset.changelog.find((entry: any) => entry.auto && entry.signature === summary.signature && Number.isFinite(Date.parse(entry.at)) && at - Date.parse(entry.at) < 15000);
  if (previous) {
    previous.date = todayIso();
    previous.at = new Date(at).toISOString();
    previous.sheetCell = summary.title ?? 'App update';
    previous.description = summary.description;
    if (summary.details) previous.details = summary.details;
    else delete previous.details;
    return;
  }
  dataset.changelog.unshift({
    date: todayIso(),
    sheetCell: summary.title ?? 'App update',
    description: summary.description,
    ...(summary.details ? { details: summary.details } : {}),
    signature: summary.signature,
    auto: true,
    at: new Date(at).toISOString(),
  });
}

function isTyping(el: EventTarget | null) {
  return el instanceof HTMLElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName);
}

type AppUser = { id: string; email: string | null; local: boolean };

function syncStatusLabel(sync: { enabled: boolean; phase: string; pending: number; conflicts: number; message?: string }) {
  if (!sync.enabled) return { label: 'Saved locally', tone: '', title: 'Saved in this local workspace' };
  if (sync.phase === 'conflict') {
    return {
      label: `Conflict saved${sync.conflicts > 1 ? ` (${sync.conflicts})` : ''}`,
      tone: 'warn',
      title: sync.message ?? 'Both versions are retained in the conflict queue',
    };
  }
  if (sync.phase === 'error') {
    return { label: 'Sync paused', tone: 'danger', title: sync.message ?? 'Changes remain queued locally' };
  }
  if (sync.phase === 'offline') {
    return { label: 'Offline · queued', tone: 'warn', title: sync.message ?? 'Changes will sync when the network returns' };
  }
  if (sync.phase === 'syncing') return { label: 'Syncing…', tone: 'live', title: 'Syncing with the cloud' };
  if (sync.pending > 0) return { label: `Saved locally · ${sync.pending} pending`, tone: 'warn', title: 'Waiting to push changes to the cloud' };
  if (sync.phase === 'synced') return { label: 'Synced', tone: 'live', title: 'Cloud workspace is up to date' };
  return { label: 'Ready to sync', tone: 'warn', title: 'Cloud sync is ready' };
}

const LOCAL_USER: AppUser = { id: LOCAL_USER_ID, email: null, local: true };
const STORAGE_MODE_KEY = 'financehub.storage-mode.v1';
const LEGACY_LOCAL_KEY = 'financehub.local-mode.v1';

type StorageMode = 'cloud' | 'local';

function readStorageMode(): StorageMode | null {
  try {
    const saved = localStorage.getItem(STORAGE_MODE_KEY);
    if (saved === 'cloud' || saved === 'local') return saved;
    if (localStorage.getItem(LEGACY_LOCAL_KEY) === '1') return 'local';
  } catch {
    /* localStorage may be unavailable; fall back to the hosted default */
  }
  return HOSTED_WEB ? 'cloud' : null;
}

function FinanceHub({ user, onSignOut, localAccount, demo = false, onChooseWorkspace, onOpenDemo }: { user: AppUser; onSignOut: () => void; localAccount?: LocalAccountControls; demo?: boolean; onChooseWorkspace: (mode: 'account' | 'local') => void; onOpenDemo?: () => void }) {
  const [loaded] = useState<LoadedState>(() => (demo ? { state: demoState(), status: 'ok' } : loadStateWithStatus(user.id)));
  const [state, setState] = useState(() => {
    const dataset = structuredClone(loaded.state.dataset);
    return syncBillTransactions(dataset) ? { ...loaded.state, dataset } : loaded.state;
  });
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(loaded.state.savedAt ?? null);
  const [recoveryNotice, setRecoveryNotice] = useState(
    loaded.status === 'recovered'
      ? loaded.message ?? 'The saved budget could not be read. FinanceHub recovered the last known-good copy.'
      : null,
  );
  const [view, setView] = useState(() => (state.dataset.accounts.length === 0 && state.dataset.transactions.length === 0 ? 'setup' : 'dashboard'));
  const [navTip, setNavTip] = useState<{ label: string; text: string; top: number; left: number } | null>(null);
  const [month, setMonth] = useState(() => Number(state.dataset.settings.asOfDate.slice(5, 7)) || 11);
  // The year being viewed is separate from the configured target year, so
  // history and imported later years can be inspected without rolling over.
  const [activeYear, setActiveYear] = useState(() => state.dataset.settings.targetYear);
  const [toast, setToast] = useState<string | null>(null);
  const [feedbackTab, setFeedbackTab] = useState<'send' | 'inbox' | null>(null);
  const [feedbackItems, setFeedbackItems] = useState<PortalFeedback[]>(() => readFeedbackForOwner(user.id));
  const [palette, setPalette] = useState(false);
  const [query, setQuery] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [vaultSession, setVaultSession] = useState<UnlockedVault | null>(null);
  // The PIN lock is device-only: never offered in the demo or an account workspace.
  const deviceOnly = !demo && user.local;
  const [appLock, setAppLockState] = useState<AppLockConfig | null>(() => (deviceOnly ? readAppLock() : null));
  const [appLocked, setAppLocked] = useState(() => deviceOnly && Boolean(readAppLock()));
  const blocked = loaded.status === 'blocked';
  const stateRef = useRef(state);
  stateRef.current = state;
  const sync = useCloudSync({
    enabled: !user.local && !blocked,
    userId: user.id,
    state,
    onRestoreLocal: (next) => setState(next),
    onRemoteState: (next) => {
      setState(() => {
        const dataset = structuredClone(next.dataset);
        return syncBillTransactions(dataset) ? { ...next, dataset } : next;
      });
      // A vault changed on another device must be unlocked again here.
      setVaultSession((current) =>
        current && next.vault?.ciphertext !== stateRef.current.vault?.ciphertext ? null : current,
      );
      // A fresh browser opens on the blank hosted seed. Once the first cloud pull
      // arrives, move an untouched setup screen to the real budget.
      setView((current) =>
        current === 'setup' && (next.dataset.accounts.length > 0 || next.dataset.transactions.length > 0)
          ? 'dashboard'
          : current,
      );
    },
  });
  const syncRef = useRef(sync);
  syncRef.current = sync;

  const engine = useMemo(() => buildEngine(state.dataset), [state.dataset]);
  const yearOptions = useMemo(() => availableYears(state.dataset), [state.dataset]);
  useEffect(() => {
    if (!yearOptions.includes(activeYear)) setActiveYear(state.dataset.settings.targetYear);
  }, [yearOptions, activeYear, state.dataset.settings.targetYear]);

  useEffect(() => {
    document.documentElement.dataset.theme = state.theme;
  }, [state.theme]);

  useEffect(() => {
    const refresh = () => setFeedbackItems(readFeedbackForOwner(user.id));
    refresh();
    window.addEventListener(PORTAL_FEEDBACK_EVENT, refresh);
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener(PORTAL_FEEDBACK_EVENT, refresh);
      window.removeEventListener('storage', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [user.id]);

  // A menu item can be hidden or a provider removed while its view is open.
  useEffect(() => {
    if (view === 'setup' || blocked) return;
    const nav = buildNav(state.dataset, {
      hideSetup: state.dataset.accounts.length > 0 || state.dataset.transactions.length > 0,
    });
    if (!nav.some((group) => group.items.some((item) => item.id === view))) {
      setView(nav[0]?.items[0]?.id ?? 'dashboard');
    }
  }, [state.dataset, view, blocked]);

  useEffect(() => {
    if (blocked || demo) return;
    const t = window.setTimeout(() => {
      const result = saveState(state, user.id);
      if (result.ok) {
        setSaveError(null);
        setLastSavedAt(result.savedAt ?? new Date().toISOString());
        refreshPortalStatements(user.id, state.dataset);
      } else {
        setSaveError(result.message ?? 'Local storage is unavailable.');
      }
    }, 200);
    return () => window.clearTimeout(t);
  }, [state, user.id, blocked, demo]);

  useEffect(() => {
    if (blocked || demo) return;
    const flush = () => {
      const result = saveState(stateRef.current, user.id);
      if (result.ok) syncRef.current.flush(stateRef.current);
    };
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
    };
  }, [blocked, user.id, demo]);

  useEffect(() => {
    const bridge = window.financeHubDesktop;
    if (!bridge?.onBeforeClose) return;
    return bridge.onBeforeClose(() => {
      try {
        if (!blocked && !demo) {
          const result = saveState(stateRef.current, user.id);
          if (result.ok) syncRef.current.flush(stateRef.current);
        }
      } finally {
        bridge.closeReady();
      }
    });
  }, [blocked, user.id, demo]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((p) => !p);
        return;
      }
      if (e.key === 'Escape') setPalette(false);
      if (isTyping(e.target)) return;
      if (e.key === '[') setMonth((m) => (m === 1 ? 12 : m - 1));
      if (e.key === ']') setMonth((m) => (m === 12 ? 1 : m + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Real activity restarts the idle window; a hidden or background window still
  // locks, because the check compares elapsed wall-clock time.
  useEffect(() => {
    if (!appLock || appLocked || demo) return;
    let lastActivity = Date.now();
    const bump = () => { lastActivity = Date.now(); };
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'mousemove'] as const;
    for (const name of events) window.addEventListener(name, bump, { passive: true });
    const timer = window.setInterval(() => {
      if (!shouldAutoLock(appLock, lastActivity, Date.now())) return;
      setAppLocked(true);
      setVaultSession(null);
      setPalette(false);
    }, 10_000);
    return () => {
      for (const name of events) window.removeEventListener(name, bump);
      window.clearInterval(timer);
    };
  }, [appLock, appLocked, demo]);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((current) => (current === message ? null : current)), 2800);
  };

  const openFeedback = (tab: 'send' | 'inbox' = 'inbox') => setFeedbackTab(tab);

  // The lock is device-local, so a failed write must not pretend the PIN is on.
  const setAppLock = (next: AppLockConfig | null) => {
    if (!writeAppLock(next)) {
      notify('The app lock could not be saved on this device');
      return;
    }
    setAppLockState(next);
    if (!next) setAppLocked(false);
  };

  const lockNow = () => {
    if (!appLock) return;
    setAppLocked(true);
    // A locked app must not leave provider credentials unlocked in memory.
    setVaultSession(null);
    setPalette(false);
    setNavTip(null);
    setFeedbackTab(null);
  };

  const update = (mutator: (dataset: typeof state.dataset) => void) => {
    if (blocked) return;
    setState((prev) => {
      const dataset = structuredClone(prev.dataset);
      mutator(dataset);
      syncBillTransactions(dataset);
      // Record the before/after of each changed record at the single mutation
      // boundary. Generated bill rows are excluded by diffRecords.
      const audit = diffRecords(prev.dataset, dataset);
      if (audit.length > 0) appendAudit(dataset, audit);
      const summary = changeSummary(prev.dataset, dataset);
      if (summary) appendChangeLog(dataset, summary);
      return { ...prev, dataset };
    });
  };

  const setTheme = (theme: 'dark' | 'light') => {
    if (blocked) return;
    setState((prev) => ({ ...prev, theme }));
  };

  const setVault = (vault: EncryptedVault | null) => {
    if (blocked) return;
    setState((prev) => ({ ...prev, vault }));
  };

  const manualSync = () => {
    if (blocked || user.local || !sync.enabled || sync.phase === 'syncing') return;
    const result = saveState(stateRef.current, user.id);
    if (!result.ok) {
      setSaveError(result.message ?? 'Local storage is unavailable.');
      return;
    }
    setSaveError(null);
    setLastSavedAt(result.savedAt ?? new Date().toISOString());
    sync.flush(stateRef.current);
    void sync.syncNow();
  };

  if (appLocked && appLock) {
    return (
      <AppLockScreen
        config={appLock}
        onUnlocked={() => setAppLocked(false)}
        onRemoved={() => setAppLock(null)}
      />
    );
  }

  if (blocked) {
    return (
      <BlockedStatePage
        userId={user.id}
        isLocal={user.local}
        message={loaded.message ?? null}
        onSignOut={onSignOut}
      />
    );
  }

  const props: ViewProps = {
    ds: state.dataset,
    engine,
    month,
    setMonth,
    year: activeYear,
    setYear: setActiveYear,
    availableYears: yearOptions,
    update,
    theme: state.theme,
    setTheme,
    notify,
    go: setView,
    userId: user.id,
    userEmail: localAccount?.email ?? user.email,
    isLocal: user.local,
    lastSavedAt,
    lastSyncedAt: sync.lastSyncedAt ?? null,
    signOut: onSignOut,
    workspace: demo ? 'demo' : user.local ? 'local' : 'account',
    chooseWorkspace: onChooseWorkspace,
    localAccount,
    vault: state.vault ?? null,
    appLock,
    setAppLock,
    lockNow,
    vaultSession,
    setVault,
    setVaultSession,
    feedbackItems,
    openFeedback,
    syncConflicts: sync.conflictList,
    resolveSyncConflict: sync.resolveConflict,
    exportSyncConflict: sync.exportConflict,
    syncHealth: sync.enabled ? { phase: sync.phase, pending: sync.pending, message: sync.message, lastSyncedAt: sync.lastSyncedAt } : undefined,
    onOpenDemo,
  };

  const setupHidden = state.dataset.accounts.length > 0 || state.dataset.transactions.length > 0;
  const visibleNav = buildNav(state.dataset, { hideSetup: setupHidden });
  const allItems = visibleNav.flatMap((group) => group.items);
  const current = allItems.find((item) => item.id === view) ?? allItems[0] ?? { id: 'dashboard', label: 'Dashboard', icon: '' };
  const locked = engine.monthlySummary(activeYear, month).locked;
  const filtered = allItems.filter((item) => item.label.toLowerCase().includes(query.trim().toLowerCase()));
  const syncBadge = saveError
    ? { label: 'Not saved', tone: 'danger', title: `Changes are not being saved. ${saveError}` }
    : syncStatusLabel(sync);
  const feedbackUnread = feedbackItems.filter((item) => !item.readAt).length;
  const budgetNotifications = buildBudgetNotifications(state.dataset, engine);
  const notificationUnread = unreadBudgetNotifications(state.dataset, budgetNotifications).length;

  const showNavTip = (event: { currentTarget: HTMLElement }, label: string, text: string) => {
    if (!text) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setNavTip({
      label,
      text,
      top: Math.min(Math.max(rect.top - 4, 8), window.innerHeight - 100),
      left: Math.min(rect.right + 10, window.innerWidth - 290),
    });
  };
  const hideNavTip = () => setNavTip(null);

  const renderView = () => {
    switch (view) {
      case 'dashboard': return <Dashboard {...props} />;
      case 'setup': return <OnboardingView {...props} />;
      case 'monthly': return <Monthly {...props} />;
      case 'income': return <Income {...props} />;
      case 'monthEnd': return <MonthEnd {...props} />;
      case 'transactions': return <Transactions {...props} />;
      case 'accounts': return <Accounts {...props} />;
      case 'cards': return <Cards {...props} />;
      case 'people': return <People {...props} />;
      case 'bills': return <Bills {...props} />;
      case 'debts': return <Debts {...props} />;
      case 'savings': return <Savings {...props} />;
      case 'holidays': return <Holidays {...props} />;
      case 'rent': return <Rent {...props} />;
      case 'statements': return <Statements {...props} />;
      case 'import': return <ImportView {...props} />;
      case 'health': return <DataHealthView {...props} />;
      case 'alerts': return <NotificationsView {...props} />;
      case 'settings': return <SettingsView {...props} />;
      case 'appChangelog': return <AppChangelogView {...props} />;
      case 'changelog': return <ChangelogView {...props} />;
      case 'guides': return <GuidesView {...props} />;
      case 'water': return <ProviderView {...props} provider="water" title={providerDisplayName(state.dataset, 'water')} subtitle="Thames Water — monthly plan" />;
      case 'councilTax': return <ProviderView {...props} provider="councilTax" title={providerDisplayName(state.dataset, 'councilTax')} subtitle="Charges, payments and running balance" />;
      case 'parkXmas': return <ProviderView {...props} provider="parkXmas" title={providerDisplayName(state.dataset, 'parkXmas')} subtitle="Savings plan and withdrawals" />;
      case 'pureCremation': return <ProviderView {...props} provider="pureCremation" title={providerDisplayName(state.dataset, 'pureCremation')} subtitle="Monthly plan" />;
      case 'ovo': return <ProviderView {...props} provider="ovo" title={providerDisplayName(state.dataset, 'ovo')} subtitle="Statement periods and payments" />;
      case 'o2': return <ProviderView {...props} provider="o2" title={providerDisplayName(state.dataset, 'o2')} subtitle="Contract bills year by year" />;
      case 'virgin': return <ProviderView {...props} provider="virgin" title={providerDisplayName(state.dataset, 'virgin')} subtitle="Contract bills year by year" />;
      default: return <Dashboard {...props} />;
    }
  };

  return (
    <div className="app">
      {navTip && (
        <div className="nav-tooltip" role="tooltip" style={{ top: navTip.top, left: navTip.left }}>
          <strong>{navTip.label}</strong>
          <span>{navTip.text}</span>
        </div>
      )}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">FH</div>
          <div className="brand-text">
            <div className="brand-title">FinanceHub™</div>
            <div className="brand-sub">Income &amp; Expenses {activeYear}</div>
          </div>
        </div>
        <nav className="nav" aria-label="Sections">
          {visibleNav.map((group) => (
            <div className="nav-group" key={group.group}>
              <div
                className="nav-group-title"
                onMouseEnter={(event) => showNavTip(event, group.group, NAV_GROUP_TIPS[group.group])}
                onMouseLeave={hideNavTip}
              >
                {group.group}
              </div>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  className={`nav-item ${view === item.id ? 'active' : ''}`}
                  onClick={() => { setView(item.id); hideNavTip(); }}
                  onMouseEnter={(event) => showNavTip(event, item.label, item.tip)}
                  onMouseLeave={hideNavTip}
                  onFocus={(event) => showNavTip(event, item.label, item.tip)}
                  onBlur={hideNavTip}
                  aria-current={view === item.id ? 'page' : undefined}
                >
                  <span className="nav-icon" aria-hidden>{item.icon}</span>
                  <span className="nav-label">{item.label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className={`sidebar-account ${user.local ? 'is-local' : ''} ${localAccount ? 'has-account' : ''}`}>
          <div className="sidebar-identity">
            <span>{demo ? 'Sample workspace' : user.local ? (localAccount ? 'Local workspace · account' : 'Local workspace') : 'Signed in as'}</span>
            <strong title={demo ? 'Demo data only' : localAccount?.email ?? user.email ?? undefined}>
              {demo ? 'Demo data only' : user.local ? (localAccount?.email ?? 'This device') : user.email ?? 'Account'}
            </strong>
          </div>
          {localAccount ? (
            <div className="sidebar-account-actions">
              <button
                className="btn ghost sm"
                onClick={localAccount.onSync}
                disabled={!localAccount.canSync}
                title={localAccount.canSync ? 'Upload this local budget to the signed-in account' : 'The account already has a saved budget; use Exit'}
              >Sync</button>
              <button className="btn ghost sm" onClick={localAccount.onExit} title="Open the signed-in cloud workspace without uploading local data">Exit</button>
              <button className="btn ghost sm" onClick={localAccount.onLogout}>Log out</button>
            </div>
          ) : (
            <div className="sidebar-account-actions">
              {!user.local && (
                <button
                  className="btn ghost sm"
                  onClick={manualSync}
                  disabled={!sync.enabled || sync.phase === 'syncing'}
                  title={sync.enabled ? 'Sync this cloud budget now' : 'Cloud sync is not available'}
                >
                  {sync.phase === 'syncing' ? 'Syncing…' : 'Sync'}
                </button>
              )}
              <button className="btn ghost sm" onClick={onSignOut}>{demo ? 'Exit demo' : user.local ? 'Use an account' : 'Sign out'}</button>
            </div>
          )}
        </div>
        <div className="sidebar-foot">
          <span className="sync-foot" title={syncBadge.title}>
            <span className={`save-dot ${syncBadge.tone}`} />{syncBadge.label}
          </span>
          <span>v{APP_VERSION}</span>
          <a href={GITHUB_REPO_URL} target="_blank" rel="noreferrer" title="FinanceHub source on GitHub" style={{ color: 'inherit' }}>GitHub ↗</a>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar-left">
            <h1 className="view-title">{current.label}</h1>
            <p className="view-sub">{SUBTITLES[view] ?? 'FinanceHub'}</p>
          </div>
          <div className="topbar-right">
            <select
              className="month-select"
              aria-label="Viewing year"
              value={activeYear}
              onChange={(e) => setActiveYear(Number(e.target.value))}
              title={`Viewing ${activeYear}; the target year is ${state.dataset.settings.targetYear}`}
            >
              {yearOptions.map((option) => (
                <option value={option} key={option}>{option}</option>
              ))}
            </select>
            <select
              className="month-select"
              aria-label="Viewing month"
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
            >
              {MONTHS.map((m, i) => (
                <option value={i + 1} key={m}>{m} {activeYear}</option>
              ))}
            </select>
            <Badge tone={locked ? 'amber' : 'green'}>{locked ? '🔒 Locked' : '● Open'}</Badge>
            <button
              className="btn ghost"
              onClick={() => { setPalette(true); setQuery(''); }}
              title="Command palette (Ctrl+K)"
            >
              <span className="kbd">Ctrl</span><span className="kbd">K</span>
            </button>
            <button
              className="btn"
              onClick={() => setTheme(state.theme === 'dark' ? 'light' : 'dark')}
              aria-label={`Switch to ${state.theme === 'dark' ? 'light' : 'dark'} theme`}
              title={`Switch to ${state.theme === 'dark' ? 'light' : 'dark'} theme`}
            >
              {state.theme === 'dark' ? '☀ Light' : '🌙 Dark'}
            </button>
            {deviceOnly && appLock && (
              <button
                className="btn ghost"
                onClick={lockNow}
                title={`Lock FinanceHub now (also locks after ${appLock.idleMinutes} minutes idle)`}
                aria-label="Lock FinanceHub"
              >
                🔒 Lock
              </button>
            )}
            <button
              className="btn ghost"
              type="button"
              onClick={() => setView('alerts')}
              title={`${notificationUnread} unread bill or balance alert${notificationUnread === 1 ? '' : 's'}`}
              aria-label={`Notifications${notificationUnread ? `, ${notificationUnread} unread` : ''}`}
            >
              <span aria-hidden="true">🔔</span>
              {notificationUnread > 0 && <span className="feedback-count">{notificationUnread > 9 ? '9+' : notificationUnread}</span>}
            </button>
            {!demo && (
              <button
                className="btn ghost feedback-trigger"
                type="button"
                onClick={() => setFeedbackTab(feedbackUnread > 0 ? 'inbox' : 'send')}
                title="Feedback & suggestions"
              >
                <span aria-hidden="true">💬</span>
                <span className="feedback-trigger-label">Feedback</span>
                {feedbackUnread > 0 && (
                  <span className="feedback-count" aria-label={`${feedbackUnread} unread feedback messages`}>
                    {feedbackUnread > 9 ? '9+' : feedbackUnread}
                  </span>
                )}
              </button>
            )}
          </div>
        </header>

        <main className="content">
          {demo && (
            <div className="notice info demo-banner" role="status">
              <span><strong>Demo workspace.</strong> Sample data only — nothing is saved to your account.</span>
              <button className="btn ghost sm" onClick={() => setView('setup')}>Open guided setup</button>
            </div>
          )}
          {recoveryNotice && (
            <div className="notice warn" role="status" style={{ margin: '12px 18px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ flex: 1 }}>
                <strong>Recovered the last known-good copy.</strong>{' '}
                {recoveryNotice}
              </span>
              <button className="btn ghost sm" onClick={() => setRecoveryNotice(null)}>Dismiss</button>
            </div>
          )}
          {saveError && (
            <div className="notice danger" role="alert" style={{ margin: '12px 18px 0' }}>
              <strong>Changes are not being saved.</strong>{' '}
              {saveError} Keep this window open and resolve device storage before closing.
            </div>
          )}
          <div className="view" key={view}>{renderView()}</div>
        </main>
      </div>

      {palette && (
        <div className="palette-backdrop" onMouseDown={() => setPalette(false)}>
          <div className="palette" onMouseDown={(e) => e.stopPropagation()}>
            <input
              className="palette-input"
              autoFocus
              placeholder="Jump to a section…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && filtered[0]) {
                  setView(filtered[0].id);
                  setPalette(false);
                  setQuery('');
                }
              }}
            />
            <div className="palette-list">
              {filtered.map((item, index) => (
                <button
                  key={item.id}
                  className={`palette-item ${index === 0 ? 'active' : ''}`}
                  onClick={() => { setView(item.id); setPalette(false); setQuery(''); }}
                >
                  <span>{item.label}</span>
                  <span className="group">{MONTH_LONG[month - 1]}</span>
                </button>
              ))}
              {filtered.length === 0 && <div className="empty">No section matches “{query}”.</div>}
            </div>
          </div>
        </div>
      )}

      {feedbackTab && !demo && (
        <FeedbackDialog
          ownerId={user.id}
          author={localAccount?.email ?? user.email ?? (user.local ? 'Local workspace' : 'FinanceHub user')}
          initialTab={feedbackTab}
          onClose={() => setFeedbackTab(null)}
          notify={notify}
        />
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(authConfigured);
  const [recovery, setRecovery] = useState(false);
  const [storageMode, setStorageMode] = useState<StorageMode | null>(readStorageMode);
  const [demo, setDemo] = useState(false);
  const [localImportResolved, setLocalImportResolved] = useState(false);
  const [localImportError, setLocalImportError] = useState<string | null>(null);
  const [peopleRoute, setPeopleRoute] = useState(() => window.location.hash.replace(/^#/, '') === 'people');
  const [legalRoute, setLegalRoute] = useState<LegalDocId | null>(legalRouteFromHash);
  const [appChangelogRoute, setAppChangelogRoute] = useState(() => window.location.hash.replace(/^#/, '') === 'app-changelog');

  useEffect(() => {
    const onHash = () => {
      setPeopleRoute(window.location.hash.replace(/^#/, '') === 'people');
      setAppChangelogRoute(window.location.hash.replace(/^#/, '') === 'app-changelog');
      setLegalRoute(legalRouteFromHash());
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const openPeoplePortal = () => {
    if (window.location.hash !== '#people') window.location.hash = '#people';
    setPeopleRoute(true);
  };

  const closePeoplePortal = () => {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    setPeopleRoute(false);
  };

  const closeLegal = () => {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    setLegalRoute(null);
  };

  useEffect(() => {
    try {
      if (storageMode) localStorage.setItem(STORAGE_MODE_KEY, storageMode);
      else localStorage.removeItem(STORAGE_MODE_KEY);
      localStorage.removeItem(LEGACY_LOCAL_KEY);
    } catch {
      /* storage unavailable: the current session still works */
    }
  }, [storageMode]);

  useEffect(() => {
    if (!authClient) {
      setAuthLoading(false);
      return;
    }

    let mounted = true;
    const { data: { subscription } } = authClient.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;
      if (event === 'SIGNED_OUT') {
        setSession(null);
        setRecovery(false);
      } else if (event === 'PASSWORD_RECOVERY') {
        setSession(nextSession);
        setRecovery(true);
      } else if (nextSession) {
        setSession(nextSession);
      }
      setAuthLoading(false);
    });

    authClient.auth.getSession()
      .then(({ data }) => {
        if (!mounted) return;
        setSession((current) => current ?? data.session);
        setAuthLoading(false);
      })
      .catch(() => {
        if (mounted) setAuthLoading(false);
      });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    setLocalImportResolved(false);
    setLocalImportError(null);
  }, [session?.user.id]);

  const handleSignOut = async () => {
    try {
      await endSession();
    } catch {
      /* endSession clears the local session even when the network sign-out fails */
    }
    setSession(null);
    setRecovery(false);
    setStorageMode('cloud');
  };

  const [localCopyRemoved, setLocalCopyRemoved] = useState(false);

  const removeLocalCopy = () => {
    if (!session) return;
    if (!hasAccountState(session.user.id)) {
      window.alert('The account has no saved cloud budget yet. Sync it or start empty first; the local copy has not been removed.');
      return;
    }
    if (!window.confirm('Remove this device’s local-only budget?\n\nThe signed-in cloud budget is not affected. Export a backup first if you might need the local copy.')) return;
    if (!removeLocalBudget()) {
      window.alert('The local copy could not be removed. Nothing was deleted.');
      return;
    }
    setLocalCopyRemoved(true);
    setLocalImportError(null);
  };

  const handleLocalExit = () => setStorageMode('cloud');

  const chooseWorkspace = async (mode: 'account' | 'local') => {
    setDemo(false);
    if (mode === 'local') {
      if (session) {
        try {
          await endSession();
        } catch {
          /* the local workspace does not depend on the cloud session */
        }
      }
      setSession(null);
      setRecovery(false);
      setStorageMode('local');
      return;
    }
    setStorageMode('cloud');
  };

  const syncLocalBudget = () => {
    if (!session) return;
    if (hasAccountState(session.user.id)) {
      setLocalImportError('The account already has a saved cloud budget. Use Exit to open it instead of overwriting it.');
      setStorageMode('cloud');
      return;
    }
    if (!claimLocalBudget(session.user.id)) {
      setLocalImportError('The local budget could not be read. It has not been uploaded or changed.');
      setStorageMode('cloud');
      return;
    }
    setLocalImportError(null);
    setLocalImportResolved(true);
    setStorageMode('cloud');
  };

  const handleLocalSignOut = async () => {
    try {
      await endSession();
    } catch {
      /* endSession clears the local session even when the network sign-out fails */
    }
    setSession(null);
    setRecovery(false);
    setStorageMode('local');
  };

  const importLocalBudget = () => {
    if (!session) return;
    if (!claimLocalBudget(session.user.id)) {
      setLocalImportError('The local budget could not be read. It has not been uploaded or changed.');
      return;
    }
    setLocalImportError(null);
    setLocalImportResolved(true);
  };

  const startEmptyCloud = () => {
    if (!session) return;
    if (!startEmptyCloudBudget(session.user.id)) {
      setLocalImportError('The cloud workspace could not be created. The local budget has not been changed.');
      return;
    }
    setLocalImportError(null);
    setLocalImportResolved(true);
  };

  const keepLocalOnly = () => {
    setStorageMode('local');
    setLocalImportResolved(false);
    setLocalImportError(null);
  };

  const handleRecoveryCancel = async () => {
    try {
      await endSession();
    } catch {
      /* local session is cleared */
    }
    setSession(null);
    setRecovery(false);
  };

  const localAccount: LocalAccountControls | undefined = session
    ? {
        email: session.user.email ?? null,
        canSync: !hasAccountState(session.user.id),
        onSync: syncLocalBudget,
        onExit: () => setStorageMode('cloud'),
        onLogout: () => void handleLocalSignOut(),
        canRemoveLocal: !localCopyRemoved && hasLocalBudget() && hasAccountState(session.user.id),
        onRemoveLocal: removeLocalCopy,
      }
    : undefined;

  const closeAppChangelog = () => {
    if (window.location.hash === '#app-changelog') window.location.hash = '';
    setAppChangelogRoute(false);
  };

  if (appChangelogRoute) {
    return <AppChangelogPage onClose={closeAppChangelog} />;
  }
  if (legalRoute) {
    return <LegalPage initial={legalRoute} onClose={closeLegal} />;
  }
  if (peopleRoute) {
    return <PeoplePortalPage onExit={closePeoplePortal} />;
  }
  if (demo) {
    return (
      <FinanceHub
        demo
        user={{ id: DEMO_USER_ID, email: 'Demo workspace', local: true }}
        onSignOut={() => setDemo(false)}
        onChooseWorkspace={chooseWorkspace}
      />
    );
  }
  if (storageMode === 'local') {
    return (
      <FinanceHub
        user={LOCAL_USER}
        onSignOut={localAccount ? () => void handleLocalSignOut() : handleLocalExit}
        localAccount={localAccount}
        onChooseWorkspace={chooseWorkspace}
        onOpenDemo={() => setDemo(true)}
      />
    );
  }
  if (authLoading) return <AuthLoading />;
  if (!storageMode) {
    return <ModeChooser cloudAvailable={authConfigured} onChoose={setStorageMode} />;
  }
  if (!session) {
    return (
      <LoginPage
        onContinueLocally={() => setStorageMode('local')}
        onTryDemo={() => setDemo(true)}
        onOpenPeoplePortal={openPeoplePortal}
      />
    );
  }
  if (recovery) {
    return (
      <RecoveryPage
        onComplete={() => setRecovery(false)}
        onCancel={() => void handleRecoveryCancel()}
      />
    );
  }

  const needsLocalImport = Boolean(
    session
    && storageMode === 'cloud'
    && !localImportResolved
    && hasLocalBudget()
    && !hasAccountState(session.user.id),
  );

  if (needsLocalImport && session) {
    return (
      <LocalImportPrompt
        email={session.user.email ?? null}
        error={localImportError}
        onImport={importLocalBudget}
        onStartEmpty={startEmptyCloud}
        onKeepLocal={keepLocalOnly}
        onSignOut={() => void handleSignOut()}
      />
    );
  }

  return (
    <FinanceHub
      user={{ id: session.user.id, email: session.user.email ?? null, local: false }}
      onSignOut={() => void handleSignOut()}
      onChooseWorkspace={chooseWorkspace}
      onOpenDemo={() => setDemo(true)}
    />
  );
}
