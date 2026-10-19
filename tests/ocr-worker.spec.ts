import { expect, test } from '@playwright/test';
import path from 'node:path';
import expected from './fixtures/dark-highlighted.json';

test('OCR loads lazily, cancels a loading worker, and supports a fresh retry', async ({ page }) => {
  const vendorRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/vendor/')) vendorRequests.push(request.url());
  });
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    const state = { created: 0, terminated: 0 };
    Object.assign(window, { ocrWorkers: state });
    window.Worker = class extends NativeWorker {
      private stopped = false;
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        state.created++;
      }
      terminate() {
        if (!this.stopped) state.terminated++;
        this.stopped = true;
        super.terminate();
      }
    };
  });
  // Leave initialization pending until cancellation terminates its owner.
  await page.route('**/vendor/opencv.js', () => {});
  await page.goto('/?new');
  expect(vendorRequests).toEqual([]);
  const upload = page.getByLabel('Choose a Sudoku photo', { exact: true });
  await upload.setInputFiles(path.resolve('tests/fixtures/dark-highlighted.jpeg'));
  await expect.poll(() => vendorRequests.some((url) => url.endsWith('/opencv.js'))).toBe(true);
  await page.getByRole('button', { name: 'Cancel reading' }).click();
  await expect(upload).toBeEnabled();
  expect(
    await page.evaluate(() => (window as unknown as { ocrWorkers: unknown }).ocrWorkers),
  ).toEqual({ created: 1, terminated: 1 });
  await page.unroute('**/vendor/opencv.js');
  await upload.setInputFiles(path.resolve('tests/fixtures/dark-highlighted.jpeg'));
  await expect(page.getByRole('button', { name: 'Confirm clues & play' })).toBeVisible({
    timeout: 150000,
  });
  expect(
    await page
      .locator('.cell')
      .evaluateAll((cells) => cells.map((cell) => Number(cell.getAttribute('data-value')))),
  ).toEqual(expected);
});

test('an unavailable OpenCV asset reports an error and unlocks photo input', async ({ page }) => {
  await page.route('**/vendor/opencv.js', (route) => route.abort());
  await page.goto('/?new');
  const upload = page.getByLabel('Choose a Sudoku photo', { exact: true });
  await upload.setInputFiles(path.resolve('tests/fixtures/original.jpeg'));
  await expect(page.getByRole('status')).toContainText(/importScripts|reader|load/i);
  await expect(upload).toBeEnabled();
});
