import { test, expect } from '@playwright/test';
import { puzzleShareURL } from '../lib/sharing';
import clues from './fixtures/expected.json';
import type { Attempt } from '../lib/attempts';
import type { TimerRecord } from '../lib/storage-records';

test('timer-only external commits and stale attempt revisions are respected', async ({ page }) => {
  const assets: { url: string; status: number; type: string }[] = [];
  page.on('response', (response) => {
    if (response.url().includes('/core-wasm/'))
      assets.push({
        url: response.url(),
        status: response.status(),
        type: response.headers()['content-type'] ?? '',
      });
  });
  await page.goto(puzzleShareURL('http://127.0.0.1:3187', clues, 'Concurrent engine'));
  await page.getByRole('button', { name: 'Confirm clues & play' }).click();
  await expect(page.getByLabel('Attempt history')).toBeVisible();
  if (process.env.NEXT_PUBLIC_SUDOKU_ENGINE === 'wasm') {
    expect(assets.some((asset) => asset.url.endsWith('.js') && asset.status === 200)).toBe(true);
    expect(
      assets.some(
        (asset) =>
          asset.url.endsWith('.wasm') &&
          asset.status === 200 &&
          asset.type.includes('application/wasm'),
      ),
    ).toBe(true);
  } else {
    expect(assets).toEqual([]);
  }
  await page.locator('#cell-0').click();
  await page.keyboard.press('8');
  await expect(page.locator('#cell-0')).toHaveAttribute('data-value', '8');
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('sudoku-local');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('timers', 'readwrite');
          const request = tx.objectStore('timers').openCursor();
          request.onsuccess = () => {
            const cursor = request.result;
            if (cursor)
              cursor.update({
                ...(cursor.value as TimerRecord),
                activeMs: 900000,
                lastActiveEnd: Date.now(),
              });
          };
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onabort = () => reject(tx.error);
        };
      }),
  );
  await page.locator('#cell-1').click();
  await page.keyboard.press('5');
  await expect(page.locator('#cell-1')).toHaveAttribute('data-value', '5');
  const elapsed = await page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open('sudoku-local');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('attempts', 'readwrite');
          const request = tx.objectStore('attempts').openCursor();
          let elapsed = 0;
          request.onsuccess = () => {
            const cursor = request.result;
            if (cursor) {
              const attempt = cursor.value as Attempt;
              elapsed = attempt.moves.at(-1)!.elapsedMs;
              cursor.update({ ...attempt, revision: attempt.revision + 1 });
            }
          };
          tx.oncomplete = () => {
            db.close();
            resolve(elapsed);
          };
          tx.onabort = () => reject(tx.error);
        };
      }),
  );
  expect(elapsed).toBeGreaterThanOrEqual(900000);
  await page.locator('#cell-0').click();
  await page.keyboard.press('1');
  await expect(page.getByRole('region', { name: 'Sudoku game' }).getByRole('alert')).toContainText(
    'another tab',
  );
  await page.reload();
  await expect(page.locator('#cell-0')).toHaveAttribute('data-value', '8');
  await expect(page.locator('#cell-1')).toHaveAttribute('data-value', '5');
});

// Run unchanged against separate TypeScript-default and Wasm-opt-in production builds.
test('aborted move is not published and the next command uses committed state', async ({
  page,
}) => {
  await page.goto(puzzleShareURL('http://127.0.0.1:3187', clues, 'Engine persistence'));
  await page.getByRole('button', { name: 'Confirm clues & play' }).click();
  await expect(page.getByLabel('Attempt history')).toBeVisible();
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'attempts') {
        IDBObjectStore.prototype.put = put;
        this.transaction.abort();
        throw new DOMException('Injected abort', 'AbortError');
      }
      return put.apply(this, args);
    };
  });
  await page.locator('#cell-0').click();
  await page.keyboard.press('8');
  await expect(page.getByRole('region', { name: 'Sudoku game' }).getByRole('alert')).toBeVisible();
  await expect(page.locator('#cell-0')).toHaveAttribute('data-value', '0');
  await page.getByRole('button', { name: 'Resume editing' }).click();
  await page.locator('#cell-0').press('8');
  await expect(page.locator('#cell-0')).toHaveAttribute('data-value', '8');
  await page.reload();
  await expect(page.locator('#cell-0')).toHaveAttribute('data-value', '8');
  await expect(page.getByText('Move 1 of 1', { exact: false })).toBeVisible();
});
