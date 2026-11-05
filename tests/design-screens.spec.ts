import { createRequire } from 'node:module';
import path from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { durationLabel } from '../lib/attempts';
import {
  captureTime,
  designURL,
  freshActiveMs,
  screenIds,
  seedDesignScreens,
} from './design-screen-fixtures';

const resolveDependency = createRequire(path.resolve('package.json'));
const axePath = resolveDependency.resolve('axe-core/axe.min.js');
const viewports = [
  { width: 320, height: 740 },
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 1280, height: 900 },
  { width: 844, height: 390 },
];

test.use({ locale: 'en-US', timezoneId: 'UTC', reducedMotion: 'reduce', deviceScaleFactor: 1 });

test.beforeEach(async ({ page }) => {
  // Freeze wall time, not timers: React, workers and IndexedDB still run normally.
  await page.clock.setFixedTime(captureTime);
});

async function stableScreen(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.load('700 40px "Bricolage Grotesque"');
    await document.fonts.load('600 28px "JetBrains Mono"', '0123456789:');
    await document.fonts.ready;
  });
  await page.addStyleTag({
    content:
      '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }',
  });
}

async function assertGeometry(page: Page) {
  const geometry = await page.evaluate(() => ({
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    boards: Array.from(document.querySelectorAll<HTMLElement>('.kit-sudoku-board'))
      .filter((element) => element.getClientRects().length)
      .map((element) => {
        const { width, height } = element.getBoundingClientRect();
        return { width, height };
      }),
    controls: Array.from(
      document.querySelectorAll<HTMLElement>(
        'main button, main a, main select, main input:not([type="file"]):not([type="range"])',
      ),
    )
      .filter(
        (element) =>
          element.getClientRects().length && !element.closest('[aria-label="Sudoku board"]'),
      )
      .map((element) => {
        const box = element.getBoundingClientRect();
        return {
          name: element.getAttribute('aria-label') || element.textContent?.trim(),
          left: box.left,
          right: box.right,
          width: box.width,
          height: box.height,
          fontSize: parseFloat(getComputedStyle(element).fontSize),
          input: element instanceof HTMLInputElement,
        };
      }),
  }));
  expect(geometry.scrollWidth, 'no horizontal document overflow').toBeLessThanOrEqual(
    geometry.width,
  );
  for (const board of geometry.boards) {
    expect(Math.abs(board.width - board.height), 'Sudoku board is square').toBeLessThan(1);
    if (geometry.width >= 960)
      expect(board.width, 'desktop Sudoku board width').toBeLessThanOrEqual(540);
  }
  for (const control of geometry.controls) {
    expect(control.left, `${control.name} left edge`).toBeGreaterThanOrEqual(-1);
    expect(control.right, `${control.name} right edge`).toBeLessThanOrEqual(geometry.width + 1);
    expect(control.height, `${control.name} touch height`).toBeGreaterThanOrEqual(44);
    expect(control.width, `${control.name} touch width`).toBeGreaterThanOrEqual(44);
    if (control.input)
      expect(control.fontSize, `${control.name} avoids input zoom`).toBeGreaterThanOrEqual(16);
  }
  const keys = await page
    .getByRole('group', { name: 'Number pad', exact: true })
    .getByRole('button')
    .evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().height));
  for (const height of keys)
    expect(height, 'standard keypad key height').toBeGreaterThanOrEqual(52);
}

async function capture(page: Page, info: TestInfo, name: string) {
  await stableScreen(page);
  if (info.config.metadata.guardedScreenshots === true) {
    await expect(page).toHaveScreenshot(`${name}.png`, {
      fullPage: true,
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
    });
  }
  await page.screenshot({
    path: info.outputPath(`${name}.png`),
    fullPage: true,
    animations: 'disabled',
  });
  await info.attach(name, { path: info.outputPath(`${name}.png`), contentType: 'image/png' });
  await assertGeometry(page);
}

async function assertAccessible(page: Page) {
  await page.addScriptTag({ path: axePath });
  const violations = await page.evaluate(async () => {
    const axe = (
      window as unknown as {
        axe: {
          run: (
            context: HTMLElement,
            options: object,
          ) => Promise<{
            violations: { id: string; impact: string; nodes: { failureSummary: string }[] }[];
          }>;
        };
      }
    ).axe;
    const result = await axe.run(document.body, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
    });
    return result.violations.map(({ id, impact, nodes }) => ({
      id,
      impact,
      failures: nodes.map((node) => node.failureSummary),
    }));
  });
  expect(violations).toEqual([]);
}

async function assertReplayReadOnly(page: Page) {
  await expect(page.getByRole('button', { name: 'Return to play', exact: true })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Number pad', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Pencil notes', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Mistake check', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Undo move', exact: true })).toHaveCount(0);
  const cells = page.getByRole('group', { name: 'Sudoku board', exact: true }).getByRole('button');
  const before = await cells.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute('data-value')),
  );
  await page.locator('#cell-0').press('1');
  await page.locator('#cell-0').press('Backspace');
  expect(
    await cells.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('data-value')),
    ),
  ).toEqual(before);
}

for (const theme of ['light', 'dark'] as const) {
  for (const viewport of viewports) {
    test(`six actual screens · ${theme} · ${viewport.width}x${viewport.height}`, async ({
      page,
    }, info) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.setViewportSize(viewport);
      await seedDesignScreens(page);
      const screens = [
        {
          name: 'library',
          url: '/',
          ready: () => page.getByRole('heading', { name: 'My puzzles', exact: true }),
        },
        {
          name: 'create',
          url: '/?new',
          ready: () => page.getByRole('button', { name: 'Enter clues by hand' }),
        },
        {
          name: 'review',
          url: designURL(screenIds.draft),
          ready: () => page.getByRole('button', { name: 'Confirm clues & play' }),
        },
        {
          name: 'play',
          url: designURL(screenIds.mixed, screenIds.active),
          ready: () => page.getByRole('button', { name: 'Move history', exact: true }),
        },
        {
          name: 'history',
          url: designURL(screenIds.mixed, screenIds.active),
          ready: () => page.getByRole('button', { name: 'Move history', exact: true }),
        },
        {
          name: 'detail',
          url: designURL(screenIds.mixed),
          ready: () => page.getByRole('link', { name: /Attempt 1/ }),
        },
      ];
      for (const screen of screens) {
        await test.step(screen.name, async () => {
          await page.goto(screen.url);
          await expect(screen.ready()).toBeVisible();
          await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
          if (screen.name === 'library')
            await expect(page.locator('.kit-puzzle-card')).toHaveCount(4);
          if (screen.name === 'detail') {
            await expect(page.getByRole('link', { name: 'Continue', exact: true })).toHaveAttribute(
              'href',
              designURL(screenIds.mixed, screenIds.active),
            );
          }
          if (screen.name === 'play') {
            await expect(page.getByText('Move 3 of 3', { exact: true })).toBeVisible();
            await expect(page.getByLabel('Attempt history', { exact: true })).toHaveCount(0);
          }
          if (screen.name === 'review') {
            const frame = page.locator('.review-board-frame[data-state="checking"]');
            await expect(frame).toBeVisible();
            await expect(frame.locator('> span.kit-corner-frame__corner')).toHaveCount(4);
            await expect(
              page.locator('.play-support').getByRole('button', { name: 'Confirm clues & play' }),
            ).toBeVisible();
          }
          if (screen.name === 'history') {
            await screen.ready().click();
            await assertReplayReadOnly(page);
            await expect(page.getByLabel('Attempt history', { exact: true })).toHaveAttribute(
              'aria-valuetext',
              'Move 3 of 3',
            );
          }
          await capture(page, info, screen.name);
          if (viewport.width === 390 || viewport.width === 1280) await assertAccessible(page);
        });
      }
    });
  }

  test(`empty collection and filtered results · ${theme}`, async ({ page }, info) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.setViewportSize({ width: 390, height: 844 });
    await seedDesignScreens(page, 'empty');
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Create a puzzle', exact: true })).toBeVisible();
    await expect(page.locator('.kit-puzzle-card')).toHaveCount(0);
    await capture(page, info, 'empty-collection');
    await seedDesignScreens(page, 'draft-only');
    await page.goto('/');
    await page.getByRole('button', { name: /^Completed/ }).click();
    await expect(page.locator('.kit-puzzle-card')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /no completed/i })).toBeVisible();
    await capture(page, info, 'empty-filter');
  });

  test(`collection membership, counts and persisted filter · ${theme}`, async ({ page }, info) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.setViewportSize({ width: 390, height: 844 });
    const fixtures = await seedDesignScreens(page);
    const active = fixtures.attempts.find((item) => item.id === screenIds.active)!;
    const cards = page.locator('.kit-puzzle-card');
    const filters = page.getByRole('group', { name: 'Filter puzzles', exact: true });
    const expectedDestinations = new Map([
      [screenIds.draft, designURL(screenIds.draft)],
      [screenIds.ready, designURL(screenIds.ready)],
      [screenIds.mixed, designURL(screenIds.mixed, screenIds.active)],
      [screenIds.completed, designURL(screenIds.completed, 'design-completed-only-attempt')],
    ]);
    const assertMembers = async (ids: string[]) => {
      await expect(cards).toHaveCount(ids.length);
      expect((await cards.getByRole('heading', { level: 2 }).allTextContents()).sort()).toEqual(
        fixtures.puzzles
          .filter((puzzle) => ids.includes(puzzle.id))
          .map((puzzle) => puzzle.name)
          .sort(),
      );
      for (const id of ids) {
        const name = fixtures.puzzles.find((puzzle) => puzzle.id === id)!.name;
        await expect(
          cards.filter({ has: page.getByRole('heading', { name, exact: true }) }),
        ).toHaveAttribute('href', expectedDestinations.get(id)!);
      }
      await expect(page.locator('.puzzle-library__summary')).toHaveText(
        '4 puzzles · 2 puzzles completed',
      );
    };
    await page.goto('/');
    await assertMembers([screenIds.draft, screenIds.mixed, screenIds.ready, screenIds.completed]);
    await expect(filters.getByRole('button', { name: /^All/ })).toHaveAccessibleName(
      /^All.*4 puzzles$/,
    );
    await expect(filters.getByRole('button', { name: /^In progress/ })).toHaveAccessibleName(
      /^In progress.*1 puzzle$/,
    );
    await expect(filters.getByRole('button', { name: /^Completed/ })).toHaveAccessibleName(
      /^Completed.*2 puzzles$/,
    );
    const mixed = cards.filter({
      has: page.getByRole('heading', { name: 'Morning ritual', exact: true }),
    });
    await expect(mixed).toContainText('1 completed');
    await expect(mixed).toContainText('3 attempts');
    await expect(mixed.locator('.kit-board-preview')).toHaveAttribute('data-completed', 'false');
    expect(await mixed.locator('.kit-board-preview__cell').allTextContents()).toEqual(
      active.moves.at(-1)!.position.board.map((value) => (value ? String(value) : '')),
    );
    await expect(mixed.locator('[data-entered="true"]')).toHaveCount(2);
    await expect(
      cards
        .filter({ has: page.getByRole('heading', { name: 'A quiet finish', exact: true }) })
        .locator('.kit-board-preview'),
    ).toHaveAttribute('data-completed', 'true');
    await expect(
      cards.filter({
        has: page.getByRole('heading', { name: 'Sunday paper · review clues', exact: true }),
      }),
    ).toContainText('Draft');
    for (const [filter, label, ids] of [
      ['in-progress', /^In progress/, [screenIds.mixed]],
      ['completed', /^Completed/, [screenIds.mixed, screenIds.completed]],
    ] as const) {
      await filters.getByRole('button', { name: label }).click();
      await expect(page).toHaveURL(new RegExp(`filter=${filter}`));
      await assertMembers([...ids]);
      await expect(filters.getByRole('button', { name: label })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await capture(page, info, `collection-${filter}`);
      await page.reload();
      await assertMembers([...ids]);
      await expect(filters.getByRole('button', { name: label })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    }
    await filters.getByRole('button', { name: /^All/ }).click();
    expect(new URL(page.url()).searchParams.has('filter')).toBe(false);
    await page.reload();
    await assertMembers([screenIds.draft, screenIds.mixed, screenIds.ready, screenIds.completed]);
  });

  test(`detail uses latest unfinished preview and fresh timer statistics · ${theme}`, async ({
    page,
  }, info) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.setViewportSize({ width: 390, height: 844 });
    const fixtures = await seedDesignScreens(page);
    const active = fixtures.attempts.find((item) => item.id === screenIds.active)!;
    const puzzle = fixtures.puzzles.find((item) => item.id === screenIds.mixed)!;
    const emptyCells = puzzle.clues.filter((value) => !value).length;
    expect(active.activeMs).toBeLessThan(freshActiveMs);
    await page.addInitScript(() => {
      const reads: string[] = [];
      Object.assign(window, { designReadStores: reads });
      const get = IDBObjectStore.prototype.get;
      IDBObjectStore.prototype.get = function (...args) {
        reads.push(this.name);
        return get.apply(this, args);
      };
    });
    await page.goto(designURL(screenIds.mixed));
    const summary = page.locator('dl[aria-label="Attempt statistics"]');
    const stat = (name: string) =>
      summary
        .locator('div')
        .filter({ has: page.getByText(name, { exact: true }) })
        .locator('dd');
    await expect(stat('Attempts')).toHaveText('3');
    await expect(stat('Best time')).toHaveText('00:00:00');
    await expect(stat('Time played')).toHaveText(durationLabel(freshActiveMs));
    expect(
      await page.evaluate(
        () => (window as unknown as { designReadStores: string[] }).designReadStores,
      ),
    ).not.toContain('puzzles');
    const current = page.getByRole('link', { name: /Attempt 3/ });
    const zero = page.getByRole('link', { name: /Attempt 2/ });
    const completed = page.getByRole('link', { name: /Attempt 1/ });
    await expect(current).toHaveAttribute('href', designURL(screenIds.mixed, screenIds.active));
    await expect(page.getByRole('link', { name: 'Continue', exact: true })).toHaveAttribute(
      'href',
      designURL(screenIds.mixed, screenIds.active),
    );
    await expect(current).toContainText(durationLabel(freshActiveMs));
    await expect(current).toContainText('Mistakes 0');
    await expect(current).toContainText(`2 of ${emptyCells} squares filled`);
    await expect(current.getByRole('progressbar')).toHaveAttribute('value', '2');
    await expect(current.getByRole('progressbar')).toHaveAttribute('max', String(emptyCells));
    await expect(zero).toContainText('00:00:00');
    await expect(zero.getByRole('progressbar')).toHaveAttribute('value', '0');
    await expect(completed).toHaveAttribute('data-complete', 'true');
    await expect(completed).toContainText('00:00:00');
    await expect(completed.getByRole('progressbar')).toHaveAttribute('value', String(emptyCells));
    const preview = page.locator('.puzzle-detail .kit-board-preview');
    await expect(preview).toHaveAttribute('data-completed', 'false');
    expect(await preview.locator('.kit-board-preview__cell').allTextContents()).toEqual(
      active.moves.at(-1)!.position.board.map((value) => (value ? String(value) : '')),
    );
    await expect(preview.locator('[data-entered="true"]')).toHaveCount(2);
    await capture(page, info, 'detail-fresh-timer');
    await page.reload();
    await expect(stat('Time played')).toHaveText(durationLabel(freshActiveMs));
    await expect(page.getByRole('link', { name: 'Continue', exact: true })).toHaveAttribute(
      'href',
      designURL(screenIds.mixed, screenIds.active),
    );
    await page.goto(designURL(screenIds.ready));
    await expect(stat('Attempts')).toHaveText('0');
    await expect(stat('Best time')).toHaveText('—');
    await expect(stat('Time played')).toHaveText('00:00:00');
    await expect(page.getByRole('link', { name: 'Continue', exact: true })).toHaveCount(0);
  });

  test(`zero, completed and replay boundaries · ${theme}`, async ({ page }, info) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.setViewportSize({ width: 390, height: 844 });
    await seedDesignScreens(page);
    await page.goto(designURL(screenIds.ready));
    await expect(page.getByText(/No attempts yet/)).toBeVisible();
    await capture(page, info, 'ready-no-attempts-long-name');
    await page.goto(designURL(screenIds.mixed, screenIds.finished));
    await expect(page.getByText('Completed in 00:00:00. This attempt is locked.')).toBeVisible();
    await capture(page, info, 'completed-zero-duration');
    await page.getByRole('button', { name: 'Move history', exact: true }).click();
    await assertReplayReadOnly(page);
    await capture(page, info, 'completed-replay');
    await page.goto(designURL(screenIds.completed));
    await expect(page.getByRole('link', { name: /Attempt 1/ })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Continue', exact: true })).toHaveCount(0);
    await capture(page, info, 'completed-only-detail');
    await page.goto(designURL(screenIds.mixed, screenIds.zero));
    await page.getByRole('button', { name: 'Move history', exact: true }).click();
    await expect(page.getByLabel('Attempt history', { exact: true })).toHaveAttribute(
      'aria-valuetext',
      'Move 0 of 0',
    );
    await expect(page.getByRole('button', { name: 'First move', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Latest move', exact: true })).toBeDisabled();
    await assertReplayReadOnly(page);
    await capture(page, info, 'zero-move-replay');
    await page.goto(designURL(screenIds.mixed, screenIds.active));
    await page.getByRole('button', { name: 'Move history', exact: true }).click();
    await page.getByRole('button', { name: 'First move', exact: true }).click();
    await expect(page.getByLabel('Attempt history', { exact: true })).toHaveAttribute(
      'aria-valuetext',
      'Move 0 of 3',
    );
    await capture(page, info, 'replay-first');
    await page.getByRole('button', { name: 'Next move', exact: true }).click();
    await expect(page.getByLabel('Attempt history', { exact: true })).toHaveAttribute(
      'aria-valuetext',
      'Move 1 of 3',
    );
    await capture(page, info, 'replay-middle');
    await page.getByRole('button', { name: 'Latest move', exact: true }).click();
    await assertReplayReadOnly(page);
    await capture(page, info, 'replay-latest');
    await page.getByRole('button', { name: 'Return to play', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Enter 1', exact: true })).toBeEnabled();
    await page.reload();
    await expect(page.getByText('Move 3 of 3', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Attempt history', { exact: true })).toHaveCount(0);
  });

  test(`saving, failed save and stale revision · ${theme}`, async ({ page }, info) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.setViewportSize({ width: 390, height: 844 });
    await seedDesignScreens(page);
    await page.goto(designURL(screenIds.draft));
    await expect(page.getByRole('button', { name: 'Confirm clues & play' })).toBeVisible();
    await page.evaluate(() => {
      const transaction = IDBDatabase.prototype.transaction;
      IDBDatabase.prototype.transaction = function (
        ...args: Parameters<IDBDatabase['transaction']>
      ) {
        const tx = transaction.apply(this, args);
        if (tx.mode === 'readwrite' && tx.objectStoreNames.contains('puzzles')) {
          IDBDatabase.prototype.transaction = transaction;
          // Delay acknowledgement, not the durable write, to expose real pending UI.
          const hold = (event: Event) => {
            event.stopImmediatePropagation();
            tx.removeEventListener('complete', hold, true);
            Object.assign(window, {
              releaseDesignSave: () => tx.dispatchEvent(new Event('complete')),
            });
          };
          tx.addEventListener('complete', hold, true);
        }
        return tx;
      };
    });
    await page.locator('#cell-0').click();
    await page.keyboard.press('8');
    await expect(page.getByText('Saving…', { exact: true })).toBeVisible();
    await capture(page, info, 'draft-saving');
    await page.evaluate(() =>
      (window as unknown as { releaseDesignSave: () => void }).releaseDesignSave(),
    );
    await expect(page.getByText('Draft saved', { exact: true })).toBeVisible();
    await page.evaluate(() => {
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...args) {
        if (this.name === 'puzzles') {
          IDBObjectStore.prototype.put = put;
          this.transaction.abort();
          throw new DOMException('Design capture: storage write failed', 'QuotaExceededError');
        }
        return put.apply(this, args);
      };
    });
    await page.locator('#cell-0').press('5');
    const game = page.getByRole('region', { name: 'Sudoku game' });
    await expect(game.getByRole('alert')).toBeVisible();
    await expect(page.getByText('Draft saved', { exact: true })).toHaveCount(0);
    await expect(page.locator('#cell-0')).toHaveAttribute('data-value', '8');
    await capture(page, info, 'draft-save-failed');
    await page.goto(designURL(screenIds.mixed, screenIds.active));
    await expect(page.getByRole('button', { name: 'Move history', exact: true })).toBeVisible();
    await page.evaluate(async (id) => {
      await new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('sudoku-local');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('attempts', 'readwrite');
          const store = tx.objectStore('attempts');
          const request = store.get(id);
          request.onsuccess = () =>
            store.put({
              ...request.result,
              revision: request.result.revision + 1,
              historyId: 'design-other-tab',
            });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onabort = () => {
            db.close();
            reject(tx.error);
          };
        };
      });
    }, screenIds.active);
    await page.locator('#cell-0').press('1');
    await expect(game.getByRole('alert')).toContainText('another tab');
    await expect(page.getByText('Saved', { exact: true })).toHaveCount(0);
    await capture(page, info, 'play-conflict');
  });

  test(`scan error and cancellation without OCR · ${theme}`, async ({ page }, info) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.setViewportSize({ width: 390, height: 844 });
    const app = page.getByRole('main');
    let observed: () => void = () => {};
    const requested = new Promise<void>((resolve) => {
      observed = resolve;
    });
    // Leave the request paused: cancelling terminates its worker and invalidates the route.
    const holdReader = () => observed();
    await page.route('**/vendor/opencv.js', holdReader);
    try {
      await page.goto('/?new');
      await page
        .getByLabel('Choose a Sudoku photo', { exact: true })
        .setInputFiles(path.resolve('tests/fixtures/original.jpeg'));
      await requested;
      await expect(page.getByRole('button', { name: 'Cancel reading' })).toBeVisible();
      await expect(app.getByRole('status')).toContainText('Loading the local image reader');
      await capture(page, info, 'scan-reading');
      await page.getByRole('button', { name: 'Cancel reading' }).click();
      await expect(page.getByRole('button', { name: 'Enter clues by hand' })).toBeEnabled();
      await expect(app.getByRole('status')).toContainText('Photo processing cancelled');
      await expect(app.getByRole('alert')).toHaveCount(0);
      await capture(page, info, 'scan-cancelled');
    } finally {
      await page.unroute('**/vendor/opencv.js', holdReader);
    }
    await page.route('**/vendor/opencv.js', (route) => route.abort());
    await page.goto('/?new');
    await page
      .getByLabel('Choose a Sudoku photo', { exact: true })
      .setInputFiles(path.resolve('tests/fixtures/original.jpeg'));
    await expect(app.getByRole('alert')).toContainText(/importScripts|reader|load/i);
    await expect(app.getByRole('alert')).not.toContainText('Could not find a Sudoku grid');
    await expect(page.getByRole('button', { name: 'Enter clues by hand' })).toBeEnabled();
    await capture(page, info, 'scan-load-error');
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'My puzzles', exact: true })).toBeVisible();
    await expect(page.locator('.kit-puzzle-card')).toHaveCount(0);
  });
}
