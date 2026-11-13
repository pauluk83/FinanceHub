import type { Dataset } from '../../core/engine';
import type { DataHealthReport } from '../../core/dataHealth';

export interface SupportRuntime {
  userAgent?: string;
  platform?: string;
  language?: string;
  online?: boolean;
}

export interface SupportApp {
  version: string;
  buildId: string;
  builtAt: string;
}

/**
 * A deliberately small diagnostic record. It never includes names, comments,
 * amounts, credentials, tokens or raw health messages: those can contain
 * personal data, so support gets counts and check identifiers only.
 */
export function buildSupportBundle({
  ds,
  report,
  app,
  conflicts = 0,
  backup,
  runtime = {},
  now = new Date().toISOString(),
}: {
  ds: Dataset;
  report: DataHealthReport;
  app: SupportApp;
  conflicts?: number;
  backup?: { lastExportedAt?: string | null; lastRestorePointAt?: string | null };
  runtime?: SupportRuntime;
  now?: string;
}) {
  return {
    schema: 'financehub-support-v1',
    generatedAt: now,
    app: {
      version: app.version,
      buildId: app.buildId,
      builtAt: app.builtAt,
    },
    environment: {
      userAgent: runtime.userAgent ?? '',
      platform: runtime.platform ?? '',
      language: runtime.language ?? '',
      online: runtime.online ?? null,
    },
    dataset: {
      settings: {
        targetYear: ds.settings.targetYear,
        monthsInYear: ds.settings.monthsInYear,
        currency: ds.settings.currency,
      },
      counts: {
        transactions: ds.transactions.length,
        accounts: ds.accounts.length,
        people: ds.people.length,
        cards: ds.cards.length,
        bills: ds.bills.length,
        providers: Object.keys(ds.providers ?? {}).length,
        lockedMonths: Object.keys(ds.monthLocks ?? {}).length,
        holidays: Object.keys(ds.holidays ?? {}).length,
      },
    },
    health: {
      status: report.status,
      counts: report.counts,
      checks: report.checks.map((check) => ({ id: check.id, severity: check.severity })),
    },
    sync: { conflicts },
    backup: {
      lastExportedAt: backup?.lastExportedAt ?? null,
      lastRestorePointAt: backup?.lastRestorePointAt ?? null,
    },
  };
}
