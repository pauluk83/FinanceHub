import { useState } from 'react';
import type { ViewProps } from '../types';
import { Badge, Field, Section } from '../components';
import { AI_DEFAULT_MODEL } from '../ai';
import { readAiSettings, writeAiSettings } from '../aiKeyStore';

/**
 * Settings → AI. The key is a device setting saved alongside the app's other
 * settings, so the assistant opens without unlocking the credential vault.
 */
export function AiSettings({ userId, vaultSession, notify }: Pick<ViewProps, 'userId' | 'vaultSession' | 'notify'>) {
  const stored = readAiSettings(userId);
  // A key saved in the vault before this change is offered once so it is not lost.
  const [apiKey, setApiKey] = useState(stored.apiKey || vaultSession?.secrets?.ai?.apiKey || '');
  const [model, setModel] = useState(stored.model);
  const [saved, setSaved] = useState(Boolean(stored.apiKey));
  const [error, setError] = useState('');

  const save = () => {
    setError('');
    if (!writeAiSettings(userId, { apiKey, model })) {
      setError('This browser could not save the key. Allow site data for FinanceHub and try again.');
      return;
    }
    setSaved(Boolean(apiKey.trim()));
    notify(apiKey.trim() ? 'AI key saved on this device' : 'AI key removed');
  };

  const remove = () => {
    setError('');
    if (!writeAiSettings(userId, { apiKey: '', model })) {
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
          vault. It is never written to the budget document, a backup or sync, but it is not encrypted at rest — anyone
          who can open FinanceHub on this device can use it. The free default model <code>{AI_DEFAULT_MODEL}</code> lets
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
          <button className="btn primary" onClick={save}>Save AI settings</button>
          {saved && <button className="btn ghost" onClick={remove}>Remove key</button>}
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
