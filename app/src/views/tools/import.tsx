import { useState } from 'react';
import type { ViewProps } from '../../types';
import { Badge, Empty, Field, Section, Table } from '../../components';
import { dateTimeUk, dateUk, gbp, todayIso } from '../../format';
import { detectDuplicates } from '../../../../core/importDedupe';
import {
  countCsvRows, csvFileProblem, csvRowProblem, importOutOfWindow, importWindowEnd,
} from '../../../../core/importLimits';
import { advanceAsOfToLatestTransaction } from '../../../../core/engine';
import {
  CSV_DELIMITERS, CSV_PROFILE_LIMIT, builtInCsvRows, detectCsvProfile, guessDelimiter, mapCsvRows,
  normaliseProfile, parseDelimited, type CsvDelimiter, type CsvProfile,
} from '../../../../core/csvMapping';
import { batchLockedMonths, commitImportBatch, undoImportBatch } from '../../../../core/reconciliation';
import { classifyAccount } from '../../../../core/accounts';
import { normaliseTags } from '../../../../core/categories';
import { ruleFieldText, suggestForTransaction } from '../../../../core/importRules';
import type { StageCandidate, StageRow } from './staging';
import { StarlingFeedSection } from './starlingFeed';
import { OpenBankingSection } from './openBanking';

/** One parser for the built-in path and the column-mapping wizard. */
const parseCsv = (text: string, delimiter: CsvDelimiter = ',') => parseDelimited(text, delimiter);

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
  // Imports run to today even when the As-of date has not caught up yet; adding a
  // row dated after it moves the As-of date forward (never past today).
  const importThrough = importWindowEnd(ds.settings.asOfDate, todayIso());
  const duplicateCount = staging.filter((r) => r.duplicateWith).length;
  const outsideCount = staging.filter((r) => r.outOfWindow).length;
  const ready = staging.filter((r) => r.add && !r.outOfWindow);

  const stageCandidates = (candidates: StageCandidate[], source: string) => {
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

      <StarlingFeedSection
        ds={ds}
        notify={notify}
        stageCandidates={stageCandidates}
        clearImportError={() => setError('')}
      />

      <OpenBankingSection
        ds={ds}
        notify={notify}
        stageCandidates={stageCandidates}
        clearImportError={() => setError('')}
      />
    </>
  );
}
