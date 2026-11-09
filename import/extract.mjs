/**
 * FinanceHub — Phase 1 importer.
 * Reads "Income and Expenses 2026.xlsx" (22 sheets, formulas cached by Excel)
 * and emits a canonical, app-independent dataset at data/workbook.json.
 *
 * Money is converted to integer pence at the boundary. Excel stores floats;
 * the workbook's own rounding is to 2dp, so we round here once and never again.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'Income and Expenses 2026.xlsx');
const OUT = path.join(ROOT, 'data', 'workbook.json');

if (!fs.existsSync(SRC)) {
  console.error(`Source workbook not found: ${path.basename(SRC)}`);
  console.error('The source workbook has been retired. data/workbook.json is now the canonical dataset,');
  console.error('including the 2027/2028 provider blocks and the product-sheet content.');
  console.error('Restore the workbook next to package.json only if you need to re-derive the dataset.');
  process.exit(1);
}

const wb = XLSX.readFile(SRC, { cellDates: true, cellFormula: false });
const ws = (name) => {
  const s = wb.Sheets[name];
  if (!s) throw new Error(`Missing sheet: ${name}`);
  return s;
};
const cell = (sheet, addr) => ws(sheet)[addr];
const raw = (sheet, addr) => {
  const c = cell(sheet, addr);
  return c ? c.v : undefined;
};
const text = (sheet, addr) => {
  const v = raw(sheet, addr);
  return v === undefined || v === null ? '' : String(v).trim();
};
const num = (sheet, addr) => {
  const v = raw(sheet, addr);
  return typeof v === 'number' ? v : v === '' || v === undefined || v === null ? 0 : Number(v) || 0;
};
const pence = (sheet, addr) => Math.round(num(sheet, addr) * 100);
const iso = (v) => {
  // cellDates gives a local-midnight Date. toISOString() would shift it back a
  // day in BST, so read the local calendar parts instead.
  if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return '';
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  return typeof v === 'string' ? v : '';
};
const dateCell = (sheet, addr) => iso(raw(sheet, addr));
const bool = (sheet, addr) => raw(sheet, addr) === true || raw(sheet, addr) === 'TRUE';
const dayFromLabel = (label) => {
  const m = String(label ?? '').match(/^(\d{1,2})/);
  return m ? Number(m[1]) : 0;
};

// ---------------------------------------------------------------- settings
const settings = {
  targetYear: num('Settings', 'C6'),
  startMonth: num('Settings', 'C7'),
  currency: text('Settings', 'C8') || '£',
  monthsInYear: num('Settings', 'C9'),
  asOfDate: dateCell('Settings', 'C10'),
  lockCutoff: dateCell('Settings', 'C11'),
  anchorDate: dateCell('Settings', 'C12'),
};

// ---------------------------------------------------------------- reference tables
function table(sheet, firstRow, lastRow, cols) {
  const rows = [];
  const nameCol = cols[0][1];
  for (let r = firstRow; r <= lastRow; r++) {
    const name = text(sheet, `${nameCol}${r}`);
    if (!name) continue;
    const row = { row: r, [cols[0][0]]: name };
    for (const [key, col, kind] of cols.slice(1)) {
      if (kind === 'money') row[key] = pence(sheet, `${col}${r}`);
      else if (kind === 'number') row[key] = num(sheet, `${col}${r}`);
      else if (kind === 'bool') row[key] = bool(sheet, `${col}${r}`);
      else if (kind === 'date') row[key] = dateCell(sheet, `${col}${r}`);
      else row[key] = text(sheet, `${col}${r}`);
    }
    rows.push(row);
  }
  return rows;
}

const accounts = table('Settings', 16, 21, [
  ['name', 'B', 'text'], ['targetPence', 'C', 'money'], ['openingPence', 'D', 'money'],
  ['sortOrder', 'E', 'number'], ['active', 'F', 'bool'],
]);
const people = table('Settings', 26, 34, [
  ['shortName', 'B', 'text'], ['fullName', 'C', 'text'], ['openingPence', 'D', 'money'],
  ['sortOrder', 'E', 'number'], ['active', 'F', 'bool'],
]);
const cards = table('Settings', 38, 41, [
  ['name', 'B', 'text'], ['limitPence', 'C', 'money'], ['openingPence', 'D', 'money'],
  ['sortOrder', 'E', 'number'], ['active', 'F', 'bool'],
]);
const bills = table('Settings', 45, 61, [
  ['name', 'B', 'text'], ['amountPence', 'C', 'money'], ['dueDayLabel', 'D', 'text'],
  ['dueDay', 'D', 'day'], ['linkedSheet', 'E', 'text'], ['frequency', 'F', 'text'],
  ['latestBalancePence', 'G', 'money'], ['latestPaymentPence', 'H', 'money'],
  ['sortOrder', 'I', 'number'], ['active', 'J', 'bool'], ['effectiveFrom', 'K', 'date'],
  ['paymentMethod', 'L', 'text'], ['baseAmountPence', 'N', 'money'], ['baseDueDay', 'O', 'number'],
]).map((b) => ({ ...b, dueDay: dayFromLabel(b.dueDayLabel) || b.baseDueDay || 0 }));

const billChanges = table('Settings', 66, 71, [
  ['bill', 'G', 'text'], ['appliesFrom', 'H', 'date'], ['appliesTo', 'I', 'date'],
  ['amountOverridePence', 'J', 'moneyOrBlank'], ['dueDateOverride', 'K', 'date'],
  ['changeType', 'L', 'text'], ['note', 'M', 'text'],
]);

// moneyOrBlank needs its own pass (0 is a meaningful override); handled below.
for (const ch of billChanges) {
  const c = cell('Settings', `J${ch.row}`);
  ch.amountOverridePence = c && typeof c.v === 'number' ? Math.round(c.v * 100) : null;
}

// ---------------------------------------------------------------- income schedules
function incomeSchedule(headerRow, firstRow, lastRow) {
  const rows = [];
  for (let r = firstRow; r <= lastRow; r++) {
    const month = text('Settings', `B${r}`);
    if (!month) continue;
    rows.push({
      month,
      year2026: { date: dateCell('Settings', `C${r}`), amountPence: pence('Settings', `D${r}`) },
      year2027: { date: dateCell('Settings', `E${r}`), amountPence: pence('Settings', `F${r}`) },
      year2028: { date: dateCell('Settings', `G${r}`), amountPence: pence('Settings', `H${r}`) },
    });
  }
  return rows;
}
const incomeSchedules = {
  pip: incomeSchedule(93, 94, 106),
  uc: incomeSchedule(109, 110, 121),
};

// ---------------------------------------------------------------- transactions
const transactions = [];
for (let r = 3; r <= 1117; r++) {
  const date = dateCell('Transaction Log', `A${r}`);
  if (!date) continue;
  transactions.push({
    row: r,
    date,
    account: text('Transaction Log', `B${r}`),
    type: text('Transaction Log', `C${r}`),
    amountPence: pence('Transaction Log', `D${r}`),
    comments: text('Transaction Log', `E${r}`),
    status: text('Transaction Log', `F${r}`),
    budgetTreatment: text('Transaction Log', `G${r}`),
  });
}

// ---------------------------------------------------------------- provider ledgers
const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function monthPaymentMap(sheet, rows, amountCol) {
  const map = {};
  for (const [month, row] of Object.entries(rows)) map[month] = pence(sheet, `${amountCol}${row}`);
  return map;
}
const waterRows = Object.fromEntries(monthNames.map((m, i) => [m, 11 + i]));
const water = {
  accountName: text('Water', 'B2'),
  paymentPlan: text('Water', 'B3'),
  monthlyPaymentPence: pence('Water', 'B4'),
  accountNumber: text('Water', 'B5'),
  year: num('Water', 'B7'),
  statement: monthNames.map((m) => ({
    month: m,
    billPeriod: text('Water', `B${waterRows[m]}`),
    billAmountPence: pence('Water', `C${waterRows[m]}`),
    paymentPence: pence('Water', `D${waterRows[m]}`),
    balancePence: pence('Water', `E${waterRows[m]}`),
  })),
};

const parkRows = { Jan: 10, Feb: 11, Mar: 12, Apr: 13, May: 14, Jun: 15, Jul: 16, Aug: 17, Sep: 18, Oct: 20, Nov: 21, Dec: 22 };
const parkXmas = {
  accountName: text('Park Xmas', 'B2'),
  accountNo: text('Park Xmas', 'B3'),
  paymentsRemaining: num('Park Xmas', 'B4'),
  openingBalancePence: pence('Park Xmas', 'C9'),
  statement: monthNames.map((m) => ({
    month: m,
    paymentPence: pence('Park Xmas', `B${parkRows[m]}`),
    balancePence: pence('Park Xmas', `C${parkRows[m]}`),
    totalPaidPence: pence('Park Xmas', `D${parkRows[m]}`),
    status: text('Park Xmas', `E${parkRows[m]}`),
  })),
};

const pcRows = Object.fromEntries(monthNames.map((m, i) => [m, 11 + i]));
const pureCremation = {
  accountName: text('Pure Cremation', 'B2'),
  paymentAccount: text('Pure Cremation', 'B3'),
  paymentDay: num('Pure Cremation', 'B4'),
  startDate: dateCell('Pure Cremation', 'B5'),
  paymentsRemaining: num('Pure Cremation', 'B6'),
  openingBalancePence: pence('Pure Cremation', 'C10'),
  statement: monthNames.map((m) => ({
    month: m,
    paymentPence: pence('Pure Cremation', `B${pcRows[m]}`),
    balancePence: pence('Pure Cremation', `C${pcRows[m]}`),
    totalPaidPence: pence('Pure Cremation', `D${pcRows[m]}`),
    status: text('Pure Cremation', `E${pcRows[m]}`),
    paid: text('Pure Cremation', `F${pcRows[m]}`),
  })),
};

const ovoRows = Object.fromEntries(monthNames.map((m, i) => [m, 12 + i]));
const ovo = {
  accountName: text('Ovo', 'B2'),
  plan: text('Ovo', 'B3'),
  monthlyPaymentPence: pence('Ovo', 'B4'),
  accountNumber: text('Ovo', 'B5'),
  targetYear: num('Ovo', 'B6'),
  openingBalancePence: pence('Ovo', 'C11'),
  statement: monthNames.map((m) => ({
    month: m,
    billPeriod: text('Ovo', `B${ovoRows[m]}`),
    billAmountPence: pence('Ovo', `C${ovoRows[m]}`),
    paymentPence: pence('Ovo', `D${ovoRows[m]}`),
    balancePence: pence('Ovo', `F${ovoRows[m]}`),
  })),
};

const councilTax = {
  address: text('Council Tax', 'B2'),
  tenancyStart: dateCell('Council Tax', 'B3'),
  paymentPlan: text('Council Tax', 'B4'),
  reference: text('Council Tax', 'B5'),
  entries: Array.from({ length: 13 }, (_, i) => {
    const r = 10 + i;
    return {
      date: dateCell('Council Tax', `A${r}`),
      ref: text('Council Tax', `B${r}`),
      description: text('Council Tax', `C${r}`),
      amountPence: pence('Council Tax', `D${r}`),
      balancePence: pence('Council Tax', `E${r}`),
    };
  }),
};

function telcoLedger(sheet, blockStart) {
  const isO2 = sheet === 'O2';
  const rows = [];
  for (let i = 0; i < 13; i++) {
    const r = blockStart + i;
    rows.push({
      month: text(sheet, `A${r}`),
      amountPence: pence(sheet, `B${r}`),
      paymentPence: pence(sheet, `C${r}`),
      balancePence: pence(sheet, `D${r}`),
    });
  }
  const firstTierRow = isO2 ? 7 : 6;
  const tiers = [];
  for (let r = firstTierRow; r <= 9; r++) {
    tiers.push({
      label: text(sheet, `A${r}`).replace(/\s*\(\s*End of Contract\s*\)/i, ' (end of contract)'),
      amountPence: pence(sheet, `B${r}`),
    });
  }
  return {
    year: num(sheet, 'A13') || 2026,
    contract: {
      accountName: text(sheet, 'B2'),
      accountNumber: text(sheet, 'B3'),
      ...(isO2 ? { mobileNumber: text(sheet, 'B4').replace(/^,\s*/, '') } : {}),
      length: text(sheet, isO2 ? 'B5' : 'B4'),
      remaining: text(sheet, isO2 ? 'B6' : 'B5'),
      endDate: dateCell(sheet, isO2 ? 'D6' : 'D5'),
      tiers,
      contractAmountPence: pence(sheet, 'B10'),
      paymentsPence: pence(sheet, 'B11'),
      remainingPaymentsPence: pence(sheet, 'B12'),
    },
    statement: rows,
  };
}
const o2 = telcoLedger('O2', 17);
const virgin = telcoLedger('Virgin', 17);

const rentEntries = [];
for (let r = 14; r <= 142; r++) {
  const date = dateCell('Rent', `A${r}`);
  if (!date) continue;
  rentEntries.push({
    date,
    ref: text('Rent', `B${r}`),
    description: text('Rent', `C${r}`),
    amountPence: pence('Rent', `D${r}`),
    balancePence: pence('Rent', `E${r}`),
  });
}
const rent = {
  address: text('Rent', 'B3'),
  // Hyperlinks on the workbook's housing-portal and rent-charge-letter shapes.
  portalUrl: 'https://ww2.swindon.gov.uk/oa.live/ibsxmlpr.p?docid=login',
  chargeLetterUrl: 'https://financehub.freedev.app/files/Rent%20Charge%20Letter%2026-27.pdf',
  // The Rent sheet leaves the start date blank; use the matching tenancy start from Council Tax.
  tenancyStart: dateCell('Rent', 'B4') || dateCell('Council Tax', 'B3'),
  tenancyEnd: dateCell('Rent', 'B5'),
  rentBreakdown: text('Rent', 'B6'),
  balanceStatus: text('Rent', 'F6'),
  monthlyRentPence: pence('Rent', 'C6'),
  weeklyChargePence: pence('Rent', 'C7'),
  paymentPlan: text('Rent', 'B8'),
  monthlyPaymentPence: pence('Rent', 'C8'),
  agreement: text('Rent', 'B9'),
  reference: text('Rent', 'B10'),
  closingBalancePence: pence('Rent', 'E6'),
  entries: rentEntries,
};

// ---------------------------------------------------------------- multi-year provider blocks
// The 2026 rows above keep their original shape for existing consumers. Later
// year blocks are parsed from the sheets themselves so the workbook can be
// retired without losing 2027/2028 statements, balances or prices.
const providerSheets = {
  water: 'Water',
  councilTax: 'Council Tax',
  parkXmas: 'Park Xmas',
  pureCremation: 'Pure Cremation',
  ovo: 'Ovo',
  o2: 'O2',
  virgin: 'Virgin',
};
const providerRefs = { water, councilTax, parkXmas, pureCremation, ovo, o2, virgin };

const YEAR_HEADERS = [
  ['month', 'month'], ['date', 'date'], ['bill period', 'billPeriod'], ['ref', 'ref'],
  ['description', 'description'], ['bill amount', 'billAmountPence'], ['amount', 'billAmountPence'],
  ['monthly bill', 'billPence'], ['monthly payment', 'paymentPence'], ['payment', 'paymentPence'],
  ['balance', 'balancePence'], ['total paid', 'totalPaidPence'], ['status', 'status'], ['paid', 'paid'],
];
const MONEY_KEYS = new Set(['billAmountPence', 'billPence', 'paymentPence', 'balancePence', 'totalPaidPence']);
// Council Tax calls its amount column "Amount"; the telco sheets call it "Monthly Bill".
// Both are stored as amountPence to match the existing 2026 shapes.
const AMOUNT_RENAMES = { councilTax: 'billAmountPence', o2: 'billPence', virgin: 'billPence' };

function headerKey(label) {
  const key = label.trim().toLowerCase();
  const hit = YEAR_HEADERS.find(([text]) => text === key);
  return hit ? hit[1] : null;
}

function yearMarkers(sheet) {
  const s = ws(sheet);
  const range = XLSX.utils.decode_range(s['!ref']);
  const found = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (const letter of ['A', 'B']) {
      const cell = s[`${letter}${r + 1}`];
      if (cell && typeof cell.v === 'number' && cell.v >= 2027 && cell.v <= 2030) {
        found.push({ year: cell.v, row: r + 1 });
      }
    }
  }
  return found.sort((a, b) => a.row - b.row);
}

function parseYearBlock(sheet, markerRow, endRow, year) {
  let headerRow = 0;
  for (let r = markerRow + 1; r <= Math.min(markerRow + 4, endRow); r++) {
    if (/^(month|date)$/i.test(text(sheet, `A${r}`)) || /^(month|date)$/i.test(text(sheet, `B${r}`))) {
      headerRow = r;
      break;
    }
  }
  if (!headerRow) return null;

  const columns = {};
  for (let c = 0; c <= 10; c++) {
    const letter = XLSX.utils.encode_col(c);
    const key = headerKey(text(sheet, `${letter}${headerRow}`));
    if (key && !columns[key]) columns[key] = letter;
  }

  const rows = [];
  const rollovers = [];
  let openingPence = null;
  let totalRow = 0;
  for (let r = headerRow + 1; r <= endRow; r++) {
    const label = text(sheet, `A${r}`);
    if (!label) continue;
    if (/^total$/i.test(label)) { totalRow = r; break; }

    const cells = {};
    for (const [key, letter] of Object.entries(columns)) {
      const addr = `${letter}${r}`;
      if (key === 'date') cells.date = dateCell(sheet, addr);
      else if (MONEY_KEYS.has(key)) cells[key] = pence(sheet, addr);
      else cells[key] = text(sheet, addr);
    }

    if (/^opening balance$/i.test(label)) { openingPence = cells.balancePence ?? 0; continue; }
    if (/^\d{4} opening balance$/i.test(label)) { rollovers.push({ label, row: r, balancePence: cells.balancePence ?? 0 }); continue; }
    if (columns.month) {
      if (!monthNames.includes(label)) continue;
      rows.push({ month: label, ...cells, row: r });
    } else if (columns.date) {
      if (!cells.date) continue;
      rows.push({ ...cells, row: r });
    }
  }
  if (!rows.length) return null;

  const total = {};
  if (totalRow) {
    for (const [key, letter] of Object.entries(columns)) {
      total[key] = MONEY_KEYS.has(key) ? pence(sheet, `${letter}${totalRow}`) : text(sheet, `${letter}${totalRow}`);
    }
  }

  const rename = AMOUNT_RENAMES[Object.keys(providerSheets).find((key) => providerSheets[key] === sheet)];
  const cleanRows = rows.map((row) => {
    if (!rename || row[rename] === undefined) return row;
    const { [rename]: amount, ...rest } = row;
    return { ...rest, amountPence: amount };
  });

  const last = cleanRows[cleanRows.length - 1];
  return {
    year,
    openingPence: openingPence ?? 0,
    closingPence: last?.balancePence ?? total.balancePence ?? openingPence ?? 0,
    totalPaymentPence: total.paymentPence ?? cleanRows.reduce((sum, row) => sum + (row.paymentPence ?? 0), 0),
    totalPaidPence: Math.max(total.totalPaidPence ?? 0, ...cleanRows.map((row) => row.totalPaidPence ?? 0), 0),
    rows: cleanRows,
    rollovers,
    source: { headerRow, openingRow: headerRow + 1, totalRow: totalRow || null },
  };
}

for (const [key, sheet] of Object.entries(providerSheets)) {
  const markers = yearMarkers(sheet);
  const years = {};
  markers.forEach((marker, index) => {
    const endRow = (markers[index + 1]?.row ?? 9999) - 1;
    const block = parseYearBlock(sheet, marker.row, endRow, marker.year);
    if (block) years[marker.year] = block;
  });
  if (Object.keys(years).length) providerRefs[key].years = years;
}

// ---------------------------------------------------------------- product sheets
// These four sheets are product content, not budget data. Capturing them keeps
// the onboarding, reset, admin and guide copy after the workbook is retired.
const productContent = {
  setupWizard: textBlock('Setup Wizard', 1, 60, 0, 4),
  yearReset: textBlock('Year Reset', 1, 50, 0, 4),
  productAdmin: textBlock('Product Admin', 1, 35, 0, 3),
  customerGuide: textBlock('Customer Guide', 1, 40, 0, 3),
  transactionLogHowTo: textBlock('Transaction Log', 1, 10, 7, 8),
  statementTemplate: textBlock('Statement', 1, 12, 1, 7),
  starlingImport: textBlock('Starling Import', 1, 20, 0, 4),
};

// ---------------------------------------------------------------- reference expectations
const monthLabels = monthNames;
const referenceMonths = monthLabels.map((label, i) => {
  const r = 24 + i;
  return {
    month: i + 1,
    label,
    incomePence: pence('Dashboard', `B${r}`),
    expensesPence: pence('Dashboard', `C${r}`),
    netPence: pence('Dashboard', `D${r}`),
    owedPence: pence('Dashboard', `E${r}`),
    owedChangePence: pence('Dashboard', `F${r}`),
    balanced: text('Dashboard', `G${r}`),
    lockStatus: text('Dashboard', `H${r}`),
  };
});

const reference = {
  asOfDate: dateCell('Settings', 'C10'),
  lockCutoff: dateCell('Settings', 'C11'),
  anchorDate: dateCell('Settings', 'C12'),
  ytd: {
    incomePence: pence('Dashboard', 'B36'),
    expensesPence: pence('Dashboard', 'C36'),
    netPence: pence('Dashboard', 'D36'),
    totalOwedPence: pence('Dashboard', 'B45'),
    savingsRate: num('Dashboard', 'N6'),
  },
  currentYear: {
    year: num('Dashboard', 'F1'),
    monthLabel: text('Dashboard', 'E1'),
    incomePence: pence('Dashboard', 'C3'),
    expensesPence: pence('Dashboard', 'E3'),
    netPence: pence('Dashboard', 'G3'),
    owedPence: pence('Dashboard', 'K3'),
    yearProgress: num('Dashboard', 'G1'),
  },
  months: referenceMonths,
  accountsCurrent: accounts.map((a, i) => ({
    name: a.name,
    expectedPence: pence('Monthly_Overview', `N${11 + i}`),
    targetPence: pence('Monthly_Overview', `O${11 + i}`),
    flowPence: pence('Monthly_Overview', `M${11 + i}`),
  })),
  cardsCurrent: {
    totalBalancePence: pence('Monthly_Overview', 'N37'),
    totalLimitPence: pence('Monthly_Overview', 'O37'),
    rows: cards.map((c, i) => ({
      name: c.name,
      spentPence: pence('Monthly_Overview', `M${33 + i}`),
      balancePence: pence('Monthly_Overview', `N${33 + i}`),
    })),
  },
  billSummary: [
    'Rent', 'Council Tax', 'Ovo', 'Water', 'Park Xmas', 'Pure Cremation', 'O2', 'Virgin Media',
  ].map((name, i) => {
    const r = 42 + i;
    return {
      name,
      balancePence: pence('Dashboard', `K${r}`),
      status: text('Dashboard', `L${r}`),
      paymentPence: pence('Dashboard', `M${r}`),
      frequency: text('Dashboard', `N${r}`),
    };
  }),
  currentMonthView: {
    incomePence: pence('Monthly_Overview', 'U9'),
    expensesPence: pence('Monthly_Overview', 'U10'),
    netPence: pence('Monthly_Overview', 'U15'),
    owedPence: pence('Monthly_Overview', 'U13'),
    percentIncomeSpent: num('Monthly_Overview', 'U12'),
    starlingBalancePence: pence('Monthly_Overview', 'U11'),
    scheduledBillsOutPence: pence('Monthly_Overview', 'U19'),
  },
};

// ---------------------------------------------------------------- holidays
function holidayBlock(startRow, endRow) {
  const rows = [];
  for (let r = startRow; r <= endRow; r++) {
    const event = text('Dashboard', `A${r}`);
    if (!event || event === 'Totals') continue;
    const totalText = text('Dashboard', `I${r}`);
    rows.push({
      event,
      start: dateCell('Dashboard', `B${r}`),
      end: dateCell('Dashboard', `C${r}`),
      nights: raw('Dashboard', `D${r}`),
      ref: text('Dashboard', `E${r}`),
      status: text('Dashboard', `F${r}`),
      notes: text('Dashboard', `G${r}`),
      paid: text('Dashboard', `H${r}`),
      totalText,
      totalPence: /^:/.test(totalText) ? null : pence('Dashboard', `I${r}`),
      address: text('Dashboard', `J${r}`),
    });
  }
  return rows;
}
const holidays = {
  2026: holidayBlock(53, 63),
  2027: holidayBlock(68, 77),
};

// ---------------------------------------------------------------- changelog
// Hidden guide sheets are part of the product, not just documentation.
function textBlock(sheet, r0, r1, c0, c1) {
  const out = [];
  for (let r = r0; r <= r1; r++) {
    const parts = [];
    for (let c = c0; c <= c1; c++) {
      const v = text(sheet, `${XLSX.utils.encode_col(c)}${r}`);
      if (v) parts.push(v);
    }
    if (parts.length) out.push(parts.join(' — '));
  }
  return out;
}
const guides = {
  monthEnd: textBlock('Month-End Guide', 1, 47, 0, 4),
  newYear: textBlock('New-Year Setup', 1, 47, 1, 3),
};

const changelog = [];
for (let r = 3; r <= 205; r++) {
  const date = text('Changelog', `B${r}`);
  if (!date) continue;
  changelog.push({
    date,
    sheetCell: text('Changelog', `C${r}`),
    description: text('Changelog', `D${r}`),
    sourceRow: r,
  });
}

// ---------------------------------------------------------------- audit
const knownAccounts = new Set(accounts.map((a) => a.name));
const knownPeople = new Set(people.map((p) => p.shortName));
const knownCards = new Set(cards.map((c) => c.name));
const accountUsage = new Map();
for (const t of transactions) {
  accountUsage.set(t.account, (accountUsage.get(t.account) ?? 0) + 1);
}
const audit = [];
const classify = (acct) =>
  knownAccounts.has(acct) ? 'bank' :
  knownPeople.has(acct) ? 'person' :
  knownCards.has(acct) ? 'card' :
  ['Petrol', 'Other'].includes(acct) ? 'pseudo' :
  acct === 'Credit Cards' ? 'aggregate' : 'unknown';

for (const [acct, count] of accountUsage) {
  const kind = classify(acct);
  if (kind === 'unknown' || kind === 'aggregate') {
    audit.push({
      kind: kind === 'unknown' ? 'unknown-account' : 'excluded-aggregate-account',
      severity: kind === 'unknown' ? 'warning' : 'info',
      detail: `"${acct}" (${count} rows) is not a Settings bank/person/card; the workbook's SUMIFS over those tables never includes it.`,
    });
  }
}

const feb27 = transactions.filter((t) => t.date === '2026-02-27' && t.account === 'Credit Cards');
audit.push({
  kind: 'excluded-row',
  severity: 'info',
  detail: `The 27/02/2026 "Credit Cards" £${(feb27.reduce((s, t) => s + t.amountPence, 0) / 100).toFixed(2)} expense is intentionally excluded from every budget total because "Credit Cards" is not a Settings account.`,
  transactions: feb27.map((t) => t.row),
});

const danRows = transactions.filter((t) => t.account === 'Dan');
audit.push({
  kind: 'orphan-person',
  severity: 'warning',
  detail: `"Dan" has ${danRows.length} transactions but no People account, so none of them affect owed or budget totals.`,
  transactions: danRows.map((t) => t.row),
});

const excludedBanks = ['Barclays', 'Revolut', 'Monzo', 'Nationwide']
  .filter((n) => accountUsage.has(n))
  .map((n) => `${n} (${accountUsage.get(n)})`);
audit.push({
  kind: 'ledger-only-accounts',
  severity: 'info',
  detail: `Expenses on ${excludedBanks.join(', ')} are ledger-only: Monthly_Overview sums Starling/Petrol/Other/cards, not every bank account.`,
});

for (const [year, rows] of Object.entries(holidays)) {
  for (const h of rows) {
    if (/^:/.test(h.totalText)) {
      audit.push({
        kind: 'ambiguous-holiday-total',
        severity: 'warning',
        detail: `${year} "${h.event}" total is stored as text "${h.totalText}" — interpreted as an unknown/redacted amount, not silently converted.`,
      });
    }
  }
}

const ds = {
  meta: {
    source: path.basename(SRC),
    importedAt: new Date().toISOString(),
    sheetCount: wb.SheetNames.length,
    sheetNames: wb.SheetNames,
    currency: settings.currency,
    moneyUnit: 'pence',
  },
  settings,
  accounts,
  people,
  cards,
  bills,
  billChanges,
  incomeSchedules,
  transactions,
  providers: { rent, water, parkXmas, pureCremation, ovo, councilTax, o2, virgin },
  reference,
  holidays,
  guides,
  productContent,
  changelog,
  audit,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(ds, null, 2), 'utf8');

console.log(`Wrote ${OUT}`);
console.log(`sheets=${ds.meta.sheetCount} accounts=${accounts.length} people=${people.length} cards=${cards.length} bills=${bills.length} changes=${billChanges.length}`);
console.log(`transactions=${transactions.length} changelog=${changelog.length} audit=${audit.length}`);
console.log('reference YTD', reference.ytd);
const yearSummary = Object.entries(providerSheets)
  .map(([key]) => `${key}:${Object.keys(providerRefs[key].years ?? {}).join('/') || 'none'}`)
  .join(' ');
console.log(`provider years ${yearSummary}`);
console.log(`product content lines ${Object.values(productContent).reduce((sum, lines) => sum + lines.length, 0)}`);
console.log('reference months', reference.months.map((m) => `${m.label}:${(m.incomePence / 100).toFixed(2)}/${(m.expensesPence / 100).toFixed(2)}/${(m.owedPence / 100).toFixed(2)}`).join(' '));
