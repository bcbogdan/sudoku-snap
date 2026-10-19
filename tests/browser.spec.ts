import { test, expect } from '@playwright/test';
import path from 'node:path';
import expected from './fixtures/expected.json';
import { solve } from '../lib/sudoku';

test('photo → saved draft → persistent attempts, history and independent replay', async ({
  page,
}) => {
  const errors: string[] = [],
    uploads: string[] = [],
    external: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (request.method() === 'POST') uploads.push(request.url());
    if (!/^(http:\/\/127\.0\.0\.1|blob:|data:)/.test(request.url())) external.push(request.url());
  });
  await page.goto('/?new');
  await page
    .getByLabel('Choose a Sudoku photo', { exact: true })
    .setInputFiles(path.resolve('tests/fixtures/original.jpeg'));
  await expect(page.getByRole('button', { name: 'Confirm clues & play' })).toBeVisible({
    timeout: 150000,
  });
  const actual = await page
    .locator('.cell')
    .evaluateAll((cells) => cells.map((cell) => Number(cell.getAttribute('data-value'))));
  expect(actual).toEqual(expected);
  expect(uploads).toEqual([]);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
  await page.getByText('Compare original photo', { exact: true }).click();
  const originalPhoto = page.getByRole('img', {
    name: 'Original Sudoku photo for comparing recognized clues',
  });
  await expect(originalPhoto).toBeVisible();
  await page.getByRole('slider', { name: /Photo zoom/ }).press('ArrowRight');
  await expect(originalPhoto).toHaveAttribute('style', 'width: 150%;');
  await page.getByText('Compare original photo', { exact: true }).click();
  const puzzleUrl = page.url(),
    name = await page.getByRole('heading', { level: 1 }).textContent();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name!);
  await page.getByRole('button', { name: 'Confirm clues & play' }).click();
  await expect(page.locator('.cell[data-given=true]')).toHaveCount(32);
  const attemptUrl = page.url();
  await page.locator('#cell-5').click();
  await page.getByRole('button', { name: 'Enter 1', exact: true }).click();
  await expect(page.locator('#cell-5')).toHaveAttribute('data-value', '5');
  await expect(page.locator('.cell.match')).toHaveCount(2);
  await expect(page.locator('.cell.peer')).toHaveCount(21);
  await page.locator('#cell-0').click();
  await page.getByRole('button', { name: 'Pencil notes' }).click();
  for (const n of [1, 2]) {
    await page.getByRole('button', { name: `Enter ${n}`, exact: true }).click();
    await expect(page.locator('.save-state')).toHaveText('Saved');
  }
  await expect(page.locator('#cell-0 .notes')).toHaveText('12');
  await page.reload();
  await expect(page.locator('#cell-0 .notes')).toHaveText('12');
  await page.getByRole('button', { name: 'Previous move', exact: true }).click();
  await expect(page.locator('#cell-0 .notes')).toHaveText('1');
  await expect(page.getByRole('button', { name: 'Enter 3', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Latest move', exact: true }).click();
  await page.locator('#cell-0').click();
  const correct = solve(expected).solution![0],
    wrong = correct === 1 ? 2 : 1;
  await page.getByRole('button', { name: `Enter ${wrong}`, exact: true }).click();
  await expect(page.locator('#cell-0')).toHaveAttribute('data-wrong', 'true');
  await expect(page.locator('.mistakes')).toHaveText('Mistakes 1');
  await page.reload();
  await expect(page.locator('#cell-0')).toHaveAttribute('data-value', String(wrong));
  await expect(page.locator('.mistakes')).toHaveText('Mistakes 1');
  await page.getByRole('button', { name: 'Mistake check' }).click();
  await expect(page.locator('#cell-0')).toHaveAttribute('data-wrong', 'false');
  await page.goto(puzzleUrl);
  await page.getByRole('button', { name: 'New attempt' }).click();
  await expect(page.locator('#cell-0')).toHaveAttribute('data-value', '0');
  expect(page.url()).not.toEqual(attemptUrl);
  await page.goto(attemptUrl);
  await expect(page.locator('#cell-0')).toHaveAttribute('data-value', String(wrong));
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'test-results/mobile-persistent.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('manual creation saves each draft edit and completed attempts stay locked after reload', async ({
  page,
}) => {
  const solution = solve(expected).solution!;
  await page.goto('/?new');
  await page.getByRole('button', { name: 'Enter clues by hand' }).click();
  await expect(page.getByRole('button', { name: 'Confirm clues & play' })).toBeVisible();
  await page.getByRole('button', { name: 'Confirm clues & play' }).click();
  await expect(page.getByRole('region', { name: 'Sudoku game' }).getByRole('alert')).toContainText(
    '17 clues',
  );
  for (let i = 1; i < 81; i++) {
    await page.locator(`#cell-${i}`).click();
    await page.keyboard.press(String(solution[i]));
    await expect(page.locator(`#cell-${i}`)).toHaveAttribute('data-value', String(solution[i]));
  }
  await page.reload();
  await expect(page.locator('#cell-80')).toHaveAttribute('data-value', String(solution[80]));
  await page.getByRole('button', { name: 'Confirm clues & play' }).click();
  await expect(page.locator('.cell[data-given=true]')).toHaveCount(80);
  await page.locator('#cell-0').click();
  await page.keyboard.press(String(solution[0]));
  await expect(page.locator('.completion')).toContainText('locked');
  const duration = await page.getByLabel('Attempt duration').textContent();
  await page.reload();
  await expect(page.locator('.completion')).toContainText('locked');
  await expect(page.getByLabel('Attempt duration')).toHaveText(duration!);
  await page.locator('#cell-0').click();
  await page.keyboard.press('Delete');
  await expect(page.locator('#cell-0')).toHaveAttribute('data-value', String(solution[0]));
  await page.getByRole('button', { name: 'Previous move', exact: true }).click();
  await expect(page.locator('#cell-0')).toHaveAttribute('data-value', '0');
  await page.locator('#cell-0').press('1');
  await expect(page.locator('#cell-0')).toHaveAttribute('data-value', '0');
  await page.getByRole('button', { name: 'Next move', exact: true }).click();
  await expect(page.locator('#cell-0')).toHaveAttribute('data-value', String(solution[0]));
  await page.getByRole('button', { name: 'Start a new attempt' }).click();
  await expect(page.locator('#cell-0')).toHaveAttribute('data-value', '0');
  await expect(page.locator('.completion')).toHaveCount(0);
});
