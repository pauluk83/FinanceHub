import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Take a look around' }).click();
  await expect(page.getByText('Demo workspace.')).toBeVisible();
  // The first-run tour opens once per workspace, so a fresh browser context
  // always shows it; its backdrop would block every click in the demo.
  await page.getByRole('button', { name: 'Skip the tour' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('demo navigation and month switch', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await page.getByRole('button', { name: /Transactions/ }).click();
  await expect(page.getByRole('heading', { name: 'Transactions' })).toBeVisible();

  await page.getByRole('button', { name: /Dashboard/ }).click();
  await page.getByLabel('Viewing month').selectOption('12');
  await expect(page.getByRole('heading', { name: 'December 2026' })).toBeVisible();
});

test('a transaction can be added, edited and deleted', async ({ page }) => {
  page.on('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: /Transactions/ }).click();
  await page.getByRole('button', { name: 'Add transaction' }).click();

  await page.locator('input[type="date"]').fill('2026-11-12');
  await page.locator('input[placeholder="0.00"]').fill('12.34');
  await page.locator('input[placeholder="e.g. Food"]').fill('E2E lunch');
  await page.getByRole('button', { name: /^Save( changes)?$/ }).click();

  let row = page.getByRole('row').filter({ hasText: 'E2E lunch' });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Edit' }).click();
  await page.locator('input[placeholder="0.00"]').fill('99.99');
  await page.getByRole('button', { name: /^Save( changes)?$/ }).click();
  row = page.getByRole('row').filter({ hasText: 'E2E lunch' });
  await expect(row).toContainText('99.99');

  await row.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('E2E lunch')).toHaveCount(0);
});

test('statement totals render for the selected account', async ({ page }) => {
  await page.getByRole('button', { name: /Statements/ }).click();
  await expect(page.getByRole('heading', { name: 'Statements' })).toBeVisible();
  await expect(page.getByText('Opening balance', { exact: true })).toBeVisible();
  await expect(page.getByText('£1,800.00', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Closing balance', { exact: true })).toBeVisible();
  await expect(page.getByText('£12,045.10', { exact: true }).first()).toBeVisible();
});

test('a redacted support bundle downloads', async ({ page }) => {
  await page.getByRole('button', { name: /Data health/ }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download support bundle' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^financehub-support-\d{4}-\d{2}-\d{2}\.json$/);
});

test('an Excel statement downloads', async ({ page }) => {
  await page.getByRole('button', { name: /Statements/ }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Excel' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^statement-.+\.xls$/);
  const file = await download.path();
  expect(file).toBeTruthy();
  const xml = await readFile(file as string, 'utf8');
  expect(xml).toContain('urn:schemas-microsoft-com:office:spreadsheet');
  expect(xml).toContain('Statement');
});

test('a bank CSV is staged and only added after confirmation', async ({ page }) => {
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles('tests/e2e/fixtures/bank.csv');

  await expect(page.getByText('E2E CSV import')).toBeVisible();
  await expect(page.locator('span.badge.green').filter({ hasText: 'Ready' })).toBeVisible();
  await page.getByRole('button', { name: 'Add 1 to log' }).click();
  await expect(page.getByText('1 transactions appended — nothing was auto-posted')).toBeVisible();
});

test('a bill removed from a future year can be kept or deleted from Bills', async ({ page }) => {
  page.on('dialog', (dialog) => dialog.accept());
  await page.getByLabel('Viewing year').selectOption('2027');
  await page.getByRole('button', { name: /^Bills$/ }).click();

  // Removing a bill hides it with the stopped ones, not out of reach.
  await page.getByRole('button', { name: 'Actions for Rent' }).click();
  await page.getByRole('button', { name: 'Remove from 2027' }).click();
  await expect(page.getByRole('button', { name: 'Actions for Rent' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Show stopped and removed bills' }).click();
  await page.getByRole('button', { name: 'Actions for Rent' }).click();
  await page.getByRole('button', { name: 'Keep in 2027' }).click();
  await expect(page.getByRole('button', { name: 'Actions for Rent' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show stopped and removed bills' })).toHaveCount(0);

  // A bill stopped in the live year is deleted here, giving the new year a clean slate.
  await page.getByLabel('Viewing year').selectOption('2026');
  await page.getByRole('button', { name: 'Actions for Energy' }).click();
  await page.getByRole('button', { name: /^Stop from/ }).click();
  await page.getByLabel('Viewing year').selectOption('2027');

  // The stopped bill sits behind the same toggle, where it can be deleted.
  await page.getByRole('button', { name: 'Hide stopped and removed bills' }).click();
  await expect(page.getByRole('button', { name: 'Actions for Energy' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Show stopped and removed bills' }).click();
  await page.getByRole('button', { name: 'Actions for Energy' }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Actions for Energy' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /stopped and removed bills/ })).toHaveCount(0);
});

test('month end can be locked and unlocked', async ({ page }) => {
  page.on('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: /Settings/ }).click();
  await page.locator('.settings-tabs').getByRole('button', { name: 'Budget', exact: true }).click();
  await page.getByLabel(/As-of date/).fill('2026-11-30');

  await page.getByRole('button', { name: /Month end/ }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Lock November 2026' }).click();
  await expect(page.getByRole('button', { name: 'Unlock this month' })).toBeVisible();

  await page.getByRole('button', { name: 'Unlock this month' }).click();
  await expect(page.getByRole('button', { name: 'Unlock this month' })).toHaveCount(0);
});

test('an encrypted restore point can be created and restored', async ({ page }) => {
  page.on('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: /Settings/ }).click();
  await page.locator('.settings-tabs').getByRole('button', { name: 'Data', exact: true }).click();
  const section = page.locator('section').filter({ hasText: 'Encrypted backups & restore points' });
  await section.getByLabel(/Backup passphrase/).fill('playwright-test-passphrase');
  await section.getByLabel(/Restore point label/).fill('E2E restore');
  await section.getByRole('button', { name: 'Save restore point' }).click();

  await expect(section.getByRole('row').filter({ hasText: 'E2E restore' })).toBeVisible({ timeout: 15_000 });
  await section.getByLabel(/Backup passphrase/).fill('playwright-test-passphrase');
  await section.getByRole('button', { name: 'Restore', exact: true }).click();
  await expect(page.getByText(/Restored \d+ transactions/)).toBeVisible({ timeout: 15_000 });
});
