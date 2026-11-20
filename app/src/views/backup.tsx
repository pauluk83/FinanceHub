import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dataset } from '../../../core/engine';
import type { ViewProps } from '../types';
import { Badge, Empty, Field, Section, Table } from '../components';
import { dateTimeUk, download, todayIso } from '../format';
import { decodeBackupDataset } from '../backup';
import { backupFileProblem } from '../../../core/importLimits';
import { decryptBackup, encryptBackup, MIN_BACKUP_PASSPHRASE } from '../backupArchive';
import {
  BACKUP_RETENTION,
  listEncryptedBackups,
  readEncryptedBackup,
  uploadEncryptedBackup,
  type StoredBackup,
} from '../../../core/backupUpload';
import { cloudBackupAdapterForCurrentUser, cloudBackupConfigured } from '../cloudBackup';
import {
  diffDatasets,
  restoreSections,
  RESTORABLE_SECTIONS,
  type SectionDiff,
  type SectionId,
} from '../../../core/backupDiff';
import { stripLegacySecrets } from '../vault';
import {
  autoBackupPassphrase,
  listRestorePoints,
  markBackupExported,
  readRestorePoint,
  removeRestorePoint,
  saveRestorePoint,
} from '../backupStore';

type BackupProps = Pick<ViewProps, 'ds' | 'update' | 'notify' | 'userId'>;

function safeCopy(ds: Dataset): Dataset {
  const copy = structuredClone(ds);
  stripLegacySecrets(copy);
  return copy;
}

export function EncryptedBackupSection({ ds, update, notify, userId }: BackupProps) {
  const [passphrase, setPassphrase] = useState('');
  const [label, setLabel] = useState('');
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const points = useMemo(() => listRestorePoints(userId), [userId, version]);
  const automaticCount = points.filter((point) => point.automatic).length;
  const manualCount = points.length - automaticCount;

  const refresh = () => setVersion((value) => value + 1);

  const applyRestored = (restored: Dataset, source: string) => {
    if (!confirm(`Restore ${source}? Every budget record on this device will be replaced.\n\nA plain safety copy of the current budget will download first.`)) return false;
    download(`financehub-before-restore-${todayIso()}.json`, JSON.stringify(safeCopy(ds), null, 2), 'application/json');
    update((dataset) => {
      for (const key of Object.keys(dataset)) delete (dataset as unknown as Record<string, unknown>)[key];
      Object.assign(dataset, restored);
    });
    notify(`Restored ${restored.transactions.length} transactions from ${source}`);
    return true;
  };

  const [compare, setCompare] = useState<{ label: string; createdAt: string; dataset: Dataset; diff: SectionDiff[] } | null>(null);
  const [selectedSections, setSelectedSections] = useState<SectionId[]>([]);
  const [cloudRows, setCloudRows] = useState<StoredBackup[]>([]);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudError, setCloudError] = useState<string | null>(null);

  const loadCloud = async () => {
    if (!cloudBackupConfigured) return;
    setCloudBusy(true);
    try {
      const adapter = await cloudBackupAdapterForCurrentUser();
      setCloudRows(await listEncryptedBackups(adapter));
      setCloudError(null);
    } catch (error) {
      setCloudRows([]);
      setCloudError(error instanceof Error ? error.message : 'Cloud backups are unavailable');
    } finally {
      setCloudBusy(false);
    }
  };

  useEffect(() => {
    void loadCloud();
    // The list belongs to one signed-in user; reload when that changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const uploadCloud = async () => {
    if (passphrase.length < MIN_BACKUP_PASSPHRASE) {
      notify(`Use at least ${MIN_BACKUP_PASSPHRASE} characters for the backup passphrase`);
      return;
    }
    setCloudBusy(true);
    try {
      const adapter = await cloudBackupAdapterForCurrentUser();
      const backup = await encryptBackup(safeCopy(ds), passphrase);
      const result = await uploadEncryptedBackup(adapter, backup);
      markBackupExported(userId, backup.createdAt);
      setPassphrase('');
      notify(`Uploaded ${result.name} — ${result.kept} of ${BACKUP_RETENTION} cloud backups kept${result.removed.length ? `, ${result.removed.length} older removed` : ''}`);
      await loadCloud();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'The cloud backup could not be uploaded');
    } finally {
      setCloudBusy(false);
    }
  };

  const restoreCloud = async (name: string) => {
    if (passphrase.length < MIN_BACKUP_PASSPHRASE) {
      notify('Enter the backup passphrase to unlock a cloud backup');
      return;
    }
    setCloudBusy(true);
    try {
      const adapter = await cloudBackupAdapterForCurrentUser();
      const text = await readEncryptedBackup(adapter, name);
      if (!text) { notify('That cloud backup is no longer available'); await loadCloud(); return; }
      const plain = await decryptBackup(text, passphrase);
      const restored = plain ? decodeBackupDataset(plain) : null;
      if (!restored) { notify('That cloud backup could not be decrypted with that passphrase'); return; }
      if (applyRestored(restored, `cloud backup ${name}`)) setPassphrase('');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'The cloud backup could not be restored');
    } finally {
      setCloudBusy(false);
    }
  };

  const removeCloud = async (name: string) => {
    if (!confirm(`Remove cloud backup “${name}”?\n\nThe budget on this device is not affected.`)) return;
    setCloudBusy(true);
    try {
      const adapter = await cloudBackupAdapterForCurrentUser();
      await adapter.remove(name);
      notify('Cloud backup removed');
      await loadCloud();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'The cloud backup could not be removed');
    } finally {
      setCloudBusy(false);
    }
  };

  const createBackup = async () => {
    if (passphrase.length < MIN_BACKUP_PASSPHRASE) {
      notify(`Use at least ${MIN_BACKUP_PASSPHRASE} characters for the backup passphrase`);
      return;
    }
    setBusy(true);
    try {
      const backup = await encryptBackup(safeCopy(ds), passphrase);
      download(`financehub-backup-${todayIso()}.financehub.json`, JSON.stringify(backup, null, 2), 'application/json');
      markBackupExported(userId, backup.createdAt);
      saveRestorePoint(userId, backup, label.trim() || `Export ${dateTimeUk(backup.createdAt)}`);
      refresh();
      setPassphrase('');
      notify('Encrypted backup exported and kept as a restore point');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'The encrypted backup could not be created');
    } finally {
      setBusy(false);
    }
  };

  const createPoint = async () => {
    if (passphrase.length < MIN_BACKUP_PASSPHRASE) {
      notify(`Use at least ${MIN_BACKUP_PASSPHRASE} characters for the backup passphrase`);
      return;
    }
    setBusy(true);
    try {
      const backup = await encryptBackup(safeCopy(ds), passphrase);
      if (!saveRestorePoint(userId, backup, label.trim() || `Restore point ${dateTimeUk(backup.createdAt)}`)) {
        notify('The restore point could not be stored on this device');
        return;
      }
      refresh();
      setPassphrase('');
      setLabel('');
      notify('Encrypted restore point saved — the newest seven manual points are retained');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'The restore point could not be created');
    } finally {
      setBusy(false);
    }
  };

  const restorePoint = async (id: string) => {
    const point = points.find((entry) => entry.id === id);
    const secret = point?.automatic ? autoBackupPassphrase(userId) : passphrase;
    if (!secret || (!point?.automatic && passphrase.length < MIN_BACKUP_PASSPHRASE)) {
      notify(point?.automatic
        ? 'The automatic backup key is no longer available on this device'
        : 'Enter the backup passphrase to unlock this restore point');
      return;
    }
    const backup = readRestorePoint(userId, id);
    if (!backup) { notify('That restore point is no longer available'); refresh(); return; }
    setBusy(true);
    try {
      const plain = await decryptBackup(backup, secret);
      const restored = plain ? decodeBackupDataset(plain) : null;
      if (!restored) { notify('The restore point could not be decrypted with that passphrase'); return; }
      if (applyRestored(restored, `restore point ${dateTimeUk(backup.createdAt)}`)) setPassphrase('');
    } finally {
      setBusy(false);
    }
  };

  /**
   * Decrypts one point and reports per-section differences against the live
   * budget, so a restore is a decision rather than a guess. Nothing is written.
   */
  const comparePoint = async (id: string) => {
    const point = points.find((entry) => entry.id === id);
    const secret = point?.automatic ? autoBackupPassphrase(userId) : passphrase;
    if (!secret || (!point?.automatic && passphrase.length < MIN_BACKUP_PASSPHRASE)) {
      notify(point?.automatic
        ? 'The automatic backup key is no longer available on this device'
        : 'Enter the backup passphrase to compare this restore point');
      return;
    }
    const backup = readRestorePoint(userId, id);
    if (!backup) { notify('That restore point is no longer available'); refresh(); return; }
    setBusy(true);
    try {
      const plain = await decryptBackup(backup, secret);
      const restored = plain ? decodeBackupDataset(plain) : null;
      if (!restored) { notify('The restore point could not be decrypted with that passphrase'); return; }
      const diff = diffDatasets(ds, restored);
      setCompare({ label: point?.label ?? 'restore point', createdAt: backup.createdAt, dataset: restored, diff });
      setSelectedSections(diff.filter((section) => !section.identical && RESTORABLE_SECTIONS.includes(section.id)).map((section) => section.id));
    } finally {
      setBusy(false);
    }
  };

  const toggleSection = (id: SectionId) => {
    setSelectedSections((current) => current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]);
  };

  const restoreSelected = () => {
    if (!compare || selectedSections.length === 0) return;
    const labels = compare.diff.filter((section) => selectedSections.includes(section.id)).map((section) => section.label).join(', ');
    if (!confirm(`Restore ${labels} from ${compare.label} (${dateTimeUk(compare.createdAt)})?\n\nOnly those sections change; every other record stays as it is now. A plain safety copy downloads first.`)) return;
    download(`financehub-before-section-restore-${todayIso()}.json`, JSON.stringify(safeCopy(ds), null, 2), 'application/json');
    const chosen = [...selectedSections];
    update((dataset) => {
      const next = restoreSections(dataset, compare.dataset, chosen);
      for (const key of Object.keys(dataset)) delete (dataset as unknown as Record<string, unknown>)[key];
      Object.assign(dataset, next);
    });
    notify(`Restored ${chosen.length} section${chosen.length === 1 ? '' : 's'} from ${compare.label}`);
    setCompare(null);
    setSelectedSections([]);
  };

  const restoreFile = async (file: File) => {
    const sizeProblem = backupFileProblem(file.size);
    if (sizeProblem) { notify(sizeProblem); return; }
    if (passphrase.length < MIN_BACKUP_PASSPHRASE) {
      notify('Enter the backup passphrase before choosing an encrypted backup');
      return;
    }
    let text = '';
    try { text = await file.text(); } catch { notify('That backup could not be read'); return; }
    setBusy(true);
    try {
      const plain = await decryptBackup(text, passphrase);
      const restored = plain ? decodeBackupDataset(plain) : null;
      if (!restored) { notify('That file is not a valid encrypted FinanceHub backup, or the passphrase is wrong'); return; }
      if (applyRestored(restored, `encrypted backup ${file.name}`)) setPassphrase('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
    <Section
      title="Encrypted backups & restore points"
      sub="Backup format v2 encrypts the complete budget with PBKDF2-SHA-256 and AES-256-GCM. One automatic restore point is created each day and the newest 30 stay on this device; manual restore points keep the newest seven."
      actions={<Badge tone={points.length ? 'green' : 'neutral'}>{`${manualCount}/7 manual · ${automaticCount}/30 daily`}</Badge>}
    >
      <div className="inline-form">
        <Field label="Backup passphrase" hint={`At least ${MIN_BACKUP_PASSPHRASE} characters; never stored`}>
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            value={passphrase}
            onChange={(event) => setPassphrase(event.target.value)}
          />
        </Field>
        <Field label="Restore point label" hint="Optional">
          <input className="input" value={label} onChange={(event) => setLabel(event.target.value)} maxLength={80} />
        </Field>
        <button className="btn primary" type="button" disabled={busy} onClick={() => void createBackup()} title="Encrypt, download and keep a restore point">
          Export encrypted backup
        </button>
        <button className="btn" type="button" disabled={busy} onClick={() => void createPoint()}>Save restore point</button>
        <button className="btn ghost" type="button" disabled={busy} onClick={() => fileInput.current?.click()}>Restore encrypted backup…</button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,.financehub,application/json"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void restoreFile(file);
          }}
        />
      </div>
      <div style={{ padding: '0 16px 16px' }} className="notice info">
        A restore replaces every budget record after downloading a plain safety copy. Keep the passphrase somewhere separate: without it, neither an exported backup nor a manual restore point can be opened. Automatic daily points keep 30 days of history, use a key held in this device's secure store and restore here without a prompt.
      </div>
      {compare && (
        <div style={{ padding: '12px 16px' }}>
          <div className="toolbar" style={{ borderBottom: 0 }}>
            <Badge tone="blue">Comparing {compare.label} · {dateTimeUk(compare.createdAt)}</Badge>
            <div className="toolbar-spacer" />
            <button className="btn primary sm" disabled={busy || selectedSections.length === 0} onClick={restoreSelected}>
              Restore {selectedSections.length} section{selectedSections.length === 1 ? '' : 's'}
            </button>
            <button className="btn ghost sm" disabled={busy} onClick={() => { setCompare(null); setSelectedSections([]); }}>Close</button>
          </div>
          <Table head={['Section', 'Only in this point', 'Only in the budget now', 'Changed', 'Restore']}>
            {compare.diff.filter((section) => RESTORABLE_SECTIONS.includes(section.id)).map((section) => (
              <tr key={section.id}>
                <td>
                  <strong>{section.label}</strong>
                  {section.identical && <span className="muted small"> · identical</span>}
                </td>
                <td className="num">{section.added || '—'}</td>
                <td className="num">{section.removed || '—'}</td>
                <td className="num">{section.changed || '—'}</td>
                <td>
                  <input
                    type="checkbox"
                    checked={selectedSections.includes(section.id)}
                    disabled={section.identical || busy}
                    onChange={() => toggleSection(section.id)}
                    aria-label={`Restore ${section.label} from this point`}
                  />
                </td>
              </tr>
            ))}
          </Table>
          <div className="muted small" style={{ marginTop: 8 }}>
            Settings and month locks are compared but only a full restore replaces them, because they carry the budget year, As-of and anchor dates.
          </div>
        </div>
      )}
      {points.length === 0 ? (
        <div style={{ padding: 16 }}><Empty>No encrypted restore points yet. Create one before a large edit or import.</Empty></div>
      ) : (
        <Table head={['Created', 'Label', 'Size', '']}>
          {points.map((point) => (
            <tr key={point.id}>
              <td className="muted">{dateTimeUk(point.createdAt)}</td>
              <td>{point.automatic && <Badge tone="blue">Auto</Badge>} {point.label}</td>
              <td className="num muted">{Math.ceil(point.bytes / 1024)} KB</td>
              <td className="nowrap">
                <button className="btn ghost sm" disabled={busy} onClick={() => void restorePoint(point.id)}>Restore</button>{' '}
                <button className="btn ghost sm" disabled={busy} onClick={() => void comparePoint(point.id)}>Compare</button>{' '}
                <button className="btn ghost sm" disabled={busy} onClick={() => {
                  if (!confirm(`Remove restore point “${point.label}”?`)) return;
                  if (removeRestorePoint(userId, point.id)) { refresh(); notify('Restore point removed'); }
                  else notify('That restore point could not be removed');
                }}>Remove</button>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </Section>

    {cloudBackupConfigured && (
      <Section
        title="Cloud backups"
        sub="Uploads the same encrypted envelope to your private Supabase bucket. The bucket only allows your own folder, and the newest seven uploads are kept. The passphrase above unlocks them on any device; only the ciphertext leaves this device."
        actions={<Badge tone={cloudError ? 'amber' : cloudRows.length ? 'green' : 'neutral'}>{cloudBusy ? 'Working…' : `${cloudRows.length}/${BACKUP_RETENTION} uploads`}</Badge>}
      >
        <div className="toolbar" style={{ borderBottom: 0 }}>
          <button className="btn primary" type="button" disabled={busy || cloudBusy} onClick={() => void uploadCloud()}>
            Upload encrypted backup
          </button>
          <button className="btn ghost" type="button" disabled={cloudBusy} onClick={() => void loadCloud()}>
            Refresh list
          </button>
          <span className="muted small">Uses the backup passphrase above.</span>
        </div>
        {cloudError && <div className="notice warn" style={{ margin: 12 }}>{cloudError}</div>}
        {!cloudError && cloudRows.length === 0 && (
          <div style={{ padding: 16 }}><Empty>{cloudBusy ? 'Loading cloud backups…' : 'No cloud backups uploaded yet.'}</Empty></div>
        )}
        {cloudRows.length > 0 && (
          <Table head={['Uploaded', 'File', 'Size', '']}>
            {cloudRows.map((row) => (
              <tr key={row.name}>
                <td className="muted">{row.uploadedAt ? dateTimeUk(row.uploadedAt) : '—'}</td>
                <td className="muted small">{row.name}</td>
                <td className="num muted">{row.bytes ? `${Math.ceil(row.bytes / 1024)} KB` : '—'}</td>
                <td className="nowrap">
                  <button className="btn ghost sm" type="button" disabled={cloudBusy} onClick={() => void restoreCloud(row.name)}>Restore</button>{' '}
                  <button className="btn ghost sm" type="button" disabled={cloudBusy} onClick={() => void removeCloud(row.name)}>Remove</button>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
    )}
    </>
  );
}
