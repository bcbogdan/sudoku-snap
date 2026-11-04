import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { makeAttempt, makePuzzle, cell, solution } from './data';

// Bundle only storage and its worker into memory; no Next server/build/artifacts.
async function main() {
  const [storage, worker] = await Promise.all([
    build({
      entryPoints: ['lib/storage.ts'],
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'browser',
    }),
    build({
      entryPoints: ['lib/solver.worker.ts'],
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'browser',
    }),
  ]);
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    await context.route('http://localhost:43193/**', (route) => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === '/storage.js' || pathname === '/solver.worker.ts')
        return route.fulfill({
          contentType: 'text/javascript',
          body: (pathname === '/storage.js' ? storage : worker).outputFiles[0].text,
        });
      return route.fulfill({
        contentType: 'text/html',
        body: '<title>Storage correctness</title>',
      });
    });
    const page = await context.newPage();
    await page.goto('http://localhost:43193/');
    const source = makeAttempt(10000, 900),
      puzzle = makePuzzle(900);
    await page.evaluate(
      async ({ json }) => {
        const { source, puzzle } = JSON.parse(json);
        const request = indexedDB.open('sudoku-local', 2);
        await new Promise<void>((resolve, reject) => {
          request.onupgradeneeded = () => {
            const db = request.result;
            db.createObjectStore('puzzles', { keyPath: 'id' });
            db.createObjectStore('attempts', { keyPath: 'id' }).createIndex('puzzleId', 'puzzleId');
            db.createObjectStore('puzzleSummaries', { keyPath: 'id' });
            db.createObjectStore('attemptSummaries', { keyPath: 'id' }).createIndex(
              'puzzleId',
              'puzzleId',
            );
            db.createObjectStore('timers', { keyPath: 'id' });
          };
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
        const db = request.result;
        const tx = db.transaction(
          ['puzzles', 'attempts', 'puzzleSummaries', 'attemptSummaries', 'timers'],
          'readwrite',
        );
        tx.objectStore('puzzles').put({ ...puzzle, image: new Blob(['photo']) });
        tx.objectStore('puzzleSummaries').put(puzzle);
        tx.objectStore('attempts').put(source);
        tx.objectStore('attemptSummaries').put({
          id: source.id,
          puzzleId: source.puzzleId,
          startedAt: source.startedAt,
          completedAt: null,
          durationMs: null,
          moveCount: source.moves.length,
        });
        tx.objectStore('timers').put({
          id: source.id,
          completedAt: null,
          durationMs: null,
          activeMs: source.activeMs,
          fallbackMs: source.activeMs,
        });
        await new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onabort = () => reject(tx.error);
        });
        db.close();
      },
      { json: JSON.stringify({ source, puzzle }) },
    );
    const first = await page.evaluate(
      async ({ id, cell }) => {
        const moduleURL = '/storage.js';
        const storage = await import(moduleURL);
        const coldStart = performance.now();
        const attempt = await storage.getAttempt(id);
        const coldOpenAndMigrationMs = performance.now() - coldStart;
        if (attempt.moves.length !== 10000) throw new Error('Migration lost history');
        const reads: string[] = [],
          writes: { store: string; bytes: number }[] = [];
        const getAll = IDBObjectStore.prototype.getAll,
          put = IDBObjectStore.prototype.put,
          add = IDBObjectStore.prototype.add;
        IDBObjectStore.prototype.getAll = function (...args) {
          reads.push(this.name);
          return getAll.apply(this, args);
        };
        IDBObjectStore.prototype.put = function (...args) {
          writes.push({ store: this.name, bytes: JSON.stringify(args[0]).length });
          return put.apply(this, args);
        };
        IDBObjectStore.prototype.add = function (...args) {
          writes.push({ store: this.name, bytes: JSON.stringify(args[0]).length });
          return add.apply(this, args);
        };
        const start = performance.now();
        let moved;
        try {
          moved = await storage.recordMove(attempt, cell, 2, true, false);
        } finally {
          IDBObjectStore.prototype.getAll = getAll;
          IDBObjectStore.prototype.put = put;
          IDBObjectStore.prototype.add = add;
        }
        const commandMs = performance.now() - start;
        if (
          moved.moves.length !== 10001 ||
          reads.includes('attemptMoves') ||
          writes.some((write) => write.bytes > 3000)
        )
          throw new Error('Unbounded warm command transfer');
        await storage.saveActiveInterval(id, 100, 200);
        await storage.saveActiveInterval(id, 150, 250);
        const undone = await storage.undoLastMove(moved);
        if (undone.moves.length !== 10002 || undone.activeMs !== attempt.activeMs + 150)
          throw new Error('Timer/undo mismatch');
        if (JSON.stringify(undone.moves.slice(0, 10000)) !== JSON.stringify(attempt.moves))
          throw new Error('Prefix changed');
        const originalPut = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function (...args) {
          if (this.name === 'timers') throw new Error('Injected browser timer failure');
          return originalPut.apply(this, args);
        };
        let aborted = false;
        try {
          await storage.recordMove(undone, cell, 3, true, false);
        } catch (error) {
          aborted = String(error).includes('Injected browser timer failure');
        } finally {
          IDBObjectStore.prototype.put = originalPut;
        }
        const afterAbort = await storage.getAttempt(id);
        if (!aborted || JSON.stringify(afterAbort) !== JSON.stringify(undone))
          throw new Error('Aborted append leaked state');
        return {
          coldOpenAndMigrationMs,
          commandMs,
          reads,
          writes,
          revision: undone.revision,
          history: undone.moves.length,
        };
      },
      { id: source.id, cell },
    );
    const second = await context.newPage();
    await second.goto('http://localhost:43193/second');
    const loaded = await second.evaluate(
      async ({ id }) => {
        const moduleURL = '/storage.js';
        const storage = await import(moduleURL);
        const start = performance.now();
        const attempt = await storage.getAttempt(id);
        const reloadMs = performance.now() - start;
        const puzzle = await storage.getPuzzle(attempt.puzzleId);
        if ((await puzzle.image.text()) !== 'photo') throw new Error('Photo migration failed');
        return { revision: attempt.revision, history: attempt.moves.length, reloadMs };
      },
      { id: source.id },
    );
    assert.equal(loaded.revision, first.revision);
    assert.equal(loaded.history, first.history);
    const race = await Promise.all(
      [page, second].map((target) =>
        target.evaluate(
          async ({ id, cell, revision }) => {
            const moduleURL = '/storage.js';
            const storage = await import(moduleURL);
            try {
              return {
                ok: true,
                revision: (
                  await storage.recordMove(
                    { id, puzzleId: 'puzzle-900', revision },
                    cell,
                    3,
                    true,
                    false,
                  )
                ).revision,
              };
            } catch (error) {
              return { ok: false, error: String(error) };
            }
          },
          { id: source.id, cell, revision: first.revision },
        ),
      ),
    );
    assert.equal(race.filter((result) => result.ok).length, 1);
    assert.match(race.find((result) => !result.ok)!.error!, /another tab/);
    const cleanup = await page.evaluate(
      async ({ id, solution }) => {
        const moduleURL = '/storage.js';
        const storage = await import(moduleURL);
        const attempt = await storage.getAttempt(id);
        await storage.removePuzzle(await storage.getPuzzle(attempt.puzzleId));
        if (
          (await storage.getAttempt(id)) !== undefined ||
          (await storage.saveActiveInterval(id, 250, 400)) !== null
        )
          throw new Error('Delete did not clear attempt/timer');
        const almost = solution.slice();
        almost[0] = 0;
        const started = await storage.startAttempt(await storage.createPuzzle(almost));
        await Promise.all([
          storage.saveActiveInterval(started.attempt.id, 100, 200),
          storage.saveActiveInterval(started.attempt.id, 150, 250),
        ]);
        const completed = await storage.recordMove(started.attempt, 0, solution[0], false, true);
        const late = await storage.saveActiveInterval(started.attempt.id, 250, 1000);
        if (completed.durationMs !== 150 || late.activeMs !== 150 || late.durationMs !== 150)
          throw new Error('Completion/timer atomicity failed');
        const summaries = await storage.listAttemptSummaries(started.puzzle.id);
        if (summaries[0].durationMs !== 150 || summaries[0].moveCount !== 1)
          throw new Error('Completion summary mismatch');
        await storage.removePuzzle(started.puzzle);
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('sudoku-local');
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const tx = db.transaction('attemptMoves'),
          request = tx.objectStore('attemptMoves').count();
        await new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onabort = () => reject(tx.error);
        });
        db.close();
        if (request.result !== 0) throw new Error('Orphaned moves after delete');
        return true;
      },
      { id: source.id, solution },
    );
    console.log(
      JSON.stringify(
        {
          browser: browser.version(),
          history: 10000,
          first,
          reloadMs: loaded.reloadMs,
          crossTab: race,
          cleanup,
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
