import { test, expect } from '@playwright/test';
import { puzzleShareURL } from '../lib/sharing';
import clues from './fixtures/expected.json';

test('shared links import, reopen without duplication, and removal requires confirmation', async ({
  page,
}) => {
  const shared = puzzleShareURL('http://127.0.0.1:3187', clues, 'Shared weekend 🧩');
  await page.goto(shared);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Shared weekend 🧩');
  expect(page.url()).toContain('?puzzle=');
  const localURL = page.url();
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Share puzzle', exact: true }).click();
  await expect(page.getByText('Link copied to clipboard.', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toEqual(shared);
  await expect(page.getByLabel('Puzzle link', { exact: true })).toHaveCount(0);
  await page.goto(shared);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Shared weekend 🧩');
  expect(page.url()).toEqual(localURL);
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'Remove puzzle', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Shared weekend 🧩');
  await page.getByRole('button', { name: 'Confirm clues & play' }).click();
  await expect(page.getByRole('group', { name: 'Move history', exact: true })).toContainText(
    'Move 0',
  );
  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('all its attempts');
    await dialog.accept();
  });
  await page.getByRole('button', { name: 'Remove puzzle', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My puzzles', exact: true })).toBeVisible();
  await expect(page.locator('.puzzle-card')).toHaveCount(0);
  await page.goto('/?p=invalid&n=Bad');
  await expect(page.locator('main > .status')).toContainText('invalid');
  await expect(page.locator('.puzzle-card')).toHaveCount(0);
});
