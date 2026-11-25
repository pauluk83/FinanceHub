import type { Dataset } from '../../core/engine';
import type { AppState } from './store';
import { withoutAppFeatureNotes, withoutAutomaticBudgetChanges, withoutLegacyAppUpdateNotes } from './budgetChangelog';
import { rekeyHolidaysByStartYear } from '../../core/holidays';
import { carryForwardProviderYears } from '../../core/providerCarry';
import { alignMonthsToTemplate, endPureCremationPlan, extendProvidersToPlanYear } from '../../core/providerPlans';
import { baselineFor, recalculate, recordBill, type LedgerSpec } from '../../core/providerLedger';

const OVO_SPEC: LedgerSpec = {
  rowsKey: 'statement',
  formula: 'cashflow',
  monthly: true,
};

const DATA_FIXES: { id: string; apply: (dataset: Dataset) => void }[] = [
  {
    // OVO's 23 November 2026 statement covers 17 Oct - 16 Nov: £40.62 of
    // electricity plus £55.47 of gas and £2.77 VAT, less a £150 Warm Home
    // Discount. The £150 lifts the balance to £469.70 but is not energy use, so
    // it is a credit on the row and the usage chart still shows £98.86.
    id: 'ovo-bill-2026-11-16',
    apply: (dataset) => {
      const ovo = dataset.providers?.ovo as { statement?: any[]; ledgerOpeningPence?: number } | undefined;
      const rows = ovo?.statement;
      if (!Array.isArray(rows)) return;
      const baseline = baselineFor(OVO_SPEC, rows, ovo?.ledgerOpeningPence);
      const recorded = recordBill(OVO_SPEC, rows, {
        month: 'Oct',
        billPeriod: '17 Oct - 16 Nov',
        billAmountPence: 9886,
        creditPence: 15000,
      }, baseline);
      if (!recorded) return;
      carryForwardProviderYears(ovo, OVO_SPEC, Number(dataset.settings.targetYear), rows, baseline);
    },
  },
  {
    // September's Ovo line is £19.23 + £33.69 of bills plus the £629 refund
    // paid to Starling on 14/10/2026. The bill stays whole for the balance;
    // the refund is recorded so usage can exclude it.
    id: 'ovo-refund-sep-2026',
    apply: (dataset) => {
      const rows = (dataset.providers.ovo as { statement?: any[] } | undefined)?.statement;
      const september = rows?.find((row) => row.month === 'Sep' && Number(row.billAmountPence) === 68192);
      if (september) september.refundPence = 62900;
    },
  },
  {
    // The September statement was £52.92 of energy plus the £629 paid back to
    // Starling on 14/10/2026. A refund is its own flow on the row, so the bill
    // is the usage and the balance still moves by the same amount overall.
    id: 'ovo-refund-sep-2026-split',
    apply: (dataset) => {
      const ovo = dataset.providers?.ovo as { statement?: any[]; ledgerOpeningPence?: number } | undefined;
      const rows = ovo?.statement;
      if (!Array.isArray(rows)) return;
      const september = rows.find((row) => row.month === 'Sep' && Number(row.billAmountPence) === 68192);
      if (!september) return;
      september.billAmountPence = 5292;
      september.refundPence = 62900;
      const baseline = baselineFor(OVO_SPEC, rows, ovo?.ledgerOpeningPence);
      recalculate(OVO_SPEC, rows, baseline);
      carryForwardProviderYears(ovo, OVO_SPEC, Number(dataset.settings.targetYear), rows, baseline);
    },
  },
  {
    // The 2027+ Ovo blocks were carried forward with the wrong month and bill
    // period on their rows. The 2026 statement is the reference pattern, so
    // every later block is re-aligned to it — labels only, no money moves.
    id: 'ovo-later-years-2026-pattern',
    apply: (dataset) => {
      const ovo = dataset.providers?.ovo as { statement?: any[]; years?: Record<string, { rows?: any[] }> } | undefined;
      const template = (ovo?.statement ?? []).filter((row) => row && row.month !== 'Opening Balance');
      if (template.length !== 12) return;
      for (const key of Object.keys(ovo?.years ?? {})) {
        const block = ovo?.years?.[key];
        if (!block || !Array.isArray(block.rows)) continue;
        alignMonthsToTemplate(block.rows.filter((row) => row?.month !== 'Opening Balance'), template);
      }
    },
  },
  {
    // Pure Cremation is a fixed-term plan: the December 2027 payment clears the
    // balance, so nothing bills, carries forward or plans after that year.
    id: 'pure-cremation-ends-2027',
    apply: (dataset) => { endPureCremationPlan(dataset); },
  },
  {
    // The supply contract Ovo runs on both fuels, so the provider page answers
    // the consumption and rate questions without the PDF bill to hand.
    id: 'ovo-supply-contract-2026',
    apply: (dataset) => {
      const ovo = dataset.providers?.ovo as { supply?: unknown } | undefined;
      if (!ovo || ovo.supply) return;
      ovo.supply = {
        planName: '1 Year Fixed Loyalty',
        startDate: '2026-10-02',
        endDate: '2027-10-01',
        exitFeePence: 5_000,
        electricity: { annualKwh: 1_031, standingChargePence: 55.18, unitRatePence: 26.98 },
        gas: { annualKwh: 4_860, standingChargePence: 25.00, unitRatePence: 8.64 },
      };
    },
  },
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
    // Rent used to keep every year in one top-level ledger, so 2027 rows showed
    // in the 2026 view. Keep the target year live and move later years into
    // their own blocks, preserving the running balances at the year boundary.
    id: 'rent-split-year-entries',
    apply: (dataset) => {
      const rent = dataset.providers.rent as {
        entries?: any[];
        year?: number;
        years?: Record<string, any>;
      } | undefined;
      if (!rent || !Array.isArray(rent.entries) || rent.entries.length === 0) return;

      const all = [...rent.entries].sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')));
      const groups = new Map<number, any[]>();
      for (const row of all) {
        const year = Number(String(row.date ?? '').slice(0, 4));
        if (!Number.isInteger(year)) continue;
        if (!groups.has(year)) groups.set(year, []);
        groups.get(year)!.push(row);
      }
      if (groups.size === 0) return;

      const targetYear = Number(dataset.settings.targetYear);
      const liveYear = groups.has(targetYear) ? targetYear : Math.min(...groups.keys());
      const years = rent.years && typeof rent.years === 'object' ? { ...rent.years } : {};

      for (const [year, rows] of groups) {
        if (year === liveYear) continue;
        const existing = years[String(year)];
        if (Array.isArray(existing?.rows) && existing.rows.length > 0) continue;
        const first = rows[0];
        const before = all.filter((row) => String(row.date ?? '') < String(first.date ?? '')).at(-1);
        years[String(year)] = {
          year,
          openingPence: Number(before?.balancePence) || 0,
          closingPence: Number(rows.at(-1)?.balancePence) || 0,
          rows: rows.map((row) => row.matched === undefined
            ? { ...row, matched: String(row.date ?? '') <= dataset.settings.asOfDate ? '✓ Yes' : '' }
            : row),
        };
      }

      rent.entries = groups.get(liveYear) ?? [];
      rent.year = liveYear;
      rent.years = years;
    },
  },
  {
    // A payment edit recalculates its own year, but saved later blocks used to
    // keep their imported opening balance. Re-chain every provider once so the
    // edited close starts the next block and the rest of the chain follows.
    id: 'provider-year-balance-chain',
    apply: (dataset) => {
      const specs: Record<string, LedgerSpec> = {
        water: { rowsKey: 'statement', formula: 'cashflow', monthly: true },
        ovo: { rowsKey: 'statement', formula: 'cashflow', monthly: true },
        parkXmas: { rowsKey: 'statement', formula: 'savings', monthly: true },
        pureCremation: { rowsKey: 'statement', formula: 'savings', monthly: true },
        o2: { rowsKey: 'statement', formula: 'telco', monthly: true },
        virgin: { rowsKey: 'statement', formula: 'telco', monthly: true },
        councilTax: { rowsKey: 'entries', formula: 'amount', monthly: false },
        rent: { rowsKey: 'entries', formula: 'amount', monthly: false },
      };
      for (const [key, provider] of Object.entries(dataset.providers ?? {})) {
        const spec = specs[key];
        if (!spec) continue;
        const current = provider as any;
        const liveYear = Number(current.year ?? dataset.settings.targetYear);
        if (!Number.isInteger(liveYear)) continue;
        const liveRows = current[spec.rowsKey];
        if (!Array.isArray(liveRows) || liveRows.length === 0) continue;
        const hasLaterBlock = Object.keys(current.years ?? {}).some((year) => Number(year) > liveYear);
        if (!hasLaterBlock) continue;
        carryForwardProviderYears(current, spec, liveYear, liveRows, current.ledgerOpeningPence);
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
    // The provider sheets stopped at their imported 2027/2028 blocks. Water,
    // Ovo, Park Xmas, Council Tax and Rent now repeat their newest year through
    // 2040, chained from year to year, so future trips and bills have somewhere
    // to land. O2, Virgin Media and Pure Cremation keep their own contracts.
    id: 'provider-years-to-2040',
    apply: (dataset) => {
      extendProvidersToPlanYear(dataset as { providers?: Record<string, any> });
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
    // A legacy "App update" / "Auto updates" row belonged to the application,
    // not the budget. Remove only that pair, not genuine automatic budget rows.
    id: 'budget-changelog-app-update-auto-updates-2026-11-09',
    apply: (dataset) => {
      if (Array.isArray(dataset.changelog)) {
        dataset.changelog = withoutLegacyAppUpdateNotes(dataset.changelog as { sheetCell?: string; description?: string; details?: unknown }[]);
      }
    },
  },
  {
    // Holidays were filed under the year they were entered, so a 2027 trip could
    // sit in the 2026 bucket. File every row under its start date's year.
    id: 'holidays-year-by-start-2026-11-22',
    apply: (dataset) => {
      if (dataset.holidays) {
        dataset.holidays = rekeyHolidaysByStartYear(dataset.holidays as Record<string, { start?: string }[]>);
      }
    },
  },
  {
    // Per-save "Budget change — ..." rows are no longer written. Remove the
    // automatic ones earlier builds left behind; custom and month-end stay.
    id: 'budget-changelog-auto-changes-2026-11-22',
    apply: (dataset) => {
      if (Array.isArray(dataset.changelog)) {
        dataset.changelog = withoutAutomaticBudgetChanges(dataset.changelog as { sheetCell?: string; auto?: boolean }[]);
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
