import { test, expect } from '@playwright/test';
import { puzzleShareURL } from '../lib/sharing';
import clues from './fixtures/expected.json';

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
  await expect(page.locator('.kit-puzzle-card h2')).toHaveText('WeekendPuzzle'.repeat(6));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.goto('/?new');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(16, 23, 34)');
  await page.goto(draftURL);
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(243, 245, 247)');
});

test('play controls stay aligned and readable at narrow widths; attempt focus is not clipped', async ({
  page,
}) => {
  await page.goto(puzzleShareURL('http://127.0.0.1:3187', clues, 'Layout checks'));
  await page.getByRole('button', { name: 'Confirm clues & play' }).click();
  await expect(page.getByRole('button', { name: 'Move history', exact: true })).toBeVisible();
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    for (const width of [320, 360, 390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      const board = await page.locator('.board-wrap').boundingBox();
      const toolbar = await page.locator('.play-toolbar').boundingBox();
      if (width < 960) {
        expect(Math.abs(board!.x - toolbar!.x)).toBeLessThan(1);
        expect(Math.abs(board!.width - toolbar!.width)).toBeLessThan(1);
      } else {
        expect(board!.width).toBeLessThanOrEqual(540);
        expect(toolbar!.x).toBeGreaterThanOrEqual(board!.x + board!.width + 24);
        expect(toolbar!.width).toBeGreaterThanOrEqual(300);
      }
      const toggles = await page.locator('.play-toolbar .kit-toggle').evaluateAll((buttons) =>
        buttons.map((button) => {
          const box = button.getBoundingClientRect();
          const label = button.querySelector('.kit-toggle__label')!.getBoundingClientRect();
          return {
            x: box.x,
            y: box.y,
            bottom: box.bottom,
            height: box.height,
            labelHeight: label.height,
          };
        }),
      );
      expect(toggles.every((toggle) => toggle.height >= 44 && toggle.labelHeight <= 24)).toBe(true);
      if (width === 320) {
        expect(toggles[1].x).toBe(toggles[0].x);
        expect(toggles[1].y).toBeGreaterThanOrEqual(toggles[0].bottom);
      } else {
        expect(toggles[1].y).toBe(toggles[0].y);
      }
      const saved = await page.locator('.save-state').boundingBox();
      const mistakes = await page.locator('.kit-mistake-counter').boundingBox();
      const timer = await page.locator('.kit-attempt-timer').boundingBox();
      expect(Math.abs(saved!.x + saved!.width - mistakes!.x - mistakes!.width)).toBeLessThan(2);
      expect(saved!.y).toBeGreaterThanOrEqual(timer!.y);
      expect(mistakes!.y + mistakes!.height).toBeLessThanOrEqual(timer!.y + timer!.height);
      const actions = await page.locator('.puzzle-actions button').evaluateAll((buttons) =>
        buttons.map((button) => ({
          height: button.getBoundingClientRect().height,
          whiteSpace: getComputedStyle(button).whiteSpace,
        })),
      );
      expect(
        actions.every((button) => button.height === 52 && button.whiteSpace === 'nowrap'),
      ).toBe(true);
    }
  }
  await page.getByRole('link', { name: 'All attempts' }).click();
  const attempt = page.getByRole('link', { name: /Attempt 1/ });
  await attempt.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(attempt).toBeFocused();
  await expect(attempt).toHaveCSS('outline-style', 'solid');
  await expect(page.locator('.attempt-list')).toHaveCSS('overflow', 'visible');
});
