import type { Dataset, Engine } from '../../core/engine';

/**
 * The AI assistant talks to OpenRouter with the owner's own key. The key is a
 * device setting, never a budget field: it is kept with the rest of the app's
 * local settings (see aiKeyStore.ts), so the chat opens without the credential
 * vault and the key never reaches the document, a backup or sync.
 */
export const AI_DEFAULT_MODEL = 'openrouter/free';
export const AI_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

export interface AiSettings {
  apiKey: string;
  model: string;
}

/** Read the key saved on this device; a missing or damaged record means no key. */
export function parseAiSettings(raw: string | null): AiSettings {
  let stored: Record<string, unknown> = {};
  try {
    const parsed = raw ? JSON.parse(raw) as unknown : null;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) stored = parsed as Record<string, unknown>;
  } catch {
    // An unreadable record behaves like no key so the pane can ask for one again.
  }
  return {
    apiKey: typeof stored.apiKey === 'string' ? stored.apiKey : '',
    model: typeof stored.model === 'string' && stored.model.trim() ? stored.model.trim() : AI_DEFAULT_MODEL,
  };
}

export type AiSettingsRecord =
  | { kind: 'empty' }
  | { kind: 'plain'; settings: AiSettings }
  | { kind: 'sealed'; iv: string; ciphertext: string };

/**
 * A saved record is either the plaintext shape written before the hosted build
 * wrapped keys, or `{ iv, ciphertext }` sealed with the browser's device key.
 * Anything unreadable behaves like no key, so saving can replace it.
 */
export function parseAiSettingsRecord(raw: string | null): AiSettingsRecord {
  if (!raw) return { kind: 'empty' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return { kind: 'empty' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { kind: 'empty' };
  const record = parsed as Record<string, unknown>;
  if (typeof record.iv === 'string' && record.iv && typeof record.ciphertext === 'string' && record.ciphertext) {
    return { kind: 'sealed', iv: record.iv, ciphertext: record.ciphertext };
  }
  const settings = parseAiSettings(raw);
  return settings.apiKey ? { kind: 'plain', settings } : { kind: 'empty' };
}

/** A compact, read-only view of the budget for the model. Money stays in pence. */
export function budgetSnapshot(ds: Dataset, engine: Engine, year: number, month: number) {
  return {
    asOfDate: ds.settings.asOfDate,
    targetYear: ds.settings.targetYear,
    primaryAccount: ds.settings.primaryAccount ?? '',
    accounts: ds.accounts.map((account) => ({
      name: account.name,
      openingPence: account.openingPence,
      targetPence: account.targetPence,
      active: account.active,
    })),
    cards: ds.cards.map((card) => ({ name: card.name, limitPence: card.limitPence, openingPence: card.openingPence })),
    people: ds.people.map((person) => ({ name: person.shortName, openingPence: person.openingPence, active: person.active })),
    bills: ds.bills.map((bill) => ({
      name: bill.name,
      amountPence: bill.amountPence,
      dueDay: bill.dueDay,
      account: bill.account ?? '',
      paymentMethod: bill.paymentMethod,
      linkedSheet: bill.linkedSheet,
      active: bill.active,
    })),
    providers: Object.keys(ds.providers ?? {}),
    monthLocks: Object.keys(ds.monthLocks ?? {}),
    view: engine.dashboard(year, month),
  };
}

export type AiAction =
  | {
    type: 'add_bill';
    name: string;
    amountPence: number;
    dueDay: number;
    account?: string;
    paymentMethod?: string;
  }
  | {
    type: 'update_bill';
    name: string;
    amountPence?: number;
    dueDay?: number;
    account?: string;
    active?: boolean;
  }
  | {
    type: 'add_transaction';
    date: string;
    description: string;
    amountPence: number;
    account: string;
    kind: 'Expense' | 'Income';
    category?: string;
  };

export interface AiReply {
  reply: string;
  actions: AiAction[];
}

function positivePence(value: unknown): number | null {
  const number = typeof value === 'string' ? Number(value) : value;
  if (typeof number !== 'number' || !Number.isFinite(number) || number <= 0) return null;
  return Math.round(number);
}

function dueDay(value: unknown): number | null {
  const number = typeof value === 'string' ? Number(value) : value;
  if (typeof number !== 'number' || !Number.isFinite(number)) return null;
  return Math.min(31, Math.max(1, Math.round(number)));
}

function parseAction(raw: unknown): AiAction | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  const type = String(value.type ?? '');

  if (type === 'add_bill') {
    const amount = positivePence(value.amountPence);
    const day = dueDay(value.dueDay);
    if (!name || amount === null || day === null) return null;
    return {
      type: 'add_bill',
      name,
      amountPence: amount,
      dueDay: day,
      ...(typeof value.account === 'string' && value.account.trim() ? { account: value.account.trim() } : {}),
      ...(typeof value.paymentMethod === 'string' && value.paymentMethod.trim() ? { paymentMethod: value.paymentMethod.trim() } : {}),
    };
  }

  if (type === 'update_bill') {
    if (!name) return null;
    const amount = value.amountPence === undefined ? undefined : positivePence(value.amountPence);
    const day = value.dueDay === undefined ? undefined : dueDay(value.dueDay);
    if (amount === null || day === null) return null;
    const action: AiAction = { type: 'update_bill', name };
    if (amount !== undefined) action.amountPence = amount;
    if (day !== undefined) action.dueDay = day;
    if (typeof value.account === 'string' && value.account.trim()) action.account = value.account.trim();
    if (typeof value.active === 'boolean') action.active = value.active;
    return action.amountPence === undefined && action.dueDay === undefined && !action.account && action.active === undefined
      ? null
      : action;
  }

  if (type === 'add_transaction') {
    const amount = positivePence(value.amountPence);
    const date = typeof value.date === 'string' ? value.date.trim() : '';
    const description = typeof value.description === 'string' ? value.description.trim() : '';
    const account = typeof value.account === 'string' ? value.account.trim() : '';
    const kind = value.kind === 'Income' ? 'Income' : value.kind === 'Expense' ? 'Expense' : null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !description || !account || !kind || amount === null) return null;
    return {
      type: 'add_transaction',
      date,
      description,
      amountPence: amount,
      account,
      kind,
      ...(typeof value.category === 'string' && value.category.trim() ? { category: value.category.trim() } : {}),
    };
  }

  return null;
}

/**
 * Models are asked for `{"reply": "...", "actions": []}`, sometimes inside a
 * code fence. If the body is not usable JSON the whole answer is shown as the
 * reply, so a chat answer never disappears because of formatting.
 */
export function parseAssistantReply(content: string): AiReply {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  const candidate = fenced ?? (start >= 0 && end > start ? trimmed.slice(start, end + 1) : '');

  if (candidate) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      const reply = typeof parsed.reply === 'string' ? parsed.reply.trim() : '';
      const actions = Array.isArray(parsed.actions)
        ? parsed.actions.map(parseAction).filter((action): action is AiAction => action !== null)
        : [];
      if (reply || actions.length) return { reply: reply || 'Here is the change I suggest.', actions };
    } catch {
      // fall through to plain text
    }
  }

  return { reply: trimmed, actions: [] };
}

const SYSTEM_PROMPT = [
  'You are the FinanceHub budget assistant. Answer only from the budget snapshot and the conversation.',
  'Amounts in the snapshot are in pence; show money to the owner in pounds with two decimals.',
  'You may propose changes, but never invent a figure the owner did not give: if an amount, date or account is missing, ask for it.',
  'Reply with JSON only, exactly: {"reply": "text for the owner", "actions": []}.',
  'Allowed actions:',
  '- {"type":"add_bill","name":"...","amountPence":12345,"dueDay":15,"account":"Current","paymentMethod":"Direct Debit"}',
  '- {"type":"update_bill","name":"...","amountPence":12345,"dueDay":15,"account":"Current","active":true} (send only the fields to change)',
  '- {"type":"add_transaction","date":"YYYY-MM-DD","description":"...","amountPence":12345,"account":"Current","kind":"Expense","category":"..."}',
  'Never include an action unless the owner asked for that change. The app shows each action for approval before anything is saved.',
].join('\n');

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AskOptions {
  settings: AiSettings;
  history: ChatMessage[];
  question: string;
  snapshot: unknown;
  referer?: string;
}

export async function askOpenRouter({ settings, history, question, snapshot, referer }: AskOptions): Promise<AiReply> {
  if (!settings.apiKey) throw new Error('Add an OpenRouter API key in Settings → AI first.');
  let response: Response;
  try {
    response = await fetch(AI_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      'Content-Type': 'application/json',
      'X-OpenRouter-Title': 'FinanceHub',
      ...(referer ? { 'HTTP-Referer': referer } : {}),
    },
    body: JSON.stringify({
      model: settings.model || AI_DEFAULT_MODEL,
      temperature: 0.2,
      messages: [
        { role: 'system', content: `${SYSTEM_PROMPT}\n\nBudget snapshot (JSON, money in pence):\n${JSON.stringify(snapshot)}` },
        ...history.slice(-12).map((message) => ({ role: message.role, content: message.content })),
        { role: 'user', content: question },
      ],
    }),
    });
  } catch {
    throw new Error('Could not reach OpenRouter from this app. Check the connection and try again.');
  }

  if (!response.ok) {
    const detail = (await response.text()).replace(/\s+/g, ' ').slice(0, 200);
    throw new Error(`OpenRouter returned ${response.status}${detail ? `: ${detail}` : ''}`);
  }

  const payload = (await response.json()) as { choices?: { message?: { content?: unknown } }[] };
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('OpenRouter returned no message.');
  return parseAssistantReply(content);
}

export function describeAiAction(action: AiAction): string {
  if (action.type === 'add_bill') return `Add bill “${action.name}”`;
  if (action.type === 'update_bill') return `Update bill “${action.name}”`;
  return `Add ${action.kind.toLowerCase()} “${action.description}”`;
}

/**
 * Apply one approved action to the draft dataset. Returns the label that was
 * applied, or null when the action no longer fits the budget (for example a
 * duplicate bill name), so the caller can say so instead of claiming success.
 */
export function applyAiAction(dataset: Dataset, action: AiAction, today: string): string | null {
  if (action.type === 'add_bill') {
    const name = action.name.trim();
    if (!name || dataset.bills.some((bill) => bill.name.toLowerCase() === name.toLowerCase())) return null;
    const day = Math.min(31, Math.max(1, Math.round(action.dueDay)));
    dataset.bills.push({
      name,
      amountPence: action.amountPence,
      baseAmountPence: action.amountPence,
      dueDay: day,
      baseDueDay: day,
      linkedSheet: '',
      account: action.account || dataset.settings.primaryAccount || dataset.accounts[0]?.name || '',
      frequency: 'Monthly',
      latestBalancePence: 0,
      latestPaymentPence: 0,
      sortOrder: dataset.bills.length + 1,
      active: true,
      effectiveFrom: '',
      paymentMethod: action.paymentMethod || 'Direct Debit',
    });
    return `${name} added to Bills`;
  }

  if (action.type === 'update_bill') {
    const bill = dataset.bills.find((candidate) => candidate.name.toLowerCase() === action.name.trim().toLowerCase());
    if (!bill) return null;
    if (action.amountPence !== undefined) {
      bill.amountPence = action.amountPence;
      bill.baseAmountPence = action.amountPence;
    }
    if (action.dueDay !== undefined) {
      bill.dueDay = action.dueDay;
      bill.baseDueDay = action.dueDay;
    }
    if (action.account) bill.account = action.account;
    if (action.active !== undefined) bill.active = action.active;
    return `${bill.name} updated in Bills`;
  }

  const account = dataset.accounts.find((candidate) => candidate.name.toLowerCase() === action.account.toLowerCase())
    ?? dataset.accounts.find((candidate) => candidate.name === action.account);
  const row = Math.max(0, ...dataset.transactions.map((entry) => Number(entry.row) || 0)) + 1;
  dataset.transactions.push({
    row,
    date: action.date || today,
    account: account?.name ?? action.account,
    type: action.kind,
    amountPence: action.amountPence,
    comments: action.description,
    status: '',
    budgetTreatment: action.kind,
    category: action.category ?? '',
    tags: [],
  });
  return `${action.kind} “${action.description}” added to Transactions`;
}
