import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyMove, initialPosition, type Attempt, type Puzzle } from '../lib/attempts';
import {
  createPuzzle,
  getAttempt,
  getPuzzle,
  listAttempts,
  listAttemptSummaries,
  listPuzzleSummaries,
  recordMove,
  removePuzzle,
  saveActiveInterval,
  startAttempt,
  undoLastMove,
} from '../lib/storage';
import { upgradeStorage } from '../lib/storage-records';
import { solve } from '../lib/sudoku';
import clues from './fixtures/expected.json';

function seed(name: string) {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('puzzles', { keyPath: 'id' });
      request.result
        .createObjectStore('attempts', { keyPath: 'id' })
        .createIndex('puzzleId', 'puzzleId');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function committed(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
  });
}

test('schema 1 migration preserves photos, histories, nulls and absent optional timing', async () => {
  const db = await seed('sudoku-local');
  const puzzle: Puzzle = {
    id: 'legacy',
    name: 'Legacy',
    createdAt: 1,
    updatedAt: 1,
    clues,
    status: 'ready',
    revision: 0,
    uncertain: [],
    image: new Blob(['photo']),
  };
  const initial: Attempt = {
    id: 'legacy-attempt',
    puzzleId: puzzle.id,
    startedAt: 1,
    completedAt: null,
    durationMs: null,
    initial: initialPosition(clues),
    moves: [],
    revision: 0,
  };
  const attempt = applyMove(initial, clues, solve(clues).solution!, 0, 1, true, false, 2001);
  const tx = db.transaction(['puzzles', 'attempts'], 'readwrite');
  tx.objectStore('puzzles').put(puzzle);
  tx.objectStore('attempts').put(attempt);
  await committed(tx);
  db.close();
  assert.deepEqual(await getPuzzle(puzzle.id), puzzle);
  assert.equal(await (await getPuzzle(puzzle.id))!.image!.text(), 'photo');
  assert.deepEqual(await getAttempt(attempt.id), attempt);
  assert.deepEqual(await listAttempts(puzzle.id), [attempt]);
  const summaries = await listPuzzleSummaries();
  assert.equal('image' in summaries[0], false);
  assert.deepEqual(await listAttemptSummaries(puzzle.id), [
    {
      id: attempt.id,
      puzzleId: puzzle.id,
      startedAt: 1,
      completedAt: null,
      durationMs: null,
      moveCount: 1,
    },
  ]);
});

test('aborted schema upgrade leaves version 1 intact and can retry', async () => {
  const name = 'failed-storage-upgrade';
  (await seed(name)).close();
  await assert.rejects(
    new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 2);
      request.onupgradeneeded = (event) => {
        upgradeStorage(request.result, request.transaction!, event.oldVersion);
        request.transaction!.abort();
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    }),
  );
  const old = await seed(name);
  assert.deepEqual([...old.objectStoreNames], ['attempts', 'puzzles']);
  old.close();
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, 2);
    request.onupgradeneeded = (event) =>
      upgradeStorage(request.result, request.transaction!, event.oldVersion);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  assert.equal(db.objectStoreNames.contains('timers'), true);
  db.close();
});

test('overlapping checkpoints merge fresh time into moves; timer/query scopes exclude histories', async () => {
  const { attempt, puzzle } = await startAttempt(await createPuzzle(clues));
  const scopes: string[][] = [];
  const original = IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction = function (...args: Parameters<IDBDatabase['transaction']>) {
    scopes.push(typeof args[0] === 'string' ? [args[0]] : Array.from(args[0]));
    return original.apply(this, args);
  };
  try {
    await Promise.all([
      saveActiveInterval(attempt.id, 100, 1100),
      saveActiveInterval(attempt.id, 600, 1600),
    ]);
    assert.deepEqual(scopes, [['timers'], ['timers']]);
    scopes.length = 0;
    await listPuzzleSummaries();
    await listAttemptSummaries(puzzle.id);
    assert.deepEqual(scopes, [['puzzleSummaries'], ['attemptSummaries']]);
  } finally {
    IDBDatabase.prototype.transaction = original;
  }
  const moved = await recordMove(attempt, 0, 1, true, false);
  assert.equal(moved.moves[0].elapsedMs, 1500);
  const undone = await undoLastMove(moved);
  assert.equal(undone.moves.length, 2);
  assert.equal((await listAttemptSummaries(puzzle.id))[0].moveCount, 2);
  await assert.rejects(recordMove(attempt, 0, 2, false, true), /another tab/);
  await removePuzzle(puzzle);
  assert.equal(await saveActiveInterval(attempt.id, 1600, 2600), null);
  assert.equal(await getAttempt(attempt.id), undefined);
  assert.deepEqual(await listAttemptSummaries(puzzle.id), []);
});

test('completion atomically freezes timer and summary; late checkpoints cannot extend it', async () => {
  const solution = solve(clues).solution!;
  const almost = solution.slice();
  almost[0] = 0;
  const { attempt, puzzle } = await startAttempt(await createPuzzle(almost));
  await saveActiveInterval(attempt.id, 0, 2500);
  const completed = await recordMove(attempt, 0, solution[0], false, true);
  assert.equal(completed.durationMs, 2500);
  assert.equal((await saveActiveInterval(attempt.id, 2500, 5000))!.durationMs, 2500);
  assert.deepEqual(await getAttempt(attempt.id), completed);
  assert.equal((await listAttemptSummaries(puzzle.id))[0].durationMs, 2500);
  await assert.rejects(undoLastMove(completed), /read-only/);
});

test('cancelling draft creation rolls back both photo and summary', async () => {
  const before = await listPuzzleSummaries();
  const controller = new AbortController();
  const original = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
    const request = original.apply(this, args);
    if (this.name === 'puzzleSummaries') controller.abort();
    return request;
  };
  try {
    await assert.rejects(
      createPuzzle(clues, new Blob(['cancelled photo']), [], { signal: controller.signal }),
      { name: 'AbortError' },
    );
  } finally {
    IDBObjectStore.prototype.put = original;
  }
  assert.deepEqual(await listPuzzleSummaries(), before);
  const cancelled = new AbortController();
  cancelled.abort();
  await assert.rejects(createPuzzle(clues, undefined, [], { signal: cancelled.signal }), {
    name: 'AbortError',
  });
  assert.deepEqual(await listPuzzleSummaries(), before);
});

test('a durable draft wins cancellation arriving during its completion notification', async () => {
  const controller = new AbortController();
  const original = IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction = function (...args: Parameters<IDBDatabase['transaction']>) {
    const tx = original.apply(this, args);
    if (tx.mode === 'readwrite' && tx.objectStoreNames.contains('puzzles'))
      tx.addEventListener('complete', () => controller.abort(), { once: true });
    return tx;
  };
  try {
    const saved = await createPuzzle(clues, undefined, [], { signal: controller.signal });
    assert.equal(controller.signal.aborted, true);
    assert.deepEqual(await getPuzzle(saved.id), saved);
  } finally {
    IDBDatabase.prototype.transaction = original;
  }
});
