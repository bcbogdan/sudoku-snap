import { expect, test } from '@playwright/test';
import path from 'node:path';

test('cancelling a photo read releases the create screen without saving a draft', async ({
  page,
}) => {
  let releaseLoad: () => void = () => {};
  const holdLoad = new Promise<void>((resolve) => {
    releaseLoad = resolve;
  });
  let observedLoad: () => void = () => {};
  const loading = new Promise<void>((resolve) => {
    observedLoad = resolve;
  });
  await page.route('**/vendor/opencv.js', async (route) => {
    observedLoad();
    await holdLoad;
    await route.abort();
  });
  try {
    await page.goto('/?new');
    await page
      .getByLabel('Choose a Sudoku photo', { exact: true })
      .setInputFiles(path.resolve('tests/fixtures/original.jpeg'));
    await loading;
    await page.getByRole('button', { name: /cancel/i }).click();
    await expect(page.getByRole('button', { name: 'Enter clues by hand' })).toBeEnabled();
    releaseLoad();
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'My puzzles', exact: true })).toBeVisible();
    await expect(page.locator('.puzzle-card')).toHaveCount(0);
    await page.goto('/?new');
    await page.getByRole('button', { name: 'Enter clues by hand' }).click();
    await expect(page.getByRole('button', { name: 'Confirm clues & play' })).toBeVisible();
  } finally {
    releaseLoad();
  }
});
