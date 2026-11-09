import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Badge, Empty, Field } from '../components';
import { dateTimeUk } from '../format';
import {
  addPortalFeedback,
  deletePortalFeedback,
  markAllFeedbackRead,
  PORTAL_FEEDBACK_MAX,
  readFeedbackForOwner,
  type PortalFeedback,
} from '../portal';

export type FeedbackTab = 'send' | 'inbox';

export function FeedbackDialog({
  ownerId,
  author,
  initialTab,
  onClose,
  notify,
}: {
  ownerId: string;
  author: string;
  initialTab: FeedbackTab;
  onClose: () => void;
  notify: (message: string) => void;
}) {
  const [tab, setTab] = useState<FeedbackTab>(initialTab);
  const [items, setItems] = useState<PortalFeedback[]>(() => readFeedbackForOwner(ownerId));
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState('');
  const messageRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setItems(readFeedbackForOwner(ownerId));
  }, [ownerId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (tab === 'send') messageRef.current?.focus();
  }, [tab]);

  useEffect(() => {
    if (tab !== 'inbox') return;
    if (markAllFeedbackRead(ownerId) > 0) setItems(readFeedbackForOwner(ownerId));
  }, [tab, ownerId]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setSent('');
    try {
      addPortalFeedback({ ownerId, person: author, message, source: 'app' });
      setMessage('');
      setSent('Thanks — your feedback is saved for the budget owner to review.');
      setItems(readFeedbackForOwner(ownerId));
      notify('Feedback saved');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Your feedback could not be saved.');
    }
  };

  const dismiss = (id: string) => {
    deletePortalFeedback(ownerId, id);
    setItems(readFeedbackForOwner(ownerId));
    notify('Feedback dismissed');
  };

  return (
    <div className="feedback-backdrop" onMouseDown={onClose}>
      <section
        className="feedback-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="feedback-head">
          <div>
            <span className="eyebrow">FinanceHub</span>
            <h2 id="feedback-dialog-title">Feedback &amp; suggestions</h2>
            <p>Send a note or read messages from people using the app. Stored on this device only.</p>
          </div>
          <button className="btn ghost sm" type="button" onClick={onClose} aria-label="Close feedback">
            Close
          </button>
        </header>

        <div className="feedback-tabs" role="tablist" aria-label="Feedback sections">
          <button
            className={`feedback-tab ${tab === 'send' ? 'active' : ''}`}
            type="button"
            role="tab"
            aria-selected={tab === 'send'}
            onClick={() => setTab('send')}
          >
            Send feedback
          </button>
          <button
            className={`feedback-tab ${tab === 'inbox' ? 'active' : ''}`}
            type="button"
            role="tab"
            aria-selected={tab === 'inbox'}
            onClick={() => setTab('inbox')}
          >
            Inbox{items.length > 0 ? ` (${items.length})` : ''}
          </button>
        </div>

        <div className="feedback-body">
          {tab === 'send' ? (
            <form className="feedback-form" onSubmit={submit}>
              <Field label="Your message" hint="Do not include passwords or bank details.">
                <textarea
                  ref={messageRef}
                  className="input"
                  rows={5}
                  maxLength={PORTAL_FEEDBACK_MAX}
                  value={message}
                  onChange={(event) => {
                    setMessage(event.target.value);
                    setError('');
                    setSent('');
                  }}
                  placeholder="Share a correction, question or suggestion…"
                />
              </Field>
              <div className="feedback-form-actions">
                <button className="btn primary" type="submit" disabled={message.trim().length < 3}>
                  Send feedback
                </button>
                <span className="muted small">Sending as {author} · stored on this device.</span>
              </div>
              {error && <div className="notice danger" role="alert">{error}</div>}
              {sent && <div className="notice info" role="status">{sent}</div>}
            </form>
          ) : items.length === 0 ? (
            <Empty>No feedback yet. Messages left on a People statement or from this app will appear here.</Empty>
          ) : (
            <div className="feedback-list">
              {items.map((item) => (
                <article className="feedback-item" key={item.id}>
                  <div className="feedback-item-meta">
                    <strong>{item.person}</strong>
                    <span>
                      {dateTimeUk(item.createdAt)} · {item.source === 'app' ? 'App' : 'Statement'}
                    </span>
                  </div>
                  <p>{item.message}</p>
                  <div className="feedback-item-actions">
                    <Badge tone={item.readAt ? 'neutral' : 'blue'}>{item.readAt ? 'Read' : 'New'}</Badge>
                    <button className="btn ghost sm" type="button" onClick={() => dismiss(item.id)}>
                      Dismiss
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
