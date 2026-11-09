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

interface Window {
  financeHubDesktop?: {
    secureStorage: DesktopSecureStorage;
    onBeforeClose(callback: () => void): () => void;
    closeReady(): void;
    oauth: DesktopOAuthBridge;
  };
}
