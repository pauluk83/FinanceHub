import { useEffect, useState } from 'react';
import type { ViewProps } from '../types';
import { Badge, Empty, Field, Section } from '../components';
import { deleteCloudAccount, enrollTotp, listMfaFactors, removeMfaFactor, verifyTotp, type MfaEnrollment, type MfaFactor } from '../account';

type Props = Pick<ViewProps, 'isLocal' | 'notify' | 'signOut' | 'userEmail'>;

export function AccountSecuritySection({ isLocal, notify, signOut, userEmail }: Props) {
  const [factors, setFactors] = useState<MfaFactor[]>([]);
  const [enrollment, setEnrollment] = useState<MfaEnrollment | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const refresh = async () => {
    if (isLocal) { setLoaded(true); return; }
    try {
      setFactors(await listMfaFactors());
      setError(null);
    } catch (next) {
      setError(next instanceof Error ? next.message : 'Account security could not be loaded.');
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => { void refresh(); }, [isLocal]);

  const begin = async () => {
    setBusy(true);
    setError(null);
    try {
      setEnrollment(await enrollTotp());
    } catch (next) {
      setError(next instanceof Error ? next.message : 'The authenticator could not be set up.');
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!enrollment) return;
    if (code.replace(/\s/g, '').length < 6) { setError('Enter the six-digit authenticator code.'); return; }
    setBusy(true);
    setError(null);
    try {
      await verifyTotp(enrollment.id, code);
      setEnrollment(null);
      setCode('');
      await refresh();
      notify('Authenticator app added — MFA is now available for this account');
    } catch (next) {
      setError(next instanceof Error ? next.message : 'That code was not accepted.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (factor: MfaFactor) => {
    if (!confirm(`Remove ${factor.friendlyName}? You will no longer be asked for that authenticator code.`)) return;
    setBusy(true);
    setError(null);
    try {
      await removeMfaFactor(factor.id);
      await refresh();
      notify('Authenticator removed');
    } catch (next) {
      setError(next instanceof Error ? next.message : 'The authenticator could not be removed.');
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
      <Section title="Account security" sub="MFA and cloud account deletion are available for signed-in cloud accounts">
        <div style={{ padding: 16 }}><Empty>This is a local-only workspace. Use Remove local copy or reset in Data &amp; backups to erase this device copy.</Empty></div>
      </Section>
    );
  }

  return (
    <Section
      title="Account security"
      sub={`Signed in as ${userEmail ?? 'your account'} · authenticator-app MFA and self-serve account deletion`}
      actions={<Badge tone={factors.length ? 'green' : 'amber'}>{factors.length ? 'MFA active' : 'MFA not set up'}</Badge>}
    >
      <div style={{ padding: 16, display: 'grid', gap: 12 }}>
        <div className="notice info">
          Add a time-based authenticator app (TOTP). Passkeys still depend on the Supabase project’s WebAuthn configuration and are not enabled by this build.
        </div>
        {error && <div className="notice danger" role="alert">{error}</div>}
        {!loaded && <div className="muted">Checking account security…</div>}
        {loaded && factors.length > 0 && (
          <div className="list">
            {factors.map((factor) => (
              <div className="list-row" key={factor.id}>
                <div>
                  <div className="title">{factor.friendlyName}</div>
                  <div className="sub">{factor.type.toUpperCase()} · {factor.status}</div>
                </div>
                <button className="btn ghost sm" disabled={busy} onClick={() => void remove(factor)}>Remove</button>
              </div>
            ))}
          </div>
        )}
        {!enrollment ? (
          <div><button className="btn primary" disabled={busy} onClick={() => void begin()}>Set up authenticator app</button></div>
        ) : (
          <div className="panel" style={{ margin: 0 }}>
            <header className="panel-head"><div><h2>Scan the code</h2><p>Add FinanceHub to your authenticator app, then enter the current six-digit code.</p></div></header>
            <div style={{ padding: 16, display: 'grid', gap: 12 }}>
              <img src={enrollment.qrCode} alt="Authenticator QR code" style={{ width: 180, height: 180, background: 'white', padding: 8, borderRadius: 8 }} />
              <div className="muted small">Manual key: <strong>{enrollment.secret}</strong></div>
              <div className="inline-form">
                <Field label="Six-digit code"><input className="input" inputMode="numeric" maxLength={7} value={code} onChange={(event) => setCode(event.target.value)} /></Field>
                <button className="btn primary" disabled={busy} onClick={() => void verify()}>Verify and enable MFA</button>
                <button className="btn ghost" disabled={busy} onClick={() => { setEnrollment(null); setCode(''); }}>Cancel</button>
              </div>
            </div>
          </div>
        )}
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
