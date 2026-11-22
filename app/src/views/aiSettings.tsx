import { useEffect, useState } from 'react';
import type { ViewProps } from '../types';
import { Badge, Field, Section } from '../components';
import { AI_DEFAULT_MODEL, type AiSettings as AiSettingsValue } from '../ai';
import { useAiSettings } from '../aiKeyStore';

/**
 * Settings → AI. The key is a device setting saved alongside the app's other
 * settings, so the assistant opens without unlocking the credential vault.
 */
export function AiSettings({ userId, vaultSession, notify }: Pick<ViewProps, 'userId' | 'vaultSession' | 'notify'>) {
  const { settings: stored, loading, save } = useAiSettings(userId);
  // A key saved in the vault before this change is offered once so it is not lost.
  const vaultKey = vaultSession?.secrets?.ai?.apiKey ?? '';
  const [apiKey, setApiKey] = useState(stored.apiKey || vaultKey);
  const [model, setModel] = useState(stored.model);
  const [saved, setSaved] = useState(Boolean(stored.apiKey));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setApiKey(stored.apiKey || vaultKey);
    setModel(stored.model);
    setSaved(Boolean(stored.apiKey));
  }, [stored.apiKey, stored.model]);

  const commit = async (next: AiSettingsValue) => {
    setBusy(true);
    setError('');
    const ok = await save(next);
    setBusy(false);
    return ok;
  };

  const saveKey = async () => {
    if (!(await commit({ apiKey, model }))) {
      setError('This browser could not save the key. Allow site data for FinanceHub and try again.');
      return;
    }
    setSaved(Boolean(apiKey.trim()));
    notify(apiKey.trim() ? 'AI key saved on this device' : 'AI key removed');
  };

  const remove = async () => {
    if (!(await commit({ apiKey: '', model }))) {
      setError('This browser could not remove the key. Allow site data for FinanceHub and try again.');
      return;
    }
    setApiKey('');
    setSaved(false);
    notify('AI key removed');
  };

  return (
    <Section
      title="AI"
      sub="Ask questions about this budget or ask for a change. Requests go from this app to OpenRouter with your own key; nothing is sent anywhere else."
      actions={<Badge tone={saved ? 'green' : 'neutral'}>{saved ? 'Key saved' : 'No key saved'}</Badge>}
    >
      <div style={{ padding: 16 }}>
        <div className="notice info">
          The key is kept in this device's FinanceHub settings, so the assistant works without unlocking the credential
          vault. On Windows the OS encrypts it (DPAPI) like the rest of the app's data; in the hosted web build it is
          sealed with a device key the browser holds, so a copied browser profile yields only ciphertext. It is never
          written to the budget document, a backup or sync. The free default model <code>{AI_DEFAULT_MODEL}</code> lets
          OpenRouter pick a free model; free models are rate limited, and a specific model ID can be entered instead.
        </div>

        <div className="form-grid" style={{ marginTop: 12 }}>
          <Field label="OpenRouter API key" hint="Created at openrouter.ai/keys">
            <input
              className="input"
              type="password"
              autoComplete="off"
              placeholder="sk-or-v1-…"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
            />
          </Field>
          <Field label="Model" hint="Free by default">
            <input
              className="input"
              placeholder={AI_DEFAULT_MODEL}
              value={model}
              onChange={(event) => setModel(event.target.value)}
            />
          </Field>
        </div>

        <div className="toolbar" style={{ borderBottom: 0, padding: '12px 0 0' }}>
          <button className="btn primary" onClick={() => void saveKey()} disabled={busy || loading}>
            {busy ? 'Saving…' : 'Save AI settings'}
          </button>
          {saved && <button className="btn ghost" onClick={() => void remove()} disabled={busy || loading}>Remove key</button>}
        </div>

        <p className="muted small" style={{ marginTop: 10 }}>
          Open <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">openrouter.ai/keys</a> to create a
          key, then open <strong>AI assistant</strong> in Tools to chat about the budget.
        </p>

        {error && <div className="notice danger">{error}</div>}
      </div>
    </Section>
  );
}
