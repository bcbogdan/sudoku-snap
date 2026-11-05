import { test, expect, type Page } from '@playwright/test';
import { cell, makeAttempt, makePuzzle } from '../benchmarks/data';
import { attemptSummary, puzzleSummary, timerRecord } from '../lib/storage-records';

const puzzle = { ...makePuzzle(901), name: 'Saved before source handoff', shareKey: 'legacy-key' };
const active = makeAttempt(3, 901);
active.moves[1].position.notes[cell] = [2, 5];
const finished = {
  ...makeAttempt(2, 901),
  id: 'completed-before-handoff',
  completedAt: active.startedAt + 5000,
  durationMs: 5000,
};

// The initial document is a legacy-record writer, not an old application build.
// Both documents use the exact same origin and browser context, without clearing storage.
async function seedBeforeHandoff(page: Page, version: 1 | 2 | 3, includeCompleted = true) {
  await page.route('**/history-fixture', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<title>Previous source fixture</title>' }),
  );
  await page.goto('/history-fixture');
  const attempts = includeCompleted ? [active, finished] : [active];
  const records = {
    puzzles: [puzzle],
    attempts:
      version < 3
        ? attempts
        : attempts.map(({ moves, ...fields }) => ({
            ...fields,
            moveCount: moves.length,
            historyId: `before-handoff-${fields.id}`,
          })),
    ...(version >= 2
      ? {
          puzzleSummaries: [puzzleSummary(puzzle)],
          attemptSummaries: attempts.map(attemptSummary),
          timers: attempts.map(timerRecord),
        }
      : {}),
    ...(version === 3
      ? {
          attemptMoves: attempts.flatMap((attempt) =>
            attempt.moves.map((move, index) => ({ attemptId: attempt.id, index, move })),
          ),
        }
      : {}),
  };
  await page.evaluate(
    async ({ version, records }) => {
      await new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('sudoku-local', version);
        open.onupgradeneeded = () => {
          const db = open.result;
          for (const name of Object.keys(records)) {
            const store = db.createObjectStore(name, {
              keyPath: name === 'attemptMoves' ? ['attemptId', 'index'] : 'id',
            });
            if (name === 'attempts' || name === 'attemptSummaries')
              store.createIndex('puzzleId', 'puzzleId');
          }
        };
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction(Object.keys(records), 'readwrite');
          for (const [name, values] of Object.entries(records))
            values.forEach((value) => tx.objectStore(name).add(value));
          // Photos are deliberately present in durable records but absent from summaries.
          tx.objectStore('puzzles').put({
            ...records.puzzles[0],
            image: new Blob(['original photo'], { type: 'image/jpeg' }),
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
    },
    { version, records },
  );
  await page.unroute('**/history-fixture');
}

async function durableRecords(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('sudoku-local');
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    try {
      const names = Array.from(db.objectStoreNames).filter((name) => name !== 'timers');
      const tx = db.transaction(names);
      const records = await Promise.all(
        names.map(
          (name) =>
            new Promise<[string, unknown[]]>((resolve, reject) => {
              const read = tx.objectStore(name).getAll();
              read.onsuccess = () => resolve([name, read.result]);
              read.onerror = () => reject(read.error);
            }),
        ),
      );
      const result = Object.fromEntries(records);
      result.puzzles = await Promise.all(
        (result.puzzles as (typeof puzzle & { image: Blob })[]).map(async (item) => ({
          ...item,
          image: await item.image.text(),
        })),
      );
      return result;
    } finally {
      db.close();
    }
  });
}

for (const version of [1, 2, 3] as const) {
  test(`schema ${version} collection and complete move history survive same-origin source handoff`, async ({
    page,
  }) => {
    await seedBeforeHandoff(page, version);
    await page.goto('/');
    await expect(page.locator('.kit-puzzle-card')).toHaveCount(1);
    const before = await durableRecords(page);
    expect(before.puzzles).toEqual([{ ...puzzle, image: 'original photo' }]);
    expect(before.attemptMoves).toHaveLength(active.moves.length + finished.moves.length);
    await page.goto(`/?puzzle=${puzzle.id}&attempt=${active.id}`);
    await expect(page.locator(`#cell-${cell}`)).toHaveAttribute(
      'data-value',
      String(active.moves.at(-1)!.position.board[cell]),
    );
    await page.getByRole('button', { name: 'Move history', exact: true }).click();
    const history = page.getByRole('slider');
    await expect(history).toHaveAttribute('max', '3');
    await history.fill('2');
    await expect(page.locator(`#cell-${cell}`)).toHaveAttribute(
      'aria-description',
      'Pencil notes: 2, 5. Current replay move.',
    );
    await page.reload();
    await page.getByRole('button', { name: 'Move history', exact: true }).click();
    await expect(page.getByRole('slider')).toHaveAttribute('max', '3');
    await page.goto(`/?puzzle=${puzzle.id}&attempt=${finished.id}`);
    await page.getByRole('button', { name: 'Move history', exact: true }).click();
    await expect(page.getByRole('slider')).toHaveAttribute('max', '2');
    expect(await durableRecords(page)).toEqual(before);
  });
}

test('missing puzzle and attempt links and restrictive filters do not erase the collection', async ({
  page,
}) => {
  await seedBeforeHandoff(page, 3);
  await page.goto('/?puzzle=not-local&filter=in-progress');
  await expect(page.locator('main').getByRole('alert')).toContainText(
    'Your saved puzzles are shown below',
  );
  await expect(page.locator('.kit-puzzle-card')).toHaveCount(1);
  const before = await durableRecords(page);
  await page.getByRole('button', { name: /^All/ }).click();
  expect(new URL(page.url()).searchParams.has('puzzle')).toBe(false);
  await page.reload();
  await expect(page.locator('.kit-puzzle-card')).toHaveCount(1);
  await page.goto(`/?puzzle=${puzzle.id}&attempt=not-local`);
  await expect(page.getByText('This attempt is unavailable.', { exact: true })).toBeVisible();
  expect(await durableRecords(page)).toEqual(before);
});

test('an IndexedDB open failure is not shown as an empty collection; reload safely retries', async ({
  page,
}) => {
  await seedBeforeHandoff(page, 3);
  const before = await durableRecords(page);
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('fail-storage-once')) {
      sessionStorage.setItem('fail-storage-once', 'yes');
      IDBFactory.prototype.open = () => {
        throw new DOMException('Local database access denied for test.', 'SecurityError');
      };
    }
  });
  await page.goto('/');
  await expect(page.locator('main').getByRole('alert')).toContainText(
    'Local database access denied',
  );
  await expect(page.getByText('A place for every puzzle.')).toHaveCount(0);
  await page.getByRole('button', { name: 'Reload saved puzzles' }).click();
  await expect(page.locator('.kit-puzzle-card')).toHaveCount(1);
  expect(await durableRecords(page)).toEqual(before);
});

test('Completed can hide unfinished puzzles; All restores them without any storage write', async ({
  page,
}) => {
  await seedBeforeHandoff(page, 3, false);
  const before = await durableRecords(page);
  await page.goto('/?filter=completed');
  await expect(page.getByText('No completed puzzles yet.', { exact: true })).toBeVisible();
  await expect(page.locator('.puzzle-library__summary')).toContainText('1 puzzle');
  await page.getByRole('button', { name: /^All/ }).click();
  await expect(page.locator('.kit-puzzle-card')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('.kit-puzzle-card')).toHaveCount(1);
  expect(await durableRecords(page)).toEqual(before);
});

test('missing projected final move reports unreadable history without discarding other durable records', async ({
  page,
}) => {
  await seedBeforeHandoff(page, 3);
  await page.evaluate(
    async ({ id, index }) => {
      await new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('sudoku-local');
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('attemptMoves', 'readwrite');
          tx.objectStore('attemptMoves').delete([id, index]);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onabort = () => {
            db.close();
            reject(tx.error);
          };
        };
        open.onerror = () => reject(open.error);
      });
    },
    { id: active.id, index: active.moves.length - 1 },
  );
  const before = await durableRecords(page);
  await page.goto('/');
  await expect(page.locator('main').getByRole('alert')).toContainText(
    'Saved attempt history is incomplete.',
  );
  await expect(page.getByText('A place for every puzzle.')).toHaveCount(0);
  await page.getByRole('button', { name: 'Reload saved puzzles' }).click();
  await expect(page.locator('main').getByRole('alert')).toContainText(
    'Saved attempt history is incomplete.',
  );
  expect(await durableRecords(page)).toEqual(before);
});
