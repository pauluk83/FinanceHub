import { useEffect, useState, type FormEvent } from 'react';
import type { Dataset } from '../../../core/engine';
import { Badge, Empty, Field, Section, Table } from '../components';
import { dateTimeUk, dateUk, gbp } from '../format';
import {
  addPortalFeedback,
  authenticatePersonPortal,
  createPersonPortal,
  deletePersonPortal,
  deletePortalFeedback,
  PORTAL_FEEDBACK_EVENT,
  PORTAL_FEEDBACK_MAX,
  portalPasswordProblem,
  portalStatementFromDataset,
  portalUsernameProblem,
  portalUsernameTaken,
  readAllPortals,
  readFeedbackForOwner,
  readPortalsForOwner,
  savePortalsForOwner,
  type PersonPortal,
  type PortalFeedback,
} from '../portal';
import { FINANCEHUB_URL, LEGAL_OWNER } from '../legal';
import type { WorkspaceMode } from '../types';
import { AuthFrame } from './login';

const PORTAL_SESSION_KEY = 'financehub.people-portal-session.v1';

function portalLink(): string {
  return `${window.location.href.split('#')[0]}#people`;
}

function restorePortalSession(): PersonPortal | null {
  try {
    const id = sessionStorage.getItem(PORTAL_SESSION_KEY);
    if (!id) return null;
    return readAllPortals().find((portal) => portal.id === id) ?? null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ settings */

export function PeopleAccessSection({
  ds,
  userId,
  notify,
  workspace,
}: {
  ds: Dataset;
  userId: string;
  notify: (message: string) => void;
  workspace: WorkspaceMode;
}) {
  const demo = workspace === 'demo';
  const [portals, setPortals] = useState<PersonPortal[]>(() => readPortalsForOwner(userId));
  const [person, setPerson] = useState(ds.people[0]?.shortName ?? '');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [feedbackItems, setFeedbackItems] = useState<PortalFeedback[]>(() => readFeedbackForOwner(userId));

  useEffect(() => {
    setPortals(readPortalsForOwner(userId));
    setFeedbackItems(readFeedbackForOwner(userId));
  }, [userId, ds.people]);

  useEffect(() => {
    const refresh = () => setFeedbackItems(readFeedbackForOwner(userId));
    window.addEventListener(PORTAL_FEEDBACK_EVENT, refresh);
    return () => window.removeEventListener(PORTAL_FEEDBACK_EVENT, refresh);
  }, [userId]);

  useEffect(() => {
    if (!ds.people.some((entry) => entry.shortName === person)) {
      setPerson(ds.people[0]?.shortName ?? '');
    }
  }, [ds.people, person]);

  const existing = portals.find((portal) => portal.person === person);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (demo) {
      setError('People sign-ins are not available in the demo workspace.');
      return;
    }
    if (!person) {
      setError('Add a person in the People section first.');
      return;
    }
    const usernameProblem = portalUsernameProblem(username);
    if (usernameProblem) {
      setError(usernameProblem);
      return;
    }
    const passwordProblem = portalPasswordProblem(password, username);
    if (passwordProblem) {
      setError(passwordProblem);
      return;
    }
    if (password !== confirmation) {
      setError('The two passwords do not match.');
      return;
    }
    if (portalUsernameTaken(username, existing?.id)) {
      setError('That username is already used by another people sign-in on this device.');
      return;
    }
    const statement = portalStatementFromDataset(ds, person);
    if (!statement) {
      setError('That person is not in this budget yet.');
      return;
    }

    setBusy(true);
    try {
      const portal = await createPersonPortal({ ownerId: userId, person, username, password, statement });
      const next = [...readPortalsForOwner(userId).filter((entry) => entry.person !== person), portal];
      savePortalsForOwner(userId, next);
      setPortals(next);
      setUsername('');
      setPassword('');
      setConfirmation('');
      setReveal(false);
      notify(existing ? `Sign-in replaced for ${person}` : `People sign-in created for ${person}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The people sign-in could not be created.');
    } finally {
      setBusy(false);
    }
  };

  const remove = (portal: PersonPortal) => {
    if (!confirm(`Remove the sign-in for ${portal.person}? @${portal.username} will no longer open their statement.`)) return;
    deletePersonPortal(userId, portal.id);
    setPortals(readPortalsForOwner(userId));
    notify(`Sign-in removed for ${portal.person}`);
  };

  const copyLink = async () => {
    const link = portalLink();
    try {
      await navigator.clipboard.writeText(link);
      notify('People sign-in link copied');
    } catch {
      notify(`Copy this link: ${link}`);
    }
  };

  const refreshFeedback = () => setFeedbackItems(readFeedbackForOwner(userId));

  const dismissFeedback = (id: string) => {
    deletePortalFeedback(userId, id);
    refreshFeedback();
    notify('Feedback dismissed');
  };

  const open = () => {
    window.location.hash = '#people';
  };

  return (
    <Section
      title="People sign-ins"
      sub="Give someone a username and password for a read-only view of their own People account and statement"
      actions={<Badge tone={portals.length ? 'green' : 'neutral'}>{portals.length ? `${portals.length} set up` : 'None set up'}</Badge>}
    >
      <div style={{ padding: 16, display: 'grid', gap: 14 }}>
        <div className="notice warn">
          <strong>This is a local, read-only view — not a cloud account.</strong>{' '}
          The sign-in and the person’s statement snapshot are stored only in this browser/device for this
          workspace. It is a convenience view, not a security boundary: anyone who can open this browser can
          still open FinanceHub itself. Use a separate browser profile or device for someone else’s access.
        </div>

        {demo ? (
          <div className="notice info">
            The demo workspace has no people sign-ins. Open your own workspace to create one.
          </div>
        ) : ds.people.length === 0 ? (
          <Empty>Add a person in the People section above, then create their sign-in here.</Empty>
        ) : (
          <form onSubmit={(event) => void create(event)} style={{ display: 'grid', gap: 12 }}>
            <div className="form-grid">
              <Field label="Person account" hint="They can only ever see this person’s statement">
                <select className="select" value={person} onChange={(event) => setPerson(event.target.value)}>
                  {ds.people.map((entry) => (
                    <option key={entry.shortName} value={entry.shortName}>
                      {entry.fullName || entry.shortName} ({entry.shortName})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Username" hint="An email address or a user ID — no spaces">
                <input
                  className="input"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="alex@example.com"
                  maxLength={80}
                />
              </Field>
              <Field label="Password" hint="At least 8 characters; stored only as a salted hash">
                <div className="portal-secret">
                  <input
                    className="input"
                    type={reveal ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="new-password"
                    maxLength={200}
                  />
                  <button type="button" className="btn ghost sm" onClick={() => setReveal((value) => !value)}>
                    {reveal ? 'Hide' : 'Show'}
                  </button>
                </div>
              </Field>
              <Field label="Confirm password">
                <input
                  className="input"
                  type={reveal ? 'text' : 'password'}
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  autoComplete="new-password"
                  maxLength={200}
                />
              </Field>
            </div>

            {existing && (
              <div className="muted small">
                {person} already has a sign-in as <strong>{existing.username}</strong>. Creating again replaces
                that username and password, and blocks the old ones.
              </div>
            )}
            {error && <div className="notice danger" role="alert">{error}</div>}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <button className="btn primary" type="submit" disabled={busy}>
                {busy ? 'Creating…' : existing ? 'Replace sign-in' : 'Create sign-in'}
              </button>
              <button className="btn ghost" type="button" onClick={open}>Open people sign-in</button>
              <button className="btn ghost" type="button" onClick={() => void copyLink()}>Copy link</button>
            </div>
          </form>
        )}

        {portals.length > 0 && (
          <div>
            <Table head={['Person', 'Username', 'Statement updated', 'Owed now', '']} numHead={[3]}>
              {portals.map((portal) => (
                <tr key={portal.id}>
                  <td>
                    <strong>{portal.person}</strong>
                    <div className="muted small">{portal.statement.fullName}</div>
                  </td>
                  <td className="muted">{portal.username}</td>
                  <td className="muted nowrap">{dateTimeUk(portal.statement.updatedAt)}</td>
                  <td className="num">{gbp(portal.statement.closingPence)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button className="btn ghost sm" onClick={open}>Open</button>
                      <button className="btn ghost sm" onClick={() => remove(portal)}>Remove</button>
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
            <div className="muted small" style={{ padding: '10px 16px 0' }}>
              Share this link on the device where you created the sign-in:{' '}
              <code className="portal-link">{portalLink()}</code>
            </div>
          </div>
        )}

        <div className="portal-inbox">
          <div className="portal-inbox-head">
            <div>
              <h3>Feedback &amp; suggestions</h3>
              <p>Notes left from a person’s statement page. Stored only on this device.</p>
            </div>
            <div className="portal-inbox-actions">
              <Badge tone={feedbackItems.length ? 'blue' : 'neutral'}>
                {feedbackItems.length ? `${feedbackItems.length} new` : 'None'}
              </Badge>
              <button className="btn ghost sm" type="button" onClick={refreshFeedback}>Refresh</button>
            </div>
          </div>
          {feedbackItems.length === 0 ? (
            <Empty>No feedback yet. People can leave a note from their statement page.</Empty>
          ) : (
            <div className="portal-inbox-list">
              {feedbackItems.map((item) => (
                <article key={item.id} className="portal-inbox-item">
                  <div className="portal-inbox-meta">
                    <strong>{item.person}</strong>
                    <span>{dateTimeUk(item.createdAt)}</span>
                  </div>
                  <p>{item.message}</p>
                  <button className="btn ghost sm" type="button" onClick={() => dismissFeedback(item.id)}>
                    Dismiss
                  </button>
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="muted small">
          Statements refresh automatically each time this workspace saves. Passwords are hashed with PBKDF2
          (SHA-256, 600,000 iterations) and never stored in plain text, backups or the budget.
        </div>
      </div>
    </Section>
  );
}

/* -------------------------------------------------------------------- portal */

export function PeoplePortalPage({ onExit }: { onExit: () => void }) {
  const [portal, setPortal] = useState<PersonPortal | null>(restorePortalSession);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [feedbackNotice, setFeedbackNotice] = useState('');
  const [feedbackError, setFeedbackError] = useState('');

  const signIn = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const found = await authenticatePersonPortal(username, password);
      if (!found) {
        setError('That username and password do not match a people sign-in on this device.');
        return;
      }
      setPortal(found);
      setPassword('');
      try {
        sessionStorage.setItem(PORTAL_SESSION_KEY, found.id);
      } catch {
        /* the session lasts only for this page view */
      }
    } catch {
      setError('This browser could not check the password.');
    } finally {
      setBusy(false);
    }
  };

  const signOut = () => {
    try {
      sessionStorage.removeItem(PORTAL_SESSION_KEY);
    } catch {
      /* nothing else is stored */
    }
    setPortal(null);
    setUsername('');
    setPassword('');
    setError('');
    setFeedbackMessage('');
    setFeedbackNotice('');
    setFeedbackError('');
  };

  const refresh = () => {
    if (!portal) return;
    const latest = readAllPortals().find((entry) => entry.id === portal.id);
    if (latest) setPortal(latest);
  };

  if (!portal) {
    return (
      <AuthFrame
        kicker="People access"
        title="Your statement"
        subtitle="Sign in with the username and password your budget owner created for you."
      >
        <form className="auth-form" onSubmit={(event) => void signIn(event)} noValidate>
          <label className="auth-field">
            <span>Username or email</span>
            <input
              className="auth-input"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={80}
              autoFocus
              disabled={busy}
              required
            />
          </label>
          <div className="auth-field">
            <label htmlFor="portal-password">Password</label>
            <div className="auth-password">
              <input
                id="portal-password"
                className="auth-input"
                type={reveal ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                maxLength={200}
                disabled={busy}
                required
              />
              <button
                type="button"
                className="auth-reveal"
                onClick={() => setReveal((value) => !value)}
                aria-label={reveal ? 'Hide password' : 'Show password'}
                disabled={busy}
              >
                {reveal ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {error && <div className="auth-alert auth-error" role="alert">{error}</div>}

          <button className="btn primary auth-submit" type="submit" disabled={busy}>
            {busy ? 'Checking…' : 'Open my statement'}
          </button>
        </form>

        <p className="auth-security">
          <span>
            Read-only. Only your own People statement is opened; your password is checked in this browser and
            is never sent anywhere.
          </span>
        </p>

        <div className="portal-signin-info">
          <span>FinanceHub™ is owned by <strong>{LEGAL_OWNER}</strong>.</span>
          <a href={FINANCEHUB_URL} target="_blank" rel="noreferrer">Visit the FinanceHub website ↗</a>
        </div>

        <div className="auth-switch">
          <button type="button" className="auth-link" onClick={onExit}>Back to FinanceHub</button>
        </div>
      </AuthFrame>
    );
  }

  const statement = portal.statement;

  const sendFeedback = (event: FormEvent) => {
    event.preventDefault();
    setFeedbackNotice('');
    setFeedbackError('');
    try {
      addPortalFeedback({ ownerId: portal.ownerId, person: portal.person, message: feedbackMessage });
      setFeedbackMessage('');
      setFeedbackNotice('Thanks — your feedback is saved for the budget owner.');
    } catch (reason) {
      setFeedbackError(reason instanceof Error ? reason.message : 'Your feedback could not be saved.');
    }
  };

  return (
    <div className="portal-page">
      <header className="portal-top">
        <div className="brand">
          <div className="brand-mark">FH</div>
          <div className="brand-text">
            <div className="brand-title">FinanceHub</div>
            <div className="brand-sub">People statement</div>
          </div>
        </div>
        <div className="portal-top-actions">
          <Badge tone="blue">Read-only</Badge>
          <button className="btn ghost sm" onClick={refresh}>Refresh</button>
          <button className="btn ghost sm" onClick={signOut}>Sign out</button>
        </div>
      </header>

      <main className="portal-body">
        <div className="portal-intro">
          <span className="eyebrow">Your account</span>
          <h1>{statement.fullName}</h1>
          <p>
            {statement.year} statement · as of {dateUk(statement.asOfDate)} · usernames cannot see any other
            part of the budget
          </p>
        </div>

        <div className="portal-owner-card">
          <div>
            <span className="eyebrow">Budget owner</span>
            <strong>{LEGAL_OWNER}</strong>
            <p>This statement belongs to the FinanceHub budget owned by {LEGAL_OWNER}.</p>
          </div>
          <a className="btn ghost sm" href={FINANCEHUB_URL} target="_blank" rel="noreferrer">
            Visit FinanceHub ↗
          </a>
        </div>

        <div className="metric-list portal-metrics">
          <div className="metric"><span>Opening balance</span><strong>{gbp(statement.openingPence)}</strong></div>
          <div className="metric"><span>Borrowed</span><strong>{gbp(statement.totalLentPence)}</strong></div>
          <div className="metric"><span>Repaid</span><strong>{gbp(statement.totalRepaidPence)}</strong></div>
          <div className="metric"><span>Owed now</span><strong>{gbp(statement.closingPence)}</strong></div>
        </div>

        <Section
          title="Statement"
          sub={`Every movement on ${statement.fullName}’s account for ${statement.year}, oldest first`}
          actions={<Badge tone="neutral">{statement.lines.length} row{statement.lines.length === 1 ? '' : 's'}</Badge>}
        >
          {statement.lines.length === 0 ? (
            <Empty>No movements on this account yet.</Empty>
          ) : (
            <Table head={['Date', 'Detail', 'Type', 'Amount', 'Balance']} numHead={[3, 4]}>
              {statement.lines.map((line) => (
                <tr key={`${line.row}-${line.date}`}>
                  <td className="muted nowrap">{dateUk(line.date)}</td>
                  <td>{line.comments || '—'}</td>
                  <td>{line.type === 'Income' ? 'Repaid' : 'Borrowed'}</td>
                  <td className="num">{gbp(line.amountPence)}</td>
                  <td className="num"><strong>{gbp(line.runningPence)}</strong></td>
                </tr>
              ))}
            </Table>
          )}
        </Section>

        <Section
          title="Feedback & suggestions"
          sub="Send a correction, question or suggestion to the budget owner"
        >
          <form className="portal-feedback" onSubmit={sendFeedback}>
            <Field label="Your message" hint="Do not include passwords or bank details.">
              <textarea
                className="input portal-textarea"
                rows={4}
                maxLength={PORTAL_FEEDBACK_MAX}
                value={feedbackMessage}
                onChange={(event) => {
                  setFeedbackMessage(event.target.value);
                  setFeedbackNotice('');
                  setFeedbackError('');
                }}
                placeholder="Share a correction, question or suggestion…"
              />
            </Field>
            <div className="portal-feedback-actions">
              <button className="btn primary" type="submit" disabled={feedbackMessage.trim().length < 3}>
                Send feedback
              </button>
              <span className="muted small">Stored on this device for the budget owner to review.</span>
            </div>
            {feedbackError && <div className="notice danger" role="alert">{feedbackError}</div>}
            {feedbackNotice && <div className="notice info" role="status">{feedbackNotice}</div>}
          </form>
        </Section>

        <div className="portal-note">
          <strong>Snapshot taken {dateTimeUk(statement.updatedAt)}.</strong>{' '}
          This page shows only the statement your budget owner shared. Nothing here can be edited, and changes
          to the budget appear after a refresh.
        </div>

        <div className="portal-foot">
          <span>
            Owed now = opening balance + borrowed − repaid. · Budget owner: {LEGAL_OWNER} ·{' '}
            <a className="portal-site-link" href={FINANCEHUB_URL} target="_blank" rel="noreferrer">
              Visit FinanceHub
            </a>
          </span>
          <button type="button" className="auth-link" onClick={onExit}>FinanceHub home</button>
        </div>
      </main>
    </div>
  );
}
