import { useState } from 'react';
import type { ViewProps } from '../types';
import { Badge, Empty, Section } from '../components';
import { gbp } from '../format';
import {
  applyAiAction,
  askOpenRouter,
  budgetSnapshot,
  describeAiAction,
  type AiAction,
} from '../ai';
import { readAiSettings } from '../aiKeyStore';

type ChatEntry = {
  role: 'user' | 'assistant';
  content: string;
  actions?: AiAction[];
  applied?: boolean[];
};

function actionSummary(action: AiAction): string {
  if (action.type === 'add_bill') {
    return `Add bill “${action.name}” — ${gbp(action.amountPence)}, due day ${action.dueDay}${action.account ? `, paid from ${action.account}` : ''}`;
  }
  if (action.type === 'update_bill') {
    const parts = [
      action.amountPence !== undefined ? `amount ${gbp(action.amountPence)}` : '',
      action.dueDay !== undefined ? `due day ${action.dueDay}` : '',
      action.account ? `paid from ${action.account}` : '',
      action.active !== undefined ? (action.active ? 'active' : 'inactive') : '',
    ].filter(Boolean);
    return `Update bill “${action.name}” — ${parts.join(', ')}`;
  }
  return `Add ${action.kind.toLowerCase()} “${action.description}” — ${gbp(action.amountPence)} on ${action.date} from ${action.account}`;
}

export function AssistantView({ ds, engine, year, month, update, notify, userId, go }: ViewProps) {
  const [settings] = useState(() => readAiSettings(userId));
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const ready = Boolean(settings.apiKey);

  const send = async () => {
    const text = question.trim();
    if (!text || busy) return;
    setBusy(true);
    setError('');
    setQuestion('');
    const history = messages.map((entry) => ({ role: entry.role, content: entry.content }));
    setMessages((current) => [...current, { role: 'user', content: text }]);
    try {
      const reply = await askOpenRouter({
        settings,
        history,
        question: text,
        snapshot: budgetSnapshot(ds, engine, year, month),
        referer: window.location.origin,
      });
      setMessages((current) => [...current, {
        role: 'assistant',
        content: reply.reply,
        actions: reply.actions,
        applied: reply.actions.map(() => false),
      }]);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The assistant could not answer.');
    } finally {
      setBusy(false);
    }
  };

  const apply = (messageIndex: number, actionIndex: number) => {
    const action = messages[messageIndex]?.actions?.[actionIndex];
    if (!action || messages[messageIndex].applied?.[actionIndex]) return;
    if (action.type === 'add_bill' && ds.bills.some((bill) => bill.name.toLowerCase() === action.name.toLowerCase())) {
      notify('A bill with that name already exists');
      return;
    }
    if (action.type === 'update_bill' && !ds.bills.some((bill) => bill.name.toLowerCase() === action.name.toLowerCase())) {
      notify(`No bill called “${action.name}”`);
      return;
    }
    update((dataset) => { applyAiAction(dataset, action, ds.settings.asOfDate); });
    setMessages((current) => current.map((entry, index) => index === messageIndex
      ? { ...entry, applied: (entry.applied ?? []).map((done, position) => position === actionIndex ? true : done) }
      : entry));
    notify(`${describeAiAction(action)} applied — review it in ${action.type === 'add_transaction' ? 'Transactions' : 'Bills'}`);
  };

  const actions = (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {messages.length > 0 && (
        <button className="btn ghost sm" onClick={() => { setMessages([]); setError(''); }} disabled={busy}>Clear chat</button>
      )}
      {!ready && <button className="btn sm" onClick={() => go('settings')}>Open AI settings</button>}
    </div>
  );

  if (!ready) {
    return (
      <Section title="AI assistant" sub="Ask about this budget or ask for a change, using your own OpenRouter key." actions={actions}>
        <Empty>
          Save your OpenRouter key in Settings → AI and the chat opens here — no vault passphrase needed.
        </Empty>
      </Section>
    );
  }

  return (
    <Section
      title="AI assistant"
      sub={`Answers use the budget as it stands at ${ds.settings.asOfDate}. A proposed bill or transaction is only saved when you press Apply.`}
      actions={<div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}><Badge tone="green">Ready</Badge>{actions}</div>}
    >
      <div style={{ padding: 16, borderBottom: '1px solid var(--line)' }}>
        {messages.length === 0 && (
          <div className="muted small">
            Ask about balances, bills, spending or a person, for example “How much is left in Current?” or “Add a water
            bill of £34.50 due on the 12th”.
          </div>
        )}
        {messages.map((entry, messageIndex) => (
          <div key={messageIndex} style={{ margin: '12px 0' }}>
            <div className="muted small" style={{ marginBottom: 4 }}>{entry.role === 'user' ? 'You' : 'Assistant'}</div>
            <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{entry.content}</div>
            {entry.actions && entry.actions.length > 0 && (
              <div style={{ marginTop: 8 }}>
                {entry.actions.map((action, actionIndex) => {
                  const done = entry.applied?.[actionIndex];
                  return (
                    <div key={actionIndex} className="notice info" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ flex: 1, minWidth: 200 }}>{actionSummary(action)}</span>
                      <button className="btn primary sm" disabled={done} onClick={() => apply(messageIndex, actionIndex)}>
                        {done ? 'Applied' : 'Apply'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
        {busy && <div className="muted small">Thinking…</div>}
        {error && <div className="notice danger" style={{ marginTop: 10 }}>{error}</div>}
      </div>

      <form
        className="inline-form"
        onSubmit={(event) => { event.preventDefault(); void send(); }}
      >
        <label style={{ flex: 1, minWidth: 220 }}>
          <span className="muted small">Question or change</span>
          <input
            className="input"
            placeholder="Ask about the budget…"
            aria-label="Ask the assistant"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
          />
        </label>
        <button className="btn primary" type="submit" disabled={busy || !question.trim()}>{busy ? 'Sending…' : 'Send'}</button>
      </form>
    </Section>
  );
}
