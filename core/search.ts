/**
 * Global search (R5).
 *
 * Read-only over the loaded budget. Results are ranked by a title prefix, then
 * a body match, then date; the palette in the app shell renders them beside the
 * section matches it already had.
 */
import type { Dataset, Engine } from './engine.ts';

export type SearchKind =
  | 'transaction'
  | 'bill'
  | 'person'
  | 'account'
  | 'card'
  | 'debt'
  | 'saving'
  | 'provider'
  | 'holiday';

export interface SearchResult {
  id: string;
  kind: SearchKind;
  title: string;
  detail: string;
  date?: string;
  amountPence?: number;
  view: string;
  /** 0 = title starts with the query, 1 = title contains it, 2 = body only. */
  score: number;
}

const KIND_RANK: Record<SearchKind, number> = {
  transaction: 0,
  bill: 1,
  person: 2,
  account: 3,
  card: 4,
  debt: 5,
  saving: 6,
  provider: 7,
  holiday: 8,
};

function money(pence: number): string {
  return `${pence < 0 ? '-' : ''}£${(Math.abs(pence) / 100).toFixed(2)}`;
}

function scoreFor(title: string, body: string, query: string): number {
  const name = title.toLocaleLowerCase('en-GB');
  if (name.startsWith(query)) return 0;
  if (name.includes(query)) return 1;
  if (body.toLocaleLowerCase('en-GB').includes(query)) return 2;
  return -1;
}

/**
 * Search transactions, bills, people, accounts, cards, debts, savings,
 * providers and holidays. A query shorter than two characters returns nothing
 * so the palette can keep showing section navigation.
 */
export function globalSearch(ds: Dataset, engine: Engine, rawQuery: string, limit = 40): SearchResult[] {
  const query = rawQuery.trim().toLocaleLowerCase('en-GB');
  if (query.length < 2) return [];

  const results: SearchResult[] = [];
  const push = (result: SearchResult) => {
    if (result.score >= 0) results.push(result);
  };

  for (const tx of ds.transactions) {
    if (tx.mergedIntoRow) continue;
    const body = `${tx.date} ${tx.account} ${tx.type} ${money(tx.amountPence)} ${tx.category ?? ''} ${(tx.tags ?? []).join(' ')}`;
    const title = tx.comments?.trim() || `${tx.type} on ${tx.date}`;
    push({
      id: `transaction:${tx.row}`,
      kind: 'transaction',
      title,
      detail: `${body}${tx.cleared ? ' · cleared' : ''}`,
      date: tx.date,
      amountPence: tx.amountPence,
      view: 'transactions',
      score: scoreFor(title, body, query),
    });
  }

  for (const bill of ds.bills) {
    const title = bill.name;
    const body = `${bill.linkedSheet ?? ''} ${bill.paymentMethod ?? ''} ${bill.account ?? ''} ${money(bill.baseAmountPence || bill.amountPence)}`;
    push({
      id: `bill:${bill.name}`,
      kind: 'bill',
      title,
      detail: `${money(bill.baseAmountPence || bill.amountPence)} base · day ${bill.dueDay}${bill.active === false ? ' · inactive' : ''}`,
      view: 'bills',
      amountPence: bill.baseAmountPence || bill.amountPence,
      score: scoreFor(title, body, query),
    });
  }

  for (const person of ds.people) {
    const title = person.fullName || person.shortName;
    const body = `${person.shortName} ${money(person.openingPence)}${person.active === false ? ' inactive' : ''}`;
    push({
      id: `person:${person.shortName}`,
      kind: 'person',
      title,
      detail: `${person.shortName} · opening ${money(person.openingPence)}${person.active === false ? ' · inactive' : ''}`,
      view: 'people',
      score: scoreFor(title, body, query),
    });
  }

  for (const account of ds.accounts) {
    const title = account.name;
    const body = `${account.name} ${account.active === false ? 'inactive' : 'active'}`;
    push({
      id: `account:${account.name}`,
      kind: 'account',
      title,
      detail: account.active === false ? 'Bank account · inactive' : 'Bank account',
      view: 'accounts',
      score: scoreFor(title, body, query),
    });
  }

  for (const card of ds.cards) {
    const title = card.name;
    const body = `${card.name} limit ${money(card.limitPence)}`;
    push({
      id: `card:${card.name}`,
      kind: 'card',
      title,
      detail: `Credit card · limit ${money(card.limitPence)}`,
      view: 'cards',
      amountPence: card.limitPence,
      score: scoreFor(title, body, query),
    });
  }

  for (const debt of ds.debts ?? []) {
    const title = debt.name;
    const body = `${debt.creditor ?? ''} ${debt.agreementType ?? ''} ${debt.notes ?? ''} ${money(debt.balancePence)}`;
    push({
      id: `debt:${debt.id}`,
      kind: 'debt',
      title,
      detail: `${money(debt.balancePence)} owed${debt.active === false ? ' · inactive' : ''}`,
      view: 'debts',
      amountPence: debt.balancePence,
      score: scoreFor(title, body, query),
    });
  }

  for (const saving of ds.savings ?? []) {
    const title = saving.name;
    const body = `${saving.provider ?? ''} ${saving.type ?? ''} ${saving.notes ?? ''} ${money(saving.balancePence)}`;
    push({
      id: `saving:${saving.id}`,
      kind: 'saving',
      title,
      detail: `${money(saving.balancePence)} saved${saving.active === false ? ' · inactive' : ''}`,
      view: 'savings',
      amountPence: saving.balancePence,
      score: scoreFor(title, body, query),
    });
  }

  for (const [key, provider] of Object.entries(ds.providers ?? {})) {
    const title = String(provider?.displayName ?? provider?.name ?? key);
    const body = `${key} ${provider?.accountName ?? ''} ${provider?.notes ?? ''}`;
    push({
      id: `provider:${key}`,
      kind: 'provider',
      title,
      detail: 'Provider ledger',
      view: key,
      score: scoreFor(title, body, query),
    });
  }

  const holidays = Object.values(ds.holidays ?? {}).flat().filter((trip) => trip && typeof trip === 'object');
  for (const [index, trip] of holidays.entries()) {
    const title = String((trip as any).name ?? (trip as any).destination ?? `Holiday ${index + 1}`);
    const body = `${(trip as any).destination ?? ''} ${(trip as any).notes ?? ''} ${(trip as any).start ?? ''} ${(trip as any).end ?? ''}`;
    push({
      id: `holiday:${index}`,
      kind: 'holiday',
      title,
      detail: [String((trip as any).start ?? ''), String((trip as any).end ?? '')].filter(Boolean).join(' → ') || 'Trip',
      date: String((trip as any).start ?? ''),
      view: 'holidays',
      score: scoreFor(title, body, query),
    });
  }

  // Account balances are looked up lazily so a large transaction search does
  // not pay for the engine walk unless an account actually matches.
  const matchedAccounts = results.filter((result) => result.kind === 'account' && result.score >= 0);
  if (matchedAccounts.length) {
    const balances = engine.accountBalances(ds.settings.asOfDate);
    for (const result of matchedAccounts) {
      const balance = balances.find((entry) => entry.name === result.title);
      if (balance) result.detail = `Bank account · ${money(balance.balancePence)}`;
    }
  }

  return results
    .sort((left, right) => left.score - right.score
      || KIND_RANK[left.kind] - KIND_RANK[right.kind]
      || (right.date ?? '').localeCompare(left.date ?? '')
      || left.title.localeCompare(right.title, 'en-GB'))
    .slice(0, Math.max(1, limit));
}
