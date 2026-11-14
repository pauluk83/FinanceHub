import { useEffect, useState } from 'react';
import type { ViewProps } from '../types';
import { Badge, Empty, Section } from '../components';
import { passkeyErrorMessage, passkeysSupported } from '../auth';
import {
  deleteCloudAccount,
  listPasskeys,
  registerPasskey,
  removePasskey,
  type StoredPasskey,
} from '../account';

type Props = Pick<ViewProps, 'isLocal' | 'notify' | 'signOut' | 'userEmail'>;

export function AccountSecuritySection({ isLocal, notify, signOut, userEmail }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [passkeys, setPasskeys] = useState<StoredPasskey[]>([]);
  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  const [passkeyAvailable] = useState(() => passkeysSupported());

  const refresh = async () => {
    if (isLocal) { setLoaded(true); return; }
    if (passkeyAvailable) {
      try {
        setPasskeys(await listPasskeys());
        setPasskeyError(null);
      } catch (next) {
        setPasskeyError(passkeyErrorMessage(next));
      }
    }
    setLoaded(true);
  };

  useEffect(() => { void refresh(); }, [isLocal]);

  const addPasskey = async () => {
    setBusy(true);
    setPasskeyError(null);
    try {
      const added = await registerPasskey();
      setPasskeys((current) => [...current.filter((passkey) => passkey.id !== added.id), added]);
      notify(`Passkey added — ${added.friendlyName}`);
    } catch (next) {
      setPasskeyError(passkeyErrorMessage(next));
    } finally {
      setBusy(false);
    }
  };

  const forgetPasskey = async (passkey: StoredPasskey) => {
    if (!confirm(`Remove the passkey “${passkey.friendlyName}”?\n\nYou can still sign in with your password or another passkey.`)) return;
    setBusy(true);
    setPasskeyError(null);
    try {
      await removePasskey(passkey.id);
      setPasskeys((current) => current.filter((entry) => entry.id !== passkey.id));
      notify('Passkey removed');
    } catch (next) {
      setPasskeyError(passkeyErrorMessage(next));
    } finally {
      setBusy(false);
    }
  };

  const eraseAccount = async () => {
    if (!confirm(
      'Delete your FinanceHub cloud account and every cloud budget record?\n\n'
      + 'This removes the account, synced budget, conflicts and sign-in. It cannot be undone. '
      + 'Export a backup first if you need a copy. Local workspace copies are separate and are not deleted.',
    )) return;
    setBusy(true);
    setError(null);
    try {
      await deleteCloudAccount();
      notify('Cloud account deleted');
      signOut();
    } catch (next) {
      setError(next instanceof Error ? next.message : 'The account could not be deleted. Nothing was removed.');
    } finally {
      setBusy(false);
    }
  };

  if (isLocal) {
    return (
      <Section title="Account security" sub="Passkeys and cloud account deletion are available for signed-in cloud accounts">
        <div style={{ padding: 16 }}><Empty>This is a local-only workspace. Use Remove local copy or reset in Data &amp; backups to erase this device copy.</Empty></div>
      </Section>
    );
  }

  return (
    <Section
      title="Account security"
      sub={`Signed in as ${userEmail ?? 'your account'} · passkeys and self-serve account deletion`}
      actions={<Badge tone={passkeyAvailable && passkeys.length ? 'green' : 'amber'}>
        {passkeyAvailable ? `${passkeys.length} passkey${passkeys.length === 1 ? '' : 's'}` : 'Passkeys unavailable'}
      </Badge>}
    >
      <div style={{ padding: 16, display: 'grid', gap: 12 }}>
        <div className="notice info">
          Add a passkey for phishing-resistant sign-in without a password.
        </div>
        {error && <div className="notice danger" role="alert">{error}</div>}
        {!loaded && <div className="muted">Checking account security…</div>}
        <div>
          <strong>Passkeys</strong>
          <div className="muted small" style={{ margin: '4px 0 10px' }}>
            Sign in without a password using Windows Hello, Touch ID, a security key or your password manager. A passkey is stored by your device, not by FinanceHub.
          </div>
          {!passkeyAvailable ? (
            <div className="notice info">
              Passkeys need the hosted website in a supported browser. The packaged desktop window loads local files and cannot use WebAuthn.
            </div>
          ) : (
            <>
              {passkeys.length > 0 && (
                <div className="list" style={{ marginBottom: 10 }}>
                  {passkeys.map((passkey) => (
                    <div className="list-row" key={passkey.id}>
                      <div>
                        <div className="title">{passkey.friendlyName}</div>
                        <div className="sub">
                          Created {new Date(passkey.createdAt).toLocaleDateString()}
                          {passkey.lastUsedAt ? ` · Last used ${new Date(passkey.lastUsedAt).toLocaleDateString()}` : ' · Not used yet'}
                        </div>
                      </div>
                      <button className="btn ghost sm" disabled={busy} onClick={() => void forgetPasskey(passkey)}>Remove</button>
                    </div>
                  ))}
                </div>
              )}
              <button className="btn" disabled={busy} onClick={() => void addPasskey()}>Add a passkey</button>
              {passkeys.length === 0 && <div className="muted small" style={{ marginTop: 8 }}>No passkeys registered yet.</div>}
            </>
          )}
          {passkeyError && <div className="notice danger" role="alert" style={{ marginTop: 10 }}>{passkeyError}</div>}
        </div>
        <hr style={{ border: 0, borderTop: '1px solid var(--line)', width: '100%' }} />
        <div>
          <strong>Delete cloud account</strong>
          <div className="muted small" style={{ margin: '4px 0 10px' }}>
            This runs the <code>delete_my_account</code> database function. It removes the auth user and cascades to every cloud record. Local copies and exported backups are not touched.
          </div>
          <button className="btn danger" disabled={busy} onClick={() => void eraseAccount()}>Delete cloud account permanently</button>
        </div>
      </div>
    </Section>
  );
}
