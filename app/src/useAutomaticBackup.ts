import { useEffect, useRef } from 'react';
import type { Dataset } from '../../core/engine';
import { shouldCreateAutomaticBackup } from '../../core/backupSchedule';
import { encryptBackup } from './backupArchive';
import { autoBackupPassphrase, latestAutomaticRestorePointAt, saveRestorePoint } from './backupStore';
import { stripLegacySecrets } from './vault';

/**
 * Creates one encrypted restore point per day while the app is open.
 *
 * The passphrase is random and kept in this device's secure store, so automatic
 * points restore without a prompt here but do not travel to another device. An
 * explicitly exported backup still uses the user's own backup passphrase.
 */
export function useAutomaticBackup({
  userId,
  ds,
  enabled,
  notify,
}: {
  userId: string;
  ds: Dataset;
  enabled: boolean;
  notify?: (message: string) => void;
}) {
  const datasetRef = useRef(ds);
  const notifyRef = useRef(notify);
  const running = useRef(false);
  datasetRef.current = ds;
  notifyRef.current = notify;

  useEffect(() => {
    if (!enabled || !userId) return;
    let disposed = false;

    const run = async () => {
      if (disposed || running.current) return;
      if (!shouldCreateAutomaticBackup(latestAutomaticRestorePointAt(userId))) return;
      running.current = true;
      try {
        const passphrase = autoBackupPassphrase(userId);
        if (!passphrase) {
          notifyRef.current?.('The automatic backup key could not be stored on this device');
          return;
        }
        const copy = structuredClone(datasetRef.current);
        stripLegacySecrets(copy);
        const backup = await encryptBackup(copy, passphrase);
        if (!saveRestorePoint(userId, backup, 'Automatic daily backup', true)) {
          notifyRef.current?.('The automatic backup could not be stored on this device');
        }
      } catch {
        notifyRef.current?.('The automatic backup could not be created');
      } finally {
        running.current = false;
      }
    };

    void run();
    const timer = window.setInterval(() => { void run(); }, 6 * 60 * 60 * 1000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [enabled, userId]);
}
