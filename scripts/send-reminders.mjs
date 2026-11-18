#!/usr/bin/env node
/**
 * Daily email bill reminders (R6).
 *
 * Usage:
 *   node scripts/send-reminders.mjs --budget <dataset.json> [--dry-run]
 *   node scripts/send-reminders.mjs --unsubscribe you@example.com
 *
 * The budget file is a JSON dataset (the synced `state_json.dataset` or a
 * `data/workbook.json` export). No budget file is ever committed by this
 * script. Without KNOCK_API_KEY the digest is printed and nothing is sent.
 *
 * Provider: Knock workflow `bill-reminder-digest`, which must have an email
 * step connected to your own email provider. The API key stays in the
 * environment or the scheduler, never in the app or repository.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { buildEngine } from '../core/engine.ts';
import { buildReminderDigest, reminderPreferences } from '../core/reminders.ts';

const args = process.argv.slice(2);
const option = (name, fallback = '') => {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  return args[index + 1] ?? fallback;
};
const has = (name) => args.includes(name);

const budgetPath = resolve(option('--budget', process.env.FINANCEHUB_BUDGET ?? ''));
const suppressionPath = resolve(
  process.env.FINANCEHUB_REMINDER_SUPPRESSIONS ?? 'data/reminder-suppressions.json',
);
const dryRun = has('--dry-run') || !process.env.KNOCK_API_KEY;
const unsubscribe = option('--unsubscribe', '');
const today = option('--today', new Date().toISOString().slice(0, 10));

function readSuppressions() {
  try {
    const parsed = JSON.parse(readFileSync(suppressionPath, 'utf8'));
    return Array.isArray(parsed) ? parsed.map((value) => String(value).toLowerCase()) : [];
  } catch {
    return [];
  }
}

function addSuppression(email) {
  const wanted = String(email).trim().toLowerCase();
  if (!wanted) throw new Error('Give an email address to unsubscribe');
  const current = new Set(readSuppressions());
  current.add(wanted);
  mkdirSync(dirname(suppressionPath), { recursive: true });
  writeFileSync(suppressionPath, `${JSON.stringify([...current].sort(), null, 2)}\n`);
  console.log(`Suppressed ${wanted}. No further digests will be sent to that address.`);
}

function loadDataset(path) {
  if (!path) throw new Error('Pass --budget <path> or set FINANCEHUB_BUDGET');
  if (!existsSync(path)) throw new Error(`Budget file not found: ${path}`);
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  const dataset = parsed?.dataset ?? parsed;
  if (!dataset || typeof dataset !== 'object' || !Array.isArray(dataset.transactions)) {
    throw new Error('That file is not a FinanceHub dataset or saved state');
  }
  return dataset;
}

async function send(digest) {
  const workflow = process.env.KNOCK_WORKFLOW_KEY || 'bill-reminder-digest';
  const response = await fetch(`https://api.knock.app/v1/workflows/${encodeURIComponent(workflow)}/trigger`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.KNOCK_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      recipients: [digest.recipient],
      data: {
        subject: digest.subject,
        text: digest.text,
        html: digest.html,
        reminders: digest.items.map((item) => ({
          id: item.id,
          kind: item.kind,
          title: item.title,
          detail: item.detail,
          date: item.date,
        })),
      },
    }),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Knock returned ${response.status}: ${body.slice(0, 300)}`);
  return body;
}

try {
  if (unsubscribe) {
    addSuppression(unsubscribe);
    process.exit(0);
  }

  const dataset = loadDataset(budgetPath);
  const prefs = reminderPreferences(dataset);
  const engine = buildEngine(dataset, { today });
  const digest = buildReminderDigest(dataset, engine, { today });

  if (!prefs.enabled) {
    console.log('Email reminders are turned off in Settings → Notifications. Nothing was sent.');
    process.exit(0);
  }
  if (!prefs.email) {
    console.log('No reminder email address is set. Nothing was sent.');
    process.exit(0);
  }
  if (readSuppressions().includes(prefs.email.toLowerCase())) {
    console.log(`${prefs.email} is suppressed. Nothing was sent.`);
    process.exit(0);
  }

  if (dryRun) {
    console.log('DRY RUN — no email sent.');
    console.log(`To: ${digest.recipient}`);
    console.log(`Subject: ${digest.subject}`);
    console.log('');
    console.log(digest.text);
    console.log('');
    console.log('Set KNOCK_API_KEY (and a configured Knock email workflow) to deliver this digest.');
    process.exit(0);
  }

  await send(digest);
  console.log(`Sent ${digest.items.length} reminder${digest.items.length === 1 ? '' : 's'} to ${digest.recipient}.`);
} catch (error) {
  console.error(`Reminder run failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
