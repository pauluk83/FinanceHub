import type { ViewProps } from '../../types';
import { Badge, Section } from '../../components';
import { GUIDE_BASICS, USER_GUIDE, type GuideEntry } from '../../userGuide';

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
          Use the contents below to read a section in depth. The two recurring workflows — the month-end close and the
          new-year setup — are chapters at the end of this same page.
        </p>
      </div>
      <nav className="guide-toc" aria-label="Help contents">
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
        <div>
          <strong>Workflows</strong>
          <button type="button" className="guide-link" onClick={() => jump('month-end')}>Month-end close</button>
          <button type="button" className="guide-link" onClick={() => jump('new-year')}>New-year setup</button>
        </div>
      </nav>
      {GUIDE_GROUPS.map((group) => (
        <section key={group} className="guide-group" id={`guide-group-${group.toLowerCase()}`}>
          <h3>{group}</h3>
          {all.filter((entry) => entry.group === group).map((entry) => <GuideEntryCard key={entry.id} entry={entry} />)}
        </section>
      ))}
      <section className="guide-group" id="guide-group-workflows">
        <h3>Workflows</h3>
        <WorkflowGuide
          id="month-end"
          title="Month-end close"
          summary="Reconcile the month, check the close summary and lock the snapshot so its figures stay fixed."
          lines={APP_MONTH_END_GUIDE}
        />
        <WorkflowGuide
          id="new-year"
          title="New-year setup"
          summary="Roll the current budget forward or start a clean new-year budget, without rewriting last year."
          lines={APP_NEW_YEAR_GUIDE}
        />
      </section>
    </div>
  );
}

function WorkflowGuide({ id, title, summary, lines }: { id: string; title: string; summary: string; lines: string[] }) {
  return (
    <article className="guide-entry" id={`guide-${id}`}>
      <h4>{title}</h4>
      <p>{summary}</p>
      <div className="guide" style={{ padding: '10px 0 0' }}>
        {lines.map((line, index) => {
          const heading = line.length < 90 && line === line.toUpperCase();
          return <p key={index} className={heading ? 'heading' : ''}>{line}</p>;
        })}
      </div>
    </article>
  );
}

export function GuidesView(_: ViewProps) {
  return (
    <Section
      title="Guides"
      sub="Every screen and both recurring workflows on one help page"
      actions={<Badge tone="neutral">{GUIDE_BASICS.length + USER_GUIDE.length + 2} chapters</Badge>}
    >
      <UserGuideBook />
    </Section>
  );
}
