import { test, expect } from '@playwright/test';
import { puzzleShareURL } from '../lib/sharing';
import clues from './fixtures/expected.json';

test('every number dial exit returns focus to its originating board cell', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(puzzleShareURL('http://127.0.0.1:3187', clues, 'Dial focus'));
  await page.getByRole('button', { name: 'Confirm clues & play' }).click();
  const cell = page.locator('#cell-0');
  const dialog = page.getByRole('dialog', { name: 'Choose a number' });
  for (const exit of ['choose', 'clear', 'Cancel', 'Escape', 'backdrop']) {
    await page.locator('#cell-5').click();
    const bounds = (await cell.boundingBox())!;
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.mouse.down();
    await expect(dialog).toBeVisible();
    await page.mouse.up();
    if (exit === 'choose') {
      await dialog.getByRole('button', { name: 'Choose 8', exact: true }).click();
      await expect(cell).toHaveAttribute('data-value', '8');
    } else if (exit === 'clear') {
      await dialog.getByRole('button', { name: 'Clear square' }).click();
      await expect(cell).toHaveAttribute('data-value', '0');
    } else if (exit === 'Cancel') {
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    } else if (exit === 'Escape') {
      await page.keyboard.press('Escape');
    } else {
      await page.mouse.click(2, 2);
    }
    await expect(dialog).toHaveCount(0);
    await expect(cell, `Focus after ${exit}`).toBeFocused();
    await expect(page.locator('.save-state')).toHaveText('Saved');
    await page.keyboard.press('Delete');
    await expect(cell).toHaveAttribute('data-value', '0');
    await expect(page.locator('.save-state')).toHaveText('Saved');
    await expect(cell).toBeFocused();
    await page.keyboard.press('7');
    await expect(cell).toHaveAttribute('data-value', '7');
  }
});

test('entry toggle, persistent undo, unhighlighted notes and long-press dial', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(puzzleShareURL('http://127.0.0.1:3187', clues, 'Controls test'));
  await page.getByRole('button', { name: 'Confirm clues & play' }).click();
  const cell = page.locator('#cell-0');
  await cell.click();
  await page.getByRole('button', { name: 'Enter 8', exact: true }).click();
  await expect(cell).toHaveAttribute('data-value', '8');
  await page.getByRole('button', { name: 'Enter 8', exact: true }).click();
  await expect(cell).toHaveAttribute('data-value', '0');
  await page.getByRole('button', { name: 'Undo move', exact: true }).click();
  await expect(cell).toHaveAttribute('data-value', '8');
  await page.reload();
  await expect(cell).toHaveAttribute('data-value', '8');
  await page.getByRole('button', { name: 'Undo move', exact: true }).click();
  await expect(cell).toHaveAttribute('data-value', '0');
  const bounds = (await cell.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await expect(page.getByRole('dialog', { name: 'Choose a number' })).toBeVisible();
  await page.mouse.up();
  await page.getByRole('button', { name: 'Choose 8', exact: true }).click();
  await expect(cell).toHaveAttribute('data-value', '8');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.note-match')).toHaveCount(0);
  const given = page.locator('#cell-5');
  await given.dispatchEvent('pointerdown', { button: 0, isPrimary: true, clientX: 0, clientY: 0 });
  await page.waitForTimeout(550);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await given.dispatchEvent('pointerup');
});
