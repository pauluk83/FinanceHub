/**
 * Transfers between the user's own bank accounts.
 *
 * A transfer is recorded as two rows sharing a date and amount: an Expense on
 * the account the money leaves and an Income on the account it arrives in. Both
 * carry the `Transfer` budget treatment so the monthly income and expense
 * figures ignore them, while the account balances still move.
 */
export type TransferInput = {
  date: string;
  from: string;
  to: string;
  amountPence: number;
  comments?: string;
  /** Row number for the outgoing leg; the incoming leg takes the next number. */
  firstRow: number;
};

export type TransferLeg = {
  row: number;
  date: string;
  account: string;
  type: 'Income' | 'Expense';
  amountPence: number;
  comments: string;
  status: string;
  budgetTreatment: 'Transfer';
  category?: string;
  tags?: string[];
};

export type TransferCandidate = {
  row: number;
  date: string;
  account: string;
  type: string;
  amountPence: number;
  budgetTreatment?: string;
};

/**
 * The opposite leg of the same transfer: same date and amount, opposite type,
 * different account, both marked Transfer. Undefined for ordinary rows.
 */
export function findTransferPartner<T extends TransferCandidate>(transactions: T[], leg: T): T | undefined {
  if (leg.budgetTreatment !== 'Transfer') return undefined;
  return transactions.find((other) =>
    other.row !== leg.row &&
    other.budgetTreatment === 'Transfer' &&
    other.date === leg.date &&
    other.amountPence === leg.amountPence &&
    other.type !== leg.type &&
    other.account !== leg.account,
  );
}

export function buildTransferLegs(input: TransferInput): TransferLeg[] {
  const amountPence = Math.abs(Math.round(input.amountPence));
  const note = (input.comments ?? '').trim();
  return [
    {
      row: input.firstRow,
      date: input.date,
      account: input.from,
      type: 'Expense',
      amountPence,
      comments: note || `Transfer to ${input.to}`,
      status: '',
      budgetTreatment: 'Transfer',
    },
    {
      row: input.firstRow + 1,
      date: input.date,
      account: input.to,
      type: 'Income',
      amountPence,
      comments: note || `Transfer from ${input.from}`,
      status: '',
      budgetTreatment: 'Transfer',
    },
  ];
}
