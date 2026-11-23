import { useEffect, useState } from 'react';
import type { Dataset } from '../../../../core/engine';
import type { ViewProps } from '../../types';
import { Badge, Field, Section } from '../../components';
import { dateUk, todayIso } from '../../format';
import { importOutOfWindow, importWindowEnd } from '../../../../core/importLimits';
import {
  enableBankingImportRows, normaliseEnableBankingAccounts, normaliseEnableBankingAspsps,
  type EnableBankingAccount, type EnableBankingAspsp,
} from '../../../../core/enableBanking';
import { starlingFetchWindow } from '../../../../core/starling';
import { FINANCEHUB_URL } from '../../legal';
import type { StageCandidate } from './staging';

type OpenBankingProps = Pick<ViewProps, 'notify'> & {
  ds: Dataset;
  stageCandidates: (candidates: StageCandidate[], source: string) => void;
  clearImportError: () => void;
};

/**
 * Enable Banking (AISP) for the other banks. Desktop-only, consent in the
 * browser, and read-only: rows land in the import review grid.
 */
export function OpenBankingSection({ ds, notify, stageCandidates, clearImportError }: OpenBankingProps) {
  const openBankingBridge = typeof window !== 'undefined' ? window.financeHubDesktop?.bank?.openBanking : undefined;
  const [ebStatus, setEbStatus] = useState<DesktopEnableBankingStatus>({ hasCredentials: false, secureStorage: true, sessions: [] });
  const [ebAppId, setEbAppId] = useState('');
  const [ebPrivateKey, setEbPrivateKey] = useState('');
  const [ebBusy, setEbBusy] = useState(false);
  const [ebError, setEbError] = useState('');
  const [ebWaiting, setEbWaiting] = useState(false);
  const [ebAspsps, setEbAspsps] = useState<EnableBankingAspsp[]>([]);
  const [ebAspsp, setEbAspsp] = useState('');
  const [ebAccounts, setEbAccounts] = useState<EnableBankingAccount[]>([]);
  const [ebAccountUid, setEbAccountUid] = useState('');

  const applyOpenBankingStatus = (status: DesktopEnableBankingStatus) => {
    setEbStatus(status);
    const accounts = normaliseEnableBankingAccounts(status.sessions);
    setEbAccounts(accounts);
    setEbAccountUid((current) => (accounts.some((entry) => entry.uid === current)
      ? current
      : (accounts.find((entry) => entry.currency === 'GBP')?.uid ?? accounts[0]?.uid ?? '')));
  };

  useEffect(() => {
    if (!openBankingBridge) return;
    let cancelled = false;
    void openBankingBridge.status().then((result) => {
      if (cancelled) return;
      if (!result.ok || !result.value) {
        setEbError(result.error ?? 'The Open Banking connection status could not be read.');
        return;
      }
      applyOpenBankingStatus(result.value);
    }).catch(() => {
      if (!cancelled) setEbError('The Open Banking connection status could not be read.');
    });
    const off = openBankingBridge.onLinked((payload) => {
      setEbWaiting(false);
      if (!payload.ok) {
        setEbError(payload.error || 'The bank connection failed.');
        return;
      }
      setEbError('');
      notify('Bank connected — refresh accounts to fetch transactions');
      void openBankingBridge.status().then((result) => {
        if (!cancelled && result.ok && result.value) applyOpenBankingStatus(result.value);
      });
    });
    return () => { cancelled = true; off(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openBankingBridge]);

  const importThrough = importWindowEnd(ds.settings.asOfDate, todayIso());

  const refreshOpenBanking = async () => {
    if (!openBankingBridge) return;
    const result = await openBankingBridge.status();
    if (!result.ok || !result.value) {
      setEbError(result.error ?? 'The Open Banking connection status could not be read.');
      return;
    }
    applyOpenBankingStatus(result.value);
  };

  const loadOpenBankingAspsps = async () => {
    if (!openBankingBridge) return;
    setEbBusy(true);
    setEbError('');
    try {
      const result = await openBankingBridge.aspsps();
      if (!result.ok) {
        setEbError(result.error ?? 'The UK bank list could not be loaded.');
        return;
      }
      const banks = normaliseEnableBankingAspsps(result.value);
      setEbAspsps(banks);
      setEbAspsp((current) => (banks.some((bank) => `${bank.country}|${bank.name}` === current)
        ? current
        : (banks[0] ? `${banks[0].country}|${banks[0].name}` : '')));
      if (banks.length === 0) setEbError('Enable Banking returned no UK banks for this application.');
    } catch {
      setEbError('The UK bank list could not be loaded.');
    } finally {
      setEbBusy(false);
    }
  };

  const saveOpenBankingCredentials = async () => {
    if (!openBankingBridge) return;
    setEbBusy(true);
    setEbError('');
    try {
      const result = await openBankingBridge.saveCredentials({ appId: ebAppId.trim(), privateKey: ebPrivateKey.trim() });
      if (!result.ok) {
        setEbError(result.error ?? 'The Enable Banking connection details could not be saved.');
        return;
      }
      setEbAppId('');
      setEbPrivateKey('');
      await refreshOpenBanking();
      notify('Enable Banking connection saved in this device’s encrypted store');
      void loadOpenBankingAspsps();
    } catch {
      setEbError('The Enable Banking connection details could not be saved.');
    } finally {
      setEbBusy(false);
    }
  };

  const linkOpenBanking = async () => {
    if (!openBankingBridge) return;
    const [country, ...rest] = ebAspsp.split('|');
    const name = rest.join('|');
    if (!name) {
      setEbError('Choose a bank to connect first.');
      return;
    }
    setEbBusy(true);
    setEbError('');
    try {
      const result = await openBankingBridge.link({ name, country });
      if (!result.ok) {
        setEbError(result.error ?? 'The bank connection could not be started.');
        return;
      }
      setEbWaiting(true);
    } catch {
      setEbError('The bank connection could not be started.');
    } finally {
      setEbBusy(false);
    }
  };

  const forgetOpenBanking = async () => {
    if (!openBankingBridge) return;
    if (!confirm('Forget the Enable Banking connection on this device? The application key and linked accounts are removed from FinanceHub. Revoke the consent separately in Enable Banking if you want to invalidate it.')) return;
    setEbBusy(true);
    setEbError('');
    try {
      const result = await openBankingBridge.forget();
      if (!result.ok) {
        setEbError(result.error ?? 'The Open Banking connection could not be removed.');
        return;
      }
      applyOpenBankingStatus({ hasCredentials: false, secureStorage: true, sessions: [] });
      setEbAspsps([]);
      setEbAspsp('');
      setEbWaiting(false);
    } catch {
      setEbError('The Open Banking connection could not be removed.');
    } finally {
      setEbBusy(false);
    }
  };

  const fetchOpenBanking = async () => {
    if (!openBankingBridge) return;
    const selected = ebAccounts.find((entry) => entry.uid === ebAccountUid);
    if (!selected) {
      setEbError('Choose a linked bank account first.');
      return;
    }
    if (selected.currency && selected.currency !== 'GBP') {
      setEbError('This budget is in GBP. Choose a GBP bank account.');
      return;
    }
    const range = starlingFetchWindow(ds.settings.lockCutoff, ds.settings.asOfDate, todayIso());
    if (range.problem) {
      setEbError(range.problem);
      return;
    }
    setEbBusy(true);
    setEbError('');
    try {
      const result = await openBankingBridge.transactions({ accountUid: selected.uid, min: range.min, max: range.max });
      if (!result.ok) {
        setEbError(result.error ?? 'The bank transactions could not be loaded.');
        return;
      }
      const rows = enableBankingImportRows(result.value).filter((row) => !row.currency || row.currency === 'GBP');
      const candidates = rows.map((row) => ({
        id: `bank_${row.id}`,
        date: row.date,
        description: row.description,
        amountPence: row.amountPence,
        type: row.type,
        outOfWindow: importOutOfWindow(row.date, ds.settings.lockCutoff, ds.settings.asOfDate, todayIso()),
      }));
      stageCandidates(candidates, `Open Banking — ${selected.aspspName || 'Bank'}`);
      clearImportError();
      const afterAsOf = rows.filter((row) => row.date > ds.settings.asOfDate).length;
      notify(rows.length === 0
        ? 'No booked bank transactions in this range'
        : `${rows.length} booked bank transaction${rows.length === 1 ? '' : 's'} loaded — review before adding${afterAsOf > 0 ? ` (${afterAsOf} after your As-of date of ${dateUk(ds.settings.asOfDate)})` : ''}`);
    } catch {
      setEbError('The bank transactions could not be loaded.');
    } finally {
      setEbBusy(false);
    }
  };

  if (!openBankingBridge) return null;

  return (
      <Section
        title="Open Banking (other banks)"
        sub="Enable Banking — an authorised AISP. You approve access in your browser; nothing posts automatically"
        actions={<Badge tone={ebStatus.hasCredentials ? 'green' : 'blue'}>{ebStatus.hasCredentials ? (ebAccounts.length ? 'Connected' : 'Ready') : 'Setup'}</Badge>}
      >
        <div style={{ padding: 16, display: 'grid', gap: 12 }}>
          <div className="notice info">
            <strong>FinanceHub never asks for your bank password, PIN or one-time code.</strong>{' '}
            Consent and strong customer authentication happen with your bank. Enable Banking is the authorised account-information provider and returns only the accounts you link; FinanceHub reads them and keeps the data in the review grid.
          </div>

          {!ebStatus.secureStorage && (
            <div className="notice danger">
              Windows secure storage is unavailable, so FinanceHub will not save the Enable Banking key. Check the Windows user profile and try again.
            </div>
          )}

          {openBankingBridge && !ebStatus.hasCredentials && (
            <>
              <div className="notice info">
                Register a free production application at Enable Banking, add <strong>{FINANCEHUB_URL}bank-callback.html</strong> as a redirect URL, then paste its application ID and the generated private key here. Restricted production only returns accounts you link yourself.
              </div>
              <div className="form-grid">
                <Field label="Enable Banking application ID" hint="The UUID shown next to the application in the Enable Banking control panel.">
                  <input
                    className="input"
                    value={ebAppId}
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(event) => setEbAppId(event.target.value)}
                    placeholder="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
                  />
                </Field>
                <Field label="Private key (.pem)" hint="Paste the key downloaded when the application was registered. It is stored in this device’s OS-encrypted store, never in the budget, a backup or cloud sync.">
                  <textarea
                    className="input"
                    rows={5}
                    autoComplete="off"
                    spellCheck={false}
                    value={ebPrivateKey}
                    onChange={(event) => setEbPrivateKey(event.target.value)}
                    placeholder="-----BEGIN PRIVATE KEY-----"
                  />
                </Field>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <button className="btn primary" onClick={() => void saveOpenBankingCredentials()} disabled={ebBusy || !ebAppId.trim() || !ebPrivateKey.trim()}>
                  {ebBusy ? 'Saving…' : 'Save connection'}
                </button>
                <a className="btn ghost" href="https://enablebanking.com/cp/applications" target="_blank" rel="noreferrer">
                  Open Enable Banking ↗
                </a>
              </div>
            </>
          )}

          {openBankingBridge && ebStatus.hasCredentials && (
            <>
              <div className="toolbar" style={{ padding: 0, border: 0 }}>
                <select className="select" aria-label="Bank to connect" value={ebAspsp} onChange={(event) => setEbAspsp(event.target.value)} disabled={ebBusy}>
                  <option value="">{ebAspsps.length ? 'Choose a bank' : 'Load the UK bank list'}</option>
                  {ebAspsps.map((bank) => (
                    <option key={`${bank.country}|${bank.name}`} value={`${bank.country}|${bank.name}`}>{bank.name}</option>
                  ))}
                </select>
                <button className="btn" onClick={() => void loadOpenBankingAspsps()} disabled={ebBusy}>{ebBusy ? 'Working…' : 'Load banks'}</button>
                <button className="btn primary" onClick={() => void linkOpenBanking()} disabled={ebBusy || !ebAspsp}>
                  {ebWaiting ? 'Waiting for the bank…' : 'Connect in browser'}
                </button>
                <button className="btn ghost" onClick={() => void forgetOpenBanking()} disabled={ebBusy}>Forget connection</button>
              </div>

              {ebWaiting && (
                <div className="notice info">Finish the consent in your browser. This panel updates as soon as the bank returns you to FinanceHub.</div>
              )}

              <div className="toolbar" style={{ padding: 0, border: 0 }}>
                <select className="select" aria-label="Linked bank account" value={ebAccountUid} onChange={(event) => setEbAccountUid(event.target.value)} disabled={ebBusy}>
                  <option value="">{ebAccounts.length ? 'Choose a linked account' : 'No accounts linked yet'}</option>
                  {ebAccounts.map((account) => (
                    <option key={account.uid} value={account.uid}>
                      {account.aspspName} · {account.name}{account.currency ? ` · ${account.currency}` : ''}
                    </option>
                  ))}
                </select>
                <button className="btn" onClick={() => void refreshOpenBanking()} disabled={ebBusy}>Refresh accounts</button>
                <button className="btn primary" onClick={() => void fetchOpenBanking()} disabled={ebBusy || !ebAccountUid}>
                  Fetch booked transactions
                </button>
              </div>

              {ebStatus.sessions.length > 0 && (
                <div className="muted small">
                  {ebStatus.sessions.map((session) => `${session.aspspName} — consent valid to ${session.validUntil ? dateUk(session.validUntil.slice(0, 10)) : 'an unknown date'}`).join(' · ')}
                </div>
              )}
              <div className="muted small">
                Fetching covers {dateUk(ds.settings.lockCutoff)} through {dateUk(importThrough)} and imports into the account selected above. Only booked items are offered; pending items are excluded. When the consent lapses, connect the bank again in your browser.
              </div>
            </>
          )}

          {ebError && <div className="notice danger">{ebError}</div>}
        </div>
      </Section>
  );
}
