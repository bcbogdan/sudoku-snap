import { test, expect, type Page } from '@playwright/test';
import { designURL, screenIds, seedDesignScreens } from './design-screen-fixtures';

async function fitsContent(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const status = page.locator('.kit-game-toolbar__status');
  if (await status.count()) {
    const outer = (await status.boundingBox())!;
    for (const selector of ['.kit-attempt-timer', '.kit-game-toolbar__feedback']) {
      const box = (await status.locator(selector).boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(outer.x - 1);
      expect(box.x + box.width).toBeLessThanOrEqual(outer.x + outer.width + 1);
    }
  }
}

test('review and collection pluralize zero, one and two clues; rejection stays actionable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/?new');
  await page.getByRole('button', { name: 'Enter clues by hand' }).click();
  const toolbar = page.locator('.review-toolbar');
  await expect(toolbar).toContainText('0 clues ·');
  await page.locator('#cell-0').click();
  await page.keyboard.press('1');
  await expect(toolbar).toContainText('1 clue ·');
  await page.screenshot({
    path: '/tmp/opencode/sudoku-ui-polish/one-clue-review.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Confirm clues & play' }).click();
  const error = page.locator('.board-save-error');
  await expect(error).toBeFocused();
  await expect(error).toBeInViewport({ ratio: 1 });
  await expect(error).toContainText('17');
  await page.goto('/');
  await expect(page.locator('.kit-puzzle-card__meta')).toContainText('1 clue');
  await expect(page.locator('.kit-puzzle-card__meta')).not.toContainText('1 clues');
  await page.locator('.kit-puzzle-card').click();
  await page.locator('#cell-1').click();
  await page.keyboard.press('2');
  await expect(toolbar).toContainText('2 clues ·');
});

for (const width of [320, 360, 390, 1280]) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`worst realistic data fits ${width}px ${colorScheme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await seedDesignScreens(page, 'worst-case');
      for (const [name, url] of [
        ['library', '/'],
        ['detail', designURL(screenIds.mixed)],
        ['no-attempts', designURL(screenIds.ready)],
        ['play', designURL(screenIds.mixed, screenIds.active)],
        ['review', designURL(screenIds.draft)],
      ] as const) {
        await page.goto(url);
        await expect(page.locator('h1')).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        if (name === 'play') {
          await expect(page.locator('.kit-attempt-timer')).toContainText('1284:');
          await page.locator('#cell-0').click();
          await page.keyboard.press('1');
          await expect(page.locator('.kit-mistake-counter')).toContainText('1');
        }
        if (name === 'review')
          await expect(page.locator('.review-toolbar')).toContainText('1 cell needs review.');
        await fitsContent(page);
        await page.screenshot({
          path: `/tmp/opencode/sudoku-ui-polish/after-${width}-${colorScheme}-${name}.png`,
          fullPage: true,
        });
        if (name === 'play') {
          await page.getByRole('button', { name: 'Move history', exact: true }).click();
          await expect(page.getByRole('slider')).toBeVisible();
          await fitsContent(page);
          await page.getByRole('button', { name: 'Return to play' }).click();
        }
      }
    });
  }
}
