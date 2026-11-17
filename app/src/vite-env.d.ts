/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_HOSTED_WEB?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface DesktopSecureStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface DesktopOAuthBridge {
  redirectUrl: string;
  openExternal(url: string): void;
  onCallback(callback: (payload: { code?: string | null; error?: string | null }) => void): () => void;
}

interface DesktopStarlingAccount {
  accountUid: string;
  defaultCategoryUid: string;
  name: string;
  accountType: string;
  currency: string;
  createdAt?: string;
}

interface DesktopStarlingFeedItem {
  feedItemUid?: string;
  status?: string;
  direction?: string;
  amount?: { currency?: string; minorUnits?: number } | null;
  transactionTime?: string;
  counterPartyName?: string;
  reference?: string;
  transactionType?: string;
}

interface DesktopStarlingResult<T> {
  ok: boolean;
  value?: T;
  error?: string;
}

interface DesktopStarlingBridge {
  status(): Promise<DesktopStarlingResult<{ hasToken: boolean; secureStorage: boolean }>>;
  saveToken(token: string): Promise<DesktopStarlingResult<{ hasToken: boolean; secureStorage: boolean }>>;
  forget(): Promise<DesktopStarlingResult<{ hasToken: boolean; secureStorage: boolean }>>;
  accounts(): Promise<DesktopStarlingResult<DesktopStarlingAccount[]>>;
  transactions(params: {
    accountUid: string;
    categoryUid: string;
    min: string;
    max: string;
  }): Promise<DesktopStarlingResult<DesktopStarlingFeedItem[]>>;
}

interface DesktopEnableBankingSession {
  sessionId: string;
  aspspName: string;
  aspspCountry: string;
  validUntil: string;
  linkedAt?: string;
  accounts: Array<{ uid: string; name: string; currency: string }>;
}

interface DesktopEnableBankingStatus {
  hasCredentials: boolean;
  secureStorage: boolean;
  sessions: DesktopEnableBankingSession[];
}

interface DesktopEnableBankingAspsp {
  name: string;
  country: string;
  logo?: string;
}

interface DesktopEnableBankingTransaction {
  transaction_id?: string;
  entry_reference?: string;
  status?: string;
  booking_date?: string;
  value_date?: string;
  transaction_amount?: { currency?: string; amount?: string } | null;
  credit_debit_indicator?: string;
  creditor?: { name?: string } | null;
  debtor?: { name?: string } | null;
  remittance_information?: string[];
  transaction_code?: string;
}

interface DesktopEnableBankingResult<T> {
  ok: boolean;
  value?: T;
  error?: string;
}

interface DesktopEnableBankingBridge {
  status(): Promise<DesktopEnableBankingResult<DesktopEnableBankingStatus>>;
  saveCredentials(params: { appId: string; privateKey: string }): Promise<DesktopEnableBankingResult<{ hasCredentials: boolean; secureStorage: boolean }>>;
  forget(): Promise<DesktopEnableBankingResult<DesktopEnableBankingStatus>>;
  aspsps(): Promise<DesktopEnableBankingResult<DesktopEnableBankingAspsp[]>>;
  link(params: { name: string; country: string }): Promise<DesktopEnableBankingResult<{ opened: boolean }>>;
  accounts(): Promise<DesktopEnableBankingResult<DesktopEnableBankingSession[]>>;
  transactions(params: {
    accountUid: string;
    min: string;
    max: string;
  }): Promise<DesktopEnableBankingResult<DesktopEnableBankingTransaction[]>>;
  onLinked(callback: (payload: { ok: boolean; error?: string | null }) => void): () => void;
}

interface Window {
  financeHubDesktop?: {
    secureStorage: DesktopSecureStorage;
    onBeforeClose(callback: () => void): () => void;
    closeReady(): void;
    oauth: DesktopOAuthBridge;
    bank?: { starling?: DesktopStarlingBridge; openBanking?: DesktopEnableBankingBridge };
    updater?: import('./update').DesktopUpdaterBridge;
  };
}
