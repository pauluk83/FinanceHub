/** A reviewed import row before it becomes a transaction. */
export type StageRow = {
  id: string;
  date: string;
  description: string;
  amountPence: number;
  type: 'Income' | 'Expense';
  duplicateWith: 'existing' | 'staged' | null;
  outOfWindow: boolean;
  add: boolean;
  /** Descriptive fields only; a rule can never change a money total. */
  category?: string;
  tags?: string[];
  targetAccount?: string;
  ruleId?: string;
  ruleLabel?: string;
};

/** What a CSV, a mapped profile or a bank feed hands to the review grid. */
export type StageCandidate = Omit<StageRow, 'duplicateWith' | 'add'>;
