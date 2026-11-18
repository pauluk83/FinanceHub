import type { Dataset } from '../../core/engine.ts';

/** A small valid budget with one account and no money movements. */
export function baseDataset(patch: Partial<Dataset> = {}): Dataset {
  return {
    settings: {
      targetYear: 2026,
      startMonth: 1,
      currency: '£',
      monthsInYear: 12,
      asOfDate: '2026-11-18',
      lockCutoff: '2026-11-01',
      anchorDate: '2026-11-01',
      primaryAccount: 'Starling',
    },
    accounts: [{ name: 'Starling', targetPence: 0, openingPence: 0, sortOrder: 1, active: true }],
    people: [],
    cards: [],
    bills: [],
    billChanges: [],
    incomeSchedules: { pip: [], uc: [] },
    transactions: [],
    providers: {},
    debts: [],
    savings: [],
    assets: [],
    importRules: [],
    importBatches: [],
    recurringDismissed: [],
    csvProfiles: [],
    categories: [],
    holidays: {},
    changelog: [],
    audit: [],
    monthLocks: {},
    ...patch,
  };
}
