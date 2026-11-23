import { useEffect, useState } from 'react';
import type { Dataset } from '../../../../core/engine';
import type { ViewProps } from '../../types';
import { Badge, Field, Section } from '../../components';
import { dateUk, todayIso } from '../../format';
import { importOutOfWindow, importWindowEnd } from '../../../../core/importLimits';
import {
  normaliseStarlingAccounts, starlingFetchWindow, starlingImportRows, type StarlingAccount,
} from '../../../../core/starling';
import type { StageCandidate } from './staging';

type StarlingFeedProps = Pick<ViewProps, 'notify'> & {
  ds: Dataset;
  stageCandidates: (candidates: StageCandidate[], source: string) => void;
  clearImportError: () => void;
};

/**
 * The desktop-only Starling personal-API feed. It owns its own token state and
 * hands reviewed rows to the import grid; it never writes to the budget itself.
 */
export function StarlingFeedSection({ ds, notify, stageCandidates, clearImportError }: StarlingFeedProps) {
  const starlingBridge = typeof window !== 'undefined' ? window.financeHubDesktop?.bank?.starling : undefined;
  const [bankToken, setBankToken] = useState('');
  const [bankHasToken, setBankHasToken] = useState(false);
  const [bankSecure, setBankSecure] = useState(true);
  const [bankAccounts, setBankAccounts] = useState<StarlingAccount[]>([]);
  const [bankAccountUid, setBankAccountUid] = useState('');
  const [bankBusy, setBankBusy] = useState(false);
  const [bankError, setBankError] = useState('');

  useEffect(() => {
    if (!starlingBridge) return;
    let cancelled = false;
    void starlingBridge.status().then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setBankError(result.error ?? 'The Starling token status could not be read.');
        return;
      }
      setBankHasToken(Boolean(result.value?.hasToken));
      setBankSecure(Boolean(result.value?.secureStorage));
    }).catch(() => {
      if (!cancelled) setBankError('The Starling token status could not be read.');
    });
    return () => { cancelled = true; };
  }, [starlingBridge]);

  const importThrough = importWindowEnd(ds.settings.asOfDate, todayIso());

  const loadStarlingAccounts = async () => {
    if (!starlingBridge) return [];
    setBankError('');
    const result = await starlingBridge.accounts();
    if (!result.ok) {
      setBankError(result.error ?? 'Starling accounts could not be loaded.');
      return [];
    }
    const accounts = normaliseStarlingAccounts(result.value);
    setBankAccounts(accounts);
    setBankAccountUid((current) => accounts.some((entry) => entry.accountUid === current)
      ? current
      : (accounts.find((entry) => entry.currency === 'GBP')?.accountUid ?? accounts[0]?.accountUid ?? ''));
    if (accounts.length === 0) setBankError('Starling returned no usable accounts for this token.');
    return accounts;
  };

  const saveStarlingToken = async () => {
    if (!starlingBridge) return;
    const token = bankToken.trim();
    if (!token) {
      setBankError('Paste a Starling personal access token first.');
      return;
    }
    setBankBusy(true);
    setBankError('');
    try {
      const saved = await starlingBridge.saveToken(token);
      setBankToken('');
      if (!saved.ok) {
        setBankError(saved.error ?? 'The Starling token could not be saved.');
        return;
      }
      setBankHasToken(Boolean(saved.value?.hasToken));
      setBankSecure(Boolean(saved.value?.secureStorage));
      notify('Starling token saved in this device’s encrypted store');
      await loadStarlingAccounts();
    } catch {
      setBankToken('');
      setBankError('The Starling token could not be saved.');
    } finally {
      setBankBusy(false);
    }
  };

  const forgetStarlingToken = async () => {
    if (!starlingBridge) return;
    if (!confirm('Forget the Starling token on this device? This removes FinanceHub’s stored token. Revoke it separately in the Starling developer portal if you want to invalidate it.')) return;
    setBankBusy(true);
    setBankError('');
    try {
      const result = await starlingBridge.forget();
      if (!result.ok) {
        setBankError(result.error ?? 'The Starling token could not be removed.');
        return;
      }
      setBankHasToken(false);
      setBankAccounts([]);
      setBankAccountUid('');
      notify('Starling token forgotten');
    } catch {
      setBankError('The Starling token could not be removed.');
    } finally {
      setBankBusy(false);
    }
  };

  const fetchStarling = async () => {
    if (!starlingBridge || !bankHasToken) return;
    const selected = bankAccounts.find((entry) => entry.accountUid === bankAccountUid);
    if (!selected) {
      setBankError('Choose a Starling account first.');
      return;
    }
    if (selected.currency && selected.currency !== 'GBP') {
      setBankError('This budget is in GBP. Choose a GBP Starling account.');
      return;
    }
    const range = starlingFetchWindow(ds.settings.lockCutoff, ds.settings.asOfDate, todayIso());
    if (range.problem) {
      setBankError(range.problem);
      return;
    }
    setBankBusy(true);
    setBankError('');
    try {
      const result = await starlingBridge.transactions({
        accountUid: selected.accountUid,
        categoryUid: selected.defaultCategoryUid,
        min: range.min,
        max: range.max,
      });
      if (!result.ok) {
        setBankError(result.error ?? 'Starling transactions could not be loaded.');
        return;
      }
      const rows = starlingImportRows(result.value);
      const candidates = rows.map((row) => ({
        id: `starling_${row.id}`,
        date: row.date,
        description: row.description,
        amountPence: row.amountPence,
        type: row.type,
        outOfWindow: importOutOfWindow(row.date, ds.settings.lockCutoff, ds.settings.asOfDate, todayIso()),
      }));
      stageCandidates(candidates, `Starling — ${selected.name}`);
      clearImportError();
      const afterAsOf = rows.filter((row) => row.date > ds.settings.asOfDate).length;
      notify(rows.length === 0
        ? 'No settled Starling transactions in this range'
        : `${rows.length} settled Starling transaction${rows.length === 1 ? '' : 's'} loaded — review before adding${afterAsOf > 0 ? ` (${afterAsOf} after your As-of date of ${dateUk(ds.settings.asOfDate)})` : ''}`);
    } catch {
      setBankError('Starling transactions could not be loaded.');
    } finally {
      setBankBusy(false);
    }
  };

  if (!starlingBridge) return null;

  return (
      <Section
        title="Starling personal feed"
        sub="Desktop-only read-only import from your own Starling account — not Open Banking"
        actions={<Badge tone={bankHasToken ? 'green' : 'blue'}>{bankHasToken ? 'Token saved' : 'Setup'}</Badge>}
      >
        <div style={{ padding: 16, display: 'grid', gap: 12 }}>
          <div className="notice info">
            <strong>This is Starling’s own personal API, not an Open Banking/AISP connection.</strong>{' '}
            It reads only the Starling account you link with a personal access token. The token is stored in this
            device’s OS-encrypted store, not in the budget, a backup or cloud sync. Rows are read-only and enter the
            review grid above; nothing is posted automatically.
          </div>

          {!bankSecure && (
            <div className="notice danger">
              Windows secure storage is unavailable, so FinanceHub will not save a bank token. Check the Windows user profile and try again.
            </div>
          )}

          {starlingBridge && !bankHasToken && (
            <>
              <div className="form-grid">
                <Field
                  label="Starling personal access token"
                  hint="Create it in the Starling developer portal with account:read and transaction:read. It is like a password — do not share it."
                >
                  <input
                    className="input"
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    value={bankToken}
                    onChange={(event) => setBankToken(event.target.value)}
                    placeholder="Paste the token"
                  />
                </Field>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <button className="btn primary" onClick={() => void saveStarlingToken()} disabled={bankBusy || !bankToken.trim()}>
                  {bankBusy ? 'Saving…' : 'Save token'}
                </button>
                <a className="btn ghost" href="https://developer.starlingbank.com/personal" target="_blank" rel="noreferrer">
                  Open Starling developer portal ↗
                </a>
              </div>
              <div className="muted small">
                FinanceHub does not ask for your Starling password, PIN or one-time code. Revoke the token in the Starling developer portal when you no longer need it.
              </div>
            </>
          )}

          {starlingBridge && bankHasToken && (
            <>
              <div className="toolbar" style={{ padding: 0, border: 0 }}>
                <select
                  className="select"
                  aria-label="Starling account"
                  value={bankAccountUid}
                  onChange={(event) => setBankAccountUid(event.target.value)}
                  disabled={bankBusy}
                >
                  <option value="">{bankAccounts.length ? 'Choose a Starling account' : 'No accounts loaded'}</option>
                  {bankAccounts.map((entry) => (
                    <option key={entry.accountUid} value={entry.accountUid}>
                      {entry.name}{entry.currency ? ` · ${entry.currency}` : ''}{entry.accountType ? ` · ${entry.accountType}` : ''}
                    </option>
                  ))}
                </select>
                <button className="btn" onClick={() => void loadStarlingAccounts()} disabled={bankBusy}>
                  {bankBusy ? 'Working…' : 'Refresh accounts'}
                </button>
                <button className="btn primary" onClick={() => void fetchStarling()} disabled={bankBusy || !bankAccountUid}>
                  Fetch settled transactions
                </button>
                <button className="btn ghost" onClick={() => void forgetStarlingToken()} disabled={bankBusy}>
                  Forget token
                </button>
              </div>
              <div className="muted small">
                Fetching covers {dateUk(ds.settings.lockCutoff)} through today, or through the As-of date when that is later, and imports into the account selected above. Rows dated up to {dateUk(importThrough)} can be added; adding a row dated after the As-of date ({dateUk(ds.settings.asOfDate)}) moves that date forward, up to today. Only settled items are offered; pending and reversed items are excluded.
              </div>
            </>
          )}

          {bankError && <div className="notice danger">{bankError}</div>}
        </div>
      </Section>
  );
}
