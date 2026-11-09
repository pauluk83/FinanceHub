import type { Dataset } from '../../core/engine';
import type { AppState } from './store';
import { withoutAppFeatureNotes } from './budgetChangelog';

const DATA_FIXES: { id: string; apply: (dataset: Dataset) => void }[] = [
  {
    id: 'starling-dan-2026-11-06',
    apply: (dataset) => {
      const exists = dataset.transactions.some((t) =>
        t.date === '2026-11-06' && t.account === 'Starling' && t.type === 'Expense' &&
        t.amountPence === 650 && t.comments === 'Dan');
      if (exists) return;
      const row = Math.max(0, ...dataset.transactions.map((t) => t.row)) + 1;
      dataset.transactions.push({
        row, date: '2026-11-06', account: 'Starling', type: 'Expense',
        amountPence: 650, comments: 'Dan', status: '', budgetTreatment: '',
      });
    },
  },
  {
    // The rent account was in credit, so no £500 payment went out in Nov 2026;
    // the standing order resumes on 27/12/2026.
    id: 'rent-nov-2026-credit-skip',
    apply: (dataset) => {
      const rent = dataset.providers.rent as { entries?: any[] } | undefined;
      const entries = rent?.entries;
      if (Array.isArray(entries) && entries.length > 0) {
        const nov = entries.find((e) => e.date === '2026-11-27' && /payment/i.test(String(e.description ?? '')));
        if (nov) {
          nov.amountPence = 0;
          nov.description = 'No payment (in credit)';
        }
        const dec = entries.find((e) => e.date === '2026-12-27' && /payment/i.test(String(e.description ?? '')));
        if (dec && (Number(dec.amountPence) || 0) === 0) dec.amountPence = 50000;
        entries.sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')));
        let running = (Number(entries[0].balancePence) || 0) - (Number(entries[0].amountPence) || 0);
        for (const entry of entries) {
          running += Number(entry.amountPence) || 0;
          entry.balancePence = running;
        }
      }
      const hasNovemberSkip = dataset.billChanges.some((c) => c.bill === 'Rent' && c.appliesFrom === '2026-11-01');
      if (!hasNovemberSkip) {
        dataset.billChanges.push({
          bill: 'Rent',
          appliesFrom: '2026-11-01',
          appliesTo: '2026-11-30',
          amountOverridePence: 0,
          dueDateOverride: '',
          changeType: 'Credit - no payment',
          note: 'Account in credit: no November payment; £500 resumes 27/12/2026',
        });
      }
    },
  },
  {
    // The workbook's 2027 travel-insurance row ended a year after the trip.
    id: 'holiday-insurance-2027-end',
    apply: (dataset) => {
      const rows = ((dataset.holidays as any)?.['2027'] ?? []) as any[];
      const insurance = rows.find((row) =>
        String(row.event ?? '').toLowerCase() === 'travel insurance' && row.end === '2028-04-17');
      if (insurance) insurance.end = '2027-04-24';
    },
  },
  {
    // The lone "Credit Cards" row was an ordinary Starling card payment.
    id: 'credit-cards-row-to-starling',
    apply: (dataset) => {
      const row = dataset.transactions.find((transaction) =>
        transaction.account === 'Credit Cards'
        && transaction.amountPence === 3000
        && transaction.date === '2026-02-27');
      if (row) row.account = 'Starling';
    },
  },
  {
    // Dan is tracked as a person for visibility, but his spending is not a loan.
    id: 'dan-starling-funded-person',
    apply: (dataset) => {
      let dan = dataset.people.find((person) => person.shortName === 'Dan');
      if (!dan) {
        dan = {
          row: Math.max(0, ...dataset.people.map((person: any) => Number(person.row) || 0)) + 1,
          shortName: 'Dan',
          fullName: 'Dan',
          openingPence: 0,
          sortOrder: Math.max(0, ...dataset.people.map((person) => person.sortOrder)) + 1,
          active: true,
          trackOwed: false,
        };
        dataset.people.push(dan);
      } else {
        dan.trackOwed = false;
      }
    },
  },
  {
    // Rows named in a Dan comment belong to Dan's own Starling-funded account.
    id: 'dan-comment-rows-to-dan',
    apply: (dataset) => {
      const mentionsDan = (comments: unknown) => /\bDan\b/i.test(String(comments ?? ''));
      for (const transaction of dataset.transactions) {
        if (transaction.account !== 'Dan' && mentionsDan(transaction.comments)) {
          transaction.account = 'Dan';
        }
      }
    },
  },
  {
    // The 11 direct Dan rows before the anchor were never paid from Starling.
    // Their comments do not name Dan; the Starling-funded rows do.
    id: 'dan-direct-not-starling',
    apply: (dataset) => {
      for (const transaction of dataset.transactions) {
        if (transaction.account === 'Dan' && transaction.type === 'Expense'
          && transaction.date <= dataset.settings.anchorDate
          && !/\bDan\b/i.test(String(transaction.comments ?? ''))) {
          transaction.starlingFunded = false;
        }
      }
    },
  },
  {
    // Balance corrections confirmed on 7 November: the four new rows, and the
    // February Credit Cards row is archived history and not Starling cash.
    id: 'starling-2026-11-07-four-transactions',
    apply: (dataset) => {
      dataset.settings.asOfDate = '2026-11-07';
      const creditCards = dataset.transactions.find((transaction) =>
        transaction.date === '2026-02-27' && transaction.account === 'Starling'
        && transaction.type === 'Expense' && transaction.amountPence === 3000);
      if (creditCards) creditCards.starlingPosted = false;

      const additions = [
        { date: '2026-11-07', account: 'Steve', type: 'Expense', amountPence: 500, comments: 'Loan' },
        { date: '2026-11-07', account: 'Starling', type: 'Expense', amountPence: 895, comments: 'Healthy Metal' },
        { date: '2026-11-07', account: 'Dan', type: 'Expense', amountPence: 800, comments: 'Loan' },
        { date: '2026-11-07', account: 'Steve', type: 'Expense', amountPence: 1000, comments: 'Loan' },
      ];
      for (const addition of additions) {
        // The old build defaulted these two entries to its 06/11 as-of date.
        // Move that saved pair forward rather than adding duplicates.
        const existing = dataset.transactions.find((transaction) =>
          (transaction.date === '2026-11-06' || transaction.date === '2026-11-07')
          && transaction.account === addition.account
          && transaction.type === addition.type && transaction.amountPence === addition.amountPence
          && transaction.comments === addition.comments);
        if (existing) {
          existing.date = '2026-11-07';
          continue;
        }
        dataset.transactions.push({
          row: Math.max(0, ...dataset.transactions.map((transaction) => transaction.row)) + 1,
          ...addition,
          status: '',
          budgetTreatment: '',
        });
      }
    },
  },
  {
    id: 'changelog-2026-11-07',
    apply: (dataset) => {
      const entries = [
        {
          date: '2026-11-07',
          sheetCell: 'Dan account completed',
          description: 'Dan is now a person account: all 70 transactions are booked to Dan, his spending reduces Starling, and he is excluded from the amount owed.',
          details: [
            '70 transactions · £1,129.37 combined.',
            'People shows Dan at £0.00 owed; total People who owe me stays £4,503.00.',
            'Starling £432.11; Transactions filter is plain Dan and the Starling-funded label was removed.',
          ],
          signature: 'financehub-2026-11-07-dan-account',
        },
        {
          date: '2026-11-07',
          sheetCell: 'Credit Cards cleanup',
          description: 'The single Credit Cards transaction (27/02/2026, £30.00) is now a Starling expense and the Credit Cards label is gone.',
          details: [
            'The review queue is clear; the locked February total remains £2,658.31.',
            'The £30 affects the live Starling balance, which is £432.11.',
          ],
          signature: 'financehub-2026-11-07-credit-cards',
        },
        {
          date: '2026-11-07',
          sheetCell: 'Dan review ledger',
          description: 'Accounts shows every Dan transaction in one ledger with a combined total and no owed increase.',
          details: ['70 rows · £1,129.37 combined.', 'People who owe me impact: £0.00.'],
          signature: 'financehub-2026-11-07-dan-ledger',
        },
        {
          date: '2026-11-07',
          sheetCell: 'Unknown-account safeguards',
          description: 'Added a shared account classifier, a Needs review panel and mapping blocks so unknown account rows cannot be counted silently.',
          details: ['Unknown rows stay visible in Transactions and are excluded from totals until mapped.', 'The current review queue is clear.'],
          signature: 'financehub-2026-11-07-unknown-accounts',
        },
        {
          date: '2026-11-07',
          sheetCell: 'Holiday trip grouping',
          description: 'Holiday rows now group into trips, with expandable cost lines on the Dashboard and a collapsible tracker.',
          details: [
            'December is one £1,401.09 trip; Kn Matas is £837.82.',
            'The 2027 travel insurance now ends 24/04/2027 with the Kn Matas trip.',
            'Tracker: 15 trips / 8 upcoming / 73 nights.',
          ],
          signature: 'financehub-2026-11-07-holiday-trips',
        },
        {
          date: '2026-11-07',
          sheetCell: 'Pseudo-accounts and excluded rows',
          description: 'Petrol and Other are shown as spend categories, while accounts outside the ledger are visible as not counted.',
          details: ['Petrol: 24 rows / £685.66 to the as-of date.', 'Unknown rows remain preserved and reviewable in Transactions.'],
          signature: 'financehub-2026-11-07-pseudo-accounts',
        },
        {
          date: '2026-11-07',
          sheetCell: 'Import safety and duplicate review',
          description: 'CSV imports flag duplicates in the file and against saved rows, and unsafe or oversized imports are rejected before parsing.',
          details: [
            'Duplicates are skipped by default with per-row overrides; Settings has a read-only duplicate report.',
            'Limits: 10 MB / 20,000 CSV rows and 25 MB backup restore.',
            'Provider URLs and CSV formulas are validated or neutralised.',
          ],
          signature: 'financehub-2026-11-07-import-safety',
        },
        {
          date: '2026-11-07',
          sheetCell: 'November rent and table fixes',
          description: 'November rent is skipped because the rent account is in credit; the £500 payment resumes 27/12/2026. Money-table headings were aligned over their figures.',
          details: ['November expenses £2,233.40 and bills £383.15.', 'Rent ledger shows 27/11 £0.00 and 27/12 £500.00.'],
          signature: 'financehub-2026-11-07-rent-tables',
        },
        {
          date: '2026-11-07',
          sheetCell: 'Desktop and table fixes',
          description: 'Added the standalone and browser launchers and aligned Statement and money-table headings with their figures.',
          details: ['FinanceHub Standalone opens the packaged app; FinanceHub Browser opens the local web build.', 'Headers and money columns now share the same right edge.'],
          signature: 'financehub-2026-11-07-desktop-fixes',
        },
      ];
      const log = (dataset.changelog ?? []) as any[];
      dataset.changelog = log;
      for (const entry of entries.slice().reverse()) {
        if (!log.some((existing: any) => existing.signature === entry.signature)) log.unshift(entry);
      }
    },
  },
  {
    id: 'changelog-2026-11-07-starling',
    apply: (dataset) => {
      const log = (dataset.changelog ?? []) as any[];
      dataset.changelog = log;
      const update = (signature: string, patch: Record<string, unknown>) => {
        const entry = log.find((existing: any) => existing.signature === signature);
        if (entry) Object.assign(entry, patch);
      };
      update('financehub-2026-11-07-dan-account', {
        description: 'Dan is now a person account: all 71 transactions are booked to Dan, his spending reduces Starling, and he is excluded from the amount owed.',
        details: [
          '71 transactions · £1,137.37 combined.',
          'People shows Dan at £0.00 owed; total People who owe me is £4,518.00.',
          'Starling £611.16; Transactions filter is plain Dan and the Starling-funded label was removed.',
        ],
      });
      update('financehub-2026-11-07-credit-cards', {
        description: 'The single Credit Cards transaction (27/02/2026, £30.00) is archived under Starling; the Credit Cards label is gone and the old row does not move the live balance.',
        details: [
          'The review queue is clear; the locked February total remains £2,658.31.',
          'The £30 remains in history but is excluded from Starling cash; Starling is £611.16.',
        ],
      });
      update('financehub-2026-11-07-dan-ledger', {
        details: ['71 rows · £1,137.37 combined.', 'People who owe me impact: £0.00.'],
      });
      update('financehub-2026-11-07-rent-tables', {
        details: ['November expenses £2,265.35 and bills £383.15.', 'Rent ledger shows 27/11 £0.00 and 27/12 £500.00.'],
      });
      if (!log.some((entry: any) => entry.signature === 'financehub-2026-11-07-starling')) {
        log.unshift({
          date: '2026-11-07',
          sheetCell: 'Starling balance corrected',
          description: "Corrected Starling cash to £611.16 after removing a historical £181 double-count and posting today's four transactions.",
          details: [
            'Starling is £611.16 after the 11 historical direct Dan rows (£181.00) stopped being counted as Starling cash.',
            'Four 07/11 rows added: Steve £5.00, Healthy Metal £8.95, Dan £8.00 and Steve £10.00.',
            'The £30.00 February Credit Cards row stays archived and no longer moves Starling.',
            'Dan 71 rows / £1,137.37; total owed £4,518.00; November expenses £2,265.35.',
          ],
          signature: 'financehub-2026-11-07-starling',
        });
      }
    },
  },
  {
    // The budget changelog is user data, not a release feed. Earlier builds
    // recorded app-feature notes there; remove only those entries.
    id: 'budget-changelog-app-notes-2026-11-09',
    apply: (dataset) => {
      if (Array.isArray(dataset.changelog)) {
        dataset.changelog = withoutAppFeatureNotes(dataset.changelog as { signature?: string }[]);
      }
    },
  },
  {
    id: 'changelog-2026-11-07-descriptions',
    apply: (dataset) => {
      const entry = ((dataset.changelog ?? []) as any[]).find((existing: any) => existing.signature === 'financehub-2026-11-07-dan-account');
      if (entry) {
        entry.description = 'Dan is now a person account: all 71 transactions are booked to Dan, his spending reduces Starling, and he is excluded from the amount owed.';
      }
    },
  },
];

export function applyDataFixes(state: AppState): AppState {
  const meta = (state.dataset.meta ?? {}) as { dataFixes?: string[] };
  const applied = Array.isArray(meta.dataFixes) ? meta.dataFixes : [];
  const pending = DATA_FIXES.filter((fix) => !applied.includes(fix.id));
  if (pending.length === 0) return state;
  const dataset = structuredClone(state.dataset);
  for (const fix of pending) fix.apply(dataset);
  dataset.meta = { ...(dataset.meta ?? {}), dataFixes: [...applied, ...pending.map((fix) => fix.id)] };
  return { ...state, dataset };
}
