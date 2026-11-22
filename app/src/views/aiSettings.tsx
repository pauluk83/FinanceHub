import { useEffect, useState } from 'react';
import type { ViewProps } from '../types';
import { Badge, Field, Section } from '../components';
import { createVault, sealVault, unlockVault } from '../vault';
import { AI_DEFAULT_MODEL, aiSettings, persistAiSettings } from '../ai';

/**
 * Settings → AI. The key is sealed into the same encrypted credential vault as
 * the provider logins, so it is remembered on this device without ever entering
 * the budget document, a backup or sync.
 */
export function AiSettings({ vault, vaultSession, setVault, setVaultSession, notify }: Pick<
  ViewProps,
  'vault' | 'vaultSession' | 'setVault' | 'setVaultSession' | 'notify'
>) {
  const saved = aiSettings(vaultSession);
  const [apiKey, setApiKey] = useState(saved.apiKey);
  const [model, setModel] = useState(saved.model);
  const [passphrase, setPassphrase] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const next = aiSettings(vaultSession);
    setApiKey(next.apiKey);
    setModel(next.model);
  }, [vaultSession]);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The vault could not be updated.');
    } finally {
      setBusy(false);
    }
  };

  const create = () => run(async () => {
    if (passphrase !== confirmation) throw new Error('The two passphrases do not match.');
    const created = await createVault(passphrase, apiKey.trim() ? { ai: { apiKey: apiKey.trim(), model: model.trim() || AI_DEFAULT_MODEL } } : {}, '');
    setVault(created.vault);
    setVaultSession(created.session);
    setPassphrase('');
    setConfirmation('');
    notify(apiKey.trim() ? 'Vault created and the AI key saved' : 'Credential vault created');
  });

  const unlock = () => run(async () => {
    if (!vault) return;
    const session = await unlockVault(vault, passphrase);
    setVaultSession(session);
    setPassphrase('');
    notify('Vault unlocked for this session');
  });

  const save = () => run(async () => {
    if (!vaultSession) return;
    const next = await persistAiSettings(vaultSession, { apiKey, model });
    setVault(next.vault);
    setVaultSession(next.session);
    notify(apiKey.trim() ? 'AI key saved in the encrypted vault' : 'AI key removed from the vault');
  });

  const remove = () => run(async () => {
    if (!vaultSession) return;
    const next = await persistAiSettings(vaultSession, { apiKey: '', model });
    setVault(next.vault);
    setVaultSession(next.session);
    setApiKey('');
    notify('AI key removed from the vault');
  });

  return (
    <Section
      title="AI"
      sub="Ask questions about this budget or ask for a change. Requests go from this app to OpenRouter with your own key; nothing is sent anywhere else."
      actions={<Badge tone={vaultSession && saved.apiKey ? 'green' : vault ? 'amber' : 'neutral'}>
        {vaultSession && saved.apiKey ? 'Key saved' : vault ? 'Vault locked' : 'Not set up'}
      </Badge>}
    >
      <div style={{ padding: 16 }}>
        <div className="notice info">
          The key is sealed into the encrypted credential vault on this device. It is never written to the budget document,
          a backup or sync. The free default model <code>{AI_DEFAULT_MODEL}</code> lets OpenRouter pick a free model; free
          models are rate limited, and a specific model ID can be entered instead.
        </div>

        {!vault && (
          <>
            <p className="muted small" style={{ marginTop: 12 }}>
              No credential vault yet. Create one with a passphrase of at least 12 characters; it also protects the
              provider logins. The passphrase is never stored.
            </p>
            <div className="form-grid">
              <Field label="Vault passphrase"><input className="input" type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} /></Field>
              <Field label="Confirm passphrase"><input className="input" type="password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} /></Field>
            </div>
          </>
        )}

        {vault && !vaultSession && (
          <>
            <p className="muted small" style={{ marginTop: 12 }}>
              The vault is locked. Unlock it to read or change the AI key.
              {vault.hint ? <> Hint: <strong>{vault.hint}</strong></> : null}
            </p>
            <div className="form-grid">
              <Field label="Vault passphrase"><input className="input" type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} /></Field>
            </div>
            <div className="toolbar" style={{ borderBottom: 0, padding: '12px 0 0' }}>
              <button className="btn primary" onClick={unlock} disabled={busy || !passphrase}>{busy ? 'Working…' : 'Unlock vault'}</button>
            </div>
          </>
        )}

        {!vault && (
          <div className="toolbar" style={{ borderBottom: 0, padding: '12px 0 0' }}>
            <button className="btn primary" onClick={create} disabled={busy || passphrase.length < 12}>
              {busy ? 'Working…' : 'Create vault and save key'}
            </button>
          </div>
        )}

        {vaultSession && (
          <>
            <div className="form-grid" style={{ marginTop: 12 }}>
              <Field label="OpenRouter API key" hint="Created at openrouter.ai/keys">
                <input
                  className="input"
                  type="password"
                  autoComplete="off"
                  placeholder="sk-or-v1-…"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
              </Field>
              <Field label="Model" hint="Free by default">
                <input
                  className="input"
                  placeholder={AI_DEFAULT_MODEL}
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                />
              </Field>
            </div>
            <div className="toolbar" style={{ borderBottom: 0, padding: '12px 0 0' }}>
              <button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Working…' : 'Save AI settings'}</button>
              {saved.apiKey && <button className="btn ghost" onClick={remove} disabled={busy}>Remove key</button>}
            </div>
            <p className="muted small" style={{ marginTop: 10 }}>
              Open <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">openrouter.ai/keys</a> to create a
              key, then open <strong>AI assistant</strong> in Tools to chat about the budget.
            </p>
          </>
        )}

        {error && <div className="notice danger">{error}</div>}
      </div>
    </Section>
  );
}
