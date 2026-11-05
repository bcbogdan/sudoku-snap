import { test, expect } from '@playwright/test';
import { puzzleShareURL } from '../lib/sharing';
import clues from './fixtures/expected.json';
import type { TimerRecord } from '../lib/storage-records';
import type { AttemptHeader, StoredMove } from '../lib/storage-history';

test('timer-only external commits and stale attempt revisions are respected', async ({ page }) => {
  const engineRequests: string[] = [];
  page.on('request', (request) => {
    if (/core-wasm|sudoku_wasm/.test(request.url())) engineRequests.push(request.url());
  });
  await page.goto(puzzleShareURL('http://127.0.0.1:3187', clues, 'Concurrent engine'));
  await page.getByRole('button', { name: 'Confirm clues & play' }).click();
  await expect(page.getByRole('button', { name: 'Move history', exact: true })).toBeVisible();
  expect(engineRequests).toEqual([]);
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
          const tx = db.transaction(['attempts', 'attemptMoves'], 'readwrite');
          const request = tx.objectStore('attempts').openCursor();
          let elapsed = 0;
          request.onsuccess = () => {
            const cursor = request.result;
            if (cursor) {
              const attempt = cursor.value as AttemptHeader;
              const move = tx.objectStore('attemptMoves').get([attempt.id, attempt.moveCount - 1]);
              move.onsuccess = () => {
                elapsed = (move.result as StoredMove).move.elapsedMs;
              };
              cursor.update({
                ...attempt,
                revision: attempt.revision + 1,
                historyId: crypto.randomUUID(),
              });
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
  expect(engineRequests).toEqual([]);
});

test('aborted move is not published and the next command uses committed state', async ({
  page,
}) => {
  await page.goto(puzzleShareURL('http://127.0.0.1:3187', clues, 'Engine persistence'));
  await page.getByRole('button', { name: 'Confirm clues & play' }).click();
  await expect(page.getByRole('button', { name: 'Move history', exact: true })).toBeVisible();
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
  await page.getByRole('button', { name: 'Move history', exact: true }).click();
  await expect(page.getByText('Move 1 of 1', { exact: false })).toBeVisible();
});

test('erasing an empty cell completes without rewriting its full history', async ({ page }) => {
  await page.goto(puzzleShareURL('http://127.0.0.1:3187', clues, 'Unchanged persistence'));
  await page.getByRole('button', { name: 'Confirm clues & play' }).click();
  await expect(page.getByRole('button', { name: 'Move history', exact: true })).toBeVisible();
  await page.locator('#cell-0').click();
  await page.evaluate(() => {
    const result = { completed: 0, writes: [] as string[] };
    Object.assign(window, { unchangedPersistence: result });
    const transaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args: Parameters<IDBDatabase['transaction']>) {
      const tx = transaction.apply(this, args);
      if (tx.mode === 'readwrite' && tx.objectStoreNames.contains('attempts'))
        tx.addEventListener('complete', () => result.completed++);
      return tx;
    };
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (['attempts', 'attemptSummaries'].includes(this.name)) result.writes.push(this.name);
      return put.apply(this, args);
    };
  });
  await page.keyboard.press('Backspace');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { unchangedPersistence: { completed: number } })
            .unchangedPersistence.completed,
      ),
    )
    .toBe(1);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { unchangedPersistence: { writes: string[] } }).unchangedPersistence
          .writes,
    ),
  ).toEqual([]);
  await page.reload();
  await page.getByRole('button', { name: 'Move history', exact: true }).click();
  await expect(page.getByText('Move 0 of 0', { exact: false })).toBeVisible();
});
