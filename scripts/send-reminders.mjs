#!/usr/bin/env node
/**
 * Daily email bill reminders (R6) — Resend delivery.
 *
 * Usage:
 *   node scripts/send-reminders.mjs --budget <dataset.json> [--dry-run]
 *   node scripts/send-reminders.mjs --unsubscribe you@example.com
 *
 * The budget file is a JSON dataset (the synced `state_json.dataset` or a
 * `data/workbook.json` export). No budget file is ever committed by this
 * script, and the digest is built by `core/reminders.ts` from the same derived
 * notifications the Notifications screen shows.
 *
 * Environment:
 *   RESEND_API_KEY          Resend key; without it (or RESEND_FROM) this is a dry run.
 *   RESEND_FROM             verified sender, e.g. "FinanceHub <reminders@yourdomain>"
 *   RESEND_UNSUBSCRIBE      address for the List-Unsubscribe header (defaults to RESEND_FROM)
 *   FINANCEHUB_BUDGET       budget JSON path (or --budget)
 *   FINANCEHUB_REMINDER_SUPPRESSIONS  suppression list (default data/reminder-suppressions.json)
 *
 * Provider: Resend (`POST https://api.resend.com/emails`). The same Resend
 * account is used for Supabase Auth SMTP, so auth mail and reminders share one
 * verified sender domain. The key stays in the scheduler's environment, never
 * in the app, a build or the repository.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { buildEngine } from '../core/engine.ts';
import { buildReminderDigest, reminderEmail, reminderPreferences } from '../core/reminders.ts';

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
const apiKey = String(process.env.RESEND_API_KEY ?? '').trim();
const from = String(process.env.RESEND_FROM ?? '').trim();
const dryRun = has('--dry-run') || !apiKey || !from;
const unsubscribe = option('--unsubscribe', '');
const today = option('--today', new Date().toISOString().slice(0, 10));

/** `FinanceHub <reminders@example.com>` → `reminders@example.com`. */
function addressOf(value) {
  const angled = /<([^>]+)>/.exec(value);
  return (angled ? angled[1] : value).trim();
}

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

async function send(message) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(message),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Resend returned ${response.status}: ${body.slice(0, 300)}`);
  let id = '';
  try { id = JSON.parse(body)?.id ?? ''; } catch { /* a 2xx without JSON still counts as sent */ }
  return id;
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

  const message = reminderEmail(digest, {
    from,
    unsubscribeMailto: process.env.RESEND_UNSUBSCRIBE || addressOf(from),
  });

  if (dryRun) {
    console.log('DRY RUN — no email sent.');
    console.log(`From: ${message.from}`);
    console.log(`To: ${message.to}`);
    console.log(`Subject: ${message.subject}`);
    if (message.headers['List-Unsubscribe']) console.log(`List-Unsubscribe: ${message.headers['List-Unsubscribe']}`);
    console.log('');
    console.log(message.text);
    console.log('');
    console.log('Set RESEND_API_KEY and RESEND_FROM (a verified Resend sender) to deliver this digest.');
    process.exit(0);
  }

  const id = await send(message);
  console.log(`Sent ${digest.items.length} reminder${digest.items.length === 1 ? '' : 's'} to ${message.to}${id ? ` (Resend id ${id})` : ''}.`);
} catch (error) {
  console.error(`Reminder run failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
