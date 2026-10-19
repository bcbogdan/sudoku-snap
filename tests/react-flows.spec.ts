import { test, expect, type Page } from '@playwright/test';
import { puzzleShareURL } from '../lib/sharing';
import clues from './fixtures/expected.json';

async function openGame(page: Page) {
  await page.goto(puzzleShareURL('http://127.0.0.1:3187', clues, 'React flows'));
  await page.getByRole('button', { name: 'Confirm clues & play' }).click();
  await expect(page.getByLabel('Attempt history')).toBeVisible();
}

test('delayed IndexedDB commits preserve ordered digits and evaluate toggles at commit time', async ({
  page,
}) => {
  await openGame(page);
  await page.locator('#cell-0').click();
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('sudoku-local');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction(Array.from(db.objectStoreNames), 'readwrite');
        const store = tx.objectStore('attempts');
        const until = performance.now() + 600;
        const hold = () => {
          const read = store.get('hold-input-test');
          read.onsuccess = () => {
            if (performance.now() < until) hold();
          };
        };
        hold();
        tx.oncomplete = () => db.close();
        resolve();
      };
    });
  });
  await page.keyboard.press('8');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('5');
  await page.keyboard.press('5');
  await expect(page.locator('.save-state')).toHaveText('Saved');
  await expect(page.locator('#cell-0')).toHaveAttribute('data-value', '8');
  await expect(page.locator('#cell-1')).toHaveAttribute('data-value', '0');
  await page.reload();
  await expect(page.locator('#cell-0')).toHaveAttribute('data-value', '8');
  await expect(page.locator('#cell-1')).toHaveAttribute('data-value', '0');
  await expect(page.getByText('Move 3 of 3', { exact: false })).toBeVisible();
});

async function rejectNextPuzzleWrite(page: Page) {
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'puzzles') {
        IDBObjectStore.prototype.put = original;
        throw new DOMException('Test storage is full', 'QuotaExceededError');
      }
      return original.apply(this, args);
    };
  });
}

test('failed draft writes show actionable feedback above the board on a phone', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?new');
  await page.getByRole('button', { name: 'Enter clues by hand' }).click();
  await page.locator('#cell-0').click();
  await rejectNextPuzzleWrite(page);
  await page.keyboard.press('8');
  const error = page.getByRole('region', { name: 'Sudoku game' }).getByRole('alert');
  await expect(error).toContainText('Unsaved inputs were discarded');
  const bounds = await error.boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThan(844);
  await expect(page.locator('#cell-0')).toHaveAttribute('data-value', '0');
  await expect(page.getByText('Draft saved', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Resume editing' }).click();
  await page.locator('#cell-0').press('8');
  await expect(page.locator('#cell-0')).toHaveAttribute('data-value', '8');
});

test('rename restores focus on save, Cancel and Escape; failures retain the editor', async ({
  page,
}) => {
  await openGame(page);
  const rename = page.getByRole('button', { name: 'Rename puzzle' });
  const input = page.getByRole('textbox', { name: 'Puzzle name' });
  for (const exit of ['Save name', 'Cancel', 'Escape']) {
    await rename.click();
    await input.fill('Focused name');
    if (exit === 'Escape') await input.press('Escape');
    else await page.getByRole('button', { name: exit, exact: true }).click();
    await expect(rename).toBeFocused();
  }
  await rename.click();
  await input.fill('Unsaved name');
  await rejectNextPuzzleWrite(page);
  await page.getByRole('button', { name: 'Save name' }).click();
  await expect(input).toHaveValue('Unsaved name');
  await expect(input).toBeFocused();
  await expect(page.getByRole('region', { name: 'Sudoku game' }).getByRole('alert')).toContainText(
    'Test storage is full',
  );
});
