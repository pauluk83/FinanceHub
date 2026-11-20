import { test, expect, type Page } from '@playwright/test';

/**
 * Every main view must fit the screen it is opened on.
 *
 * The shells change at 720px (bottom tabs) and 880px (icon-only sidebar), and the
 * cards reflow with `auto-fit`, so a stray fixed width only shows up at one width.
 * These checks walk the whole navigation at a small phone, a large phone and a
 * tablet, and fail on any document-level sideways scroll. Inner scrollers such as
 * a `.table-wrap` are deliberate and do not count, because they never widen the
 * document.
 */
const VIEWS = [
  'Dashboard', 'Monthly', 'Month end', 'Net worth', 'Calendar', 'Forecast', 'Progress',
  'Reports', 'Transactions', 'Income', 'Accounts', 'Cards', 'People', 'Bills', 'Debts',
  'Savings', 'Holidays', 'Statements', 'Evidence packs', 'Import', 'Import rules',
  'Notifications', 'Data health', 'Settings', 'Application changelog', 'Budget changelog',
  'Guides',
];

const WIDTHS = [320, 430, 768];

/** Opens a section through the command palette, which works in both shells. */
async function openView(page: Page, label: string) {
  await page.keyboard.press('Control+k');
  const input = page.locator('.palette-input');
  await expect(input).toBeVisible();
  await input.fill(label);
  const first = page.locator('.palette-item').first();
  await expect(first).toContainText(label);
  await first.click();
  await expect(page.locator('.view-title')).toHaveText(label);
  await expect(page.locator('.view > *').first()).toBeVisible();
}

for (const width of WIDTHS) {
  test(`no main view scrolls sideways at ${width}px`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Take a look around' }).click();
    await expect(page.getByText('Demo workspace.')).toBeVisible();

    const overflowed: string[] = [];
    for (const label of VIEWS) {
      await openView(page, label);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      if (overflow > 0) overflowed.push(`${label} (+${overflow}px)`);
    }

    expect(overflowed, `views wider than the ${width}px viewport`).toEqual([]);
  });
}
