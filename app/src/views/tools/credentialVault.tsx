import { useEffect, useMemo, useState } from 'react';
import type { ViewProps } from '../../types';
import { Badge, Field, Section } from '../../components';
import {
  createVault, legacySecrets, rotateVault, sealVault, stripLegacySecrets, unlockVault,
  VAULT_MAX_HINT, VAULT_MIN_PASSPHRASE, type VaultField, type VaultSecrets,
} from '../../vault';

const VAULT_PROVIDERS: { key: string; label: string; fields: { key: VaultField; label: string }[] }[] = [
  { key: 'rent', label: 'Rent', fields: [{ key: 'username', label: 'Username' }, { key: 'password', label: 'Password' }, { key: 'chargeLetterPassword', label: 'Charge letter password' }] },
  { key: 'water', label: 'Water', fields: [{ key: 'username', label: 'Username' }, { key: 'password', label: 'Password' }] },
  { key: 'councilTax', label: 'Council Tax', fields: [{ key: 'username', label: 'Username' }, { key: 'password', label: 'Password' }, { key: 'accessBill', label: 'Bill password' }] },
  { key: 'parkXmas', label: 'Park Xmas', fields: [{ key: 'username', label: 'Username' }, { key: 'password', label: 'Password' }] },
  { key: 'ovo', label: 'Ovo', fields: [{ key: 'username', label: 'Username' }, { key: 'password', label: 'Password' }] },
  { key: 'o2', label: 'O2', fields: [{ key: 'username', label: 'Username' }] },
  { key: 'virgin', label: 'Virgin', fields: [{ key: 'username', label: 'Username' }] },
];

function vaultErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The credential vault could not be opened.';
}

export function CredentialVault({ ds, update, notify, vault, vaultSession, setVault, setVaultSession }: Pick<ViewProps, 'ds' | 'update' | 'notify' | 'vault' | 'vaultSession' | 'setVault' | 'setVaultSession'>) {
  const [passphrase, setPassphrase] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [draft, setDraft] = useState<VaultSecrets>(() => vaultSession?.secrets ?? {});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [hint, setHint] = useState('');
  const [newPassphrase, setNewPassphrase] = useState('');
  const [newConfirmation, setNewConfirmation] = useState('');
  const [newHint, setNewHint] = useState('');
  const legacy = useMemo(() => legacySecrets(ds), [ds]);
  const hasLegacy = Object.keys(legacy).length > 0;

  useEffect(() => {
    setDraft(vaultSession?.secrets ?? {});
  }, [vaultSession]);

  useEffect(() => {
    setNewHint(vault?.hint ?? '');
  }, [vault?.hint]);

  const create = async () => {
    setError('');
    if (passphrase.length < VAULT_MIN_PASSPHRASE) {
      setError(`Use at least ${VAULT_MIN_PASSPHRASE} characters for the vault passphrase.`);
      return;
    }
    if (passphrase !== confirmation) {
      setError('The two passphrases do not match.');
      return;
    }
    setBusy(true);
    try {
      const initial = legacySecrets(ds);
      const created = await createVault(passphrase, initial, hint);
      setVault(created.vault);
      setVaultSession(created.session);
      setDraft(initial);
      if (Object.keys(initial).length) update((dataset) => stripLegacySecrets(dataset));
      setPassphrase('');
      setConfirmation('');
      setHint('');
      notify(Object.keys(initial).length ? 'Credential vault created — plaintext login fields removed' : 'Credential vault created');
    } catch (reason) {
      setError(vaultErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  const unlock = async () => {
    if (!vault) return;
    setError('');
    setBusy(true);
    try {
      const session = await unlockVault(vault, passphrase);
      setVaultSession(session);
      setDraft(session.secrets);
      setPassphrase('');
      notify('Credential vault unlocked');
    } catch (reason) {
      setError(vaultErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!vaultSession) return;
    setError('');
    setBusy(true);
    try {
      const next = await sealVault(vaultSession, draft);
      setVault(next);
      setVaultSession({ ...vaultSession, secrets: draft });
      notify('Encrypted credentials saved — sync carries ciphertext only');
    } catch (reason) {
      setError(vaultErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  const rotate = async () => {
    if (!vault || !vaultSession) return;
    setError('');
    if (newPassphrase.length < VAULT_MIN_PASSPHRASE) {
      setError(`Use at least ${VAULT_MIN_PASSPHRASE} characters for the new passphrase.`);
      return;
    }
    if (newPassphrase !== newConfirmation) {
      setError('The two new passphrases do not match.');
      return;
    }
    setBusy(true);
    try {
      const rotated = await rotateVault(vaultSession, newPassphrase, draft, newHint);
      setVault(rotated.vault);
      setVaultSession(rotated.session);
      setDraft(rotated.session.secrets);
      setNewPassphrase('');
      setNewConfirmation('');
      notify('Vault passphrase changed — the old passphrase no longer unlocks this vault');
    } catch (reason) {
      setError(vaultErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  const lock = () => {
    setVaultSession(null);
    setDraft({});
    setPassphrase('');
    setConfirmation('');
    setNewPassphrase('');
    setNewConfirmation('');
    setError('');
    notify('Credential vault locked');
  };

  const deleteVault = () => {
    if (!confirm('Delete the encrypted credential vault? The saved provider logins cannot be recovered without the passphrase.')) return;
    setVault(null);
    setVaultSession(null);
    setDraft({});
    setPassphrase('');
    setConfirmation('');
    setError('');
    notify('Encrypted credential vault deleted');
  };

  const setSecret = (provider: string, field: VaultField, value: string) => {
    setDraft((current) => ({
      ...current,
      [provider]: { ...(current[provider] ?? {}), [field]: value },
    }));
  };

  return (
    <Section
      title="Credential vault"
      sub="Provider logins are encrypted on this device before they sync"
      actions={<Badge tone={vaultSession ? 'green' : vault ? 'amber' : 'neutral'}>{vaultSession ? 'Unlocked' : vault ? 'Locked' : 'Not set up'}</Badge>}
    >
      <div style={{ padding: 16, display: 'grid', gap: 14 }}>
        <div className="muted small">
          The vault is protected with a passphrase you choose. Only ciphertext is stored in the budget and synced to your account; the passphrase is never stored, sent or recoverable. Use the same passphrase on Windows and the hosted app. An optional hint is stored unencrypted so the locked screen can show it — never put the passphrase itself in it.
        </div>

        {hasLegacy && !vault && (
          <div className="notice warn">
            Plaintext provider credentials are still in this budget. Creating the vault imports them and removes those fields from the budget. Rotate any password that has already been copied into a backup or cloud snapshot.
          </div>
        )}

        {!vault && (
          <>
            <div className="form-grid">
              <Field label="Vault passphrase" hint={`At least ${VAULT_MIN_PASSPHRASE} characters. Store it somewhere safe.`}>
                <input className="input" type="password" autoComplete="new-password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} />
              </Field>
              <Field label="Confirm passphrase">
                <input className="input" type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
              </Field>
              <Field label="Passphrase hint (optional)" hint={`Stored unencrypted, up to ${VAULT_MAX_HINT} characters. A reminder, not the passphrase.`}>
                <input className="input" type="text" autoComplete="off" maxLength={VAULT_MAX_HINT} value={hint} onChange={(event) => setHint(event.target.value)} />
              </Field>
            </div>
            <div>
              <button className="btn primary" onClick={create} disabled={busy}>{busy ? 'Creating…' : 'Create encrypted vault'}</button>
            </div>
          </>
        )}

        {vault && !vaultSession && (
          <>
            <div className="form-grid">
              <Field label="Vault passphrase" hint="Enter the passphrase used when this vault was created.">
                <input className="input" type="password" autoComplete="current-password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void unlock(); }} />
              </Field>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn primary" onClick={unlock} disabled={busy || !passphrase}>{busy ? 'Unlocking…' : 'Unlock vault'}</button>
              <button className="btn ghost" onClick={deleteVault} disabled={busy}>Delete vault and start again</button>
            </div>
            {vault.hint && (
              <div className="notice">
                <strong>Your passphrase hint:</strong> {vault.hint}
              </div>
            )}
            <div className="muted small">
              <strong>Forgotten passphrase?</strong> There is no reset and no recovery key — the passphrase is never stored, so nobody can unlock the ciphertext without it. The hint above is the only reminder this vault keeps. If it does not help, delete the vault and create a new one: your budget, transactions, bills and provider ledgers stay exactly as they are, and only the saved provider logins are lost.
            </div>
          </>
        )}

        {vault && vaultSession && (
          <>
            <div className="form-grid">
              {VAULT_PROVIDERS.map((provider) => provider.fields.map((field) => (
                <Field key={`${provider.key}-${field.key}`} label={`${provider.label} — ${field.label}`}>
                  <input
                    className="input"
                    type={field.key === 'username' ? 'text' : 'password'}
                    autoComplete="off"
                    spellCheck={false}
                    value={draft[provider.key]?.[field.key] ?? ''}
                    onChange={(event) => setSecret(provider.key, field.key, event.target.value)}
                  />
                </Field>
              )))}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save encrypted credentials'}</button>
              <button className="btn ghost" onClick={lock}>Lock vault</button>
            </div>
            <div className="muted small">Saving replaces the encrypted vault, so the other device receives the change through normal cloud sync. Unlock it there with this same passphrase.</div>

            <div style={{ borderTop: '1px solid rgba(127,127,127,0.25)', paddingTop: 14, display: 'grid', gap: 10 }}>
              <div>
                <strong>Change passphrase</strong>
                <div className="muted small">
                  Re-encrypts the logins shown above under a new passphrase and a fresh random salt, then saves them. The old passphrase stops unlocking this vault. Ciphertext already copied into an earlier cloud revision, a backup or a conflict snapshot can still be opened with the old passphrase, so rotate the provider passwords too if you think it was exposed.
                </div>
              </div>
              <div className="form-grid">
                <Field label="New passphrase" hint={`At least ${VAULT_MIN_PASSPHRASE} characters.`}>
                  <input className="input" type="password" autoComplete="new-password" value={newPassphrase} onChange={(event) => setNewPassphrase(event.target.value)} />
                </Field>
                <Field label="Confirm new passphrase">
                  <input className="input" type="password" autoComplete="new-password" value={newConfirmation} onChange={(event) => setNewConfirmation(event.target.value)} />
                </Field>
                <Field label="Passphrase hint (optional)" hint={`Stored unencrypted, up to ${VAULT_MAX_HINT} characters.`}>
                  <input className="input" type="text" autoComplete="off" maxLength={VAULT_MAX_HINT} value={newHint} onChange={(event) => setNewHint(event.target.value)} />
                </Field>
              </div>
              <div>
                <button className="btn" onClick={rotate} disabled={busy || !newPassphrase}>{busy ? 'Working…' : 'Change passphrase and save'}</button>
              </div>
            </div>
          </>
        )}

        {error && <div className="notice danger">{error}</div>}
      </div>
    </Section>
  );
}
