/**
 * Live device/session wiring: one row per install, owned by the signed-in user.
 *
 * The desktop app reports itself as "Windows app"; the web build derives a short
 * browser-and-system label. The device id is random and device-local, so the same
 * install updates its own row instead of piling up new ones.
 */
import { authClient } from './auth';
import { readPersistedValue, writePersistedValue } from './store';
import {
  DEVICE_TABLE,
  deviceFromRow,
  deviceLabel,
  deviceStore,
  requireDeviceId,
  type DeviceClient,
  type DeviceRow,
} from '../../core/devices';
import { randomToken } from '../../core/ids.ts';

const DEVICE_KEY = 'financehub.device-id.v1';

/** True when the build has Supabase configured, so the panel can be shown. */
export const devicesConfigured = Boolean(authClient);

export function currentDeviceId(): string {
  const existing = readPersistedValue(DEVICE_KEY);
  if (existing && /^[A-Za-z0-9-]{8,64}$/.test(existing)) return existing;
  const next = randomToken();
  writePersistedValue(DEVICE_KEY, requireDeviceId(next));
  return next;
}

export function currentDeviceLabel(): { label: string; platform: string } {
  const desktop = typeof window !== 'undefined' && Boolean(window.financeHubDesktop);
  const platform = desktop ? 'desktop' : 'web';
  const agent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  return { label: deviceLabel(platform, agent), platform };
}

async function client(): Promise<{ store: ReturnType<typeof deviceStore>; userId: string }> {
  if (!authClient) throw new Error('Device management is not configured in this build.');
  const { data, error } = await authClient.auth.getSession();
  if (error) throw new Error(error.message);
  const userId = data.session?.user?.id;
  if (!userId) throw new Error('Sign in to manage your devices.');

  const table = authClient.from(DEVICE_TABLE);
  const deviceClient: DeviceClient = {
    async upsert(input) {
      const { error: upsertError } = await table.upsert(
        {
          user_id: userId,
          device_id: input.deviceId,
          label: input.label,
          platform: input.platform,
          last_seen_at: input.lastSeenAt,
        },
        { onConflict: 'user_id,device_id' },
      );
      if (upsertError) throw new Error(`The device could not be recorded: ${upsertError.message}`);
    },
    async list() {
      const { data: rows, error: listError } = await authClient!
        .from(DEVICE_TABLE)
        .select('id, device_id, label, platform, created_at, last_seen_at, revoked_at')
        .order('last_seen_at', { ascending: false });
      if (listError) throw new Error(`The device list could not be read: ${listError.message}`);
      return (rows ?? []).map(deviceFromRow).filter((row): row is DeviceRow => Boolean(row));
    },
    async revoke(id) {
      const { error: revokeError } = await authClient!
        .from(DEVICE_TABLE)
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', id);
      if (revokeError) throw new Error(`That device could not be revoked: ${revokeError.message}`);
    },
  };

  return { store: deviceStore(deviceClient, userId), userId };
}

/** Records this install as seen. Safe to call on every sign-in and once an hour. */
export async function registerCurrentDevice(): Promise<void> {
  const { store } = await client();
  const { label, platform } = currentDeviceLabel();
  await store.register(currentDeviceId(), label, platform);
}

export async function listAccountDevices(): Promise<DeviceRow[]> {
  const { store } = await client();
  return store.list(currentDeviceId());
}

export async function revokeAccountDevice(id: string): Promise<void> {
  const { store } = await client();
  await store.revoke(id);
}

/**
 * Ends every session on every device through the auth service, not just this one.
 * The caller signs out locally afterwards so the UI matches.
 */
export async function signOutEverywhere(): Promise<void> {
  if (!authClient) throw new Error('Device management is not configured in this build.');
  const { error } = await authClient.auth.signOut({ scope: 'global' });
  if (error) throw new Error(error.message);
}
