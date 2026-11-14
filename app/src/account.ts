import { authClient } from './auth';

export interface StoredPasskey {
  id: string;
  friendlyName: string;
  createdAt: string;
  lastUsedAt?: string;
}

function passkeyFrom(value: any): StoredPasskey | null {
  if (typeof value?.id !== 'string' || typeof value?.created_at !== 'string') return null;
  return {
    id: value.id,
    friendlyName: typeof value.friendly_name === 'string' && value.friendly_name.trim()
      ? value.friendly_name
      : 'Passkey',
    createdAt: value.created_at,
    ...(typeof value.last_used_at === 'string' ? { lastUsedAt: value.last_used_at } : {}),
  };
}

export async function listPasskeys(): Promise<StoredPasskey[]> {
  if (!authClient) throw new Error('Authentication is not configured.');
  const { data, error } = await authClient.auth.passkey.list();
  if (error) throw error;
  return (data ?? []).map(passkeyFrom).filter((passkey): passkey is StoredPasskey => Boolean(passkey));
}

export async function registerPasskey(): Promise<StoredPasskey> {
  if (!authClient) throw new Error('Authentication is not configured.');
  const { data, error } = await authClient.auth.registerPasskey();
  if (error) throw error;
  const passkey = passkeyFrom(data);
  if (!passkey) throw new Error('The passkey service did not return the new passkey.');
  return passkey;
}

export async function removePasskey(passkeyId: string): Promise<void> {
  if (!authClient) throw new Error('Authentication is not configured.');
  const { error } = await authClient.auth.passkey.delete({ passkeyId });
  if (error) throw error;
}

/** Deletes the signed-in user's cloud data and auth account through the SQL function. */
export async function deleteCloudAccount(): Promise<void> {
  if (!authClient) throw new Error('Authentication is not configured.');
  const { error } = await authClient.rpc('delete_my_account');
  if (error) throw new Error(error.message);
}
