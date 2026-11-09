import { useEffect, useMemo, useRef, useState } from 'react';
import type { ViewProps } from '../types';
import { Badge, Empty, Field, Section, Table } from '../components';
import { dateUk, download, gbp, MONTH_LONG, parseMoney, todayIso, toCsv } from '../format';
import { clearState } from '../store';
import { PeopleAccessSection } from './peoplePortal';
import { MenuLayoutSection } from './menuLayout';
import { GUIDE_BASICS, USER_GUIDE, type GuideEntry } from '../userGuide';
import { LEGAL_COPYRIGHT, LEGAL_TRADEMARK, LEGAL_VERSION } from '../legal';
import { deletePortalsForPerson, renamePortalPerson } from '../portal';
import { decodeBackupDataset } from '../backup';
import { detectDuplicates, duplicateGroups } from '../../../core/importDedupe';
import { backupFileProblem, countCsvRows, csvFileProblem, csvRowProblem } from '../../../core/importLimits';
import { classifyAccount } from '../../../core/accounts';
import { applyMonthlyPaymentChange, applyMonthlyRentChange, rentChangeTargets, rentPaymentTargets, weeklyRentPence } from '../../../core/rent';
import { applyWaterPaymentChange, waterPaymentTargets } from '../../../core/water';
import { createVault, legacySecrets, rotateVault, sealVault, stripLegacySecrets, unlockVault, VAULT_MAX_HINT, VAULT_MIN_PASSPHRASE, type VaultField, type VaultSecrets } from '../vault';
import { AppLockSection } from './appLock';
import { planYearRollover, rolloverYear } from '../../../core/yearRollover';
import { GITHUB_REPO_URL } from '../installer';
import { EncryptedBackupSection } from './backup';
import { AccountSecuritySection } from './accountSecurity';

function YearRolloverSection({ ds, year, update, setYear, notify }: Pick<ViewProps, 'ds' | 'update' | 'setYear' | 'notify'> & { year: number }) {
  const next = ds.settings.targetYear + 1;
  const [carryOver, setCarryOver] = useState(false);
  const result = planYearRollover(ds, next, { carryBalances: carryOver });
  const carryPreview = useMemo(
    () => planYearRollover(ds, next, { carryBalances: true }).plan?.carry,
    [ds, next],
  );
  const roll = () => {
    if (!result.ok || !result.plan) {
      notify(result.reason ?? 'That rollover is not available.');
      return;
    }
    const details = result.plan;
    const carryPlan = details.carry;
    const agreed = confirm([
      `Roll the budget from ${details.from} to ${details.to}?`,
      '',
      `As-of date → ${dateUk(details.asOfDate)}`,
      `Lock cutoff → ${dateUk(details.lockCutoff)}`,
      ...(carryPlan ? [
        '',
        `Carry balances into ${details.to} from ${dateUk(carryPlan.through)}:`,
        `• ${carryPlan.accountNames.length} accounts (${gbp(carryPlan.accountTotalPence)} total)`,
        `• ${carryPlan.cardCount} cards and ${carryPlan.personCount} people`,
        `• ${carryPlan.providerNames.length} provider ledgers`,
        `• ${carryPlan.billNames.length} bills continue with their current amounts`,
      ].filter(Boolean) : []),
      '',
      'Preserved:',
      ...details.preserved.map((entry) => `• ${entry}`),
      '',
      `The balance anchor remains ${ds.settings.anchorDate ? dateUk(ds.settings.anchorDate) : 'unset'}. Recalibrate it separately only after reconciling the bank balance.`,
    ].join('\n'));
    if (!agreed) return;
    update((dataset) => { rolloverYear(dataset, details.to, todayIso(), { carryBalances: carryOver }); });
    setYear(details.to);
    notify(carryOver
      ? `Target year is now ${details.to} — balances were carried into the new year`
      : `Target year is now ${details.to} — history and provider year blocks were kept`);
  };
  return (
    <Section title="Year rollover" sub="Move the configured year forward without rewriting history">
      <div style={{ padding: 16, display: 'grid', gap: 12 }}>
        <div className="metric-list" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          <div className="metric"><span>Target year</span><strong>{ds.settings.targetYear}</strong></div>
          <div className="metric"><span>Viewing</span><strong>{year}</strong></div>
          <div className="metric"><span>Next year</span><strong>{next}</strong></div>
        </div>
        <div className="notice info">
          Rolling over sets the As-of date and lock cutoff to the start of {next}, so new rows and bills land in the new year. By default month locks, transactions, bills, provider year blocks and the balance anchor date stay exactly as they are. Use the top-bar year selector to read any year without rolling over.
        </div>
        {carryPreview && (
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: 14, border: '1px solid var(--line)', borderRadius: 10, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={carryOver}
              onChange={(event) => setCarryOver(event.target.checked)}
              style={{ marginTop: 3 }}
            />
            <span>
              <strong>Carry over balances into {next}</strong>
              <span className="muted small" style={{ display: 'block', marginTop: 3 }}>
                Start {next} from the {dateUk(carryPreview.through)} close: {carryPreview.accountNames.length} accounts
                ({gbp(carryPreview.accountTotalPence)} total), {carryPreview.cardCount} cards, {carryPreview.personCount} people
                and {carryPreview.providerNames.length} provider ledgers. Bills continue with their current amounts and due dates.
                Earlier transactions and month locks stay in the budget.
              </span>
            </span>
          </label>
        )}
        {ds.settings.targetYear !== year && (
          <div className="notice warn">
            You are viewing {year} while the target year is {ds.settings.targetYear}. Rollover changes the target year used by the engine and new entries; it does not change which year you are viewing.
          </div>
        )}
        <div>
          <button className="btn primary" onClick={roll}>Roll over to {next}</button>
        </div>
      </div>
    </Section>
  );
}

function EditableName({ value, onCommit, ariaLabel }: { value: string; onCommit: (next: string) => void; ariaLabel: string }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    const next = draft.trim();
    if (!next) { setDraft(value); return; }
    if (next !== value) onCommit(next);
  };
  return (
    <input
      className="table-input"
      aria-label={ariaLabel}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
        if (e.key === 'Escape') { setDraft(value); e.currentTarget.blur(); }
      }}
    />
  );
}

/* ------------------------------------------------------------------ import */

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

function toIso(input: string): string {
  const value = String(input ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const uk = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (uk) return `${uk[3]}-${uk[2].padStart(2, '0')}-${uk[1].padStart(2, '0')}`;
  const us = value.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (us) return `${us[3]}-${us[2].padStart(2, '0')}-${us[1].padStart(2, '0')}`;
  return '';
}

type StageRow = {
  id: string;
  date: string;
  description: string;
  amountPence: number;
  type: 'Income' | 'Expense';
  duplicateWith: 'existing' | 'staged' | null;
  outOfWindow: boolean;
  add: boolean;
};

export function ImportView({ ds, update, notify }: ViewProps) {
  const [staging, setStaging] = useState<StageRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [account, setAccount] = useState(
    ds.accounts.find((a) => a.name === (ds.settings.primaryAccount || ds.accounts[0]?.name))?.name ?? ds.accounts[0]?.name ?? '',
  );

  const duplicateCount = staging.filter((r) => r.duplicateWith).length;
  const outsideCount = staging.filter((r) => r.outOfWindow).length;
  const ready = staging.filter((r) => r.add && !r.outOfWindow);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    setError('');
    const fileProblem = csvFileProblem(file.size);
    if (fileProblem) {
      setStaging([]);
      setError(fileProblem);
      return;
    }
    const text = await file.text();
    const rowProblem = csvRowProblem(countCsvRows(text));
    if (rowProblem) {
      setStaging([]);
      setError(rowProblem);
      return;
    }
    const grid = parseCsv(text);
    if (grid.length < 2) { setError('The CSV needs a header row and at least one transaction.'); return; }
    const header = grid[0].map((h) => h.replace(/^\uFEFF/, '').trim().toLowerCase());
    const find = (re: RegExp) => header.findIndex((h) => re.test(h));
    const dateIdx = find(/date/);
    const amountIdx = find(/amount/);
    const descIdx = find(/counter|description|reference|details|narrative/);
    const typeIdx = find(/^type$|direction/);
    if (dateIdx < 0 || amountIdx < 0) {
      setError('Could not find Date and Amount columns. Expected a bank CSV with a header row.');
      return;
    }
    const existing = ds.transactions.filter((t) => t.autoBill !== true);
    const candidates: Array<Omit<StageRow, 'id' | 'duplicateWith' | 'add'> & { id: string }> = [];
    for (let i = 1; i < grid.length; i++) {
      const cells = grid[i];
      const date = toIso(cells[dateIdx]);
      const amountPence = parseMoney(cells[amountIdx]);
      if (!date || amountPence === 0) continue;
      const typeText = typeIdx >= 0 ? String(cells[typeIdx] ?? '').toLowerCase() : '';
      const type: 'Income' | 'Expense' = /out|debit|expense|payment/.test(typeText) || amountPence < 0 ? 'Expense' : 'Income';
      candidates.push({
        id: `stage_${i}`,
        date,
        description: cells[descIdx] || cells[descIdx + 1] || '',
        amountPence: Math.abs(amountPence),
        type,
        outOfWindow: date < ds.settings.lockCutoff || date > ds.settings.asOfDate,
      });
    }
    const flags = detectDuplicates(existing, candidates);
    const staged: StageRow[] = candidates.map((candidate, index) => ({
      ...candidate,
      duplicateWith: flags[index],
      add: flags[index] === null && !candidate.outOfWindow,
    }));
    setStaging(staged);
  };

  const toggle = (id: string) => setStaging((rows) => rows.map((r) => (r.id === id && !r.outOfWindow ? { ...r, add: !r.add } : r)));

  const commit = () => {
    if (ready.length === 0) return;
    if (classifyAccount(account, ds) === 'unknown') {
      setError('Choose a recognised bank account before importing.');
      return;
    }
    update((d) => {
      let row = Math.max(0, ...d.transactions.map((t) => t.row));
      for (const r of ready) {
        row += 1;
        d.transactions.push({
          row,
          date: r.date,
          account,
          type: r.type,
          amountPence: r.amountPence,
          comments: r.description,
          status: '',
          budgetTreatment: '',
        });
      }
    });
    notify(`${ready.length} transactions appended — nothing was auto-posted`);
    setStaging([]);
    setFileName('');
  };

  return (
    <>
      <Section
        title="Bank CSV import"
        sub="Bank CSV export → flagged review → ready to add. Rows are never posted automatically."
      >
        <div className="toolbar">
          <select className="select" aria-label="Import into account" value={account} onChange={(e) => setAccount(e.target.value)}>
            {ds.accounts.length === 0 && <option value={account}>{account}</option>}
            {ds.accounts.map((a) => <option key={a.name} value={a.name}>{a.name}</option>)}
          </select>
          <input className="input" type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} />
          <span className="muted small">{fileName || 'Choose a bank CSV export'}</span>
          <div className="toolbar-spacer" />
          <Badge tone="blue">Open period {dateUk(ds.settings.lockCutoff)} → {dateUk(ds.settings.asOfDate)}</Badge>
        </div>
        <div className="metric-list" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
          <div className="metric"><span>Source rows</span><strong>{staging.length}</strong></div>
          <div className="metric"><span>Ready to add</span><strong>{ready.length}</strong></div>
          <div className="metric"><span>Duplicates (±1 day)</span><strong>{duplicateCount}</strong></div>
          <div className="metric"><span>Out of window</span><strong>{outsideCount}</strong></div>
        </div>
        {error && <div style={{ padding: 14 }}><div className="notice danger">{error}</div></div>}
        {staging.length > 0 ? (
          <>
            <div style={{ maxHeight: 460, overflow: 'auto' }}>
              <Table head={['Add?', 'Date', 'Description', 'Type', 'Amount', 'Flag']}>
                {staging.map((r) => (
                  <tr key={r.id} className={r.duplicateWith || r.outOfWindow ? 'locked' : ''}>
                    <td><input type="checkbox" checked={r.add} disabled={r.outOfWindow} onChange={() => toggle(r.id)} aria-label={`Add ${r.description}`} /></td>
                    <td className="muted nowrap">{dateUk(r.date)}</td>
                    <td>{r.description || '—'}</td>
                    <td>{r.type}</td>
                    <td className="num"><strong>{gbp(r.amountPence)}</strong></td>
                    <td>{r.duplicateWith === 'staged' ? <Badge tone="amber">Duplicate in file</Badge> : r.duplicateWith === 'existing' ? <Badge tone="amber">In log</Badge> : r.outOfWindow ? <Badge tone="red">Out of window</Badge> : <Badge tone="green">Ready</Badge>}</td>
                  </tr>
                ))}
              </Table>
            </div>
            <div className="toolbar" style={{ borderBottom: 0, borderTop: '1px solid var(--line)' }}>
              <span className="muted small">Duplicates are skipped by default; tick one only if it is a genuine second payment. Out-of-window rows cannot be added.</span>
              <div className="toolbar-spacer" />
              <button className="btn primary" disabled={ready.length === 0} onClick={commit}>Add {ready.length} to log</button>
            </div>
          </>
        ) : (
          <Empty>Load a CSV to build the review grid. Nothing is imported until you confirm.</Empty>
        )}
      </Section>

      <Section
        title="Secure bank linking"
        sub="Planned connection through a regulated Open Banking provider — CSV import remains available now"
        actions={<Badge tone="blue">Planned</Badge>}
      >
        <div style={{ padding: 16, display: 'grid', gap: 12 }}>
          <div className="notice info">
            <strong>FinanceHub will never ask for or store your bank password.</strong>{' '}
            Linking will use a browser consent flow with a regulated provider. Bank data stays read-only, and transactions are never posted until you review them.
          </div>
          <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 8, color: 'var(--muted)', fontSize: 12.5, lineHeight: 1.55 }}>
            <li><strong style={{ color: 'var(--text)' }}>Consent in your browser.</strong> The bank login happens with the bank or its provider, not inside FinanceHub.</li>
            <li><strong style={{ color: 'var(--text)' }}>Map one account.</strong> You choose which FinanceHub account receives the transactions.</li>
            <li><strong style={{ color: 'var(--text)' }}>Review before posting.</strong> Synced rows enter the same duplicate and out-of-window review grid as CSV imports.</li>
            <li><strong style={{ color: 'var(--text)' }}>Disconnect at any time.</strong> Revoking the connection removes provider access and stored tokens.</li>
          </ol>
          <p className="muted small" style={{ margin: 0 }}>
            The full provider, token, consent, revocation and test plan is in the product roadmap. Bank linking will be cloud-only until a secure desktop token broker exists; local-only mode keeps CSV import.
          </p>
        </div>
      </Section>
    </>
  );
}

/* ------------------------------------------------------------------ settings */

function nextAprilDate(asOfDate: string): string {
  const year = Number(asOfDate.slice(0, 4)) || new Date().getFullYear();
  const month = Number(asOfDate.slice(5, 7)) || 1;
  return `${month >= 4 ? year + 1 : year}-04-01`;
}

function nextMonthStart(asOfDate: string): string {
  const year = Number(asOfDate.slice(0, 4)) || new Date().getFullYear();
  const month = Number(asOfDate.slice(5, 7)) || 1;
  return month === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 1).padStart(2, '0')}-01`;
}

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

function CredentialVault({ ds, update, notify, vault, vaultSession, setVault, setVaultSession }: Pick<ViewProps, 'ds' | 'update' | 'notify' | 'vault' | 'vaultSession' | 'setVault' | 'setVaultSession'>) {
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

export function SettingsView({ ds, update, notify, theme, setTheme, engine, go, userId, userEmail, isLocal, signOut, localAccount, workspace, vault, appLock, setAppLock, vaultSession, setVault, setVaultSession, syncConflicts, resolveSyncConflict, exportSyncConflict, year, setYear }: ViewProps) {
  const [acct, setAcct] = useState({ name: '', target: '', opening: '' });
  const [person, setPerson] = useState({ short: '', full: '', opening: '' });
  const [card, setCard] = useState({ name: '', limit: '', opening: '' });
  const [change, setChange] = useState({ bill: ds.bills[0]?.name ?? '', from: '', to: '', amount: '', due: '', type: '', note: '' });
  const [rentChange, setRentChange] = useState(() => ({
    amount: typeof ds.providers.rent?.monthlyRentPence === 'number' ? (ds.providers.rent.monthlyRentPence / 100).toFixed(2) : '',
    payment: typeof ds.providers.rent?.monthlyPaymentPence === 'number' ? (ds.providers.rent.monthlyPaymentPence / 100).toFixed(2) : '',
    from: nextAprilDate(ds.settings.asOfDate),
  }));
  const [waterChange, setWaterChange] = useState(() => ({
    payment: typeof ds.providers.water?.monthlyPaymentPence === 'number' ? (ds.providers.water.monthlyPaymentPence / 100).toFixed(2) : '',
    from: nextMonthStart(ds.settings.asOfDate),
  }));
  const restoreInput = useRef<HTMLInputElement>(null);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const duplicateScan = duplicateGroups(ds.transactions.filter((t) => t.autoBill !== true));

  const primaryAccount = ds.settings.primaryAccount || ds.accounts[0]?.name || '';
  const rentProvider = ds.providers.rent;
  const rentMonthlyDraft = parseMoney(rentChange.amount);
  const rentPaymentDraft = parseMoney(rentChange.payment);
  const rentWeeklyDraft = weeklyRentPence(rentMonthlyDraft);
  const rentTargets = rentProvider && rentChange.from
    ? rentChangeTargets((rentProvider.entries ?? []) as any[], ds.settings.asOfDate, rentChange.from)
    : [];
  const rentPaymentRows = rentProvider && rentChange.from
    ? rentPaymentTargets((rentProvider.entries ?? []) as any[], ds.settings.asOfDate, rentChange.from)
    : [];
  const waterProvider = ds.providers.water;
  const waterPaymentDraft = parseMoney(waterChange.payment);
  const waterPaymentRows = waterProvider && waterChange.from
    ? waterPaymentTargets(waterProvider, ds.settings.asOfDate, waterChange.from)
    : [];
  const nameExists = (name: string, old?: string) =>
    ds.accounts.some((a) => a.name === name && a.name !== old)
    || ds.people.some((p) => p.shortName === name && p.shortName !== old)
    || ds.cards.some((c) => c.name === name && c.name !== old);

  const addAccount = () => {
    const name = acct.name.trim();
    if (!name) return notify('Give the account a name');
    if (ds.accounts.some((a) => a.name === name)) return notify('An account with that name already exists');
    update((d) => d.accounts.push({ name, targetPence: parseMoney(acct.target), openingPence: parseMoney(acct.opening), sortOrder: d.accounts.length + 1, active: true }));
    setAcct({ name: '', target: '', opening: '' });
    notify(`${name} added everywhere`);
  };

  const renameAccount = (oldName: string, newName: string) => {
    if (nameExists(newName, oldName)) return notify('That name is already used by an account, person or card');
    update((d) => {
      const a = d.accounts.find((x) => x.name === oldName);
      if (!a) return;
      a.name = newName;
      d.transactions.forEach((t) => { if (t.account === oldName) t.account = newName; });
      if (d.settings.primaryAccount === oldName) d.settings.primaryAccount = newName;
    });
    notify(`${oldName} renamed to ${newName}`);
  };

  const removeAccount = (name: string) => {
    const isPrimary = name === primaryAccount;
    const used = ds.transactions.filter((t) => t.account === name).length;
    const other = ds.accounts.find((a) => a.name !== name)?.name ?? '';
    if (isPrimary && !other) return notify('Add another account before removing the main account');
    const destination = isPrimary ? other : ds.accounts.some((a) => a.name === primaryAccount) ? primaryAccount : other;
    if (used > 0 && !destination) return notify('Add another account before removing this one');
    const detail = used ? ` ${used} transactions will move to ${destination}.` : '';
    if (!confirm(`Remove ${name}?${detail}`)) return;
    update((d) => {
      if (used) d.transactions.forEach((t) => { if (t.account === name) t.account = destination; });
      d.accounts = d.accounts.filter((a) => a.name !== name);
      if (isPrimary) d.settings.primaryAccount = destination;
    });
    notify(`${name} removed${used ? ` — ledger moved to ${destination}` : ''}`);
  };

  const addPerson = () => {
    const short = person.short.trim();
    if (!short) return notify('Give the person a short name');
    if (ds.people.some((p) => p.shortName === short)) return notify('That person already exists');
    update((d) => d.people.push({ shortName: short, fullName: person.full.trim() || short, openingPence: parseMoney(person.opening), sortOrder: d.people.length + 1, active: true }));
    setPerson({ short: '', full: '', opening: '' });
    notify(`${short} added everywhere`);
  };

  const renamePerson = (oldName: string, newName: string) => {
    if (nameExists(newName, oldName)) return notify('That name is already used by an account, person or card');
    update((d) => {
      const p = d.people.find((x) => x.shortName === oldName);
      if (!p) return;
      p.shortName = newName;
      d.transactions.forEach((t) => { if (t.account === oldName) t.account = newName; });
    });
    renamePortalPerson(userId, oldName, newName);
    notify(`${oldName} renamed to ${newName}`);
  };

  const removePerson = (name: string) => {
    const used = ds.transactions.filter((t) => t.account === name).length;
    if (used > 0 && !confirm(`${name} has ${used} ledger rows. Removing the person leaves those rows in the transaction log but they will no longer count towards anyone. Remove ${name}?`)) return;
    update((d) => { d.people = d.people.filter((p) => p.shortName !== name); });
    deletePortalsForPerson(userId, name);
    notify(`${name} removed${used ? ` — ${used} ledger rows kept` : ''}`);
  };

  const addCard = () => {
    const name = card.name.trim();
    if (!name) return notify('Give the card a name');
    if (ds.cards.some((c) => c.name === name)) return notify('That card already exists');
    update((d) => d.cards.push({ name, limitPence: parseMoney(card.limit), openingPence: parseMoney(card.opening), sortOrder: d.cards.length + 1, active: true }));
    setCard({ name: '', limit: '', opening: '' });
    notify(`${name} added everywhere`);
  };

  const removeCard = (name: string) => {
    const used = ds.transactions.filter((t) => t.account === name).length;
    if (used > 0) return notify(`${name} has ${used} transactions — deactivate instead`);
    if (!confirm(`Remove ${name}?`)) return;
    update((d) => { d.cards = d.cards.filter((c) => c.name !== name); });
  };

  const applyRentChange = () => {
    if (!rentProvider) return notify('No Rent ledger is loaded');
    if (!rentChange.from) return notify('Choose the date the new rent starts');
    if (rentMonthlyDraft <= 0) return notify('Enter a monthly rent above zero');
    if (!confirm(
      `Change the monthly rent to ${gbp(rentMonthlyDraft)} from ${dateUk(rentChange.from)}?\n\n`
      + `The weekly charge will be ${gbp(rentWeeklyDraft)}. ${rentTargets.length} future Rent Charge row${rentTargets.length === 1 ? '' : 's'} will update; `
      + `entries on or before ${dateUk(ds.settings.asOfDate)} stay unchanged.`,
    )) return;
    update((d) => {
      applyMonthlyRentChange(d.providers.rent, d.settings.asOfDate, rentMonthlyDraft, rentChange.from);
    });
    setRentChange({ ...rentChange, amount: (rentMonthlyDraft / 100).toFixed(2) });
    notify(rentTargets.length
      ? `Rent updated — ${rentTargets.length} future weekly charge${rentTargets.length === 1 ? '' : 's'} changed`
      : 'Rent updated — no future weekly charges matched');
  };

  const applyRentPaymentChange = () => {
    if (!rentProvider) return notify('No Rent ledger is loaded');
    if (!rentChange.from) return notify('Choose the date the new payment starts');
    if (rentPaymentDraft <= 0) return notify('Enter a monthly payment above zero');
    if (!confirm(
      `Change the monthly Rent payment to ${gbp(rentPaymentDraft)} from ${dateUk(rentChange.from)}?\n\n`
      + `${rentPaymentRows.length} future rent payment row${rentPaymentRows.length === 1 ? '' : 's'} will update. `
      + 'Earlier payment rows and earlier Rent bill months stay unchanged.',
    )) return;
    update((d) => {
      applyMonthlyPaymentChange(d.providers.rent, d.settings.asOfDate, rentPaymentDraft, rentChange.from);
      const rentBill = d.bills.find((bill) => bill.name === 'Rent');
      if (rentBill) {
        rentBill.baseAmountPence = rentPaymentDraft;
        rentBill.amountPence = rentPaymentDraft;
      }
    });
    setRentChange({ ...rentChange, payment: (rentPaymentDraft / 100).toFixed(2) });
    notify(rentPaymentRows.length
      ? `Rent payment updated — ${rentPaymentRows.length} future payment row${rentPaymentRows.length === 1 ? '' : 's'} changed`
      : 'Rent payment updated — no future payment rows matched');
  };

  const applyWaterPayment = () => {
    if (!waterProvider) return notify('No Water sheet is loaded');
    if (!waterChange.from) return notify('Choose the date the new Water payment starts');
    if (waterPaymentDraft <= 0) return notify('Enter a monthly Water payment above zero');
    if (!confirm(
      `Change the monthly Water payment to ${gbp(waterPaymentDraft)} from ${dateUk(waterChange.from)}?\n\n`
      + `${waterPaymentRows.length} Water statement month${waterPaymentRows.length === 1 ? '' : 's'} will update. `
      + 'Earlier statement months and zero-payment months stay unchanged.',
    )) return;
    update((d) => {
      applyWaterPaymentChange(d.providers.water, d.settings.asOfDate, waterPaymentDraft, waterChange.from);
      const waterBill = d.bills.find((bill) => bill.name === 'Water');
      if (waterBill) {
        waterBill.baseAmountPence = waterPaymentDraft;
        waterBill.amountPence = waterPaymentDraft;
      }
    });
    setWaterChange({ ...waterChange, payment: (waterPaymentDraft / 100).toFixed(2) });
    notify(waterPaymentRows.length
      ? `Water payment updated — ${waterPaymentRows.length} statement month${waterPaymentRows.length === 1 ? '' : 's'} changed`
      : 'Water payment updated — future Water bills will use the new amount');
  };

  const addChange = () => {
    if (!change.bill) return notify('Choose a bill');
    update((d) => d.billChanges.push({
      bill: change.bill,
      appliesFrom: change.from,
      appliesTo: change.to,
      amountOverridePence: change.amount.trim() ? parseMoney(change.amount) : null,
      dueDateOverride: change.due,
      changeType: change.type,
      note: change.note,
    }));
    setChange({ ...change, from: '', to: '', amount: '', due: '', type: '', note: '' });
    notify('Bill change added');
  };

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
        actions={<Badge tone={syncConflicts.length ? 'amber' : 'green'}>{syncConflicts.length ? `${syncConflicts.length} to review` : 'None'}</Badge>}
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

      <Section title="Appearance" sub="Theme preference is stored on this device">
        <div className="tabs" style={{ borderBottom: 0 }}>
          <button className={`tab ${theme === 'dark' ? 'active' : ''}`} onClick={() => setTheme('dark')}>🌙 Dark</button>
          <button className={`tab ${theme === 'light' ? 'active' : ''}`} onClick={() => setTheme('light')}>☀ Light</button>
        </div>
      </Section>

      <MenuLayoutSection ds={ds} update={update} notify={notify} />

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

      <Section title="Bank accounts" sub="Edit a name in place (Enter saves, Esc cancels); removing an account moves its transactions to the main account">
        <Table head={['Name', 'Target £', 'Opening £', 'Sort', 'Active', '']} numHead={[1, 2, 3]}>
          {ds.accounts.map((a, i) => (
            <tr key={a.name}>
              <td><EditableName value={a.name} onCommit={(next) => renameAccount(a.name, next)} ariaLabel={`Account name ${a.name}`} /></td>
              <td className="num"><input className="table-input" inputMode="decimal" value={(a.targetPence / 100).toFixed(2)} onChange={(e) => update((d) => { d.accounts[i].targetPence = parseMoney(e.target.value); })} /></td>
              <td className="num"><input className="table-input" inputMode="decimal" value={(a.openingPence / 100).toFixed(2)} onChange={(e) => update((d) => { d.accounts[i].openingPence = parseMoney(e.target.value); })} /></td>
              <td className="num muted">{a.sortOrder}</td>
              <td><input type="checkbox" checked={a.active} onChange={(e) => update((d) => { d.accounts[i].active = e.target.checked; })} /></td>
              <td><button className="btn ghost sm" onClick={() => removeAccount(a.name)}>Remove</button></td>
            </tr>
          ))}
        </Table>
        <div className="inline-form">
          <Field label="New account"><input className="input" placeholder="Name" value={acct.name} onChange={(e) => setAcct({ ...acct, name: e.target.value })} /></Field>
          <Field label="Target £"><input className="input" inputMode="decimal" value={acct.target} onChange={(e) => setAcct({ ...acct, target: e.target.value })} /></Field>
          <Field label="Opening £"><input className="input" inputMode="decimal" value={acct.opening} onChange={(e) => setAcct({ ...acct, opening: e.target.value })} /></Field>
          <button className="btn primary" onClick={addAccount}>Add account</button>
        </div>
      </Section>

      <Section title="People" sub="Edit names in place; removing someone keeps their ledger rows but stops counting them as owed">
        <Table head={['Short name', 'Full name', 'Opening £', 'Active', '']} numHead={[2]}>
          {ds.people.map((p, i) => (
            <tr key={p.shortName}>
              <td><EditableName value={p.shortName} onCommit={(next) => renamePerson(p.shortName, next)} ariaLabel={`Short name ${p.shortName}`} /></td>
              <td><EditableName value={p.fullName} onCommit={(next) => update((d) => { d.people[i].fullName = next; })} ariaLabel={`Full name ${p.fullName}`} /></td>
              <td className="num"><input className="table-input" inputMode="decimal" value={(p.openingPence / 100).toFixed(2)} onChange={(e) => update((d) => { d.people[i].openingPence = parseMoney(e.target.value); })} /></td>
              <td><input type="checkbox" checked={p.active} onChange={(e) => update((d) => { d.people[i].active = e.target.checked; })} /></td>
              <td><button className="btn ghost sm" onClick={() => removePerson(p.shortName)}>Remove</button></td>
            </tr>
          ))}
        </Table>
        <div className="inline-form">
          <Field label="Short name"><input className="input" value={person.short} onChange={(e) => setPerson({ ...person, short: e.target.value })} /></Field>
          <Field label="Full name"><input className="input" value={person.full} onChange={(e) => setPerson({ ...person, full: e.target.value })} /></Field>
          <Field label="Opening £"><input className="input" inputMode="decimal" value={person.opening} onChange={(e) => setPerson({ ...person, opening: e.target.value })} /></Field>
          <button className="btn primary" onClick={addPerson}>Add person</button>
        </div>
      </Section>

      <PeopleAccessSection ds={ds} userId={userId} notify={notify} workspace={workspace} />

      <Section title="Credit cards" sub="Limits and opening balances">
        <Table head={['Card', 'Limit £', 'Opening £', 'Active', '']} numHead={[1, 2]}>
          {ds.cards.map((c, i) => (
            <tr key={c.name}>
              <td><strong>{c.name}</strong></td>
              <td className="num"><input className="table-input" inputMode="decimal" value={(c.limitPence / 100).toFixed(2)} onChange={(e) => update((d) => { d.cards[i].limitPence = parseMoney(e.target.value); })} /></td>
              <td className="num"><input className="table-input" inputMode="decimal" value={(c.openingPence / 100).toFixed(2)} onChange={(e) => update((d) => { d.cards[i].openingPence = parseMoney(e.target.value); })} /></td>
              <td><input type="checkbox" checked={c.active} onChange={(e) => update((d) => { d.cards[i].active = e.target.checked; })} /></td>
              <td><button className="btn ghost sm" onClick={() => removeCard(c.name)}>Remove</button></td>
            </tr>
          ))}
        </Table>
        <div className="inline-form">
          <Field label="New card"><input className="input" value={card.name} onChange={(e) => setCard({ ...card, name: e.target.value })} /></Field>
          <Field label="Limit £"><input className="input" inputMode="decimal" value={card.limit} onChange={(e) => setCard({ ...card, limit: e.target.value })} /></Field>
          <Field label="Opening £"><input className="input" inputMode="decimal" value={card.opening} onChange={(e) => setCard({ ...card, opening: e.target.value })} /></Field>
          <button className="btn primary" onClick={addCard}>Add card</button>
        </div>
      </Section>

      {rentProvider && (
        <Section title="Rent" sub="Change the monthly rent or payment from the chosen date; passed history stays intact">
          <div className="inline-form">
            <Field label="Monthly rent £" hint={`Current ${gbp(rentProvider.monthlyRentPence)}`}>
              <input
                className="input"
                aria-label="Monthly rent"
                inputMode="decimal"
                value={rentChange.amount}
                onChange={(e) => setRentChange({ ...rentChange, amount: e.target.value })}
              />
            </Field>
            <Field label="Apply from" hint="Passed and zero/free-week rows stay untouched">
              <input
                className="input"
                aria-label="Rent change effective date"
                type="date"
                value={rentChange.from}
                onChange={(e) => setRentChange({ ...rentChange, from: e.target.value })}
              />
            </Field>
            <button className="btn primary" onClick={applyRentChange}>Update future rent</button>
          </div>
          <div className="notice info" style={{ margin: '0 16px 12px' }}>
            Weekly charge will be <strong>{gbp(rentWeeklyDraft)}</strong> (monthly rent ÷ 4).{' '}
            {rentTargets.length} future Rent Charge row{rentTargets.length === 1 ? '' : 's'} will update.
            <div className="muted small" style={{ marginTop: 4 }}>
              Entries on or before As-Of {dateUk(ds.settings.asOfDate)} and zero/free-week rows are retained.
            </div>
          </div>
          <div className="inline-form" style={{ borderTop: '1px solid var(--border)' }}>
            <Field label="Monthly payment £" hint={`Current ${gbp(rentProvider.monthlyPaymentPence)}`}>
              <input
                className="input"
                aria-label="Monthly payment"
                inputMode="decimal"
                value={rentChange.payment}
                onChange={(e) => setRentChange({ ...rentChange, payment: e.target.value })}
              />
            </Field>
            <button className="btn primary" onClick={applyRentPaymentChange}>Update future payment</button>
          </div>
          <div className="notice info" style={{ margin: '0 16px 16px' }}>
            Payment will be <strong>{gbp(rentPaymentDraft)}</strong> from {dateUk(rentChange.from)}.{' '}
            {rentPaymentRows.length} future rent payment row{rentPaymentRows.length === 1 ? '' : 's'} will update.
            <div className="muted small" style={{ marginTop: 4 }}>
              The payment card updates now; the Rent bill applies from this date. Earlier payment rows, zero-payment months, and earlier bill months are retained.
            </div>
          </div>
        </Section>
      )}

      {waterProvider && (
        <Section title="Water" sub="Change the monthly payment from a chosen date; earlier statement months stay intact">
          <div className="inline-form">
            <Field label="Monthly payment £" hint={`Current ${gbp(waterProvider.monthlyPaymentPence)}`}>
              <input
                className="input"
                aria-label="Water monthly payment"
                inputMode="decimal"
                value={waterChange.payment}
                onChange={(e) => setWaterChange({ ...waterChange, payment: e.target.value })}
              />
            </Field>
            <Field label="Apply from" hint="Earlier and zero-payment months stay untouched">
              <input
                className="input"
                aria-label="Water payment effective date"
                type="date"
                value={waterChange.from}
                onChange={(e) => setWaterChange({ ...waterChange, from: e.target.value })}
              />
            </Field>
            <button className="btn primary" onClick={applyWaterPayment}>Update future Water payment</button>
          </div>
          <div className="notice info" style={{ margin: '0 16px 16px' }}>
            Payment will be <strong>{gbp(waterPaymentDraft)}</strong> from {dateUk(waterChange.from)}.{' '}
            {waterPaymentRows.length} current-year Water statement month{waterPaymentRows.length === 1 ? '' : 's'} will update.
            <div className="muted small" style={{ marginTop: 4 }}>
              The monthly payment card updates now; earlier statement months and zero-payment months are retained. Future Water bills use the new amount from this date.
            </div>
          </div>
        </Section>
      )}

      <Section title="Bill changes" sub="Bill definitions and link sheets live in Bills. Add one-off or dated overrides here.">
        <Table head={['Bill', 'From', 'To', 'Amount', 'Due override', 'Due day', 'Type', 'Note', '']} numHead={[3]}>
          {ds.billChanges.map((c, i) => (
            <tr key={i}>
              <td>{c.bill}</td>
              <td className="muted">{dateUk(c.appliesFrom)}</td>
              <td className="muted">{dateUk(c.appliesTo)}</td>
              <td className="num">{c.amountOverridePence === null ? '—' : gbp(c.amountOverridePence)}</td>
              <td className="muted">{c.dueDateOverride ? dateUk(c.dueDateOverride) : '—'}</td>
              <td className="muted">{typeof c.dueDayOverride === 'number' ? `Day ${c.dueDayOverride}` : '—'}</td>
              <td className="muted small">{c.skip ? `Removed${c.changeType ? ` — ${c.changeType}` : ''}` : c.changeType || '—'}</td>
              <td className="muted small">{c.note || '—'}</td>
              <td><button className="btn ghost sm" onClick={() => update((d) => { d.billChanges.splice(i, 1); })}>Remove</button></td>
            </tr>
          ))}
        </Table>
        <div className="inline-form">
          <Field label="Bill">
            <select className="select" value={change.bill} onChange={(e) => setChange({ ...change, bill: e.target.value })}>
              {ds.bills.map((b) => <option key={b.name} value={b.name}>{b.name}</option>)}
            </select>
          </Field>
          <Field label="Applies from"><input className="input" type="date" value={change.from} onChange={(e) => setChange({ ...change, from: e.target.value })} /></Field>
          <Field label="Applies to"><input className="input" type="date" value={change.to} onChange={(e) => setChange({ ...change, to: e.target.value })} /></Field>
          <Field label="Amount £"><input className="input" inputMode="decimal" value={change.amount} onChange={(e) => setChange({ ...change, amount: e.target.value })} /></Field>
          <Field label="Due override"><input className="input" type="date" value={change.due} onChange={(e) => setChange({ ...change, due: e.target.value })} /></Field>
          <Field label="Type"><input className="input" value={change.type} onChange={(e) => setChange({ ...change, type: e.target.value })} /></Field>
          <button className="btn primary" onClick={addChange}>Add change</button>
        </div>
      </Section>

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

      <Section title="About & legal" sub="Ownership, copyright, trademark and the documents that govern your use of FinanceHub">
        <div style={{ padding: 16, display: 'grid', gap: 10 }}>
          <div><strong>FinanceHub™</strong> <span className="muted small">· version {LEGAL_VERSION}</span></div>
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

      <Section
        title="Duplicate check"
        sub="Read-only: transactions that share the same date, account, type and amount. Nothing is deleted here."
        actions={<Badge tone={duplicateScan.length ? 'amber' : 'green'}>{duplicateScan.length ? `${duplicateScan.length} groups` : 'None found'}</Badge>}
      >
        {duplicateScan.length === 0 ? (
          <div style={{ padding: 16 }}><Empty>No duplicate groups in this budget.</Empty></div>
        ) : (
          <>
            <div className="toolbar" style={{ borderBottom: 0 }}>
              <span className="muted small">
                {duplicateScan.reduce((sum, group) => sum + group.rows.length, 0)} rows across {duplicateScan.length} groups. Review them in Transactions; the report never changes the ledger.
              </span>
              <div className="toolbar-spacer" />
              <button className="btn" onClick={() => setShowDuplicates((value) => !value)}>
                {showDuplicates ? 'Hide groups' : 'Show groups'}
              </button>
            </div>
            {showDuplicates && (
              <Table head={['Date', 'Account', 'Type', 'Amount', 'Rows', 'Descriptions']} numHead={[3, 4]}>
                {duplicateScan.map((group) => (
                  <tr key={group.key}>
                    <td className="muted nowrap">{dateUk(group.date)}</td>
                    <td>{group.account}</td>
                    <td>{group.type}</td>
                    <td className="num">{gbp(group.amountPence)}</td>
                    <td className="num">{group.rows.length}</td>
                    <td className="muted small">{group.rows.map((row) => row.comments?.trim() || '—').join(' · ')}</td>
                  </tr>
                ))}
              </Table>
            )}
          </>
        )}
      </Section>
    </>
  );
}

/* ------------------------------------------------------------------ changelog / guides */

export function ChangelogView({ ds, update, notify }: ViewProps) {
  const [q, setQ] = useState('');
  const [customOpen, setCustomOpen] = useState(false);
  const [custom, setCustom] = useState({ date: todayIso(), title: '', description: '' });
  const all = ds.changelog ?? [];
  const entries = all.filter((c: any) => {
    const details = Array.isArray(c.details) ? c.details.join(' ') : '';
    return !q || `${c.date} ${c.sheetCell} ${c.description} ${details}`.toLowerCase().includes(q.toLowerCase());
  });

  const addCustom = () => {
    const title = custom.title.trim() || 'Custom change';
    const description = custom.description.trim() || title;
    update((d) => {
      d.changelog = [{
        date: custom.date || todayIso(),
        sheetCell: title,
        description,
        custom: true,
        at: new Date().toISOString(),
      }, ...(d.changelog ?? [])];
    });
    setCustom({ date: todayIso(), title: '', description: '' });
    setCustomOpen(false);
    notify('Custom change added to the changelog');
  };

  return (
    <Section
      title="Budget changelog"
      sub={`${entries.length} of ${all.length} budget changes, newest first — app releases are in Application changelog`}
      actions={<button className="btn primary" onClick={() => setCustomOpen((open) => !open)}>{customOpen ? 'Cancel' : 'Add custom change'}</button>}
    >
      <div className="notice info" style={{ margin: 12 }}>
        This history contains budget data only. Editing a preference such as the menu layout creates no entry,
        and app release notes are kept separately in <strong>Application changelog</strong>.
      </div>
      <div className="toolbar">
        <input className="input" placeholder="Search changes…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {customOpen && (
        <div className="inline-form" style={{ alignItems: 'flex-end' }}>
          <Field label="Date"><input className="input" aria-label="Custom change date" type="date" value={custom.date} onChange={(e) => setCustom({ ...custom, date: e.target.value })} /></Field>
          <Field label="Title"><input className="input" aria-label="Custom change title" placeholder="e.g. Reconciled October" value={custom.title} onChange={(e) => setCustom({ ...custom, title: e.target.value })} /></Field>
          <Field label="Details"><input className="input" aria-label="Custom change details" placeholder="What changed?" value={custom.description} onChange={(e) => setCustom({ ...custom, description: e.target.value })} /></Field>
          <button className="btn primary" onClick={addCustom}>Add change</button>
        </div>
      )}
      <div className="list">
        {entries.map((c: any, i: number) => (
          <div className="list-row" key={i}>
            <div style={{ minWidth: 0 }}>
              <div className="title">{c.sheetCell || 'Workbook'} {c.auto ? <Badge tone="blue">Auto</Badge> : c.custom ? <Badge tone="neutral">Custom</Badge> : null}</div>
              <div className="sub">{c.description}</div>
              {Array.isArray(c.details) && c.details.length > 0 && (
                <div className="sub" style={{ marginTop: 4, display: 'grid', gap: 2 }}>
                  {c.details.map((line: string, detailIndex: number) => <span key={detailIndex}>{line}</span>)}
                </div>
              )}
            </div>
            <span className="muted small nowrap">{dateUk(c.date) !== '—' ? dateUk(c.date) : c.date}</span>
          </div>
        ))}
      </div>
      {entries.length === 0 && <Empty>No entries match that search.</Empty>}
    </Section>
  );
}

const APP_MONTH_END_GUIDE = [
  '📋  MONTH-END GUIDE',
  'How to reconcile, close and lock a month in FinanceHub (updated November 2026)',
  'BEFORE YOU CLOSE',
  'Reconcile first. Check every bank account, card and person against its statement or record. Correct anything missing or wrong before locking.',
  'Update the ledger. Post missing transactions, bill changes and provider-sheet entries. The month-end lock records the close; it does not repair an incomplete month.',
  'Leave the Balance Anchor Date unchanged. It is a fixed calibration date for the balance engine, not a month-end control.',
  'Select the month you are closing from the month selector at the top, or click it in Year at a glance on the Dashboard.',
  'Set the As-of date in Settings to the last day of that month. The Dashboard will not enable Lock until As-of is on or after month end; only change it once the month is genuinely complete.',
  'CONFIRM AND LOCK — DASHBOARD',
  'Step — What to do — Where',
  '1 — Review Expected bank balance, Card balance, Owed to me and Bills this month. — Dashboard → Month end',
  '2 — Check every Bank, Card and Person row in the balance table. These are the figures stored in the close snapshot. — Dashboard → Month end',
  '3 — Tick “I have checked these balances against my bank, cards and people records.” — Dashboard → Month end',
  '4 — Add a reconciliation note for a statement check, variance or anything you need to remember. — Dashboard → Month end',
  '5 — Click Lock [Month] [Year]. The topbar and Dashboard should both show 🔒 Locked. — Dashboard → Month end',
  'WHAT THE LOCK DOES',
  '• Income, Expenses, Net and Owed are frozen at the confirmed values, and Monthly reads from the saved snapshot.',
  '• The snapshot stores every bank, card and person balance, plus the scheduled bills for the month.',
  '• A detailed Auto entry is written to the Changelog with totals, accounts, cards, people, every bill and your note.',
  '• The lock is stored on this device and is included in Export full backup (JSON). It is a FinanceHub close snapshot, not an Excel protection flag.',
  '• Once locked, you can set As-of back to today if you prefer. The month remains locked; the rest of the app can return to the current date.',
  'CHANGELOG AND UNLOCKING',
  'Open Tools → Changelog to see “Month end closed — [Month] [Year]”. Search matches the month, account, card, person and bill lines.',
  'Unlock this month on Dashboard → Month end removes the local snapshot and lets the month recalculate. The Changelog records “Month end reopened” with the snapshot that was removed.',
  'IMPORTED WORKBOOK LOCKS',
  'January–October 2026 are already locked by the imported workbook. They show “Locked by the imported workbook” and cannot be unlocked in FinanceHub; they are the parity reference months.',
  'A local month locked before the detailed changelog update has no bill lines in its entry. Unlock and relock it to create the full record.',
  'IF SOMETHING LOOKS WRONG',
  '• Lock is disabled — set As-of to the month-end date or later in Settings. Do not use a future date until the month is actually finished.',
  '• A balance is wrong — correct the ledger or the underlying record before locking. Unlocking removes the close snapshot but keeps the underlying data.',
  '• A bill amount is wrong — check Bills and the relevant provider sheet first. Month end records the scheduled bill amounts, not payments already made.',
  '• A prior close needs checking — open Changelog and search for the month name, account or bill.',
];

const APP_NEW_YEAR_GUIDE = [
  '🗓️  NEW-YEAR SETUP GUIDE',
  'How to move FinanceHub into a new budget year (updated November 2026)',
  'CHOOSE YOUR PATH',
  'FinanceHub keeps one continuous ledger per budget. Choose the path that matches what you want before changing any settings.',
  '• Roll forward — keep the current accounts, people, cards, transactions, locks and provider history. Use this when the new year continues from the December close in the same budget.',
  '• Start clean — create a separate new-year budget with fresh opening balances. Use this when you want a standalone year, a handover, or fresh provider statements.',
  'BEFORE EITHER PATH',
  'Finish December first. Reconcile every account, card and person, then close December from Dashboard → Month end. The close snapshot is the source for your opening balances.',
  'Export a full backup from Settings → Data & backups before making changes. Keep it with the finished-year records.',
  'PATH A — ROLL THE CURRENT BUDGET FORWARD',
  '1 — Open Settings → Year rollover and move the target year forward, or set the target year in Settings → Core settings.',
  '2 — For a continuous ledger, leave Balance anchor date and every opening balance unchanged. FinanceHub calculates balances from the original anchor across the whole ledger. To start the new year from the 31 December close instead, tick Carry over balances in Settings → Year rollover: it records a year-opening checkpoint without deleting earlier rows, so the same history is not counted twice.',
  '3 — Set As-of date to the date you have actually reconciled to. Move it forward only when the matching records exist.',
  '4 — Leave past month locks alone. They are stored by year and month and are not recalculated when the target year changes.',
  '5 — Change the top-bar year to a future year and review Bills. Amount, due-day and remove edits there create a plan for that year only; the base definitions and earlier years stay untouched. Use a dated Bill change in Settings → Bill changes for a one-off month or a range that is not a whole year. The latest matching change wins.',
  '6 — Review the link sheets under Bills. A provider-linked sheet keeps its provider lookup when renamed; a custom sheet is a label and uses the bill’s base amount. Add, rename or remove sheets in Bills.',
  '7 — Provider ledgers keep each year in its own block. Choose a future year in the top bar to add, amend or remove that year’s rows and balance anchors without touching the live year. Editing any year carries its new closing balance into the next block and recalculates the rest of the chain; use Recalculate later years on a provider to rebuild every saved block from the live close on demand. Carry over balances rotates a future block into the live ledger and keeps the old year read-only. A provider-linked bill reads the block for the selected year.',
  '8 — Add new-year transactions through Import or Transactions. Imports never post until you confirm them, and locked months reject new rows.',
  'PATH B — START A CLEAN NEW-YEAR BUDGET',
  '1 — Open Settings → Onboarding & reset → Open Guided setup.',
  '2 — In Budget basics, set the new Budget year, As-of date and Balance anchor date. If the opening balances are the 31 December close, use 31 December as the anchor.',
  '3 — In Start from a clean slate, enter the main account and its opening balance, then choose Start blank budget. A JSON backup downloads before accounts, people, cards, bills, transactions, holidays and provider ledgers are cleared.',
  '4 — Add the remaining accounts, people and cards. Use the confirmed 31 December closing balances as the new opening balances. Do not import last year’s transactions into the new budget.',
  '5 — Open Bills to add the new year’s bills and link sheets, and Settings → Bill changes for dated changes. A clean budget has no provider history, so a provider-linked bill uses its base amount; a custom sheet is the simplest label.',
  '6 — Import the first new-year bank CSV or add transactions manually. The opening balance belongs in the account record, not in a transaction.',
  'BILLS, INCOME AND BALANCES',
  '• Base amount changes apply to every open month unless a dated Bill change overrides them. Use 1 January changes to preserve the finished year.',
  '• Account, card and person balances are cumulative from the anchor date; changing Target year does not reset them.',
  '• In a rolled-forward budget, PIP and UC scheduled income comes from the imported schedule. Use Income to review or update the dates and amounts; a clean budget starts with no schedule, so add the first payments there. Locked months keep their saved close totals.',
  '• A locked month is a saved close snapshot. Unlocking and relocking it is the only supported way to recalculate it.',
  'FINISH AND VERIFY',
  '1 — Check Dashboard for the new year: month, income, expenses, net, account balances, cards, people and scheduled bills should all make sense.',
  '2 — Open Monthly for January and a later month. Confirm every expected bill and income line; a missing bill change or link sheet shows up here.',
  '3 — Open Bills in the new target year and confirm every bill has the right amount, due day, method, link sheet and active state. For a future year, switch the top-bar year and use its bill plan before rolling over.',
  '4 — Export another full backup from Settings → Data & backups for the new year.',
  '5 — Use Changelog → Add custom change to record “New-Year setup — [year]” and whether you rolled forward or started clean.',
  'IF SOMETHING LOOKS WRONG',
  '• Balances doubled — the anchor or opening balances were changed in a continuous budget. Stop and correct them before making more edits; an exported JSON is a record, not an in-app restore.',
  '• Last year changed — Target year is a view, but Bill changes and provider rows are dated. Check those before assuming history was rewritten.',
  '• A bill is missing — check Active and Effective from in Bills, then the month and any matching Bill change.',
  '• January is locked — a lock belongs to a specific year and month. Unlock it from Dashboard → Month end only if the close is genuinely wrong.',
  '• The original workbook is needed — Settings → Data & backups → Reset to imported workbook discards local edits and restores the imported workbook.',
];

function GuideEntryCard({ entry }: { key?: string; entry: GuideEntry }) {
  return (
    <article className="guide-entry" id={`guide-${entry.id}`}>
      <h4>{entry.title}</h4>
      <p>{entry.summary}</p>
      <ol>
        {entry.steps.map((step, index) => <li key={index}>{step}</li>)}
      </ol>
      {entry.notes && entry.notes.length > 0 && (
        <ul className="guide-notes">
          {entry.notes.map((note, index) => <li key={index}>{note}</li>)}
        </ul>
      )}
    </article>
  );
}

const GUIDE_GROUPS: GuideEntry['group'][] = ['Basics', 'Overview', 'Ledger', 'Providers', 'Tools'];

function UserGuideBook() {
  const all = [...GUIDE_BASICS, ...USER_GUIDE];
  const jump = (id: string) => document.getElementById(`guide-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return (
    <div className="guide-book">
      <div className="guide-intro">
        <h3>FinanceHub, end to end</h3>
        <p>
          Every screen reads the same budget document: accounts, income, bills, transactions, people, cards, holidays
          and provider ledgers all feed one calculation engine. Open months recalculate as you edit; a locked month is a
          saved close that never moves until you deliberately unlock it.
        </p>
        <p>
          The sidebar groups the app into Overview, Ledger, Providers and Tools. Hover or focus any entry for a one-line
          reminder, hover a group title for its purpose, or press <span className="kbd">Ctrl</span>
          <span className="kbd">K</span> to jump anywhere. Settings → Menu layout decides what is visible and which section
          it sits in — except Tools, which is always fixed.
        </p>
        <p>
          Use the contents below to read a section in depth. The Month-End Guide and New-Year Setup tabs cover the two
          recurring workflows step by step.
        </p>
      </div>
      <nav className="guide-toc" aria-label="User guide contents">
        {GUIDE_GROUPS.map((group) => (
          <div key={group}>
            <strong>{group}</strong>
            {all.filter((entry) => entry.group === group).map((entry) => (
              <button key={entry.id} type="button" className="guide-link" onClick={() => jump(entry.id)}>
                {entry.title}
              </button>
            ))}
          </div>
        ))}
      </nav>
      {GUIDE_GROUPS.map((group) => (
        <section key={group} className="guide-group" id={`guide-group-${group.toLowerCase()}`}>
          <h3>{group}</h3>
          {all.filter((entry) => entry.group === group).map((entry) => <GuideEntryCard key={entry.id} entry={entry} />)}
        </section>
      ))}
    </div>
  );
}

export function GuidesView(_: ViewProps) {
  const [tab, setTab] = useState<'sections' | 'monthEnd' | 'newYear'>('sections');
  const lines = tab === 'monthEnd' ? APP_MONTH_END_GUIDE : APP_NEW_YEAR_GUIDE;
  return (
    <Section
      title="Guides"
      sub="The complete user guide for every section, plus the month-end and new-year workflows"
      actions={<Badge tone="neutral">{GUIDE_BASICS.length + USER_GUIDE.length} chapters</Badge>}
    >
      <div className="tabs">
        <button className={`tab ${tab === 'sections' ? 'active' : ''}`} onClick={() => setTab('sections')}>User Guide</button>
        <button className={`tab ${tab === 'monthEnd' ? 'active' : ''}`} onClick={() => setTab('monthEnd')}>Month-End Guide</button>
        <button className={`tab ${tab === 'newYear' ? 'active' : ''}`} onClick={() => setTab('newYear')}>New-Year Setup</button>
      </div>
      {tab === 'sections' ? <UserGuideBook /> : (
        <div className="guide">
          {lines.map((line: string, i: number) => {
            const heading = line.length < 90 && line === line.toUpperCase();
            return <p key={i} className={heading ? 'heading' : ''}>{line}</p>;
          })}
          {lines.length === 0 && <Empty>Guide text is not available.</Empty>}
        </div>
      )}
    </Section>
  );
}
