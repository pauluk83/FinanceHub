import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Take a look around' }).click();
  await expect(page.getByText('Demo workspace.')).toBeVisible();
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
  await page.getByRole('button', { name: 'Save' }).click();

  let row = page.getByRole('row').filter({ hasText: 'E2E lunch' });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Edit' }).click();
  await page.locator('input[placeholder="0.00"]').fill('99.99');
  await page.getByRole('button', { name: 'Save' }).click();
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

test('a bank CSV is staged and only added after confirmation', async ({ page }) => {
  await page.getByRole('button', { name: /Import/ }).click();
  await page.locator('input[type="file"]').setInputFiles('tests/e2e/fixtures/bank.csv');

  await expect(page.getByText('E2E CSV import')).toBeVisible();
  await expect(page.locator('span.badge.green').filter({ hasText: 'Ready' })).toBeVisible();
  await page.getByRole('button', { name: 'Add 1 to log' }).click();
  await expect(page.getByText('1 transactions appended — nothing was auto-posted')).toBeVisible();
});

test('month end can be locked and unlocked', async ({ page }) => {
  page.on('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: /Settings/ }).click();
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
  const section = page.locator('section').filter({ hasText: 'Encrypted backups & restore points' });
  await section.getByLabel(/Backup passphrase/).fill('playwright-test-passphrase');
  await section.getByLabel(/Restore point label/).fill('E2E restore');
  await section.getByRole('button', { name: 'Save restore point' }).click();

  await expect(section.getByRole('row').filter({ hasText: 'E2E restore' })).toBeVisible({ timeout: 15_000 });
  await section.getByLabel(/Backup passphrase/).fill('playwright-test-passphrase');
  await section.getByRole('button', { name: 'Restore', exact: true }).click();
  await expect(page.getByText(/Restored \d+ transactions/)).toBeVisible({ timeout: 15_000 });
});
