/**
 * One place decides what a transaction account name means. The engine, the
 * transaction editor and the review panels all use this classifier so an
 * unknown name can never be counted as a bank, person or card by accident.
 */

export type AccountKind = 'bank' | 'person' | 'card' | 'pseudo' | 'unknown';

export interface AccountDirectory {
  accounts: readonly { name: string }[];
  people: readonly { shortName: string }[];
  cards: readonly { name: string }[];
}

export const PSEUDO_ACCOUNTS = ['Petrol', 'Other'] as const;

export function accountClassifier(directory: AccountDirectory): (name: string) => AccountKind {
  const banks = new Set(directory.accounts.map((account) => account.name));
  const people = new Set(directory.people.map((person) => person.shortName));
  const cards = new Set(directory.cards.map((card) => card.name));
  const pseudo = new Set<string>(PSEUDO_ACCOUNTS);

  return (name: string): AccountKind => {
    if (banks.has(name)) return 'bank';
    if (people.has(name)) return 'person';
    if (cards.has(name)) return 'card';
    if (pseudo.has(name)) return 'pseudo';
    return 'unknown';
  };
}

export function classifyAccount(name: string, directory: AccountDirectory): AccountKind {
  return accountClassifier(directory)(name);
}

/** Names the transaction editor may offer, in the order the UI has always used. */
export function knownAccountNames(directory: AccountDirectory): string[] {
  return Array.from(new Set([
    ...directory.accounts.map((account) => account.name),
    ...directory.people.map((person) => person.shortName),
    ...directory.cards.map((card) => card.name),
    ...PSEUDO_ACCOUNTS,
  ]));
}

export interface TransactionShape {
  account: string;
  type: string;
  date: string;
  amountPence: number;
  comments?: string;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Match a name as a whole word in free-text comments, case-insensitively. */
export function commentsMention(comments: string | undefined, name: string): boolean {
  const target = name.trim();
  if (!target) return false;
  return new RegExp(`\\b${escapeRegExp(target)}\\b`, 'i').test(comments ?? '');
}

export interface LinkedCommentSummary {
  rows: number;
  expensePence: number;
  incomePence: number;
  lastDate: string;
}

/** A review ledger: direct rows plus rows on other accounts that mention the name. */
export function linkedAccountTransactions<T extends TransactionShape>(
  transactions: readonly T[],
  name: string,
  through?: string,
): T[] {
  return transactions.filter((transaction) =>
    (!through || transaction.date <= through)
    && (transaction.account === name || commentsMention(transaction.comments, name)),
  );
}

/**
 * Rows already on another account whose comments name an unclassified account.
 * They are linked for review only: they stay on their original account and in
 * their original totals.
 */
export function linkedCommentSummary(
  transactions: readonly TransactionShape[],
  name: string,
  through?: string,
): LinkedCommentSummary {
  const summary: LinkedCommentSummary = { rows: 0, expensePence: 0, incomePence: 0, lastDate: '' };
  for (const transaction of transactions) {
    if (through && transaction.date > through) continue;
    if (transaction.account === name || !commentsMention(transaction.comments, name)) continue;
    summary.rows += 1;
    if (transaction.type === 'Expense') summary.expensePence += transaction.amountPence;
    else summary.incomePence += transaction.amountPence;
    if (transaction.date > summary.lastDate) summary.lastDate = transaction.date;
  }
  return summary;
}

export interface UnclassifiedAccount {
  name: string;
  rows: number;
  expensePence: number;
  lastDate: string;
}

/**
 * Unknown accounts that still need a decision. An unknown account with
 * comment-linked rows is a linked ledger (reviewed for now), so it does not
 * keep appearing in the review queue; the direct rows stay excluded from totals.
 */
export function accountsNeedingReview(
  transactions: readonly TransactionShape[],
  directory: AccountDirectory,
  through?: string,
): UnclassifiedAccount[] {
  return unknownAccounts(transactions, directory, through).filter(
    (account) => linkedCommentSummary(transactions, account.name, through).rows === 0,
  );
}

/**
 * Summarise rows whose account matches no ledger. They remain visible and are
 * deliberately excluded from totals until the owner maps them to a known name.
 */
export function unknownAccounts(
  transactions: readonly TransactionShape[],
  directory: AccountDirectory,
  through?: string,
): UnclassifiedAccount[] {
  const kindOf = accountClassifier(directory);
  const found = new Map<string, UnclassifiedAccount>();

  for (const transaction of transactions) {
    if (through && transaction.date > through) continue;
    if (kindOf(transaction.account) !== 'unknown') continue;
    const summary = found.get(transaction.account) ?? {
      name: transaction.account,
      rows: 0,
      expensePence: 0,
      lastDate: '',
    };
    summary.rows += 1;
    if (transaction.type === 'Expense') summary.expensePence += transaction.amountPence;
    if (transaction.date > summary.lastDate) summary.lastDate = transaction.date;
    found.set(transaction.account, summary);
  }

  return Array.from(found.values()).sort(
    (a, b) => b.expensePence - a.expensePence || a.name.localeCompare(b.name),
  );
}
