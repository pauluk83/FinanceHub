import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addPortalFeedback,
  createPersonPortal,
  deletePortalFeedback,
  markAllFeedbackRead,
  normalisePortalUsername,
  PORTAL_FEEDBACK_MAX,
  portalFeedbackProblem,
  portalPasswordProblem,
  portalStatementFromDataset,
  portalUsernameProblem,
  readFeedbackForOwner,
  unreadFeedbackForOwner,
} from '../app/src/portal.ts';
import type { Dataset } from '../core/engine.ts';

function dataset(): Dataset {
  return {
    settings: { targetYear: 2026, asOfDate: '2026-11-07', lockCutoff: '2026-11-01', currency: '£' },
    people: [
      { shortName: 'Alex', fullName: 'Alex Morgan', openingPence: 1_000, sortOrder: 1, active: true },
      { shortName: 'Sam', fullName: 'Sam Taylor', openingPence: 500, sortOrder: 2, active: true },
    ],
    transactions: [
      { row: 1, date: '2026-03-14', account: 'Alex', type: 'Expense', amountPence: 2_000, comments: 'Car repair' },
      { row: 2, date: '2026-06-12', account: 'Alex', type: 'Income', amountPence: 500, comments: 'Repayment' },
      { row: 3, date: '2026-09-09', account: 'Sam', type: 'Expense', amountPence: 2_500, comments: 'Tickets' },
      { row: 4, date: '2026-12-01', account: 'Alex', type: 'Expense', amountPence: 9_000, comments: 'After as-of' },
      { row: 5, date: '2025-12-01', account: 'Alex', type: 'Expense', amountPence: 8_000, comments: 'Last year' },
    ],
  } as unknown as Dataset;
}

test('a portal statement contains only one person, this year, up to the as-of date', () => {
  const statement = portalStatementFromDataset(dataset(), 'Alex');
  assert.ok(statement);
  assert.equal(statement.person, 'Alex');
  assert.equal(statement.fullName, 'Alex Morgan');
  assert.equal(statement.year, 2026);
  assert.equal(statement.asOfDate, '2026-11-07');
  assert.deepEqual(statement.lines.map((line) => line.comments), ['Car repair', 'Repayment']);
  assert.ok(statement.lines.every((line) => !line.comments.includes('Tickets')));
});

test('a portal statement runs the balance as opening + borrowed - repaid', () => {
  const statement = portalStatementFromDataset(dataset(), 'Alex');
  assert.ok(statement);
  assert.equal(statement.openingPence, 1_000);
  assert.equal(statement.totalLentPence, 2_000);
  assert.equal(statement.totalRepaidPence, 500);
  assert.equal(statement.lines[0].runningPence, 3_000);
  assert.equal(statement.lines[1].runningPence, 2_500);
  assert.equal(statement.closingPence, 2_500);
});

test('a missing person produces no statement', () => {
  assert.equal(portalStatementFromDataset(dataset(), 'Nobody'), null);
});

test('usernames normalise and reject unsafe shapes', () => {
  assert.equal(normalisePortalUsername('  Alex@Example.com '), 'alex@example.com');
  assert.equal(portalUsernameProblem('alex@example.com'), null);
  assert.equal(portalUsernameProblem('user_1234'), null);
  assert.equal(portalUsernameProblem('ab'), 'Use at least 3 characters for the username.');
  assert.match(portalUsernameProblem('alex morgan') ?? '', /spaces/i);
  assert.match(portalUsernameProblem('alex<script>') ?? '', /letters, numbers/i);
  assert.match(portalUsernameProblem('-alex') ?? '', /letters, numbers/i);
});

test('passwords need eight characters and cannot match the username', () => {
  assert.equal(portalPasswordProblem('correct horse'), null);
  assert.match(portalPasswordProblem('short') ?? '', /8 characters/i);
  assert.match(portalPasswordProblem('AlexMorgan', 'AlexMorgan') ?? '', /different from the username/i);
});

test('feedback is validated and kept per owner on this device', () => {
  assert.match(portalFeedbackProblem(' ') ?? '', /3 characters/i);
  assert.match(portalFeedbackProblem('x'.repeat(PORTAL_FEEDBACK_MAX + 1)) ?? '', /characters or fewer/i);
  assert.equal(portalFeedbackProblem('A useful suggestion'), null);

  const data = new Map<string, string>();
  const localStorage = {
    get length() { return data.size; },
    clear() { data.clear(); },
    getItem(key: string) { return data.get(key) ?? null; },
    key(index: number) { return [...data.keys()][index] ?? null; },
    removeItem(key: string) { data.delete(key); },
    setItem(key: string, value: string) { data.set(key, value); },
  } as Storage;
  const globals = globalThis as unknown as { window?: unknown };
  const previous = globals.window;
  globals.window = { localStorage };
  try {
    const item = addPortalFeedback({ ownerId: 'owner-1', person: 'Alex', message: '  Please add a monthly summary.  ' });
    assert.equal(item.message, 'Please add a monthly summary.');
    assert.equal(item.source, 'statement');
    assert.equal(readFeedbackForOwner('owner-1').length, 1);
    assert.equal(unreadFeedbackForOwner('owner-1').length, 1);
    assert.equal(markAllFeedbackRead('owner-1'), 1);
    assert.equal(unreadFeedbackForOwner('owner-1').length, 0);
    assert.ok(readFeedbackForOwner('owner-1')[0].readAt);
    assert.equal(readFeedbackForOwner('owner-2').length, 0);
    deletePortalFeedback('owner-1', item.id);
    assert.equal(readFeedbackForOwner('owner-1').length, 0);
  } finally {
    if (previous === undefined) Reflect.deleteProperty(globalThis, 'window');
    else globals.window = previous;
  }
});

test('a created portal stores a hash and the scoped statement, never the password', async () => {
  const statement = portalStatementFromDataset(dataset(), 'Alex');
  assert.ok(statement);
  const portal = await createPersonPortal({
    ownerId: 'owner-1',
    person: 'Alex',
    username: 'Alex@Example.com',
    password: 'a-long-password',
    statement,
  });

  assert.equal(portal.ownerId, 'owner-1');
  assert.equal(portal.person, 'Alex');
  assert.equal(portal.username, 'Alex@Example.com');
  assert.equal(portal.usernameKey, 'alex@example.com');
  assert.ok(portal.iterations >= 600_000);
  assert.ok(portal.salt.length > 0);
  assert.ok(portal.hash.length > 0);
  assert.ok(!JSON.stringify(portal).includes('a-long-password'));
  assert.equal(portal.statement.person, 'Alex');
  assert.equal(portal.statement.lines.length, 2);
  assert.equal(portal.statement.lines.some((line) => line.comments === 'Tickets'), false);
});
