import { authClient, authAnonKey, authUrl } from './auth';

export interface MfaFactor {
  id: string;
  type: string;
  friendlyName: string;
  status: string;
}

export interface StoredPasskey {
  id: string;
  friendlyName: string;
  createdAt: string;
  lastUsedAt?: string;
}

export interface MfaEnrollment {
  id: string;
  qrCode: string;
  secret: string;
}

async function authRequest(path: string, init: RequestInit = {}): Promise<any> {
  if (!authClient || !authUrl || !authAnonKey) throw new Error('Authentication is not configured.');
  const { data: { session } } = await authClient.auth.getSession();
  if (!session) throw new Error('Sign in again before changing account security.');
  const response = await fetch(`${authUrl.replace(/\/$/, '')}/auth/v1${path}`, {
    ...init,
    headers: {
      apikey: authAnonKey,
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  let body: any = null;
  try { body = await response.json(); } catch { /* some errors have no JSON body */ }
  if (!response.ok) {
    throw new Error(body?.msg || body?.message || body?.error_description || `Account service answered ${response.status}.`);
  }
  return body;
}

function factorFrom(value: any): MfaFactor | null {
  const id = value?.id;
  const type = value?.factor_type ?? value?.type;
  if (typeof id !== 'string' || typeof type !== 'string') return null;
  return {
    id,
    type,
    friendlyName: typeof value?.friendly_name === 'string' ? value.friendly_name : 'Authenticator app',
    status: typeof value?.status === 'string' ? value.status : 'verified',
  };
}

export async function listMfaFactors(): Promise<MfaFactor[]> {
  const body = await authRequest('/factors', { method: 'GET' });
  const source = Array.isArray(body?.all) ? body.all : Array.isArray(body?.totp) ? body.totp : [];
  return source.map(factorFrom).filter((factor: MfaFactor | null): factor is MfaFactor => Boolean(factor));
}

export async function enrollTotp(): Promise<MfaEnrollment> {
  const body = await authRequest('/factors', {
    method: 'POST',
    body: JSON.stringify({ factor_type: 'totp', friendly_name: 'FinanceHub' }),
  });
  const id = body?.id;
  const qrCode = body?.totp?.qr_code;
  const secret = body?.totp?.secret;
  if (typeof id !== 'string' || typeof qrCode !== 'string' || typeof secret !== 'string') {
    throw new Error('The authenticator service did not return a setup code.');
  }
  return { id, qrCode, secret };
}

export async function verifyTotp(factorId: string, code: string): Promise<void> {
  const challenge = await authRequest(`/factors/${encodeURIComponent(factorId)}/challenge`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  if (typeof challenge?.id !== 'string') throw new Error('The authenticator challenge was not created.');
  await authRequest(`/factors/${encodeURIComponent(factorId)}/verify`, {
    method: 'POST',
    body: JSON.stringify({ challenge_id: challenge.id, code: code.replace(/\s/g, '') }),
  });
}

export async function removeMfaFactor(factorId: string): Promise<void> {
  await authRequest(`/factors/${encodeURIComponent(factorId)}`, { method: 'DELETE' });
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
