import { test, expect } from '@playwright/test';

test('editable names persist and mobile layouts follow live system theme changes', async ({
  page,
}) => {
  await page.goto('/?new');
  await page.getByRole('button', { name: 'Enter clues by hand' }).click();
  await expect(page.getByRole('button', { name: 'Rename puzzle' })).toBeVisible();
  const draftURL = page.url();
  const original = await page.getByRole('heading', { level: 1 }).textContent();
  await page.getByRole('button', { name: 'Rename puzzle' }).click();
  await page.getByLabel('Puzzle name', { exact: true }).fill('Discarded name');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(original!);
  await page.getByRole('button', { name: 'Rename puzzle' }).click();
  await page.getByLabel('Puzzle name', { exact: true }).fill('WeekendPuzzle'.repeat(6));
  await page.getByRole('button', { name: 'Save name', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('WeekendPuzzle'.repeat(6));
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('WeekendPuzzle'.repeat(6));
  for (const width of [320, 360, 390, 430, 768]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    if (width <= 600) {
      const targets = await page.locator('.keypad button').evaluateAll((buttons) =>
        buttons.map((b) => ({
          w: b.getBoundingClientRect().width,
          h: b.getBoundingClientRect().height,
        })),
      );
      expect(targets.every((t) => t.w >= 44 && t.h >= 44)).toBe(true);
    }
  }
  await page.setViewportSize({ width: 844, height: 390 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(243, 245, 247)');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(16, 23, 34)');
  await expect(page.locator('#cell-1')).toHaveCSS('background-color', 'rgb(38, 52, 73)');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/mobile-dark.png', fullPage: true });
  await page.goto('/');
  await expect(page.locator('.puzzle-card h2')).toHaveText('WeekendPuzzle'.repeat(6));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.goto('/?new');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(16, 23, 34)');
  await page.goto(draftURL);
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(243, 245, 247)');
});
