/**
 * FinanceHub — seed local SQLite from the imported workbook, then emit the
 * post-import reconciliation report. Run: node import/migrate.mjs
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { buildEngine } from '../core/engine.ts';
import { applyMigrations } from '../db/migrations.ts';
import { adjustedCurrentMonth, adjustedMonth, adjustedYtd } from '../core/reference.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const DATA = path.join(ROOT, 'data', 'workbook.json');
const DB = path.join(ROOT, 'data', 'financehub.db');
const MIGRATIONS = path.join(ROOT, 'db', 'migrations');
const REPORTS = path.join(ROOT, 'reports');

const ds = JSON.parse(fs.readFileSync(DATA, 'utf8'));
const plaintextCredentialsFound = Array.isArray(ds.settings.plaintextCredentials) ? ds.settings.plaintextCredentials.length : 0;
const engine = buildEngine(ds);
const now = new Date().toISOString();
const slug = (s, prefix) => `${prefix}_${String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`;

if (fs.existsSync(DB)) fs.rmSync(DB);
const db = new DatabaseSync(DB);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
const migrations = applyMigrations(db, MIGRATIONS);

const s = ds.settings;
db.prepare(`INSERT INTO settings (id,target_year,start_month,currency,months_in_year,as_of_date,lock_cutoff,anchor_date,updated_at,rev)
  VALUES (1,?,?,?,?,?,?,?,?,1)`).run(s.targetYear, s.startMonth, s.currency, s.monthsInYear, s.asOfDate, s.lockCutoff, s.anchorDate, now);

const insAccount = db.prepare(`INSERT INTO accounts (id,name,target_pence,opening_pence,sort_order,active,updated_at,rev) VALUES (?,?,?,?,?,?,?,1)`);
for (const a of ds.accounts) insAccount.run(slug(a.name, 'acct'), a.name, a.targetPence, a.openingPence, a.sortOrder, a.active ? 1 : 0, now);

const insPerson = db.prepare(`INSERT INTO people (id,short_name,full_name,opening_pence,sort_order,active,updated_at,rev) VALUES (?,?,?,?,?,?,?,1)`);
for (const p of ds.people) insPerson.run(slug(p.shortName, 'person'), p.shortName, p.fullName, p.openingPence, p.sortOrder, p.active ? 1 : 0, now);

const insCard = db.prepare(`INSERT INTO cards (id,name,limit_pence,opening_pence,sort_order,active,updated_at,rev) VALUES (?,?,?,?,?,?,?,1)`);
for (const c of ds.cards) insCard.run(slug(c.name, 'card'), c.name, c.limitPence, c.openingPence, c.sortOrder, c.active ? 1 : 0, now);

const insBill = db.prepare(`INSERT INTO bills (id,name,amount_pence,due_day,linked_sheet,frequency,latest_balance_pence,latest_payment_pence,sort_order,active,effective_from,payment_method,base_amount_pence,base_due_day,updated_at,rev)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`);
const billIds = new Map();
for (const b of ds.bills) {
  const id = slug(b.name, 'bill');
  billIds.set(b.name, id);
  insBill.run(id, b.name, b.amountPence, b.dueDay, b.linkedSheet || null, b.frequency || null, b.latestBalancePence, b.latestPaymentPence, b.sortOrder, b.active ? 1 : 0, b.effectiveFrom || null, b.paymentMethod || null, b.baseAmountPence, b.baseDueDay, now);
}

const insChange = db.prepare(`INSERT INTO bill_changes (id,bill_id,applies_from,applies_to,amount_override_pence,due_date_override,change_type,note,updated_at,rev)
  VALUES (?,?,?,?,?,?,?,?,?,1)`);
ds.billChanges.forEach((ch, i) => {
  insChange.run(`chg_${i + 1}`, billIds.get(ch.bill), ch.appliesFrom || null, ch.appliesTo || null, ch.amountOverridePence, ch.dueDateOverride || null, ch.changeType || null, ch.note || null, now);
});

const insSched = db.prepare(`INSERT INTO income_schedules (id,kind,month_label,year,pay_date,amount_pence) VALUES (?,?,?,?,?,?)`);
for (const kind of ['pip', 'uc']) {
  const label = kind === 'pip' ? 'PIP' : 'UC';
  ds.incomeSchedules[kind].forEach((row, i) => {
    for (const year of [2026, 2027, 2028]) {
      const block = row[`year${year}`];
      if (!block.date) continue;
      insSched.run(`${kind}_${year}_${i}_${block.date}`, label, row.month, year, block.date, block.amountPence);
    }
  });
}

const insTx = db.prepare(`INSERT INTO transactions (id,tx_date,account,type,amount_pence,comments,status,budget_treatment,source_row,created_at,updated_at,rev)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,1)`);
for (const t of ds.transactions) {
  insTx.run(`tx_${String(t.row).padStart(5, '0')}`, t.date, t.account, t.type, t.amountPence, t.comments || null, t.status || null, t.budgetTreatment || '', t.row, now, now);
}

const insLock = db.prepare(`INSERT INTO month_locks (year,month,balanced,locked_at,snapshot_income_pence,snapshot_expenses_pence,snapshot_net_pence,snapshot_owed_pence,source)
  VALUES (?,?,?,?,?,?,?,?,?)`);
for (const m of ds.reference.months) {
  const balanced = m.balanced === '✓ Balanced';
  insLock.run(2026, m.month, balanced ? 1 : 0, balanced ? now : null, balanced ? m.incomePence : null, balanced ? m.expensesPence : null, balanced ? m.netPence : null, balanced ? m.owedPence : null, 'workbook');
}

const insHoliday = db.prepare(`INSERT INTO holidays (id,year,event,start_date,end_date,nights,ref,status,notes,paid,total_pence,total_text,address,updated_at,rev)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`);
for (const [year, rows] of Object.entries(ds.holidays)) {
  rows.forEach((h, i) => {
    const nights = typeof h.nights === 'number' ? h.nights : null;
    insHoliday.run(`hol_${year}_${i + 1}`, Number(year), h.event, h.start || null, h.end || null, nights, h.ref || null, h.status || null, h.notes || null, h.paid || null, h.totalPence, h.totalText || null, h.address || null, now);
  });
}

const insLog = db.prepare(`INSERT INTO changelog (id,entry_date,sheet_cell,description,created_at) VALUES (?,?,?,?,?)`);
ds.changelog.forEach((c, i) => insLog.run(`log_${i + 1}`, c.date, c.sheetCell || null, c.description, now));

const insProvider = db.prepare(`INSERT INTO provider_entries (id,provider,entry_date,month_label,description,ref,amount_pence,payment_pence,balance_pence,meta_json,updated_at,rev)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,1)`);
let providerRows = 0;
const p = ds.providers;
for (const e of p.rent.entries) {
  insProvider.run(`rent_${providerRows++}`, 'rent', e.date, null, e.description || null, e.ref || null, e.amountPence, 0, e.balancePence, null, now);
}
for (const [key, label] of [['water', 'Water'], ['parkXmas', 'Park Xmas'], ['pureCremation', 'Pure Cremation'], ['ovo', 'Ovo']]) {
  for (const row of p[key].statement) {
    insProvider.run(`${key}_${providerRows++}`, key, null, row.month, row.billPeriod || null, null, row.billAmountPence ?? row.paymentPence ?? 0, row.paymentPence ?? 0, row.balancePence ?? null, JSON.stringify(row), now);
  }
}
for (const e of p.councilTax.entries) {
  insProvider.run(`councilTax_${providerRows++}`, 'councilTax', e.date || null, null, e.description || null, e.ref || null, e.amountPence, e.amountPence, e.balancePence, null, now);
}
for (const [key, label] of [['o2', 'O2'], ['virgin', 'Virgin']]) {
  for (const row of p[key].statement) {
    insProvider.run(`${key}_${providerRows++}`, key, null, row.month || null, null, null, row.amountPence, row.paymentPence, row.balancePence, JSON.stringify(row), now);
  }
}

const insAudit = db.prepare(`INSERT INTO audit_log (id,kind,severity,detail,created_at) VALUES (?,?,?,?,?)`);
ds.audit.forEach((a, i) => insAudit.run(`audit_${i + 1}`, a.kind, a.severity, a.detail, now));

db.prepare(`INSERT INTO audit_log (id,kind,severity,detail,created_at) VALUES (?,?,?,?,?)`)
  .run('audit_credentials', 'plaintext-credentials', 'warning',
    `${plaintextCredentialsFound} plaintext credential pairs were present in Settings!K6:K11. They were deliberately NOT copied into the database; re-enter them into the encrypted vault on first setup.`, now);

// ------------------------------------------------------------------ reconciliation
const money = (pence) => `${pence < 0 ? '-' : ''}£${(Math.abs(pence) / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const ytd = engine.yearToDate(2026, 11);
const nov = engine.monthlySummary(2026, 11);
const owed = engine.owedAt('2026-11-30');
const cards = engine.cardBalances('2026-11-30');
const rent = engine.rentLedger(ds.reference.asOfDate);

// The workbook baseline is adjusted exactly as the parity gate adjusts it:
// internal transfers removed, post-workbook November rows added and the skipped
// November rent excluded (core/reference.ts).
const expectedYtd = adjustedYtd(ds.reference.ytd);
const expectedNov = adjustedCurrentMonth(ds.reference.currentMonthView);
const checks = [
  { name: 'YTD income', expected: expectedYtd.incomePence, actual: ytd.incomePence },
  { name: 'YTD expenses', expected: expectedYtd.expensesPence, actual: ytd.expensesPence },
  { name: 'YTD net', expected: expectedYtd.netPence, actual: ytd.netPence },
  { name: 'Total owed', expected: expectedYtd.totalOwedPence, actual: owed },
  { name: 'November income', expected: expectedNov.incomePence, actual: nov.incomePence },
  { name: 'November expenses', expected: expectedNov.expensesPence, actual: nov.expensesPence },
  { name: 'November net', expected: expectedNov.netPence, actual: nov.netPence },
  { name: 'Credit card total', expected: ds.reference.cardsCurrent.totalBalancePence, actual: cards.reduce((t, c) => t + c.balancePence, 0) },
  { name: 'Rent ledger balance', expected: 98329, actual: rent.balancePence },
  { name: 'Scheduled bills (Dec)', expected: 88315, actual: engine.scheduledBillsTotal(2026, 12) },
];
for (const c of checks) c.status = c.expected === c.actual ? 'PASS' : 'FAIL';

const monthChecks = ds.reference.months.map((month) => {
  const a = engine.monthlySummary(2026, month.month);
  const expected = adjustedMonth(month);
  return {
    month: month.label,
    source: a.source,
    income: a.incomePence === expected.incomePence,
    expenses: a.expensesPence === expected.expensesPence,
    net: a.netPence === expected.netPence,
    owed: a.owedPence === expected.owedPence,
  };
});

const counts = Object.fromEntries(['accounts', 'people', 'cards', 'bills', 'billChanges', 'transactions', 'changelog']
  .map((k) => [k, Array.isArray(ds[k]) ? ds[k].length : 0]));

fs.mkdirSync(REPORTS, { recursive: true });
const report = {
  generatedAt: now,
  source: ds.meta.source,
  sheetCount: ds.meta.sheetCount,
  counts,
  providerRows,
  checks,
  months: monthChecks,
  audit: ds.audit,
  plaintextCredentialsFound,
  credentialsImported: 0,
};
fs.writeFileSync(path.join(REPORTS, 'reconciliation.json'), JSON.stringify(report, null, 2));

const md = [
  '# FinanceHub — post-import reconciliation',
  '',
  `Source: \`${ds.meta.source}\` (${ds.meta.sheetCount} sheets) · generated ${now}`,
  '',
  `Imported ${counts.transactions} transactions, ${counts.accounts} bank accounts, ${counts.people} people, ${counts.cards} cards, ${counts.bills} bills, ${counts.billChanges} bill changes, ${counts.changelog} changelog entries and ${providerRows} provider ledger rows.`,
  '',
  'Expectations apply the documented adjustments: internal transfers removed, the post-workbook November rows added and the skipped November rent excluded (`core/reference.ts`), matching the parity gate.',
  '',
  '## Key totals vs workbook',
  '',
  '| Check | Workbook | FinanceHub | Status |',
  '| --- | ---: | ---: | --- |',
  ...checks.map((c) => `| ${c.name} | ${money(c.expected)} | ${money(c.actual)} | ${c.status} |`),
  '',
  '## Monthly parity (2026)',
  '',
  '| Month | Source | Income | Expenses | Net | Owed |',
  '| --- | --- | :---: | :---: | :---: | :---: |',
  ...monthChecks.map((m) => `| ${m.month} | ${m.source === 'engine' ? 'engine' : 'locked snapshot'} | ${m.income ? '✓' : '✗'} | ${m.expenses ? '✓' : '✗'} | ${m.net ? '✓' : '✗'} | ${m.owed ? '✓' : '✗'} |`),
  '',
  '## Audit log (excluded / ambiguous data)',
  '',
  ...ds.audit.map((a) => `- **${a.severity}** — ${a.detail}`),
  '',
  '## Credential vault',
  '',
  `${plaintextCredentialsFound} plaintext credential pairs were found in the workbook. None were copied to the database; they must be re-entered into the encrypted vault.`,
  '',
].join('\n');
fs.writeFileSync(path.join(REPORTS, 'reconciliation.md'), md);

const failures = checks.filter((c) => c.status === 'FAIL').length + monthChecks.filter((m) => !(m.income && m.expenses && m.net && m.owed)).length;
console.log(`Seeded ${DB} (schema: ${migrations.applied.length} migration(s) applied)`);
console.log(`rows: accounts=${ds.accounts.length} people=${ds.people.length} cards=${ds.cards.length} bills=${ds.bills.length} tx=${ds.transactions.length} provider=${providerRows}`);
console.log(`checks: ${checks.filter((c) => c.status === 'PASS').length}/${checks.length} pass; months: ${12 - monthChecks.filter((m) => !(m.income && m.expenses && m.net && m.owed)).length}/12 complete`);
console.log(`report: ${path.join(REPORTS, 'reconciliation.md')}`);
process.exit(failures === 0 ? 0 : 1);
