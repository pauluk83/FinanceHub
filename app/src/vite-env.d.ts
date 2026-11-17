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

interface Window {
  financeHubDesktop?: {
    secureStorage: DesktopSecureStorage;
    onBeforeClose(callback: () => void): () => void;
    closeReady(): void;
    oauth: DesktopOAuthBridge;
    bank?: { starling?: DesktopStarlingBridge };
    updater?: import('./update').DesktopUpdaterBridge;
  };
}
