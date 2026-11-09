import type { Dataset } from '../../core/engine';

/**
 * Metadata for the provider ledgers FinanceHub ships with. The onboarding
 * provider step and the sidebar builder both read this list, so a provider is
 * described once (label, icon, editable fields, blank ledger shape).
 */

export type ProviderFieldType = 'text' | 'url' | 'date' | 'number' | 'multiline';

/** What a provider normally bills, what you normally pay and how often. */
export interface ProviderBilling {
  /** The normal bill for the period. */
  billPence: number;
  /** What you normally pay each month; falls back to the bill. */
  monthlyPence: number;
  /** Day of the month the payment leaves, 1–28. */
  paymentDay: number;
  /** Bank account the provider is paid from; blank means the main account. */
  account: string;
  contractDetails: string;
  /** When true the provider keeps a monthly bill so the year plan is built. */
  recurring: boolean;
}

export interface ProviderPlanRow {
  month: number;
  monthLabel: string;
  date: string;
  amountPence: number;
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const wholePence = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : 0);
const paymentDay = (value: unknown) => {
  const day = Math.round(Number(value));
  return Number.isFinite(day) ? Math.min(28, Math.max(1, day)) : 1;
};

export interface ProviderFieldConfig {
  key: string;
  label: string;
  type?: ProviderFieldType;
  hint?: string;
}

export interface ProviderSetupMeta {
  key: string;
  name: string;
  icon: string;
  defaultLogo?: string;
  fields: ProviderFieldConfig[];
  blank: (year: number) => Record<string, any>;
}

export const PROVIDER_LOGO_MAX_BYTES = 200 * 1024;
export const PROVIDER_LOGO_MAX_DATA = 300_000;
const LOGO_DATA = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

const URL_FIELD: ProviderFieldConfig = { key: 'portalUrl', label: 'Portal URL', type: 'url' };

function statementLedger(year: number) {
  return { enabled: true, year, statement: [] };
}

export const PROVIDER_SETUP: ProviderSetupMeta[] = [
  {
    key: 'rent',
    name: 'Rent',
    icon: '🏠',
    defaultLogo: 'swindon-borough-council.svg',
    blank: (year) => ({
      enabled: true,
      year,
      entries: [],
      monthlyRentPence: 0,
      weeklyChargePence: 0,
      monthlyPaymentPence: 0,
      paymentDay: 1,
    }),
    fields: [
      { key: 'providerName', label: 'Provider name' },
      { key: 'address', label: 'Address', type: 'multiline' },
      { key: 'tenancyStart', label: 'Tenancy start', type: 'date' },
      { key: 'reference', label: 'Tenancy reference' },
      { key: 'rentBreakdown', label: 'Rent breakdown', type: 'multiline' },
      { key: 'agreementType', label: 'Agreement type' },
      { key: 'paymentPlan', label: 'Payment plan', type: 'multiline' },
      { key: 'paymentDay', label: 'Payment day', type: 'number' },
      { key: 'agreement', label: 'Agreement', type: 'multiline' },
      { key: 'providerUrl', label: 'Provider website', type: 'url' },
      { key: 'chargeLetterUrl', label: 'Charge letter URL', type: 'url' },
      URL_FIELD,
    ],
  },
  {
    key: 'water',
    name: 'Water',
    icon: '💧',
    defaultLogo: 'thames-water-logo.svg',
    blank: (year) => ({ ...statementLedger(year), monthlyPaymentPence: 0 }),
    fields: [
      { key: 'accountName', label: 'Account name' },
      { key: 'accountNumber', label: 'Account number' },
      { key: 'paymentPlan', label: 'Payment plan' },
      URL_FIELD,
    ],
  },
  {
    key: 'councilTax',
    name: 'Council Tax',
    icon: '🏛',
    defaultLogo: 'swindon-borough-council.svg',
    blank: (year) => ({ enabled: true, year, entries: [] }),
    fields: [
      { key: 'providerName', label: 'Provider name' },
      { key: 'address', label: 'Address', type: 'multiline' },
      { key: 'tenancyStart', label: 'Tenancy start', type: 'date' },
      { key: 'reference', label: 'Reference' },
      { key: 'paymentPlan', label: 'Payment plan' },
      { key: 'billUrl', label: 'Bill URL', type: 'url' },
      URL_FIELD,
    ],
  },
  {
    key: 'parkXmas',
    name: 'Park Xmas',
    icon: '🎄',
    defaultLogo: 'park-christmas-savings.svg',
    blank: (year) => statementLedger(year),
    fields: [
      { key: 'accountName', label: 'Account name' },
      { key: 'accountNo', label: 'Account number' },
      URL_FIELD,
    ],
  },
  {
    key: 'pureCremation',
    name: 'Pure Cremation',
    icon: '⚱',
    blank: (year) => statementLedger(year),
    fields: [
      { key: 'accountName', label: 'Account name' },
      { key: 'paymentAccount', label: 'Payment account' },
      { key: 'paymentDay', label: 'Payment day', type: 'number' },
      URL_FIELD,
    ],
  },
  {
    key: 'ovo',
    name: 'Ovo',
    icon: '⚡',
    defaultLogo: 'ovo-logo.svg',
    blank: (year) => ({ ...statementLedger(year), monthlyPaymentPence: 0 }),
    fields: [
      { key: 'accountName', label: 'Account name' },
      { key: 'plan', label: 'Plan' },
      { key: 'accountNumber', label: 'Account number' },
      URL_FIELD,
    ],
  },
  {
    key: 'o2',
    name: 'O2',
    icon: '📱',
    defaultLogo: 'o2-logo.svg',
    blank: (year) => ({ ...statementLedger(year), contract: { tiers: [] } }),
    fields: [
      { key: 'contract.accountName', label: 'Account name' },
      { key: 'contract.accountNumber', label: 'Account number' },
      { key: 'contract.mobileNumber', label: 'Mobile number' },
      URL_FIELD,
    ],
  },
  {
    key: 'virgin',
    name: 'Virgin',
    icon: '📡',
    defaultLogo: 'virgin-media-logo.png',
    blank: (year) => ({ ...statementLedger(year), contract: { tiers: [] } }),
    fields: [
      { key: 'contract.accountName', label: 'Account name' },
      { key: 'contract.accountNumber', label: 'Account number' },
      URL_FIELD,
    ],
  },
];

export function providerMeta(key: string): ProviderSetupMeta | undefined {
  return PROVIDER_SETUP.find((entry) => entry.key === key);
}

export function providerAsset(file: string): string {
  return `${import.meta.env.BASE_URL}${file}`;
}

export function providerDisplayName(ds: Dataset, key: string): string {
  const custom = ds.providers?.[key]?.displayName;
  if (typeof custom === 'string' && custom.trim()) return custom.trim();
  return providerMeta(key)?.name ?? key;
}

/** A provider appears in the app only when its ledger exists and is not hidden. */
export function isProviderEnabled(ds: Dataset, key: string): boolean {
  const provider = ds.providers?.[key];
  return Boolean(provider) && provider.enabled !== false;
}

export function newProviderData(key: string, year: number): Record<string, any> | null {
  const meta = providerMeta(key);
  return meta ? meta.blank(year) : null;
}

export function providerLogo(ds: Dataset, key: string): string | undefined {
  const logo = ds.providers?.[key]?.logoData;
  return typeof logo === 'string' && LOGO_DATA.test(logo) ? logo : undefined;
}

export function readProviderField(provider: any, key: string): string {
  const value = key.split('.').reduce<any>((current, part) => (current == null ? undefined : current[part]), provider);
  if (value === undefined || value === null) return '';
  return String(value);
}

export function writeProviderField(provider: any, key: string, value: string, type: ProviderFieldType = 'text'): void {
  const parts = key.split('.');
  let target = provider;
  for (const part of parts.slice(0, -1)) {
    if (!target[part] || typeof target[part] !== 'object') target[part] = {};
    target = target[part];
  }
  const leaf = parts[parts.length - 1];
  if (type === 'number') {
    const digits = String(value).replace(/[^\d.-]/g, '');
    const number = Number(digits);
    target[leaf] = Number.isFinite(number) ? number : 0;
    return;
  }
  target[leaf] = value;
}

/** Billing details for a provider, with safe defaults for ledgers created before they existed. */
export function providerBilling(provider: any): ProviderBilling {
  const billing = provider?.billing ?? {};
  return {
    billPence: wholePence(billing.billPence),
    monthlyPence: wholePence(billing.monthlyPence),
    paymentDay: paymentDay(billing.paymentDay ?? provider?.paymentDay ?? 1),
    account: typeof billing.account === 'string' ? billing.account : '',
    contractDetails: typeof billing.contractDetails === 'string' ? billing.contractDetails : '',
    recurring: billing.recurring === true,
  };
}

/** The figure the year plan uses: what you normally pay, else the normal bill. */
export function providerBillingAmount(billing: ProviderBilling): number {
  return billing.monthlyPence || billing.billPence;
}

/** Twelve dated payments for the year, clamping the day to short months. */
export function buildProviderYearPlan(year: number, billing: ProviderBilling): ProviderPlanRow[] {
  const amount = providerBillingAmount(billing);
  if (!amount || !Number.isInteger(year)) return [];
  return MONTH_LABELS.map((monthLabel, index) => {
    const month = index + 1;
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const day = Math.min(billing.paymentDay, lastDay);
    return {
      month,
      monthLabel,
      date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      amountPence: amount,
    };
  });
}

export function providerYearPlanTotal(plan: ProviderPlanRow[]): number {
  return plan.reduce((total, row) => total + row.amountPence, 0);
}

export type ProviderPlanKind = 'cashflow' | 'savings' | 'telco' | 'dated';

/** The ledger row shape a provider page reads, or null when it keeps its own schedule. */
export function providerPlanKind(key: string): ProviderPlanKind | null {
  if (key === 'water' || key === 'ovo') return 'cashflow';
  if (key === 'parkXmas' || key === 'pureCremation') return 'savings';
  if (key === 'o2' || key === 'virgin') return 'telco';
  if (key === 'councilTax') return 'dated';
  return null;
}

/**
 * The ledger rows for the remaining months, in the shape the provider's own page
 * expects, so enabling the plan in setup actually fills the provider page.
 * Rows are marked `plan` so a later change can update or remove only its own rows.
 */
export function buildProviderPlanEntries(
  key: string,
  year: number,
  billing: ProviderBilling,
  fromMonth = 1,
): Record<string, any>[] {
  const amount = providerBillingAmount(billing);
  const kind = providerPlanKind(key);
  if (!amount || !kind || !Number.isInteger(year)) return [];
  const start = Math.min(12, Math.max(1, Math.round(fromMonth)));
  const rows: Record<string, any>[] = [];
  for (let month = start; month <= 12; month += 1) {
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const day = Math.min(billing.paymentDay, lastDay);
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const label = MONTH_LABELS[month - 1];
    if (kind === 'cashflow') {
      rows.push({ month: label, billPeriod: '', billAmountPence: billing.billPence || amount, paymentPence: amount, balancePence: 0, plan: true });
    } else if (kind === 'telco') {
      rows.push({ month: label, amountPence: billing.billPence || amount, paymentPence: amount, balancePence: 0, paid: 'No', plan: true });
    } else if (kind === 'savings') {
      rows.push({ month: label, paymentPence: amount, balancePence: 0, totalPaidPence: 0, status: 'Owed', paid: 'No', plan: true });
    } else {
      rows.push({ date, ref: 'Direct Debit', description: '', amountPence: amount, balancePence: 0, plan: true });
    }
  }
  return rows;
}

/**
 * Fill in months the ledger does not have yet and refresh rows the plan created.
 * A month with real data is never overwritten.
 */
export function mergeProviderPlanRows(list: any[], rows: any[], monthly: boolean): { added: number; updated: number } {
  const keyOf = (row: any) => (monthly ? String(row.month ?? '') : String(row.date ?? ''));
  const byKey = new Map(list.map((row) => [keyOf(row), row] as const));
  let added = 0;
  let updated = 0;
  for (const row of rows) {
    const existing = byKey.get(keyOf(row));
    if (!existing) {
      list.push({ ...row });
      added += 1;
      continue;
    }
    if (existing.plan !== true) continue;
    for (const [field, value] of Object.entries(row)) {
      if (field === 'paid' || field === 'status' || field === 'balancePence' || field === 'totalPaidPence') continue;
      existing[field] = value;
    }
    updated += 1;
  }
  return { added, updated };
}

/** Rows the plan created, without the user's own ledger entries. */
export const withoutProviderPlanRows = (rows: any[]): any[] => rows.filter((row) => row?.plan !== true);

export function providerFieldProblem(field: ProviderFieldConfig, value: string): string | null {
  const text = value.trim();
  if (!text) return null;
  if (field.type === 'url') {
    try {
      const url = new URL(text);
      if (!/^https?:$/.test(url.protocol) || url.username || url.password) {
        return 'Use a full http or https address without a username or password.';
      }
    } catch {
      return 'Enter a complete http or https address.';
    }
  }
  if (field.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(text)) return 'Choose a valid date.';
  if (field.type === 'number' && !/^\d+$/.test(text)) return 'Use a whole number.';
  return null;
}

export function providerLogoFileProblem(file: { type: string; size: number } | null | undefined): string | null {
  if (!file) return 'Choose an image file.';
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return 'Use a PNG, JPEG or WebP image.';
  if (!Number.isFinite(file.size) || file.size <= 0) return 'That image file is empty.';
  if (file.size > PROVIDER_LOGO_MAX_BYTES) return 'Keep the logo under 200 KB.';
  return null;
}

export function providerLogoDataProblem(data: string): string | null {
  if (!data) return 'That image could not be read.';
  if (data.length > PROVIDER_LOGO_MAX_DATA) return 'That logo is too large to sync; use a smaller image.';
  if (!LOGO_DATA.test(data)) return 'That logo is not a supported PNG, JPEG or WebP image.';
  return null;
}

export async function readProviderLogo(file: File): Promise<string> {
  const problem = providerLogoFileProblem(file);
  if (problem) throw new Error(problem);
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('That image could not be read.'));
    reader.readAsDataURL(file);
  });
  const dataProblem = providerLogoDataProblem(data);
  if (dataProblem) throw new Error(dataProblem);
  return data;
}
