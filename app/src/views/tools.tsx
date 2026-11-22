import { useEffect, useMemo, useRef, useState } from 'react';
import type { ViewProps } from '../types';
import { Badge, Empty, Field, Section, Table } from '../components';
import { dateTimeUk, dateUk, download, gbp, MONTH_LONG, parseMoney, todayIso, toCsv } from '../format';
import { clearState } from '../store';
import { PeopleAccessSection } from './peoplePortal';
import { MenuLayoutSection } from './menuLayout';
import { GUIDE_BASICS, USER_GUIDE, type GuideEntry } from '../userGuide';
import { withoutAppUpdatePlaceholders } from '../budgetChangelog';
import { FINANCEHUB_URL, LEGAL_COPYRIGHT, LEGAL_TRADEMARK, LEGAL_VERSION } from '../legal';
import { decodeBackupDataset } from '../backup';
import { detectDuplicates, duplicateGroups } from '../../../core/importDedupe';
import { mergeDuplicateRows, mergedRows, unmergeTransaction } from '../../../core/cleanup';
import { backupFileProblem, countCsvRows, csvFileProblem, csvRowProblem, importOutOfWindow, importWindowEnd } from '../../../core/importLimits';
import { advanceAsOfToLatestTransaction } from '../../../core/engine';
import {
  CSV_DELIMITERS, CSV_PROFILE_LIMIT, builtInCsvRows, detectCsvProfile, guessDelimiter, mapCsvRows,
  normaliseProfile, parseDelimited, type CsvDelimiter, type CsvProfile,
} from '../../../core/csvMapping';
import { batchLockedMonths, commitImportBatch, undoImportBatch } from '../../../core/reconciliation';
import { classifyAccount } from '../../../core/accounts';
import { normaliseCategory, normaliseTags } from '../../../core/categories';
import { ruleFieldText, suggestForTransaction } from '../../../core/importRules';
import { normaliseStarlingAccounts, starlingFetchWindow, starlingImportRows, type StarlingAccount } from '../../../core/starling';
import {
  enableBankingImportRows,
  normaliseEnableBankingAccounts,
  normaliseEnableBankingAspsps,
  type EnableBankingAccount,
  type EnableBankingAspsp,
} from '../../../core/enableBanking';
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

/* ------------------------------------------------------------------ import */

/** One parser for the built-in path and the column-mapping wizard. */
const parseCsv = (text: string, delimiter: CsvDelimiter = ',') => parseDelimited(text, delimiter);

type StageRow = {
  id: string;
  date: string;
  description: string;
  amountPence: number;
  type: 'Income' | 'Expense';
  duplicateWith: 'existing' | 'staged' | null;
  outOfWindow: boolean;
  add: boolean;
  /** Descriptive fields only; a rule can never change a money total. */
  category?: string;
  tags?: string[];
  targetAccount?: string;
  ruleId?: string;
  ruleLabel?: string;
};

export function ImportView({ ds, update, go, notify }: ViewProps) {
  const [staging, setStaging] = useState<StageRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [rawGrid, setRawGrid] = useState<string[][] | null>(null);
  const [rawDelimiter, setRawDelimiter] = useState<CsvDelimiter>(',');
  const [mappingOpen, setMappingOpen] = useState(false);
  const [profileDraft, setProfileDraft] = useState<CsvProfile | null>(null);
  const [profileName, setProfileName] = useState('');
  const [account, setAccount] = useState(
    ds.accounts.find((a) => a.name === (ds.settings.primaryAccount || ds.accounts[0]?.name))?.name ?? ds.accounts[0]?.name ?? '',
  );
  const starlingBridge = typeof window !== 'undefined' ? window.financeHubDesktop?.bank?.starling : undefined;
  const [bankToken, setBankToken] = useState('');
  const [bankHasToken, setBankHasToken] = useState(false);
  const [bankSecure, setBankSecure] = useState(true);
  const [bankAccounts, setBankAccounts] = useState<StarlingAccount[]>([]);
  const [bankAccountUid, setBankAccountUid] = useState('');
  const [bankBusy, setBankBusy] = useState(false);
  const [bankError, setBankError] = useState('');

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

  // Imports run to today even when the As-of date has not caught up yet; adding a
  // row dated after it moves the As-of date forward (never past today).
  const importThrough = importWindowEnd(ds.settings.asOfDate, todayIso());
  const duplicateCount = staging.filter((r) => r.duplicateWith).length;
  const outsideCount = staging.filter((r) => r.outOfWindow).length;
  const ready = staging.filter((r) => r.add && !r.outOfWindow);

  const stageCandidates = (candidates: Array<Omit<StageRow, 'duplicateWith' | 'add'>>, source: string) => {
    const existing = ds.transactions.filter((t) => t.autoBill !== true);
    const flags = detectDuplicates(existing, candidates);
    setStaging(candidates.map((candidate, index) => {
      const suggestion = suggestForTransaction(ds.importRules ?? [], {
        description: candidate.description,
        account,
        amountPence: candidate.amountPence,
      });
      return {
        ...candidate,
        duplicateWith: flags[index],
        add: flags[index] === null && !candidate.outOfWindow,
        category: suggestion.category || undefined,
        tags: suggestion.tags.length > 0 ? suggestion.tags : undefined,
        targetAccount: suggestion.targetAccount,
        ruleId: suggestion.rule?.id,
        ruleLabel: suggestion.rule ? ruleFieldText(suggestion.rule) : undefined,
      };
    }));
    setFileName(source);
  };

  const applySuggestions = () => {
    setStaging((rows) => rows.map((row) => {
      const suggestion = suggestForTransaction(ds.importRules ?? [], {
        description: row.description,
        account,
        amountPence: row.amountPence,
      });
      return {
        ...row,
        category: suggestion.category || row.category,
        tags: suggestion.tags.length > 0 ? suggestion.tags : row.tags,
        targetAccount: suggestion.targetAccount ?? row.targetAccount,
        ruleId: suggestion.rule?.id,
        ruleLabel: suggestion.rule ? ruleFieldText(suggestion.rule) : row.ruleLabel,
      };
    }));
    notify('Rule suggestions applied in the review grid — nothing has been added yet');
  };

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
      setError('');
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
      setError('');
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
    const delimiter = guessDelimiter(text);
    const grid = parseCsv(text, delimiter);
    if (grid.length < 2) { setError('The CSV needs a header row and at least one transaction.'); return; }
    setRawGrid(grid);
    setRawDelimiter(delimiter);
    const mapped = builtInCsvRows(grid);
    if (!mapped) {
      const draft = detectCsvProfile(grid, { delimiter });
      setProfileDraft(draft);
      setProfileName(draft?.name ?? '');
      setMappingOpen(true);
      setError('The Date and Amount columns were not recognised. Map them below; nothing is imported yet.');
      return;
    }
    const candidates: Array<Omit<StageRow, 'duplicateWith' | 'add'>> = mapped.map((row, index) => ({
      id: `stage_${index + 1}`,
      ...row,
      outOfWindow: importOutOfWindow(row.date, ds.settings.lockCutoff, ds.settings.asOfDate, todayIso()),
    }));
    stageCandidates(candidates, file.name);
  };

  const applyMapping = () => {
    if (!rawGrid || !profileDraft) return;
    const rows = mapCsvRows(rawGrid, profileDraft);
    if (rows.length === 0) {
      setError('That mapping produced no rows. Check the date, amount and date-format columns.');
      return;
    }
    const candidates: Array<Omit<StageRow, 'duplicateWith' | 'add'>> = rows.map((row, index) => ({
      id: `mapped_${index + 1}`,
      ...row,
      outOfWindow: importOutOfWindow(row.date, ds.settings.lockCutoff, ds.settings.asOfDate, todayIso()),
    }));
    stageCandidates(candidates, fileName || 'Mapped CSV');
    setMappingOpen(false);
    setError('');
    notify(`${rows.length} row${rows.length === 1 ? '' : 's'} mapped — review them above before adding`);
  };

  const saveProfile = () => {
    if (!profileDraft) return;
    const profile = normaliseProfile({
      ...profileDraft,
      id: profileDraft.id || `csv_${Date.now().toString(36)}`,
      name: profileName.trim() || `${fileName || 'Bank'} profile`,
    });
    update((dataset) => {
      dataset.csvProfiles = [...(dataset.csvProfiles ?? []).filter((entry) => entry.id !== profile.id), profile].slice(-CSV_PROFILE_LIMIT);
    });
    setProfileDraft(profile);
    setProfileName(profile.name);
    notify(`${profile.name} saved for this budget`);
  };

  const loadProfile = (id: string) => {
    const profile = (ds.csvProfiles ?? []).find((entry) => entry.id === id);
    if (!profile) return;
    setProfileDraft(profile);
    setProfileName(profile.name);
    setMappingOpen(true);
    notify(`${profile.name} loaded — choose the file to map`);
  };

  const deleteProfile = (id: string) => {
    update((dataset) => { dataset.csvProfiles = (dataset.csvProfiles ?? []).filter((entry) => entry.id !== id); });
    notify('Column profile removed');
  };

  const undoBatch = (id: string) => {
    const rows = ds.transactions.filter((row) => row.importBatchId === id).length;
    if (!rows) return notify('That import has no rows left to remove');
    if (!confirm(`Remove the ${rows} row${rows === 1 ? '' : 's'} from this import? Hand-entered rows and every other import are left alone.`)) return;
    let message = '';
    update((dataset) => { message = undoImportBatch(dataset, id).message; });
    notify(message || 'That import could not be undone');
  };

  const toggle = (id: string) => setStaging((rows) => rows.map((r) => (r.id === id && !r.outOfWindow ? { ...r, add: !r.add } : r)));

  const targetFor = (row: StageRow) => (
    row.targetAccount && ds.accounts.some((entry) => entry.name === row.targetAccount) ? row.targetAccount : account
  );

  const commit = () => {
    if (ready.length === 0) return;
    if (ready.some((row) => classifyAccount(targetFor(row), ds) === 'unknown')) {
      setError('Choose a recognised bank account before importing.');
      return;
    }
    const today = todayIso();
    const newest = ready.map((r) => r.date).sort().slice(-1)[0] ?? '';
    const movedTo = newest > ds.settings.asOfDate ? (newest > today ? today : newest) : '';
    update((d) => {
      // The same helper serves a CSV, a mapped profile and both bank feeds.
      commitImportBatch(d, ready.map((r) => ({
        date: r.date,
        account: targetFor(r),
        type: r.type,
        amountPence: r.amountPence,
        comments: r.description,
        category: r.category,
        tags: r.tags,
      })), { source: fileName || 'Bank CSV' });
      advanceAsOfToLatestTransaction(d, today);
    });
    notify(`${ready.length} transactions appended${movedTo ? ` — As-of date moved to ${dateUk(movedTo)}` : ''} — nothing was auto-posted`);
    setStaging([]);
    setFileName('');
  };

  const mappingHeaders = rawGrid
    ? (rawGrid[0] ?? []).map((cell) => cell.replace(/^\uFEFF/, '').trim() || 'Column')
    : [];

  const columnSelect = (label: string, value: number, onChange: (next: number) => void) => (
    <Field label={label}>
      <select className="select" value={value} onChange={(event) => onChange(Number(event.target.value))}>
        {mappingHeaders.map((header, index) => (
          <option key={`${header}-${index}`} value={index}>{index + 1}. {header}</option>
        ))}
      </select>
    </Field>
  );

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
          <Badge tone="blue">Open period {dateUk(ds.settings.lockCutoff)} → {dateUk(importThrough)}</Badge>
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
              <Table head={['Add?', 'Date', 'Description', 'Type', 'Amount', 'Category', 'Tags', 'Rule', 'Flag']}>
                {staging.map((r) => (
                  <tr key={r.id} className={r.duplicateWith || r.outOfWindow ? 'locked' : ''}>
                    <td><input type="checkbox" checked={r.add} disabled={r.outOfWindow} onChange={() => toggle(r.id)} aria-label={`Add ${r.description}`} /></td>
                    <td className="muted nowrap">{dateUk(r.date)}</td>
                    <td>{r.description || '—'}</td>
                    <td>{r.type}</td>
                    <td className="num"><strong>{gbp(r.amountPence)}</strong></td>
                    <td>
                      <input
                        className="input compact"
                        style={{ minWidth: 110 }}
                        value={r.category ?? ''}
                        placeholder="—"
                        aria-label={`Category for ${r.description}`}
                        onChange={(event) => setStaging((rows) => rows.map((row) => row.id === r.id ? { ...row, category: event.target.value } : row))}
                      />
                    </td>
                    <td>
                      <input
                        className="input compact"
                        style={{ minWidth: 110 }}
                        value={(r.tags ?? []).join(', ')}
                        placeholder="—"
                        aria-label={`Tags for ${r.description}`}
                        onChange={(event) => setStaging((rows) => rows.map((row) => row.id === r.id ? { ...row, tags: normaliseTags(event.target.value) } : row))}
                      />
                    </td>
                    <td>
                      {r.ruleLabel ? <Badge tone="blue" >{r.ruleLabel}</Badge> : <span className="muted small">—</span>}
                      {r.targetAccount && <div className="muted small">→ {r.targetAccount}</div>}
                    </td>
                    <td>{r.duplicateWith === 'staged' ? <Badge tone="amber">Duplicate in file</Badge> : r.duplicateWith === 'existing' ? <Badge tone="amber">In log</Badge> : r.outOfWindow ? <Badge tone="red">Out of window</Badge> : <Badge tone="green">Ready</Badge>}</td>
                  </tr>
                ))}
              </Table>
            </div>
            <div className="toolbar" style={{ borderBottom: 0, borderTop: '1px solid var(--line)' }}>
              <span className="muted small">
                Duplicates are skipped by default; tick one only if it is a genuine second payment. Out-of-window rows (before {dateUk(ds.settings.lockCutoff)} or after {dateUk(importThrough)}) cannot be added.
                {outsideCount > 0 ? ` ${outsideCount} row${outsideCount === 1 ? '' : 's'} fall outside the open period; rows dated after the As-of date move it forward, and future-dated rows stay out of window.` : ''}
              </span>
              <div className="toolbar-spacer" />
              <button className="btn ghost" type="button" disabled={staging.length === 0 || (ds.importRules ?? []).length === 0} onClick={applySuggestions}>
                Apply rule suggestions
              </button>
              <button className="btn ghost" onClick={() => go('bills')}>Review subscriptions</button>
              <button className="btn primary" disabled={ready.length === 0} onClick={commit}>Add {ready.length} to log</button>
            </div>
          </>
        ) : (
          <Empty>Load a bank CSV export to build the review grid. Nothing is imported until you confirm.</Empty>
        )}
      </Section>

      <Section
        title="Recent imports"
        sub="Every batch keeps its own ID, so a bad import can be undone without touching hand-entered rows or another batch."
        actions={<Badge tone="neutral">{(ds.importBatches ?? []).length} kept</Badge>}
      >
        {(ds.importBatches ?? []).length > 0 ? (
          <Table head={['Imported', 'Source', 'Into', 'Rows', 'Dates', 'Net', '']} numHead={[3, 5]}>
            {[...(ds.importBatches ?? [])].reverse().map((batch) => {
              const locked = batchLockedMonths(ds, batch.id);
              return (
                <tr key={batch.id}>
                  <td className="muted nowrap">{dateTimeUk(batch.importedAt)}</td>
                  <td>{batch.source}</td>
                  <td className="muted">{batch.account}</td>
                  <td className="num">{batch.rows}</td>
                  <td className="muted small nowrap">{dateUk(batch.from)} – {dateUk(batch.to)}</td>
                  <td className="num">{gbp(batch.totalPence, { sign: true })}</td>
                  <td>
                    <button
                      className="btn ghost sm"
                      disabled={locked.length > 0}
                      title={locked.length > 0 ? `Locked: ${locked.join(', ')}` : 'Remove only this batch'}
                      onClick={() => undoBatch(batch.id)}
                    >
                      Undo import
                    </button>
                  </td>
                </tr>
              );
            })}
          </Table>
        ) : (
          <Empty>No import batches yet. Adding a reviewed CSV or bank-feed import creates one you can undo.</Empty>
        )}
      </Section>

      <Section
        title="CSV column mapping"
        sub="For another bank's layout: choose the columns once, save the profile, and the rows land in the same review grid as a built-in import."
        actions={<Badge tone={mappingOpen ? 'amber' : 'neutral'}>{mappingOpen ? 'Mapping' : `${(ds.csvProfiles ?? []).length} profiles`}</Badge>}
      >
        {mappingOpen && rawGrid && profileDraft ? (
          <div style={{ padding: 16, display: 'grid', gap: 12 }}>
            <div className="form-grid">
              <Field label="Profile name">
                <input className="input" value={profileName} onChange={(event) => setProfileName(event.target.value)} placeholder="e.g. Nationwide current account" />
              </Field>
              <Field label="Delimiter">
                <select
                  className="select"
                  value={profileDraft.delimiter}
                  onChange={(event) => setProfileDraft({ ...profileDraft, delimiter: event.target.value as CsvDelimiter })}
                >
                  {CSV_DELIMITERS.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
                </select>
              </Field>
              {columnSelect('Date column', profileDraft.dateColumn, (value) => setProfileDraft({ ...profileDraft, dateColumn: value }))}
              {columnSelect('Description column', profileDraft.descriptionColumn, (value) => setProfileDraft({ ...profileDraft, descriptionColumn: value }))}
              {columnSelect('Amount column', profileDraft.amountColumn, (value) => setProfileDraft({ ...profileDraft, amountColumn: value }))}
              <Field label="Direction column" hint="Optional: the built-in importer reads a type or direction column when the file has one.">
                <select
                  className="select"
                  value={profileDraft.typeColumn === null ? 'none' : profileDraft.typeColumn}
                  onChange={(event) => setProfileDraft({ ...profileDraft, typeColumn: event.target.value === 'none' ? null : Number(event.target.value) })}
                >
                  <option value="none">None — use the amount sign</option>
                  {mappingHeaders.map((header, index) => <option key={`type-${index}`} value={index}>{index + 1}. {header}</option>)}
                </select>
              </Field>
              <Field label="Date format">
                <select
                  className="select"
                  value={profileDraft.dateFormat}
                  onChange={(event) => setProfileDraft({ ...profileDraft, dateFormat: event.target.value as CsvProfile['dateFormat'] })}
                >
                  <option value="iso">Year first (2026-11-18)</option>
                  <option value="uk">Day first (18/11/2026)</option>
                  <option value="us">Month first (11-18-2026)</option>
                </select>
              </Field>
              <Field label="Sign">
                <select
                  className="select"
                  value={profileDraft.sign}
                  onChange={(event) => setProfileDraft({ ...profileDraft, sign: event.target.value as CsvProfile['sign'] })}
                >
                  <option value="signed">As written — minus means spending</option>
                  <option value="inverted">Inverted — plus means spending</option>
                </select>
              </Field>
            </div>
            <div className="muted small">
              {mapCsvRows(rawGrid, profileDraft).length} rows will be staged. First three:{' '}
              {mapCsvRows(rawGrid, profileDraft).slice(0, 3).map((row) => `${row.date} ${row.description || '—'} ${row.type} ${gbp(row.amountPence)}`).join(' · ') || 'none'}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn primary" onClick={applyMapping}>Apply mapping</button>
              <button className="btn" onClick={saveProfile}>Save profile</button>
              <button className="btn ghost" onClick={() => setMappingOpen(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <>
            <Empty>
              {rawGrid
                ? 'Choose a saved profile, or map the columns for the file you just loaded.'
                : 'Load a CSV above first. If its columns are not recognised, map them here — nothing is imported until you add the reviewed rows.'}
            </Empty>
            {(ds.csvProfiles ?? []).length > 0 && (
              <Table head={['Profile', 'Columns', '']}>
                {(ds.csvProfiles ?? []).map((profile) => (
                  <tr key={profile.id}>
                    <td><strong>{profile.name}</strong><div className="muted small">{profile.delimiter === '\t' ? 'Tab' : profile.delimiter === ';' ? 'Semicolon' : 'Comma'} · {profile.dateFormat.toUpperCase()}</div></td>
                    <td className="muted small">Date {profile.dateColumn + 1} · Description {profile.descriptionColumn + 1} · Amount {profile.amountColumn + 1}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn ghost sm" onClick={() => loadProfile(profile.id)}>Use</button>
                        <button className="btn ghost sm" onClick={() => deleteProfile(profile.id)}>Remove</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </>
        )}
      </Section>

      {starlingBridge && (
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
      )}

      {openBankingBridge && (
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
      )}
    </>
  );
}

/* ------------------------------------------------------------------ settings */

type SettingsPane = 'account' | 'budget' | 'data' | 'app';

const SETTINGS_PANES: { id: SettingsPane; label: string; summary: string }[] = [
  { id: 'account', label: 'Account', summary: 'Session, passkeys, app lock, sync conflicts and the provider vault.' },
  { id: 'budget', label: 'Budget', summary: 'Year rollover, core dates and the record pages that hold accounts, people and cards.' },
  { id: 'data', label: 'Data', summary: 'Backups, duplicate review, onboarding and reset.' },
  { id: 'app', label: 'App', summary: 'Theme, sidebar layout and legal information.' },
];

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

export function SettingsView({ ds, update, notify, theme, setTheme, engine, go, userId, userEmail, isLocal, signOut, localAccount, workspace, vault, appLock, setAppLock, vaultSession, setVault, setVaultSession, syncConflicts, resolveSyncConflict, exportSyncConflict, purgeSyncConflicts, year, setYear }: ViewProps) {
  const restoreInput = useRef<HTMLInputElement>(null);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [settingsPane, setSettingsPane] = useState<SettingsPane>('account');
  const activeSettingsPane = SETTINGS_PANES.find((pane) => pane.id === settingsPane) ?? SETTINGS_PANES[0];
  const duplicateScan = duplicateGroups(ds.transactions.filter((t) => t.autoBill !== true && t.mergedIntoRow === undefined));
  const mergedDuplicates = mergedRows(ds);
  const mergeGroup = (rowNumbers: number[]) => {
    if (!confirm(`Merge ${rowNumbers.length} rows into row ${Math.min(...rowNumbers)}? The later rows become zero-amount links, so the payment counts once. You can undo it here.`)) return;
    let message = '';
    update((d) => { message = mergeDuplicateRows(d, rowNumbers).message; });
    notify(message);
  };
  const undoMerge = (row: number) => {
    let message = '';
    update((d) => { message = unmergeTransaction(d, row).message; });
    notify(message);
  };

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

      <Section title="Accounts, people and cards" sub="Each record is edited on the page that owns it, so there is only one copy.">
        <div className="toolbar" style={{ borderBottom: 0 }}>
          <button className="btn" onClick={() => go('accounts')}>Open Accounts</button>
          <button className="btn" onClick={() => go('people')}>Open People</button>
          <button className="btn" onClick={() => go('cards')}>Open Cards</button>
        </div>
      </Section>

      <PeopleAccessSection ds={ds} userId={userId} notify={notify} workspace={workspace} />
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

      <Section
        title="Duplicate check"
        sub="Merge rows that share the same date, account, type and amount. The oldest row keeps the amount; later rows become zero-amount links and can be restored here."
        actions={<Badge tone={duplicateScan.length ? 'amber' : 'green'}>{duplicateScan.length ? `${duplicateScan.length} groups` : 'None found'}</Badge>}
      >
        {duplicateScan.length === 0 ? (
          <div style={{ padding: 16 }}><Empty>No duplicate groups in this budget.</Empty></div>
        ) : (
          <>
            <div className="toolbar" style={{ borderBottom: 0 }}>
              <span className="muted small">
                {duplicateScan.reduce((sum, group) => sum + group.rows.length, 0)} rows across {duplicateScan.length} groups. A merge changes the totals by removing the duplicate amount; undo restores it exactly.
              </span>
              <div className="toolbar-spacer" />
              <button className="btn" onClick={() => setShowDuplicates((value) => !value)}>
                {showDuplicates ? 'Hide groups' : 'Show groups'}
              </button>
            </div>
            {showDuplicates && (
              <Table head={['Date', 'Account', 'Type', 'Amount', 'Rows', 'Descriptions', '']} numHead={[3, 4]}>
                {duplicateScan.map((group) => (
                  <tr key={group.key}>
                    <td className="muted nowrap">{dateUk(group.date)}</td>
                    <td>{group.account}</td>
                    <td>{group.type}</td>
                    <td className="num">{gbp(group.amountPence)}</td>
                    <td className="num">{group.rows.length}</td>
                    <td className="muted small">
                      {group.rows.map((row) => `${row.comments?.trim() || '—'} (row ${row.row})`).join(' · ')}
                    </td>
                    <td>
                      <button className="btn ghost sm" onClick={() => mergeGroup(group.rows.map((row) => row.row))}>
                        Merge into row {Math.min(...group.rows.map((row) => row.row))}
                      </button>
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </>
        )}
        {mergedDuplicates.length > 0 && (
          <>
            <div className="panel-head"><div><h3 className="card-title">Merged rows</h3><p className="card-sub">Undo restores the amount and removes the link.</p></div></div>
            <Table head={['Row', 'Date', 'Account', 'Type', 'Kept amount', 'Merged into', '']} numHead={[4]}>
              {mergedDuplicates.map((row) => (
                <tr key={row.row}>
                  <td className="num">{row.row}</td>
                  <td className="muted nowrap">{dateUk(row.date)}</td>
                  <td>{row.account}</td>
                  <td>{row.type}</td>
                  <td className="num">{gbp(row.mergedFromPence ?? 0)}</td>
                  <td className="num">{row.mergedIntoRow}</td>
                  <td><button className="btn ghost sm" onClick={() => undoMerge(row.row)}>Undo merge</button></td>
                </tr>
              ))}
            </Table>
          </>
        )}
      </Section>
      </div>

      <div className="settings-pane" hidden={settingsPane !== 'app'}>
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

      <Section title="Appearance" sub="Theme preference is stored on this device">
        <div className="tabs" style={{ borderBottom: 0 }}>
          <button className={`tab ${theme === 'dark' ? 'active' : ''}`} onClick={() => setTheme('dark')}>🌙 Dark</button>
          <button className={`tab ${theme === 'light' ? 'active' : ''}`} onClick={() => setTheme('light')}>☀ Light</button>
        </div>
      </Section>

      <MenuLayoutSection ds={ds} update={update} notify={notify} />
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ changelog / guides */

export function ChangelogView({ ds, update, notify }: ViewProps) {
  const [q, setQ] = useState('');
  const [customOpen, setCustomOpen] = useState(false);
  const [custom, setCustom] = useState({ date: todayIso(), title: '', description: '' });
  // App-generated placeholders from older builds carry no money detail; new
  // automatic entries name the section they changed, so history stays meaningful.
  const all = withoutAppUpdatePlaceholders(ds.changelog ?? []);
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
  '5 — Change the top-bar year to a future year and review Bills. Amount, due-day and remove edits there create a plan for that year only; the base definitions and earlier years stay untouched. Use a dated Bill change in Bill changes on Bills for a one-off month or a range that is not a whole year. The latest matching change wins.',
  '6 — Review the link sheets under Bills. A provider-linked sheet keeps its provider lookup when renamed; a custom sheet is a label and uses the bill’s base amount. Add, rename or remove sheets in Bills.',
  '7 — Provider ledgers keep each year in its own block. Choose a future year in the top bar to add, amend or remove that year’s rows and balance anchors without touching the live year. Editing any year carries its new closing balance into the next block and recalculates the rest of the chain; use Recalculate later years on a provider to rebuild every saved block from the live close on demand. Carry over balances rotates a future block into the live ledger and keeps the old year read-only. A provider-linked bill reads the block for the selected year.',
  '8 — Add new-year transactions through Import or Transactions. Imports never post until you confirm them, and locked months reject new rows.',
  'PATH B — START A CLEAN NEW-YEAR BUDGET',
  '1 — Open Settings → Onboarding & reset → Open Guided setup.',
  '2 — In Budget basics, set the new Budget year, As-of date and Balance anchor date. If the opening balances are the 31 December close, use 31 December as the anchor.',
  '3 — In Start from a clean slate, enter the main account and its opening balance, then choose Start blank budget. A JSON backup downloads before accounts, people, cards, bills, transactions, holidays and provider ledgers are cleared.',
  '4 — Add the remaining accounts, people and cards. Use the confirmed 31 December closing balances as the new opening balances. Do not import last year’s transactions into the new budget.',
  '5 — Open Bills to add the new year’s bills and link sheets, and Bill changes on Bills for dated changes. A clean budget has no provider history, so a provider-linked bill uses its base amount; a custom sheet is the simplest label.',
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
