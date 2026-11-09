import type { Dataset } from '../../core/engine';

export const PEOPLE_PORTAL_KEY_PREFIX = 'financehub.people-portal.v1:';
export const PEOPLE_FEEDBACK_KEY_PREFIX = 'financehub.people-feedback.v1:';
export const PORTAL_FEEDBACK_EVENT = 'financehub:feedback-changed';
export const PORTAL_MIN_PASSWORD = 8;
export const PORTAL_ITERATIONS = 600_000;
export const PORTAL_FEEDBACK_MAX = 2000;

export interface PortalLine {
  row: number;
  date: string;
  comments: string;
  type: 'Income' | 'Expense';
  amountPence: number;
  runningPence: number;
}

export interface PortalStatement {
  person: string;
  fullName: string;
  year: number;
  asOfDate: string;
  openingPence: number;
  totalRepaidPence: number;
  totalLentPence: number;
  closingPence: number;
  lines: PortalLine[];
  updatedAt: string;
}

export interface PersonPortal {
  version: 1;
  id: string;
  ownerId: string;
  person: string;
  username: string;
  usernameKey: string;
  salt: string;
  iterations: number;
  hash: string;
  statement: PortalStatement;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePortalInput {
  ownerId: string;
  person: string;
  username: string;
  password: string;
  statement: PortalStatement;
}

export interface PortalFeedback {
  version: 1;
  id: string;
  ownerId: string;
  person: string;
  message: string;
  createdAt: string;
  source?: 'statement' | 'app';
  readAt?: string;
}

export interface CreatePortalFeedbackInput {
  ownerId: string;
  person: string;
  message: string;
  source?: 'statement' | 'app';
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bufferSource(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function portalCrypto(): SubtleCrypto {
  if (!globalThis.crypto?.subtle) throw new Error('This browser cannot create a people sign-in.');
  return globalThis.crypto.subtle;
}

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function ownerKey(ownerId: string): string {
  return `${PEOPLE_PORTAL_KEY_PREFIX}${ownerId}`;
}

function feedbackKey(ownerId: string): string {
  return `${PEOPLE_FEEDBACK_KEY_PREFIX}${ownerId}`;
}

function emitFeedbackChanged(): void {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  try {
    window.dispatchEvent(new Event(PORTAL_FEEDBACK_EVENT));
  } catch {
    /* the dashboard will refresh on its next focus */
  }
}

export function normalisePortalUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function portalUsernameProblem(username: string): string | null {
  const value = username.trim();
  if (value.length < 3) return 'Use at least 3 characters for the username.';
  if (value.length > 80) return 'Keep the username to 80 characters or fewer.';
  if (/\s/.test(value)) return 'Usernames cannot contain spaces.';
  if (!/^[A-Za-z0-9][A-Za-z0-9._@+-]*$/.test(value)) {
    return 'Use letters, numbers or . _ @ + - only.';
  }
  return null;
}

export function portalPasswordProblem(password: string, username = ''): string | null {
  if (password.length < PORTAL_MIN_PASSWORD) return `Use at least ${PORTAL_MIN_PASSWORD} characters for the password.`;
  if (password.length > 200) return 'Keep the password to 200 characters or fewer.';
  if (username.trim() && password.toLowerCase() === username.trim().toLowerCase()) {
    return 'The password must be different from the username.';
  }
  return null;
}

export function portalFeedbackProblem(message: string): string | null {
  const value = message.trim();
  if (value.length < 3) return 'Write at least 3 characters.';
  if (value.length > PORTAL_FEEDBACK_MAX) return `Keep feedback to ${PORTAL_FEEDBACK_MAX} characters or fewer.`;
  return null;
}

/** Build the smallest statement snapshot needed by one person. */
export function portalStatementFromDataset(ds: Dataset, personName: string): PortalStatement | null {
  const person = ds.people.find((entry) => entry.shortName === personName);
  if (!person) return null;

  const asOfDate = ds.settings.asOfDate;
  const year = ds.settings.targetYear;
  const transactions = ds.transactions
    .filter((tx) => tx.account === person.shortName)
    .filter((tx) => tx.date <= asOfDate && tx.date.slice(0, 4) === String(year))
    .sort((a, b) => a.date.localeCompare(b.date) || a.row - b.row);

  let running = person.openingPence;
  const lines: PortalLine[] = transactions.map((tx) => {
    const type = tx.type === 'Income' ? 'Income' : 'Expense';
    running += type === 'Income' ? -tx.amountPence : tx.amountPence;
    return {
      row: tx.row,
      date: tx.date,
      comments: tx.comments || '',
      type,
      amountPence: tx.amountPence,
      runningPence: running,
    };
  });

  return {
    person: person.shortName,
    fullName: person.fullName || person.shortName,
    year,
    asOfDate,
    openingPence: person.openingPence,
    totalRepaidPence: lines.filter((line) => line.type === 'Income').reduce((sum, line) => sum + line.amountPence, 0),
    totalLentPence: lines.filter((line) => line.type === 'Expense').reduce((sum, line) => sum + line.amountPence, 0),
    closingPence: running,
    lines,
    updatedAt: new Date().toISOString(),
  };
}

async function derivePassword(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const subtle = portalCrypto();
  const material = await subtle.importKey(
    'raw',
    bufferSource(new TextEncoder().encode(password)),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await subtle.deriveBits(
    { name: 'PBKDF2', salt: bufferSource(salt), iterations, hash: 'SHA-256' },
    material,
    256,
  );
  return new Uint8Array(bits);
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) difference |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return difference === 0;
}

export async function createPersonPortal(input: CreatePortalInput): Promise<PersonPortal> {
  const usernameProblem = portalUsernameProblem(input.username);
  if (usernameProblem) throw new Error(usernameProblem);
  const passwordProblem = portalPasswordProblem(input.password, input.username);
  if (passwordProblem) throw new Error(passwordProblem);

  const username = input.username.trim();
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePassword(input.password, salt, PORTAL_ITERATIONS);
  const now = new Date().toISOString();
  return {
    version: 1,
    id: `portal_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    ownerId: input.ownerId,
    person: input.person,
    username,
    usernameKey: normalisePortalUsername(username),
    salt: bytesToBase64(salt),
    iterations: PORTAL_ITERATIONS,
    hash: bytesToBase64(hash),
    statement: input.statement,
    createdAt: now,
    updatedAt: now,
  };
}

function isPortal(value: unknown): value is PersonPortal {
  if (!value || typeof value !== 'object') return false;
  const portal = value as Partial<PersonPortal>;
  return portal.version === 1
    && typeof portal.id === 'string'
    && typeof portal.ownerId === 'string'
    && typeof portal.person === 'string'
    && typeof portal.username === 'string'
    && typeof portal.usernameKey === 'string'
    && typeof portal.salt === 'string'
    && typeof portal.iterations === 'number'
    && typeof portal.hash === 'string'
    && Boolean(portal.statement)
    && Array.isArray(portal.statement?.lines);
}

function decodePortalList(raw: string | null): PersonPortal[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isPortal);
  } catch {
    return [];
  }
}

export function readPortalsForOwner(ownerId: string): PersonPortal[] {
  const store = storage();
  if (!store) return [];
  try {
    return decodePortalList(store.getItem(ownerKey(ownerId)));
  } catch {
    return [];
  }
}

export function readAllPortals(): PersonPortal[] {
  const store = storage();
  if (!store) return [];
  const portals: PersonPortal[] = [];
  try {
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (!key?.startsWith(PEOPLE_PORTAL_KEY_PREFIX)) continue;
      portals.push(...decodePortalList(store.getItem(key)));
    }
  } catch {
    return [];
  }
  return portals;
}

export function savePortalsForOwner(ownerId: string, portals: PersonPortal[]): void {
  const store = storage();
  if (!store) throw new Error('People sign-ins need browser storage on this device.');
  const key = ownerKey(ownerId);
  if (portals.length === 0) {
    store.removeItem(key);
    return;
  }
  store.setItem(key, JSON.stringify(portals));
}

function isFeedback(value: unknown): value is PortalFeedback {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<PortalFeedback>;
  return item.version === 1
    && typeof item.id === 'string'
    && typeof item.ownerId === 'string'
    && typeof item.person === 'string'
    && typeof item.message === 'string'
    && typeof item.createdAt === 'string';
}

function decodeFeedbackList(raw: string | null): PortalFeedback[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isFeedback);
  } catch {
    return [];
  }
}

export function readFeedbackForOwner(ownerId: string): PortalFeedback[] {
  const store = storage();
  if (!store) return [];
  try {
    return decodeFeedbackList(store.getItem(feedbackKey(ownerId)));
  } catch {
    return [];
  }
}

export function saveFeedbackForOwner(ownerId: string, items: PortalFeedback[]): void {
  const store = storage();
  if (!store) throw new Error('Feedback needs browser storage on this device.');
  const key = feedbackKey(ownerId);
  if (items.length === 0) {
    store.removeItem(key);
    return;
  }
  store.setItem(key, JSON.stringify(items));
}

export function addPortalFeedback(input: CreatePortalFeedbackInput): PortalFeedback {
  const problem = portalFeedbackProblem(input.message);
  if (problem) throw new Error(problem);
  const item: PortalFeedback = {
    version: 1,
    id: `feedback_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    ownerId: input.ownerId,
    person: input.person,
    message: input.message.trim(),
    createdAt: new Date().toISOString(),
    source: input.source ?? 'statement',
  };
  saveFeedbackForOwner(input.ownerId, [item, ...readFeedbackForOwner(input.ownerId)].slice(0, 100));
  emitFeedbackChanged();
  return item;
}

export function deletePortalFeedback(ownerId: string, id: string): void {
  saveFeedbackForOwner(ownerId, readFeedbackForOwner(ownerId).filter((item) => item.id !== id));
  emitFeedbackChanged();
}

export function markFeedbackRead(ownerId: string, id: string): void {
  const at = new Date().toISOString();
  let changed = false;
  const next = readFeedbackForOwner(ownerId).map((item) => {
    if (item.id !== id || item.readAt) return item;
    changed = true;
    return { ...item, readAt: at };
  });
  if (!changed) return;
  saveFeedbackForOwner(ownerId, next);
  emitFeedbackChanged();
}

export function markAllFeedbackRead(ownerId: string): number {
  const at = new Date().toISOString();
  let changed = 0;
  const next = readFeedbackForOwner(ownerId).map((item) => {
    if (item.readAt) return item;
    changed += 1;
    return { ...item, readAt: at };
  });
  if (changed === 0) return 0;
  saveFeedbackForOwner(ownerId, next);
  emitFeedbackChanged();
  return changed;
}

export function unreadFeedbackForOwner(ownerId: string): PortalFeedback[] {
  return readFeedbackForOwner(ownerId).filter((item) => !item.readAt);
}

export function portalUsernameTaken(username: string, exceptId?: string): boolean {
  const key = normalisePortalUsername(username);
  return readAllPortals().some((portal) => portal.usernameKey === key && portal.id !== exceptId);
}

export async function authenticatePersonPortal(username: string, password: string): Promise<PersonPortal | null> {
  const usernameKey = normalisePortalUsername(username);
  if (!usernameKey || !password) return null;
  const portal = readAllPortals().find((entry) => entry.usernameKey === usernameKey);
  if (!portal) return null;
  try {
    const actual = await derivePassword(password, base64ToBytes(portal.salt), portal.iterations);
    return equalBytes(actual, base64ToBytes(portal.hash)) ? portal : null;
  } catch {
    return null;
  }
}

/** Update every portal snapshot for this owner after a budget save. */
export function refreshPortalStatements(ownerId: string, ds: Dataset): boolean {
  const portals = readPortalsForOwner(ownerId);
  if (portals.length === 0) return false;
  let changed = false;
  const now = new Date().toISOString();
  const next = portals.map((portal) => {
    const statement = portalStatementFromDataset(ds, portal.person);
    if (!statement) return portal;
    const before = JSON.stringify({ ...portal.statement, updatedAt: '' });
    const after = JSON.stringify({ ...statement, updatedAt: '' });
    if (before === after) return portal;
    changed = true;
    return { ...portal, statement, updatedAt: now };
  });
  if (changed) {
    try {
      savePortalsForOwner(ownerId, next);
    } catch {
      return false;
    }
  }
  return changed;
}

export function renamePortalPerson(ownerId: string, oldName: string, newName: string): void {
  const portals = readPortalsForOwner(ownerId);
  let changed = false;
  const next = portals.map((portal) => {
    if (portal.person !== oldName) return portal;
    changed = true;
    return {
      ...portal,
      person: newName,
      statement: { ...portal.statement, person: newName },
      updatedAt: new Date().toISOString(),
    };
  });
  if (changed) savePortalsForOwner(ownerId, next);
}

export function deletePortalsForPerson(ownerId: string, person: string): void {
  const portals = readPortalsForOwner(ownerId);
  const next = portals.filter((portal) => portal.person !== person);
  if (next.length !== portals.length) savePortalsForOwner(ownerId, next);
}

export function deletePersonPortal(ownerId: string, id: string): void {
  savePortalsForOwner(ownerId, readPortalsForOwner(ownerId).filter((portal) => portal.id !== id));
}
