/**
 * Device and session management for a signed-in account.
 *
 * One row per browser or desktop install, owner-scoped by RLS (`user_id` must
 * equal `auth.uid()`). The Supabase client is injected, so the tests prove the
 * scoping, the ordering and the stale rule with no network and no second account.
 */
export const DEVICE_TABLE = 'user_devices';
/** A device not seen for this long is shown as inactive, never auto-deleted. */
export const DEVICE_STALE_DAYS = 30;
const DEVICE_ID = /^[A-Za-z0-9-]{8,64}$/;

export interface DeviceRow {
  id: string;
  deviceId: string;
  label: string;
  platform: string | null;
  createdAt: string;
  lastSeenAt: string;
  revokedAt: string | null;
}

export interface DeviceClient {
  upsert(input: { deviceId: string; label: string; platform: string | null; lastSeenAt: string }): Promise<void>;
  list(): Promise<DeviceRow[]>;
  revoke(id: string): Promise<void>;
}

/** Mirrors the bucket guard: an empty or traversing id never leaves the device. */
export function requireDeviceOwner(userId: string | null | undefined): string {
  const value = String(userId ?? '').trim();
  if (!value || value.includes('/') || value.includes('\\') || value.includes('..') || value.length > 64) {
    throw new Error('Sign in to manage devices.');
  }
  return value;
}

export function requireDeviceId(deviceId: string | null | undefined): string {
  const value = String(deviceId ?? '').trim();
  if (!DEVICE_ID.test(value)) throw new Error('This device has no valid identifier.');
  return value;
}

/** A database row (snake_case) as the app uses it, or null when the shape is wrong. */
export function deviceFromRow(value: any): DeviceRow | null {
  if (typeof value?.id !== 'string' || typeof value?.device_id !== 'string') return null;
  if (typeof value?.created_at !== 'string' || typeof value?.last_seen_at !== 'string') return null;
  if (!Number.isFinite(Date.parse(value.created_at)) || !Number.isFinite(Date.parse(value.last_seen_at))) return null;
  return {
    id: value.id,
    deviceId: value.device_id,
    label: typeof value.label === 'string' && value.label.trim() ? value.label.trim() : 'Unknown device',
    platform: typeof value.platform === 'string' && value.platform ? value.platform : null,
    createdAt: value.created_at,
    lastSeenAt: value.last_seen_at,
    revokedAt: typeof value.revoked_at === 'string' ? value.revoked_at : null,
  };
}

/** "Windows app", "Chrome on Windows", "Safari on iPhone" — never a user-agent dump. */
export function deviceLabel(platform: string, userAgent = ''): string {
  if (platform === 'desktop') return 'Windows app';
  const ua = userAgent;
  const browser = /Edg\//.test(ua) ? 'Edge'
    : /OPR\//.test(ua) ? 'Opera'
      : /Firefox\//.test(ua) ? 'Firefox'
        : /Chrome\//.test(ua) ? 'Chrome'
          : /Safari\//.test(ua) ? 'Safari'
            : 'Browser';
  const system = /Windows/.test(ua) ? 'Windows'
    : /iPhone/.test(ua) ? 'iPhone'
      : /iPad/.test(ua) ? 'iPad'
        : /Android/.test(ua) ? 'Android'
          : /Mac OS X|Macintosh/.test(ua) ? 'macOS'
            : /Linux/.test(ua) ? 'Linux'
              : '';
  return system ? `${browser} on ${system}` : browser;
}

export function deviceDaysSince(lastSeenAt: string, now = Date.now()): number {
  const seen = Date.parse(lastSeenAt);
  if (!Number.isFinite(seen)) return Number.POSITIVE_INFINITY;
  return Math.floor((now - seen) / 86_400_000);
}

export function isDeviceStale(row: Pick<DeviceRow, 'lastSeenAt' | 'revokedAt'>, now = Date.now()): boolean {
  if (row.revokedAt) return false;
  return deviceDaysSince(row.lastSeenAt, now) >= DEVICE_STALE_DAYS;
}

/** This device first, then active devices by last seen, then revoked ones. */
export function sortDevices(rows: readonly DeviceRow[], currentDeviceId: string | null): DeviceRow[] {
  const rank = (row: DeviceRow) => row.revokedAt ? 2 : row.deviceId === currentDeviceId ? 0 : 1;
  return [...rows].sort((a, b) => {
    const byRank = rank(a) - rank(b);
    if (byRank !== 0) return byRank;
    return b.lastSeenAt.localeCompare(a.lastSeenAt);
  });
}

export function deviceSummary(
  rows: readonly DeviceRow[],
  now = Date.now(),
): { total: number; active: number; stale: number; revoked: number } {
  const revoked = rows.filter((row) => row.revokedAt).length;
  const stale = rows.filter((row) => isDeviceStale(row, now)).length;
  return { total: rows.length, active: rows.length - revoked, stale, revoked };
}

export function deviceStore(client: DeviceClient, userId: string | null | undefined) {
  const owner = requireDeviceOwner(userId);
  return {
    owner,
    async register(deviceId: string, label: string, platform: string | null, at = new Date().toISOString()) {
      const id = requireDeviceId(deviceId);
      await client.upsert({ deviceId: id, label: label.trim().slice(0, 80) || 'Unknown device', platform, lastSeenAt: at });
    },
    async list(currentDeviceId: string | null = null) {
      return sortDevices((await client.list()).filter((row) => row.deviceId !== ''), currentDeviceId);
    },
    async revoke(id: string) {
      if (!id) throw new Error('Choose a device to revoke.');
      await client.revoke(id);
    },
  };
}
