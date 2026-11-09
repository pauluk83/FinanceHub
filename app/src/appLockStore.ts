import { readPersistedValue, removePersistedValue, writePersistedValue } from './store';
import { parseAppLock, type AppLockConfig } from './appLock';

export const APP_LOCK_KEY = 'financehub.applock.v1';
export const APP_LOCK_ATTEMPTS_KEY = 'financehub.applock.attempts.v1';

export interface LockAttempts {
  failures: number;
  blockedUntil: number;
}

/** Device-local, never part of the synced budget document. */
export function readAppLock(): AppLockConfig | null {
  return parseAppLock(readPersistedValue(APP_LOCK_KEY));
}

export function writeAppLock(config: AppLockConfig | null): boolean {
  if (!config) {
    removePersistedValue(APP_LOCK_KEY);
    return true;
  }
  return writePersistedValue(APP_LOCK_KEY, JSON.stringify(config));
}

export function readLockAttempts(): LockAttempts {
  try {
    const parsed = JSON.parse(readPersistedValue(APP_LOCK_ATTEMPTS_KEY) ?? 'null') as Partial<LockAttempts> | null;
    const failures = Number(parsed?.failures);
    const blockedUntil = Number(parsed?.blockedUntil);
    return {
      failures: Number.isFinite(failures) && failures > 0 ? Math.floor(failures) : 0,
      blockedUntil: Number.isFinite(blockedUntil) && blockedUntil > 0 ? blockedUntil : 0,
    };
  } catch {
    return { failures: 0, blockedUntil: 0 };
  }
}

export function saveLockAttempts(attempts: LockAttempts): void {
  const clean: LockAttempts = {
    failures: Math.max(0, Math.floor(attempts.failures)),
    blockedUntil: Math.max(0, Math.floor(attempts.blockedUntil)),
  };
  if (clean.failures === 0 && clean.blockedUntil === 0) removePersistedValue(APP_LOCK_ATTEMPTS_KEY);
  else writePersistedValue(APP_LOCK_ATTEMPTS_KEY, JSON.stringify(clean));
}
