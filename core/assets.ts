/**
 * Net worth: manual assets on top of the balances the engine already owns.
 *
 * The formula is deliberately the plain one the plan promises:
 *   bank accounts + savings + assets − cards − debts
 * Provider ledgers stay out because the bills already account for them, and
 * every item can be excluded so nothing is counted twice.
 */
import type { Dataset, Engine } from './engine.ts';

export type AssetKind = 'property' | 'vehicle' | 'pension' | 'investment' | 'other';

export const ASSET_KINDS: { id: AssetKind; label: string }[] = [
  { id: 'property', label: 'Property' },
  { id: 'vehicle', label: 'Vehicle' },
  { id: 'pension', label: 'Pension' },
  { id: 'investment', label: 'Investment' },
  { id: 'other', label: 'Other' },
];

export interface Asset {
  id: string;
  name: string;
  kind: AssetKind;
  /** The owner's full valuation in pence, before the ownership share. */
  valuePence: number;
  /** The share of the valuation that belongs to this budget, 0–100. */
  ownershipPct: number;
  /** False hides the asset from totals without deleting its history. */
  includeInNetWorth?: boolean;
  active?: boolean;
  notes?: string;
}

export function ownedValuePence(asset: Asset): number {
  const pct = Number.isFinite(asset.ownershipPct) ? Math.max(0, Math.min(100, asset.ownershipPct)) : 100;
  return Math.round((Number.isFinite(asset.valuePence) ? asset.valuePence : 0) * pct / 100);
}

export interface NetWorthLine {
  name: string;
  balancePence: number;
}

export interface NetWorthBreakdown {
  asOf: string;
  accountsPence: number;
  savingsPence: number;
  assetsPence: number;
  cardsPence: number;
  debtsPence: number;
  netPence: number;
  accounts: NetWorthLine[];
  savings: NetWorthLine[];
  assets: { id: string; name: string; kind: AssetKind; valuePence: number }[];
  cards: NetWorthLine[];
  debts: NetWorthLine[];
  /** Names deliberately left out of the totals, for the transparency note. */
  excluded: string[];
}

export function netWorth(ds: Dataset, engine: Engine, through: string): NetWorthBreakdown {
  const excluded: string[] = [];

  const accounts = engine.accountBalances(through)
    .filter((account) => {
      if (account.active === false) return false;
      if (account.excludeFromNetWorth === true) {
        excluded.push(account.name);
        return false;
      }
      return true;
    })
    .map((account) => ({ name: account.name, balancePence: account.balancePence }));

  const savings = (ds.savings ?? [])
    .filter((account) => {
      if (account.active === false) return false;
      if (account.excludeFromNetWorth === true) {
        excluded.push(account.name);
        return false;
      }
      return true;
    })
    .map((account) => ({ name: account.name, balancePence: account.balancePence }));

  const assets = (ds.assets ?? [])
    .filter((asset) => {
      if (asset.active === false) return false;
      if (asset.includeInNetWorth === false) {
        excluded.push(asset.name);
        return false;
      }
      return true;
    })
    .map((asset) => ({ id: asset.id, name: asset.name, kind: asset.kind, valuePence: ownedValuePence(asset) }));

  const cards = engine.cardBalances(through)
    .filter((card) => card.active !== false)
    .map((card) => ({ name: card.name, balancePence: card.balancePence }));

  const debts = (ds.debts ?? [])
    .filter((debt) => debt.active !== false)
    .map((debt) => ({ name: debt.name, balancePence: debt.balancePence }));

  const accountsPence = accounts.reduce((sum, line) => sum + line.balancePence, 0);
  const savingsPence = savings.reduce((sum, line) => sum + line.balancePence, 0);
  const assetsPence = assets.reduce((sum, line) => sum + line.valuePence, 0);
  const cardsPence = cards.reduce((sum, line) => sum + line.balancePence, 0);
  const debtsPence = debts.reduce((sum, line) => sum + line.balancePence, 0);

  return {
    asOf: through,
    accountsPence,
    savingsPence,
    assetsPence,
    cardsPence,
    debtsPence,
    netPence: accountsPence + savingsPence + assetsPence - cardsPence - debtsPence,
    accounts,
    savings,
    assets,
    cards,
    debts,
    excluded,
  };
}

export interface NetWorthPoint {
  key: string;
  label: string;
  netPence: number;
  accountsPence: number;
  savingsPence: number;
  assetsPence: number;
  cardsPence: number;
  debtsPence: number;
  source: 'lock' | 'live';
  /**
   * Older locks only froze accounts, cards and people. A point without savings,
   * debts and assets recorded is shown but never invented.
   */
  complete: boolean;
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (value: number) => String(value).padStart(2, '0');

/** The last `months` recorded closes, ending with the live figure for the current month. */
export function netWorthTrend(ds: Dataset, engine: Engine, through: string, months = 12): NetWorthPoint[] {
  const currentKey = through.slice(0, 7);
  const excludeAccounts = new Set(ds.accounts.filter((account) => account.excludeFromNetWorth === true).map((account) => account.name));
  const excludeSavings = new Set((ds.savings ?? []).filter((account) => account.excludeFromNetWorth === true).map((account) => account.name));

  const points: NetWorthPoint[] = Object.entries(ds.monthLocks ?? {})
    .filter(([key]) => key <= currentKey)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, lock]) => {
      const accountsPence = lock.accounts
        .filter((account) => !excludeAccounts.has(account.name))
        .reduce((sum, account) => sum + account.balancePence, 0);
      const cardsPence = lock.cards.reduce((sum, card) => sum + card.balancePence, 0);
      const savingsPence = (lock.savings ?? [])
        .filter((account) => !excludeSavings.has(account.name))
        .reduce((sum, account) => sum + account.balancePence, 0);
      const debtsPence = (lock.debts ?? []).reduce((sum, debt) => sum + debt.balancePence, 0);
      const assetsPence = (lock.assets ?? []).reduce((sum, asset) => sum + asset.valuePence, 0);
      return {
        key,
        label: `${MONTH_SHORT[Number(key.slice(5, 7)) - 1]} ${key.slice(2, 4)}`,
        accountsPence,
        savingsPence,
        assetsPence,
        cardsPence,
        debtsPence,
        netPence: accountsPence + savingsPence + assetsPence - cardsPence - debtsPence,
        source: 'lock' as const,
        complete: lock.savings !== undefined && lock.debts !== undefined && lock.assets !== undefined,
      };
    })
    .slice(-months);

  if (!points.some((point) => point.key === currentKey)) {
    const live = netWorth(ds, engine, through);
    points.push({
      key: currentKey,
      label: `${MONTH_SHORT[Number(currentKey.slice(5, 7)) - 1]} ${currentKey.slice(2, 4)}`,
      accountsPence: live.accountsPence,
      savingsPence: live.savingsPence,
      assetsPence: live.assetsPence,
      cardsPence: live.cardsPence,
      debtsPence: live.debtsPence,
      netPence: live.netPence,
      source: 'live',
      complete: true,
    });
  }

  return points.slice(-months);
}

/** Values captured with a new month lock so the trend has real history from now on. */
export function monthLockNetWorthSnapshot(ds: Dataset, engine: Engine, through: string) {
  const live = netWorth(ds, engine, through);
  return {
    savings: (ds.savings ?? []).filter((account) => account.active !== false).map((account) => ({ name: account.name, balancePence: account.balancePence })),
    debts: (ds.debts ?? []).filter((debt) => debt.active !== false).map((debt) => ({ name: debt.name, balancePence: debt.balancePence })),
    assets: (ds.assets ?? []).filter((asset) => asset.active !== false).map((asset) => ({
      name: asset.name,
      // An excluded asset is recorded as zero so a later re-inclusion cannot
      // rewrite history that was not counted at the time.
      valuePence: asset.includeInNetWorth === false ? 0 : ownedValuePence(asset),
    })),
    netPence: live.netPence,
  };
}
