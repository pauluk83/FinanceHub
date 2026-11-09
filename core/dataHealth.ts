/**
 * Read-only data-integrity checks.
 *
 * Everything here inspects the loaded budget and returns findings. Nothing is
 * deleted, merged, renumbered or recalculated; the owner follows the link to
 * the relevant screen and decides what to change.
 */
import type { BillSheet, Dataset, Engine } from './engine.ts';
import { accountsNeedingReview } from './accounts.ts';
import { duplicateGroups } from './importDedupe.ts';
import { providerBlockYear, providerRowsKey } from './providerYears.ts';

export type HealthSeverity = 'ok' | 'info' | 'warning' | 'critical';

export interface HealthCheck {
  id: string;
  title: string;
  severity: HealthSeverity;
  summary: string;
  items: string[];
  action?: { label: string; view: string };
}

export interface DataHealthReport {
  status: 'ok' | 'warning' | 'critical';
  counts: Record<HealthSeverity, number>;
  issueCount: number;
  checks: HealthCheck[];
  stats: {
    transactions: number;
    accounts: number;
    people: number;
    cards: number;
    bills: number;
    providers: number;
    lockedMonths: number;
  };
}

export interface DataHealthOptions {
  /** The link sheets the bill editor offers, including historical names. */
  sheets?: readonly BillSheet[];
  syncConflicts?: number;
}

function money(pence: number): string {
  return `${pence < 0 ? '-' : ''}£${(Math.abs(pence) / 100).toFixed(2)}`;
}

function lastBalance(rows: readonly any[]): number | null {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    if (typeof rows[index]?.balancePence === 'number') return rows[index].balancePence;
  }
  return null;
}

function providerLabel(key: string, provider: any): string {
  const label = provider?.displayName ?? provider?.name;
  return typeof label === 'string' && label.trim() ? label.trim() : key;
}

function unknownAccountCheck(ds: Dataset): HealthCheck {
  const accounts = accountsNeedingReview(ds.transactions, ds, ds.settings.asOfDate);
  if (!accounts.length) {
    return {
      id: 'unknown-accounts',
      title: 'Account names',
      severity: 'ok',
      summary: 'Every transaction account is a bank, person, card or pseudo-account.',
      items: [],
      action: { label: 'Open Accounts', view: 'accounts' },
    };
  }
  return {
    id: 'unknown-accounts',
    title: 'Unresolved account names',
    severity: 'warning',
    summary: `${accounts.length} account name${accounts.length === 1 ? '' : 's'} cannot be matched to a ledger. Their rows stay in the log but are excluded from totals.`,
    items: accounts.map((account) =>
      `${account.name}: ${account.rows} row${account.rows === 1 ? '' : 's'} · ${money(account.expensePence)} spent · last ${account.lastDate || 'unknown'}`,
    ),
    action: { label: 'Review in Accounts', view: 'accounts' },
  };
}

function duplicateCheck(ds: Dataset): HealthCheck {
  const groups = duplicateGroups(ds.transactions.filter((transaction) => transaction.autoBill !== true));
  if (!groups.length) {
    return {
      id: 'duplicate-transactions',
      title: 'Duplicate transactions',
      severity: 'ok',
      summary: 'No saved rows share the same date, account, type and amount.',
      items: [],
      action: { label: 'Open duplicate check', view: 'settings' },
    };
  }
  const rows = groups.reduce((sum, group) => sum + group.rows.length, 0);
  return {
    id: 'duplicate-transactions',
    title: 'Possible duplicate transactions',
    severity: 'warning',
    summary: `${groups.length} group${groups.length === 1 ? '' : 's'} · ${rows} rows share the same date, account, type and amount. They have not been changed.`,
    items: groups.map((group) =>
      `${group.date} · ${group.account} · ${group.type} · ${money(group.amountPence)} · ${group.rows.length} rows`,
    ),
    action: { label: 'Review duplicate check', view: 'settings' },
  };
}

function providerYearCheck(ds: Dataset): HealthCheck {
  const issues: string[] = [];
  let checked = 0;

  for (const [key, provider] of Object.entries(ds.providers ?? {})) {
    if (!provider || typeof provider !== 'object') continue;
    const liveYear = providerBlockYear(provider);
    if (liveYear === null) continue;

    const blockYears = Object.keys(provider.years ?? {})
      .map(Number)
      .filter((year) => Number.isInteger(year) && year > liveYear)
      .sort((a, b) => a - b);
    if (!blockYears.length) continue;
    checked += 1;

    const rows = Array.isArray(provider[providerRowsKey(key)]) ? provider[providerRowsKey(key)] : [];
    let previousClose = lastBalance(rows);
    if (previousClose === null && typeof provider.closingBalancePence === 'number') {
      previousClose = provider.closingBalancePence;
    }
    if (previousClose === null) {
      issues.push(`${providerLabel(key, provider)}: the ${liveYear} rows have no closing balance to carry forward.`);
      continue;
    }

    for (const year of blockYears) {
      const block = provider.years?.[String(year)];
      if (!block || !Array.isArray(block.rows)) {
        issues.push(`${providerLabel(key, provider)} ${year}: the year block has no row list.`);
        continue;
      }
      if (typeof block.openingPence !== 'number') {
        issues.push(`${providerLabel(key, provider)} ${year}: opening balance is missing; expected ${money(previousClose)}.`);
      } else if (block.openingPence !== previousClose) {
        issues.push(`${providerLabel(key, provider)} ${year}: opens at ${money(block.openingPence)}, but the previous close is ${money(previousClose)}.`);
      }

      const rowClose = lastBalance(block.rows);
      if (typeof block.closingPence !== 'number') {
        issues.push(`${providerLabel(key, provider)} ${year}: closing balance is missing.`);
      } else if (rowClose !== null && block.closingPence !== rowClose) {
        issues.push(`${providerLabel(key, provider)} ${year}: closing balance says ${money(block.closingPence)}, but the final row is ${money(rowClose)}.`);
      }

      previousClose = rowClose ?? (typeof block.closingPence === 'number' ? block.closingPence : previousClose);
    }
  }

  if (!issues.length) {
    return {
      id: 'provider-year-chain',
      title: 'Provider year chains',
      severity: 'ok',
      summary: checked
        ? `${checked} provider year chain${checked === 1 ? '' : 's'} checked; every later block opens from the previous close.`
        : 'No future provider year blocks need checking.',
      items: [],
    };
  }

  return {
    id: 'provider-year-chain',
    title: 'Provider year-chain breaks',
    severity: 'warning',
    summary: `${issues.length} break${issues.length === 1 ? '' : 's'} in ${checked} provider year chain${checked === 1 ? '' : 's'}. Later-year bills may not match the running balance.`,
    items: issues,
  };
}

function billLinkCheck(ds: Dataset, sheets: readonly BillSheet[]): HealthCheck {
  const providerBySheet = new Map(sheets.map((sheet) => [sheet.name.trim(), sheet.providerKey]));
  const issues: string[] = [];
  let linked = 0;

  for (const bill of ds.bills) {
    const sheetName = bill.linkedSheet?.trim();
    if (!sheetName) continue;
    linked += 1;
    const providerKey = providerBySheet.get(sheetName);
    if (!providerKey) {
      issues.push(`${bill.name}: “${sheetName}” is not connected to a provider ledger.`);
    } else if (!ds.providers?.[providerKey]) {
      issues.push(`${bill.name}: “${sheetName}” points to the ${providerKey} ledger, which has no data.`);
    }
  }

  if (!issues.length) {
    return {
      id: 'bill-links',
      title: 'Bill links',
      severity: 'ok',
      summary: linked
        ? `${linked} linked bill${linked === 1 ? '' : 's'} resolve to a provider ledger.`
        : 'No bills are linked to provider ledgers.',
      items: [],
      action: { label: 'Open Bills', view: 'bills' },
    };
  }

  return {
    id: 'bill-links',
    title: 'Linked bills with no ledger',
    severity: 'warning',
    summary: `${issues.length} linked bill${issues.length === 1 ? '' : 's'} cannot read a provider statement or payment history.`,
    items: issues,
    action: { label: 'Review in Bills', view: 'bills' },
  };
}

function billChangeCheck(ds: Dataset): HealthCheck {
  const names = new Set(ds.bills.map((bill) => bill.name));
  const orphaned = (ds.billChanges ?? []).filter((change) => !names.has(change.bill));
  if (!orphaned.length) {
    return {
      id: 'bill-changes',
      title: 'Bill changes',
      severity: 'ok',
      summary: 'Every bill change points to a bill that exists.',
      items: [],
      action: { label: 'Open Bills', view: 'bills' },
    };
  }
  return {
    id: 'bill-changes',
    title: 'Bill changes with no bill',
    severity: 'warning',
    summary: `${orphaned.length} change${orphaned.length === 1 ? '' : 's'} refer to a bill that is no longer in the budget, so they cannot affect a schedule.`,
    items: orphaned.map((change) => `${change.bill}: ${change.appliesFrom || 'no start'} to ${change.appliesTo || 'no end'}`),
    action: { label: 'Review in Bills', view: 'bills' },
  };
}

function balanceDifferences(
  label: string,
  saved: readonly { name: string; balancePence: number }[] | undefined,
  live: readonly { name: string; balancePence: number }[],
): string[] {
  if (!Array.isArray(saved)) return [`${label}: no snapshot was recorded.`];
  const current = new Map(live.map((item) => [item.name, item.balancePence]));
  const seen = new Set<string>();
  const differences: string[] = [];

  for (const row of saved) {
    seen.add(row.name);
    if (!current.has(row.name)) {
      differences.push(`${label} ${row.name}: removed after the lock (snapshot ${money(row.balancePence)}).`);
    } else if (current.get(row.name) !== row.balancePence) {
      differences.push(`${label} ${row.name}: snapshot ${money(row.balancePence)}, live ${money(current.get(row.name) ?? 0)}.`);
    }
  }
  for (const [name, balancePence] of current) {
    if (!seen.has(name)) differences.push(`${label} ${name}: added after the lock (live ${money(balancePence)}).`);
  }
  return differences;
}

function lockedMonthCheck(ds: Dataset, engine: Engine): HealthCheck {
  const locks = Object.entries(ds.monthLocks ?? {});
  if (!locks.length) {
    return {
      id: 'locked-month-drift',
      title: 'Locked month snapshots',
      severity: 'ok',
      summary: 'No months have been locked yet.',
      items: [],
      action: { label: 'Open Month end', view: 'monthEnd' },
    };
  }

  const issues: string[] = [];
  let differing = 0;

  for (const [key, lock] of locks) {
    const match = /^(\d{4})-(\d{2})$/.exec(key);
    const year = match ? Number(match[1]) : 0;
    const month = match ? Number(match[2]) : 0;
    if (!match || month < 1 || month > 12) {
      differing += 1;
      issues.push(`${key}: the lock key is not a valid year-month.`);
      continue;
    }
    if (!lock || typeof lock !== 'object') {
      differing += 1;
      issues.push(`${key}: the lock has no snapshot.`);
      continue;
    }

    const dashboard = engine.dashboard(year, month);
    const differences: string[] = [];
    if (!lock.lockedAt) differences.push('no lock timestamp');
    differences.push(...balanceDifferences('Account', lock.accounts, dashboard.accounts));
    differences.push(...balanceDifferences('Card', lock.cards, dashboard.cards));
    differences.push(...balanceDifferences(
      'Person',
      lock.people?.map((person) => ({ name: person.shortName, balancePence: person.balancePence })),
      dashboard.owedByPerson.map((person) => ({ name: person.shortName, balancePence: person.balancePence })),
    ));
    if (lock.bills !== undefined) {
      differences.push(...balanceDifferences(
        'Bill',
        lock.bills.map((bill) => ({ name: bill.name, balancePence: bill.amountPence })),
        dashboard.bills.map((bill) => ({ name: bill.name, balancePence: bill.amountPence })),
      ));
    }

    if (differences.length) {
      differing += 1;
      issues.push(`${key}: ${differences.join('; ')}`);
    }
  }

  if (!issues.length) {
    return {
      id: 'locked-month-drift',
      title: 'Locked month snapshots',
      severity: 'ok',
      summary: `${locks.length} locked month${locks.length === 1 ? '' : 's'} still match the live balances and bills.`,
      items: [],
      action: { label: 'Open Month end', view: 'monthEnd' },
    };
  }

  return {
    id: 'locked-month-drift',
    title: 'Locked months have drifted',
    severity: 'warning',
    summary: `${differing} locked month${differing === 1 ? '' : 's'} no longer match the live data behind the snapshot.`,
    items: issues,
    action: { label: 'Review Month end', view: 'monthEnd' },
  };
}

function dormantAccountCheck(ds: Dataset): HealthCheck {
  const year = ds.settings.targetYear;
  const moved = new Set(
    ds.transactions
      .filter((transaction) => transaction.autoBill !== true && transaction.date.slice(0, 4) === String(year))
      .map((transaction) => transaction.account),
  );
  const dormant = ds.accounts.filter((account) => account.active && !moved.has(account.name));
  if (!dormant.length) {
    return {
      id: 'dormant-accounts',
      title: 'Dormant accounts',
      severity: 'ok',
      summary: `Every active account has a movement in ${year}.`,
      items: [],
      action: { label: 'Open Accounts', view: 'accounts' },
    };
  }
  return {
    id: 'dormant-accounts',
    title: 'Active accounts with no movements',
    severity: 'info',
    summary: `${dormant.length} active account${dormant.length === 1 ? '' : 's'} had no movement in ${year}. This is a note, not an error.`,
    items: dormant.map((account) => `${account.name}: no non-generated transaction in ${year}.`),
    action: { label: 'Review in Accounts', view: 'accounts' },
  };
}

function syncConflictCheck(count: number): HealthCheck {
  if (count <= 0) {
    return {
      id: 'sync-conflicts',
      title: 'Sync conflicts',
      severity: 'ok',
      summary: 'No unresolved sync conflicts are waiting for a decision.',
      items: [],
      action: { label: 'Open Settings', view: 'settings' },
    };
  }
  return {
    id: 'sync-conflicts',
    title: 'Unresolved sync conflicts',
    severity: 'warning',
    summary: `${count} conflict${count === 1 ? '' : 's'} need a local-or-remote choice. Both copies remain available until you decide.`,
    items: [`${count} unresolved conflict${count === 1 ? '' : 's'}.`],
    action: { label: 'Open Settings', view: 'settings' },
  };
}

export function buildDataHealth(ds: Dataset, engine: Engine, options: DataHealthOptions = {}): DataHealthReport {
  const checks = [
    unknownAccountCheck(ds),
    duplicateCheck(ds),
    providerYearCheck(ds),
    billLinkCheck(ds, options.sheets ?? []),
    billChangeCheck(ds),
    lockedMonthCheck(ds, engine),
    dormantAccountCheck(ds),
    syncConflictCheck(options.syncConflicts ?? 0),
  ];

  const counts: Record<HealthSeverity, number> = { ok: 0, info: 0, warning: 0, critical: 0 };
  for (const check of checks) counts[check.severity] += 1;

  return {
    status: counts.critical ? 'critical' : counts.warning ? 'warning' : 'ok',
    counts,
    issueCount: counts.warning + counts.critical,
    checks,
    stats: {
      transactions: ds.transactions.length,
      accounts: ds.accounts.length,
      people: ds.people.length,
      cards: ds.cards.length,
      bills: ds.bills.length,
      providers: Object.keys(ds.providers ?? {}).length,
      lockedMonths: Object.keys(ds.monthLocks ?? {}).length,
    },
  };
}
