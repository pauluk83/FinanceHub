/**
 * Enable Banking (Open Banking AIS) normalisation.
 *
 * Enable Banking is an authorised account-information service provider: the
 * consent and SCA happen with the bank through its flow, and FinanceHub only
 * receives the account data the owner linked. This module keeps the mapping
 * pure so the main process never hands the renderer raw provider payloads.
 */

export interface EnableBankingAspsp {
  name: string;
  country: string;
  logo?: string;
}

export interface EnableBankingSession {
  sessionId: string;
  aspspName: string;
  aspspCountry: string;
  validUntil: string;
  accounts: Array<{ uid: string; name: string; currency: string; accountId?: string }>;
}

export interface EnableBankingAccount {
  uid: string;
  sessionId: string;
  name: string;
  currency: string;
  aspspName: string;
  validUntil: string;
}

export interface EnableBankingImportRow {
  id: string;
  date: string;
  description: string;
  amountPence: number;
  type: 'Income' | 'Expense';
  currency: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

export function isEnableBankingUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/** Enable Banking sends decimal strings such as "12.34"; convert exactly to pence. */
export function enableBankingAmountPence(value: unknown): number | null {
  const raw = typeof value === 'number' && Number.isFinite(value)
    ? value.toFixed(2)
    : typeof value === 'string' ? value.trim() : '';
  if (!/^-?\d{1,12}(\.\d{1,2})?$/.test(raw)) return null;
  const negative = raw.startsWith('-');
  const [whole, fraction = ''] = raw.replace('-', '').split('.');
  const pence = Number(whole) * 100 + Number(`${fraction}00`.slice(0, 2));
  if (!Number.isSafeInteger(pence)) return null;
  return negative ? -pence : pence;
}

export function normaliseEnableBankingAspsps(input: unknown): EnableBankingAspsp[] {
  const list = Array.isArray(record(input).aspsps) ? record(input).aspsps as unknown[] : [];
  const seen = new Set<string>();
  const aspsps: EnableBankingAspsp[] = [];
  for (const entry of list) {
    const aspsp = record(entry);
    const name = text(aspsp.name);
    const country = text(aspsp.country).toUpperCase();
    if (!name || !/^[A-Z]{2}$/.test(country)) continue;
    const key = `${country}|${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const logo = text(aspsp.logo);
    aspsps.push({ name, country, ...(/^https:\/\//.test(logo) ? { logo } : {}) });
  }
  return aspsps.sort((a, b) => a.name.localeCompare(b.name));
}

/** Flatten the stored sessions into the accounts they cover. */
export function normaliseEnableBankingAccounts(sessions: unknown): EnableBankingAccount[] {
  if (!Array.isArray(sessions)) return [];
  const accounts: EnableBankingAccount[] = [];
  for (const entry of sessions) {
    const session = record(entry);
    const sessionId = text(session.sessionId);
    if (!sessionId) continue;
    const aspspName = text(session.aspspName);
    const validUntil = text(session.validUntil);
    const rows = Array.isArray(session.accounts) ? session.accounts : [];
    for (const item of rows) {
      const account = record(item);
      const uid = text(account.uid);
      if (!uid) continue;
      accounts.push({
        uid,
        sessionId,
        name: text(account.name) || 'Linked account',
        currency: text(account.currency).toUpperCase(),
        aspspName,
        validUntil,
      });
    }
  }
  return accounts;
}

/** BOOKED transactions become review rows; pending (PDNG) items are excluded. */
export function enableBankingImportRows(input: unknown): EnableBankingImportRow[] {
  const list = Array.isArray(input) ? input : Array.isArray(record(input).transactions) ? record(input).transactions as unknown[] : [];
  const rows: EnableBankingImportRow[] = [];
  list.forEach((entry, index) => {
    const item = record(entry);
    const status = text(item.status).toUpperCase();
    if (status && status !== 'BOOKED') return;
    const amount = record(item.transaction_amount);
    const signed = enableBankingAmountPence(amount.amount);
    if (signed === null || signed === 0) return;
    const date = text(item.booking_date) || text(item.value_date);
    if (!DATE_RE.test(date)) return;
    const currency = text(amount.currency).toUpperCase();
    const direction = text(item.credit_debit_indicator).toUpperCase();
    const type: 'Income' | 'Expense' = direction === 'CRDT' ? 'Income'
      : direction === 'DBIT' ? 'Expense'
        : signed > 0 ? 'Income' : 'Expense';
    const remittance = Array.isArray(item.remittance_information)
      ? item.remittance_information.map(text).filter(Boolean).join(' — ')
      : text(item.remittance_information);
    const counterparty = text(record(item.creditor).name) || text(record(item.debtor).name);
    const description = (remittance || counterparty || text(item.transaction_code) || 'Bank transaction').slice(0, 240);
    const id = text(item.transaction_id) || text(item.entry_reference) || `eb_${date}_${Math.abs(signed)}_${index}`;
    rows.push({ id, date, description, amountPence: Math.abs(signed), type, currency });
  });
  return rows.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

/** The JWT claims Enable Banking accepts (RS256 header is added by the signer). */
export function enableBankingJwtClaims(nowSeconds: number): {
  iss: string; aud: string; iat: number; exp: number;
} {
  const issued = Number.isFinite(nowSeconds) ? Math.floor(nowSeconds) : Math.floor(Date.now() / 1000);
  return {
    iss: 'enablebanking.com',
    aud: 'api.enablebanking.com',
    iat: issued,
    exp: issued + 3600,
  };
}
