import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { cell, clues, histories, makeAttempt, makePuzzle, solution } from './data';
import { instrument } from './instrumentation';
import { integerEnv, readRun, summary, writeReport } from './report';
import darkExpected from '../tests/fixtures/dark-highlighted.json';

const mode = process.env.BENCH_MODE ?? 'default';
if (!['default', 'full', 'stress', 'ocr'].includes(mode)) throw new Error('Invalid BENCH_MODE');
const samples = integerEnv('BENCH_SAMPLES', 5);
const warmup = integerEnv('BENCH_WARMUP', 1, 0);
const io = process.env.BENCH_IO !== '0';
const sizes = process.env.BENCH_SIZES === '1';
const filter = new RegExp(process.env.BENCH_FILTER ?? '.');
const historyFilter =
  process.env.BENCH_HISTORY === undefined ? null : integerEnv('BENCH_HISTORY', 0, 0);
const image =
  process.env.BENCH_IMAGES === '1'
    ? readFileSync('tests/fixtures/original.jpeg').toString('base64')
    : null;
type Marks = {
  name: string;
  startTime: number;
  detail?: { bytes?: number; mode?: string; id?: number };
}[];
type Sample = { durationMs: number; marks: Marks; [key: string]: unknown };
const results: {
  name: string;
  dataset: unknown;
  cacheState: string;
  samples: Sample[];
  summaryMetric: string;
  summary: unknown;
}[] = [];

async function seed(context: BrowserContext, count: number, history: number, url = '/') {
  const page = await context.newPage();
  // Inert same-origin document: no app reads or timer writes during setup.
  await page.route('**/__benchmark_seed', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<title>seed</title>' }),
  );
  await page.goto('/__benchmark_seed');
  await page.evaluate(
    async ({ count, template, puzzle, image }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('sudoku-local', 1);
        request.onupgradeneeded = () => {
          request.result.createObjectStore('puzzles', { keyPath: 'id' });
          request.result
            .createObjectStore('attempts', { keyPath: 'id' })
            .createIndex('puzzleId', 'puzzleId');
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const blob = image
        ? new Blob([Uint8Array.from(atob(image), (c) => c.charCodeAt(0))], { type: 'image/jpeg' })
        : undefined;
      // Batches bound setup memory in the opt-in 500 x 10000 stress case.
      for (let start = 0; start < Math.max(count, 1); start += 10) {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(['puzzles', 'attempts'], 'readwrite');
          if (!start) {
            tx.objectStore('puzzles').clear();
            tx.objectStore('attempts').clear();
          }
          for (let i = start; i < Math.min(start + 10, count); i++) {
            tx.objectStore('puzzles').put({
              ...puzzle,
              id: `puzzle-${i}`,
              name: `Benchmark ${i}`,
              createdAt: puzzle.createdAt + i,
              image: blob,
            });
            tx.objectStore('attempts').put({
              ...template,
              id: `attempt-${i}`,
              puzzleId: `puzzle-${i}`,
            });
          }
          tx.oncomplete = () => resolve();
          tx.onabort = () => reject(tx.error);
        });
      }
      db.close();
      performance.clearMarks();
    },
    { count, template: makeAttempt(history), puzzle: makePuzzle(0), image },
  );
  await page.close();
  // Measured pages never use request routing (which disables HTTP caching).
  // The create screen has no active attempt/timer; replacing its URL lets a
  // real reload restore a pristine attempt without a pre-reload timer write.
  const measured = await context.newPage();
  await measured.goto('/?new');
  await expect(measured.locator('.create-screen')).toBeVisible();
  await measured.evaluate((url) => window.history.replaceState(null, '', url), url);
  return measured;
}
async function collect(page: Page): Promise<Sample> {
  return page.evaluate(() => {
    const marks = performance
      .getEntriesByType('mark')
      .filter((e) => e.name.startsWith('bench:'))
      .map((e) => ({ ...e.toJSON(), detail: (e as PerformanceMark).detail })) as Marks;
    const start = performance.getEntriesByName('bench:start')[0]?.startTime ?? 0;
    const end = (performance.getEntriesByName('bench:idle-end')[0] ??
      performance.getEntriesByName('bench:ui-committed').at(-1))!.startTime;
    const paint = performance.getEntriesByName('bench:paint-proxy').at(-1)?.startTime;
    const transactions = marks.filter((m) => m.name === 'bench:tx-complete');
    return {
      durationMs: end - start,
      timeOrigin: performance.timeOrigin,
      marks,
      paintProxyMs: paint === undefined ? null : paint - start,
      transactionCompletionMs: transactions.map((m) => ({ ...m.detail, ms: m.startTime - start })),
      io: {
        readRequests: marks.filter((m) => m.name === 'bench:read-request').length,
        writeRequests: marks.filter((m) => m.name === 'bench:write-request').length,
        estimatedReadBytes: marks
          .filter((m) => m.name === 'bench:read-success')
          .reduce((sum, m) => sum + (m.detail?.bytes ?? 0), 0),
        estimatedWriteBytes: marks
          .filter((m) => m.name === 'bench:write-size')
          .reduce((sum, m) => sum + (m.detail?.bytes ?? 0), 0),
      },
    } as Sample;
  });
}
async function waitCommit(page: Page) {
  await page.waitForFunction(() => performance.getEntriesByName('bench:paint-proxy').length > 0);
}
async function action(page: Page, selector: string, expectedStep: number, total: number) {
  await page.evaluate(
    async ({ selector, expectedStep, total }) => {
      performance.clearMarks();
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          observer.disconnect();
          reject(new Error('UI commit timeout'));
        }, 30000);
        const observer = new MutationObserver(() => {
          if (
            document.querySelector('.history label')?.textContent?.trim() !==
              `Move ${expectedStep} of ${total}` ||
            document.querySelector('.save-state')?.textContent !== 'Saved'
          )
            return;
          performance.mark('bench:ui-committed');
          observer.disconnect();
          clearTimeout(timeout);
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              performance.mark('bench:paint-proxy');
              resolve();
            }),
          );
        });
        observer.observe(document, {
          subtree: true,
          childList: true,
          attributes: true,
          characterData: true,
        });
        const target = document.querySelector<HTMLButtonElement>(selector);
        if (!target || target.disabled) {
          clearTimeout(timeout);
          observer.disconnect();
          reject(new Error(`Unavailable ${selector}`));
          return;
        }
        performance.mark('bench:start');
        target.click();
      });
    },
    { selector, expectedStep, total },
  );
  return collect(page);
}
async function stored(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('sudoku-local', 1);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const result = await new Promise<unknown>((resolve, reject) => {
      const r = db.transaction('attempts').objectStore('attempts').get('attempt-0');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    db.close();
    return result;
  }) as Promise<ReturnType<typeof makeAttempt>>;
}
function validateIO(sample: Sample, writes = false) {
  assert(Number.isFinite(sample.durationMs) && sample.durationMs > 0, 'Invalid measured duration');
  if (!io) return;
  assert(!sample.marks.some((m) => m.name === 'bench:tx-abort'));
  if (writes)
    assert(
      sample.marks.some((m) => m.name === 'bench:tx-complete' && m.detail?.mode === 'readwrite'),
    );
}

test('production performance baselines', async ({ browser }) => {
  const meta = { ...readRun('browser', process.env.BENCH_RUN_ID), browser: browser.version() };
  const write = (workloadsComplete: boolean) =>
    writeReport('browser', {
      ...meta,
      complete: false,
      workloadsComplete,
      mode,
      warmup,
      sampleCount: samples,
      filter: filter.source,
      historyFilter,
      idleMs: integerEnv('BENCH_IDLE_MS', 3200),
      instrumentation: { io, sizes },
      browserSettings: {
        headless: true,
        viewport: { width: 1280, height: 900 },
        locale: 'en-US',
        timezoneId: 'UTC',
      },
      results,
    });
  write(false);
  async function trial(
    name: string,
    count: number,
    history: number,
    run: (page: Page, context: BrowserContext) => Promise<Sample>,
    cacheState = 'warm HTTP and app DB read caches; fresh measured document; fixed seeded records',
  ) {
    if (!filter.test(name) || (historyFilter !== null && history !== historyFilter)) return;
    const measured: Sample[] = [];
    for (let i = -warmup; i < samples; i++) {
      const context = await browser.newContext({
        baseURL: 'http://127.0.0.1:3197',
        viewport: { width: 1280, height: 900 },
        locale: 'en-US',
        timezoneId: 'UTC',
      });
      context.setDefaultTimeout(180000);
      context.setDefaultNavigationTimeout(180000);
      try {
        const prime = await context.newPage();
        await prime.goto('/');
        await expect(prime.locator('.library')).toBeVisible();
        await prime.close();
        await context.addInitScript(instrument, { io, sizes });
        const page = await seed(
          context,
          count,
          history,
          name === 'attempt-reload' ? '/?puzzle=puzzle-0&attempt=attempt-0' : '/',
        );
        const sample = await run(page, context);
        validateIO(sample);
        if (i >= 0) measured.push(sample);
      } finally {
        await context.close();
      }
    }
    results.push({
      name,
      dataset: {
        puzzles: count,
        attemptsPerPuzzle: 1,
        historyPerAttempt: history,
        inputHistory:
          history +
          (['erase', 'undo'].includes(name) || (!history && name.startsWith('history')) ? 1 : 0),
        imageBytesPerPuzzle: image ? Buffer.from(image, 'base64').length : 0,
      },
      cacheState,
      samples: measured,
      summaryMetric: name === 'timer-idle' ? 'mainThreadTaskMs' : 'durationMs',
      summary: summary(
        measured.map((s) => (name === 'timer-idle' ? Number(s.mainThreadTaskMs) : s.durationMs)),
      ),
    });
    write(false);
  }
  if (mode !== 'ocr') {
    const libraryCases =
      mode === 'stress'
        ? [1, 50, 500].flatMap((n) => histories.map((h) => [n, h]))
        : mode === 'full'
          ? [1, 50, 500].flatMap((n) => [0, 100, 1000].map((h) => [n, h]))
          : [
              [1, 0],
              [50, 100],
              [500, 0],
            ];
    for (const [count, history] of libraryCases)
      await trial('library-load', count, history, async (page) => {
        await page.reload();
        await waitCommit(page);
        const sample = await collect(page);
        await expect(page.locator('.puzzle-card')).toHaveCount(count);
        await expect(page.locator('.puzzle-card h2').first()).toHaveText(`Benchmark ${count - 1}`);
        return sample;
      });
    for (const history of mode === 'default' ? [0, 1000] : histories) {
      await trial('attempt-reload', 1, history, async (page) => {
        await page.reload();
        await waitCommit(page);
        const sample = await collect(page);
        await expect(page.getByLabel('Attempt history')).toHaveValue(String(history));
        expect(
          await page
            .locator('.cell')
            .evaluateAll((cells) => cells.map((c) => Number(c.getAttribute('data-value')))),
        ).toEqual(clues);
        return sample;
      });
      for (const kind of [
        'entry',
        'note',
        'erase',
        'undo',
        'history-first',
        'history-latest',
        'history-previous',
        'history-next',
        'timer-idle',
      ]) {
        await trial(kind, 1, history, async (page) => {
          await page.goto('/?puzzle=puzzle-0&attempt=attempt-0');
          await waitCommit(page);
          await page.bringToFront();
          await page.locator(`#cell-${cell}`).click();
          let total = history;
          if (['erase', 'undo'].includes(kind) || (!history && kind.startsWith('history'))) {
            total++;
            await action(page, `[aria-label="Enter ${solution[cell]}"]`, total, total);
          }
          if (kind === 'note') await page.getByRole('button', { name: 'Pencil notes Off' }).click();
          if (kind === 'history-latest' || kind === 'history-next')
            await action(page, '[aria-label="First move"]', 0, total);
          if (kind === 'timer-idle') {
            const session = await page.context().newCDPSession(page);
            await session.send('Performance.enable');
            const before = await session.send('Performance.getMetrics');
            assert(
              await page.evaluate(
                () => document.hasFocus() && document.visibilityState === 'visible',
              ),
            );
            await page.evaluate(
              async (duration) => {
                performance.clearMarks();
                const timer = document.querySelector('time')!;
                const observer = new MutationObserver(() =>
                  performance.mark('bench:timer-ui-committed', { detail: timer.textContent }),
                );
                observer.observe(timer, { subtree: true, childList: true, characterData: true });
                performance.mark('bench:start');
                await new Promise((resolve) => setTimeout(resolve, duration));
                observer.disconnect();
                performance.mark('bench:idle-end');
              },
              integerEnv('BENCH_IDLE_MS', 3200),
            );
            const sample = await collect(page);
            const after = await session.send('Performance.getMetrics');
            const metric = (list: typeof before.metrics, name: string) =>
              list.find((m) => m.name === name)?.value ?? 0;
            sample.mainThreadTaskMs =
              (metric(after.metrics, 'TaskDuration') - metric(before.metrics, 'TaskDuration')) *
              1000;
            sample.timerText = await page.getByLabel('Attempt duration').textContent();
            assert(sample.marks.some((m) => m.name === 'bench:timer-ui-committed'));
            const saved = await stored(page);
            assert(saved.activeMs! > history * 100);
            assert.equal(saved.moves.length, history);
            validateIO(sample, true);
            await session.detach();
            return sample;
          }
          const navigation = kind.startsWith('history');
          const selector =
            kind === 'undo'
              ? '.history > button'
              : kind === 'erase'
                ? '[aria-label="Erase cell"]'
                : navigation
                  ? `[aria-label="${({ 'history-first': 'First', 'history-latest': 'Latest', 'history-previous': 'Previous', 'history-next': 'Next' } as Record<string, string>)[kind]} move"]`
                  : `[aria-label="Enter ${solution[cell]}"]`;
          const nextTotal = total + (navigation ? 0 : 1);
          const step =
            kind === 'history-first'
              ? 0
              : kind === 'history-previous'
                ? total - 1
                : kind === 'history-next'
                  ? 1
                  : nextTotal;
          const sample = await action(page, selector, step, nextTotal);
          const saved = await stored(page);
          assert.equal(saved.moves.length, nextTotal);
          const position = saved.moves.at(-1)?.position ?? saved.initial;
          if (!navigation) {
            assert.equal(position.board[cell], kind === 'entry' ? solution[cell] : 0);
            assert.deepEqual(position.notes[cell], kind === 'note' ? [solution[cell]] : []);
            validateIO(sample, true);
          }
          const visiblePosition = step ? saved.moves[step - 1].position : saved.initial;
          assert.deepEqual(
            await page
              .locator('.cell')
              .evaluateAll((cells) => cells.map((c) => Number(c.getAttribute('data-value')))),
            visiblePosition.board,
          );
          if (kind === 'note')
            await expect(page.locator(`#cell-${cell} .notes`)).toHaveText(String(solution[cell]));
          return sample;
        });
      }
    }
  }
  if (mode === 'ocr' || mode === 'full' || mode === 'stress') {
    for (const fixture of ['original', 'dark-highlighted'])
      for (const cache of ['cold', 'warm']) {
        await trial(
          `ocr-${fixture}-${cache}`,
          0,
          0,
          async (page, context) => {
            const expected = fixture === 'original' ? clues : darkExpected;
            const upload = async () => {
              await page.goto('/?new');
              await expect(page.locator('.create-screen')).toBeVisible();
              await page
                .getByLabel('Choose a Sudoku photo', { exact: true })
                .setInputFiles(path.resolve(`tests/fixtures/${fixture}.jpeg`));
              await expect(page.getByRole('button', { name: 'Confirm clues & play' })).toBeVisible({
                timeout: 180000,
              });
              await waitCommit(page);
              expect(
                await page
                  .locator('.cell')
                  .evaluateAll((cells) => cells.map((c) => Number(c.getAttribute('data-value')))),
              ).toEqual(expected);
            };
            if (cache === 'warm') {
              await upload();
              await page.close();
              page = await seed(context, 0, 0);
            }
            await upload();
            const sample = await collect(page);
            const previous = (await page.evaluate(() =>
              JSON.parse(sessionStorage.getItem('bench:ocr')!),
            )) as { timeOrigin: number; marks: Marks };
            assert(previous?.marks.some((m) => m.name === 'bench:ocr-start'));
            const start = previous.marks.find((m) => m.name === 'bench:ocr-start')!.startTime;
            sample.durationMs =
              Number(sample.timeOrigin) + sample.durationMs - previous.timeOrigin - start;
            sample.uploadDocument = previous;
            if (io)
              assert(
                previous.marks.some(
                  (m) => m.name === 'bench:tx-complete' && m.detail?.mode === 'readwrite',
                ),
              );
            return sample;
          },
          cache === 'cold'
            ? 'fresh context; cold OCR HTTP/language cache; warm app shell; OS cache uncontrolled'
            : 'one prior real upload; warm HTTP/language cache; fresh document and OCR worker; app DB reset',
        );
      }
  }
  assert(results.length > 0, 'No workloads matched benchmark filters');
  write(true);
});
