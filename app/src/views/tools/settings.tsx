import { useRef, useState } from 'react';
import type { ViewProps } from '../../types';
import { Badge, Empty, Field, Section, Table } from '../../components';
import { download, todayIso, toCsv } from '../../format';
import { clearState } from '../../store';
import { stripLegacySecrets } from '../../vault';
import { decodeBackupDataset } from '../../backup';
import { backupFileProblem } from '../../../../core/importLimits';
import { FINANCEHUB_URL, LEGAL_COPYRIGHT, LEGAL_TRADEMARK, LEGAL_VERSION } from '../../legal';
import { APP_CHANGELOG } from '../../appChangelog.generated';
import { GITHUB_REPO_URL } from '../../installer';
import { MenuLayoutSection } from '../menuLayout';
import { AiSettings } from '../aiSettings';
import { AccountSecuritySection } from '../accountSecurity';
import { AppLockSection } from '../appLock';
import { EncryptedBackupSection } from '../backup';
import { YearRolloverSection } from './yearRollover';
import { UpdateCheckSection } from './updateCheck';
import { CredentialVault } from './credentialVault';
import { LOCALES, locale as currentLocale, setLocale, t, type Locale } from '../../i18n';

type SettingsPane = 'account' | 'ai' | 'budget' | 'data' | 'app';

const SETTINGS_PANES: { id: SettingsPane; label: string; summary: string }[] = [
  { id: 'account', label: 'Account', summary: 'Session, passkeys, app lock, sync conflicts and the provider vault.' },
  { id: 'ai', label: 'AI', summary: 'The OpenRouter key for the AI assistant, kept on this device.' },
  { id: 'budget', label: 'Budget', summary: 'Year rollover plus the core dates, account and currency every screen reads.' },
  { id: 'data', label: 'Data', summary: 'Backups, duplicate review, onboarding and reset.' },
  { id: 'app', label: 'App', summary: 'Theme, sidebar layout and legal information.' },
];

export function SettingsView({ ds, update, notify, theme, setTheme, engine, go, userId, userEmail, isLocal, signOut, localAccount, workspace, vault, appLock, setAppLock, vaultSession, setVault, setVaultSession, syncConflicts, resolveSyncConflict, exportSyncConflict, purgeSyncConflicts, year, setYear }: ViewProps) {
  const restoreInput = useRef<HTMLInputElement>(null);
  const [settingsPane, setSettingsPane] = useState<SettingsPane>('account');
  const activeSettingsPane = SETTINGS_PANES.find((pane) => pane.id === settingsPane) ?? SETTINGS_PANES[0];
  const primaryAccount = ds.settings.primaryAccount || ds.accounts[0]?.name || '';
  const reset = () => {
    if (!confirm('Discard every local edit and restore the imported workbook data?')) return;
    clearState(userId);
    location.reload();
  };

  const backup = () => {
    const safe = structuredClone(ds);
    stripLegacySecrets(safe);
    download('financehub-backup.json', JSON.stringify(safe, null, 2), 'application/json');
    notify('Backup exported — credential fields are excluded');
  };

  const restore = async (file: File) => {
    const sizeProblem = backupFileProblem(file.size);
    if (sizeProblem) {
      notify(sizeProblem);
      return;
    }

    let text = '';
    try {
      text = await file.text();
    } catch {
      notify('That backup could not be read');
      return;
    }

    const restored = decodeBackupDataset(text);
    if (!restored) {
      notify('That file is not a valid FinanceHub backup, or it contains an unsafe link');
      return;
    }

    if (!confirm(`Restore this backup? Every budget record on this device will be replaced.\n\nThe current budget will download first as a safety copy.`)) return;

    const safety = structuredClone(ds);
    stripLegacySecrets(safety);
    download(
      `financehub-before-restore-${todayIso()}.json`,
      JSON.stringify(safety, null, 2),
      'application/json',
    );
    update((d) => {
      for (const key of Object.keys(d)) delete (d as unknown as Record<string, unknown>)[key];
      Object.assign(d, restored);
    });
    notify(`Backup restored — ${restored.transactions.length} transactions and ${restored.holidays ? Object.values(restored.holidays).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0) : 0} holidays`);
  };

  return (
    <>
      <nav className="settings-switcher" aria-label="Settings groups">
        <div className="settings-switcher-head">
          <strong>{activeSettingsPane.label}</strong>
          <span>{activeSettingsPane.summary}</span>
        </div>
        <div className="tabs settings-tabs">
          {SETTINGS_PANES.map((pane) => (
            <button
              key={pane.id}
              type="button"
              className={`tab ${settingsPane === pane.id ? 'active' : ''}`}
              aria-pressed={settingsPane === pane.id}
              onClick={() => setSettingsPane(pane.id)}
            >
              {pane.label}
            </button>
          ))}
        </div>
      </nav>

      <div className="settings-pane" hidden={settingsPane !== 'account'}>
      <Section
        title="Account"
        sub={isLocal
          ? localAccount
            ? 'Local workspace — account signed in for sync'
            : 'Local workspace — no account connected'
          : 'Your FinanceHub session is managed by Supabase Auth'}
        actions={<Badge tone={isLocal ? 'amber' : 'green'}>{isLocal ? (localAccount ? 'Local + account' : 'Local only') : 'Secure session'}</Badge>}
      >
        <div style={{ padding: 16, display: 'flex', gap: 14, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <strong>{isLocal ? (localAccount?.email ?? 'Local workspace') : userEmail ?? 'Signed-in account'}</strong>
            <div className="muted small">
              {isLocal
                ? localAccount
                  ? 'This budget is stored on this device. Your account session is available for sync, exit, or logout.'
                  : 'This budget is stored only in this browser and is not protected by a login.'
                : 'Budget data is stored locally for this account. Provider credentials live in the encrypted vault, never as plaintext budget fields.'}
            </div>
          </div>
          {isLocal && localAccount ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn" onClick={localAccount.onSync} disabled={!localAccount.canSync} title={localAccount.canSync ? 'Upload this local budget to the signed-in account' : 'The account already has a saved budget; use Exit'}>
                Sync
              </button>
              <button className="btn ghost" onClick={localAccount.onExit} title="Open the signed-in cloud workspace without uploading local data">
                Exit
              </button>
              {localAccount.canRemoveLocal && (
                <button
                  className="btn ghost"
                  onClick={localAccount.onRemoveLocal}
                  title="Delete the device-only copy; the signed-in cloud budget is untouched"
                >
                  Remove local copy
                </button>
              )}
              <button className="btn ghost" onClick={localAccount.onLogout}>
                Log out
              </button>
            </div>
          ) : (
            <button className="btn" onClick={signOut}>{isLocal ? 'Use an account' : 'Sign out'}</button>
          )}
        </div>
      </Section>

      <AccountSecuritySection isLocal={isLocal} notify={notify} signOut={signOut} userEmail={userEmail} />

      <AppLockSection config={appLock} onChange={setAppLock} workspace={workspace} notify={notify} />

      <Section
        title="Sync conflicts"
        sub="Both versions are kept when this device and the cloud edit the same revision. Nothing is discarded automatically."
        actions={<div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Badge tone={syncConflicts.length ? 'amber' : 'green'}>{syncConflicts.length ? `${syncConflicts.length} to review` : 'None'}</Badge>
          <button
            className="btn ghost sm"
            onClick={async () => {
              if (!confirm('Purge all sync-conflict history?\n\nThis deletes every local and cloud conflict snapshot for this account. Budget records and transactions are not touched. This cannot be undone.')) return;
              try {
                const purged = await purgeSyncConflicts();
                notify(purged ? `Purged ${purged} conflict snapshot${purged === 1 ? '' : 's'}` : 'Conflict history purged');
              } catch {
                notify('The conflict history could not be purged');
              }
            }}
          >
            Purge conflict history
          </button>
        </div>}
      >
        {syncConflicts.length === 0 ? (
          <div style={{ padding: 16 }}><Empty>No unresolved sync conflicts.</Empty></div>
        ) : (
          <Table head={['Detected', 'Local rev', 'Server rev', 'Changed', 'Snapshots', '']} numHead={[1, 2]}>
            {syncConflicts.map((conflict) => (
              <tr key={conflict.id}>
                <td className="muted small">{new Date(conflict.detectedAt).toLocaleString('en-GB')}</td>
                <td className="num">{conflict.localRev}</td>
                <td className="num">{conflict.remoteRev}</td>
                <td className="muted small" title={conflict.changedPaths.join(', ')}>
                  {conflict.changedPaths.slice(0, 4).join(', ') || '—'}
                </td>
                <td className="muted small">
                  {conflict.localAvailable && conflict.remoteAvailable
                    ? 'Both kept'
                    : conflict.localAvailable
                      ? 'Local only'
                      : conflict.remoteAvailable
                        ? 'Server only'
                        : 'Metadata only'}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button
                      className="btn sm"
                      disabled={!conflict.localAvailable}
                      onClick={() => resolveSyncConflict(conflict.id, 'local')}
                      title={conflict.localAvailable
                        ? 'Restore this device’s version and push it as the next revision'
                        : 'The local snapshot was trimmed; export the conflict record instead'}
                    >
                      Use mine
                    </button>
                    <button className="btn ghost sm" onClick={() => resolveSyncConflict(conflict.id, 'remote')}>
                      Use server
                    </button>
                    <button
                      className="btn ghost sm"
                      onClick={() => {
                        const payload = exportSyncConflict(conflict.id);
                        if (!payload) { notify('That conflict is no longer available'); return; }
                        download(
                          `financehub-conflict-${conflict.id.replace(/[^a-z0-9_-]/gi, '-')}.json`,
                          JSON.stringify(payload, null, 2),
                          'application/json',
                        );
                        notify('Conflict exported — both available versions are in the file');
                      }}
                    >
                      Export both
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <CredentialVault ds={ds} update={update} notify={notify} vault={vault} vaultSession={vaultSession} setVault={setVault} setVaultSession={setVaultSession} />
      </div>

      <div className="settings-pane" hidden={settingsPane !== 'ai'}>
      <AiSettings userId={userId} vaultSession={vaultSession} notify={notify} />
      </div>

      <div className="settings-pane" hidden={settingsPane !== 'budget'}>
      <YearRolloverSection ds={ds} year={year} update={update} setYear={setYear} notify={notify} />

      <Section title="Core settings" sub="Every screen reads from these values">
        <div className="form-grid">
          <Field label="Target year">
            <input type="number" value={ds.settings.targetYear} onChange={(e) => update((d) => { d.settings.targetYear = Number(e.target.value); })} />
          </Field>
          <Field label="As-of date" hint="Drives the lock cutoff and dashboard">
            <input type="date" value={ds.settings.asOfDate} onChange={(e) => update((d) => { d.settings.asOfDate = e.target.value; d.settings.lockCutoff = engine.lockCutoff(e.target.value); })} />
          </Field>
          <Field label="Lock cutoff (computed)">
            <input type="date" value={ds.settings.lockCutoff} disabled />
          </Field>
          <Field label="Currency">
            <input value={ds.settings.currency} onChange={(e) => update((d) => { d.settings.currency = e.target.value; })} />
          </Field>
          <Field label="Main budget account" hint="Income, spending and cash-flow calculations use this account">
            <select
              className="select"
              value={primaryAccount}
              disabled={ds.accounts.length === 0}
              onChange={(e) => update((d) => { d.settings.primaryAccount = e.target.value; })}
            >
              {!ds.accounts.some((a) => a.name === primaryAccount) && <option value={primaryAccount}>{primaryAccount} (missing)</option>}
              {ds.accounts.map((a) => <option key={a.name} value={a.name}>{a.name}</option>)}
            </select>
          </Field>
          <Field label="Months in year">
            <input type="number" value={ds.settings.monthsInYear} onChange={(e) => update((d) => { d.settings.monthsInYear = Number(e.target.value); })} />
          </Field>
          <Field label="Balance anchor date" hint="Protected: changing it re-derives the main account balance">
            <input
              type="date"
              value={ds.settings.anchorDate}
              onChange={(e) => {
                if (confirm('Balance Anchor Date is protected in the workbook. Change it only after reconciling the bank balance. Continue?')) {
                  update((d) => { d.settings.anchorDate = e.target.value; });
                  notify('Anchor updated — main balance re-derived');
                }
              }}
            />
          </Field>
        </div>
      </Section>

      </div>

      <div className="settings-pane" hidden={settingsPane !== 'data'}>
      <Section title="Onboarding & reset" sub="Open Guided setup for a new budget or a clean start. Once your budget has data, its sidebar entry is hidden.">
        <div className="toolbar" style={{ borderBottom: 0 }}>
          <button className="btn" onClick={() => go('setup')}>Open Guided setup</button>
          <span className="muted small">Ongoing settings remain on this page.</span>
        </div>
      </Section>

      <Section title="Data & backups" sub="Export, restore or reset the complete budget record">
        <div className="toolbar" style={{ borderBottom: 0 }}>
          <button className="btn" onClick={backup}>Export full backup (JSON)</button>
          <button className="btn" onClick={() => restoreInput.current?.click()}>Restore backup…</button>
          <input
            ref={restoreInput}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void restore(file);
            }}
          />
          <button className="btn" onClick={() => download('financehub-transactions.csv', toCsv([
            ['Date', 'Account', 'Type', 'Amount', 'Comments', 'Category', 'Tags', 'Treatment', 'Status'],
            ...ds.transactions.map((t) => [t.date, t.account, t.type, (t.amountPence / 100).toFixed(2), t.comments, t.category ?? '', (t.tags ?? []).join(', '), t.budgetTreatment, t.status]),
          ]))}>Export transactions (CSV)</button>
          <div className="toolbar-spacer" />
          <button className="btn danger" onClick={reset}>Reset to imported workbook</button>
        </div>
        <div style={{ padding: '0 16px 16px', display: 'grid', gap: 8 }}>
          <div className="notice warn">A restore replaces every budget record. The current budget downloads as a safety copy first. Backups are plain JSON, so keep them somewhere protected.</div>
          <div className="notice info">Provider login details are stored with this budget and shown on their provider pages. Exported backups are plain JSON, so keep them protected.</div>
        </div>
      </Section>

      <EncryptedBackupSection ds={ds} update={update} notify={notify} userId={userId} />

      </div>

      <div className="settings-pane" hidden={settingsPane !== 'app'}>
      <UpdateCheckSection notify={notify} />
      <Section title="About & legal" sub="Ownership, copyright, trademark and the documents that govern your use of FinanceHub">
        <div style={{ padding: 16, display: 'grid', gap: 10 }}>
          <div><strong>FinanceHub™</strong> <span className="muted small">· version {LEGAL_VERSION}</span></div>
          {/* The build id is the only way to tell two builds of the same day apart,
              so it is listed here rather than only on the changelog page. */}
          <div className="muted small">
            Running build <strong>{APP_CHANGELOG.buildId}</strong> · built {APP_CHANGELOG.builtAt.slice(0, 10)}
          </div>
          <div className="muted small">Designed, built and owned by Zane Stanton. {LEGAL_COPYRIGHT}</div>
          <div className="muted small">{LEGAL_TRADEMARK} The name, logo and source code may not be used without permission.</div>
          <div className="toolbar" style={{ borderBottom: 0, padding: 0 }}>
            <a className="btn" href="#legal/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>
            <a className="btn" href="#legal/terms" target="_blank" rel="noreferrer">Terms of Service</a>
            <a className="btn" href="#legal/eula" target="_blank" rel="noreferrer">EULA</a>
            <a className="btn" href={GITHUB_REPO_URL} target="_blank" rel="noreferrer">GitHub repository</a>
          </div>
          <div className="muted small">
            Privacy requests and data erasure: email the address registered to your FinanceHub account with the subject
            “Privacy request”, or use Data &amp; backups above to export, reset or erase this workspace.
          </div>
        </div>
      </Section>

      <Section title="Appearance" sub="Theme preference is stored on this device">
        <div className="tabs" style={{ borderBottom: 0 }}>
          <button className={`tab ${theme === 'dark' ? 'active' : ''}`} onClick={() => setTheme('dark')}>🌙 Dark</button>
          <button className={`tab ${theme === 'glass' ? 'active' : ''}`} onClick={() => setTheme('glass')}>🫧 Liquid glass</button>
          <button className={`tab ${theme === 'light' ? 'active' : ''}`} onClick={() => setTheme('light')}>☀ Light</button>
          <button className={`tab ${theme === 'contrast' ? 'active' : ''}`} onClick={() => setTheme('contrast')}>◐ Contrast</button>
          <button className={`tab ${theme === 'system' ? 'active' : ''}`} onClick={() => setTheme('system')}>🖥 {t('theme.system')}</button>
        </div>
      </Section>

      <Section title={t('language.title')} sub={t('language.hint')}>
        <div className="inline-form">
          <Field label={t('language.label')}>
            <select
              className="select"
              aria-label={t('language.label')}
              value={currentLocale()}
              onChange={(e) => setLocale(e.target.value as Locale)}
            >
              {LOCALES.map((entry) => (
                <option key={entry.id} value={entry.id}>{entry.label}</option>
              ))}
            </select>
          </Field>
        </div>
      </Section>

      <MenuLayoutSection ds={ds} update={update} notify={notify} />
      </div>
    </>
  );
}
