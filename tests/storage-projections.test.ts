import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cell, clues, makeAttempt } from '../benchmarks/data';
import type { Attempt } from '../lib/attempts';
import {
  createPuzzle,
  getPuzzle,
  getPuzzleSummary,
  listAttemptPresentations,
  listAttemptSummaries,
  saveActiveInterval,
} from '../lib/storage';
import { putAttempt, upgradeStorage } from '../lib/storage-records';

function committed(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
  });
}

async function edit(operation: (tx: IDBTransaction) => void) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('sudoku-local', 3);
    request.onupgradeneeded = (event) =>
      upgradeStorage(request.result, request.transaction!, event.oldVersion);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    const tx = db.transaction(
      ['attempts', 'attemptMoves', 'attemptSummaries', 'timers'],
      'readwrite',
    );
    operation(tx);
    await committed(tx);
  } finally {
    db.close();
  }
}

async function seed(...attempts: Attempt[]) {
  await edit((tx) => attempts.forEach((attempt) => putAttempt(tx, attempt)));
}

test('single puzzle summary reads no photo or history; full puzzle retains its image', async () => {
  const puzzle = await createPuzzle(clues, new Blob(['original puzzle photo']));
  const reads: { store: string; key: IDBValidKey | IDBKeyRange }[] = [];
  const scopes: { names: string[]; mode: IDBTransactionMode }[] = [];
  const originalGet = IDBObjectStore.prototype.get;
  const originalTransaction = IDBDatabase.prototype.transaction;
  IDBObjectStore.prototype.get = function (...args: Parameters<IDBObjectStore['get']>) {
    reads.push({ store: this.name, key: args[0] });
    return originalGet.apply(this, args);
  };
  IDBDatabase.prototype.transaction = function (...args: Parameters<IDBDatabase['transaction']>) {
    const tx = originalTransaction.apply(this, args);
    scopes.push({ names: Array.from(tx.objectStoreNames), mode: tx.mode });
    return tx;
  };
  try {
    const summary = await getPuzzleSummary(puzzle.id);
    const { image: _image, ...expected } = puzzle;
    assert.deepEqual(summary, expected);
    assert.equal('image' in summary!, false);
    assert.deepEqual(reads, [{ store: 'puzzleSummaries', key: puzzle.id }]);
    assert.deepEqual(scopes, [{ names: ['puzzleSummaries'], mode: 'readonly' }]);
    assert.equal(await getPuzzleSummary('missing-puzzle-summary'), undefined);
    assert.deepEqual(reads.at(-1), {
      store: 'puzzleSummaries',
      key: 'missing-puzzle-summary',
    });
    assert.deepEqual(scopes.at(-1), { names: ['puzzleSummaries'], mode: 'readonly' });
  } finally {
    IDBObjectStore.prototype.get = originalGet;
    IDBDatabase.prototype.transaction = originalTransaction;
  }
  const full = await getPuzzle(puzzle.id);
  assert.equal(await full!.image!.text(), 'original puzzle photo');
  assert.deepEqual(full!.clues, clues);
  assert.equal(await getPuzzle('missing-puzzle-summary'), undefined);
});

test('zero-move projections use initial positions and preserve recorded zero time', async () => {
  const attempt = makeAttempt(0, 301);
  attempt.initial.notes[cell] = [1, 2];
  await seed(attempt);
  const [result] = await listAttemptPresentations([attempt.id]);
  assert.deepEqual(result.position, attempt.initial);
  assert.equal(result.elapsedMs, 0);
  assert.equal(result.durationMs, null);
  assert.equal(result.position.mistakes, 0);
  assert.equal('initial' in result, false);
  assert.equal('moves' in result, false);
});

test('latest positions provide actual mistakes, entries, clues and notes for caller progress', async () => {
  const attempt = makeAttempt(3, 302);
  const latest = attempt.moves.at(-1)!;
  latest.position.mistakes = 4;
  const noteCell = clues.findIndex((value, index) => value === 0 && index !== cell);
  latest.position.notes[noteCell] = [1, 3];
  await seed(attempt);
  const [result] = await listAttemptPresentations([attempt.id]);
  assert.deepEqual(result.position, latest.position);
  assert.equal(result.position.mistakes, 4);
  assert.equal(result.position.board[cell], latest.position.board[cell]);
  assert.equal(result.position.board[noteCell], 0);
  assert.deepEqual(result.position.notes[noteCell], [1, 3]);
  assert.equal(result.elapsedMs, 300);
});

test('timer-only checkpoints refresh unfinished duration without changing stored summaries', async () => {
  const attempt = makeAttempt(1, 303);
  await seed(attempt);
  const before = await listAttemptSummaries(attempt.puzzleId);
  await saveActiveInterval(attempt.id, 1000, 3500);
  const [result] = await listAttemptPresentations([attempt.id]);
  assert.equal(result.elapsedMs, 2600);
  assert.equal(result.durationMs, null);
  assert.equal(result.completedAt, null);
  assert.deepEqual(await listAttemptSummaries(attempt.puzzleId), before);
  assert.equal((await listAttemptPresentations([attempt.id]))[0].elapsedMs, 2600);
});

test('completed durations preserve zero and missing duration remains unknown', async () => {
  const zero = { ...makeAttempt(1, 304), completedAt: 1234, durationMs: 0 };
  const completed = { ...makeAttempt(1, 305), completedAt: 1234, durationMs: 7000 };
  const missing = { ...makeAttempt(1, 306), completedAt: 1234 };
  await seed(zero, completed, missing);
  await saveActiveInterval(zero.id, 0, 9000);
  const results = await listAttemptPresentations([completed.id, zero.id, missing.id]);
  assert.deepEqual(
    results.map((result) => result.elapsedMs),
    [7000, 0, null],
  );
  assert.ok(results.every((result) => result.completedAt === 1234));
});

test('missing timers fall back to recorded header or last-move time, never wall-clock gaps', async () => {
  const headerTime = makeAttempt(1, 307);
  const legacy = makeAttempt(3, 308);
  delete legacy.activeMs;
  const initial = makeAttempt(0, 309);
  delete initial.activeMs;
  await seed(headerTime, legacy, initial);
  await edit((tx) => {
    for (const attempt of [headerTime, legacy, initial])
      tx.objectStore('timers').delete(attempt.id);
  });
  const results = await listAttemptPresentations([headerTime.id, legacy.id, initial.id]);
  assert.deepEqual(
    results.map((result) => result.elapsedMs),
    [100, 200, 0],
  );
});

test('legacy timer fallback is fresh and valid timer zero takes precedence', async () => {
  const legacy = makeAttempt(3, 310);
  delete legacy.activeMs;
  const zero = makeAttempt(3, 311);
  await seed(legacy, zero);
  await edit((tx) => {
    tx.objectStore('timers').put({
      id: legacy.id,
      completedAt: null,
      durationMs: null,
      fallbackMs: 1234,
    });
    tx.objectStore('timers').put({
      id: zero.id,
      completedAt: null,
      durationMs: null,
      activeMs: 0,
      fallbackMs: 1234,
    });
  });
  const results = await listAttemptPresentations([legacy.id, zero.id]);
  assert.deepEqual(
    results.map((result) => result.elapsedMs),
    [1234, 0],
  );
});

test('missing attempts and expected final moves reject instead of inventing empty state', async () => {
  await assert.rejects(listAttemptPresentations(['missing']), /attempt is unavailable/);
  const attempt = makeAttempt(2, 312);
  await seed(attempt);
  await edit((tx) => tx.objectStore('attemptMoves').delete([attempt.id, 1]));
  await assert.rejects(listAttemptPresentations([attempt.id]), /history is incomplete/);
});

test('empty requests avoid transactions; selected long histories read exactly one final move', async () => {
  const long = makeAttempt(10000, 313);
  const initial = makeAttempt(0, 314);
  const unselected = makeAttempt(10, 315);
  await seed(long, initial, unselected);
  const reads: { store: string; key: IDBValidKey | IDBKeyRange }[] = [];
  const scopes: { names: string[]; mode: IDBTransactionMode }[] = [];
  const originalGet = IDBObjectStore.prototype.get;
  const originalGetAll = IDBObjectStore.prototype.getAll;
  const originalCursor = IDBObjectStore.prototype.openCursor;
  const originalTransaction = IDBDatabase.prototype.transaction;
  IDBObjectStore.prototype.get = function (...args: Parameters<IDBObjectStore['get']>) {
    reads.push({ store: this.name, key: args[0] });
    return originalGet.apply(this, args);
  };
  IDBObjectStore.prototype.getAll = function () {
    throw new Error('Presentation must not read full histories.');
  };
  IDBObjectStore.prototype.openCursor = function () {
    throw new Error('Presentation must not scan histories.');
  };
  IDBDatabase.prototype.transaction = function (...args: Parameters<IDBDatabase['transaction']>) {
    const tx = originalTransaction.apply(this, args);
    scopes.push({ names: Array.from(tx.objectStoreNames), mode: tx.mode });
    return tx;
  };
  try {
    assert.deepEqual(await listAttemptPresentations([]), []);
    assert.deepEqual(scopes, []);
    const results = await listAttemptPresentations([initial.id, long.id, initial.id]);
    assert.deepEqual(
      results.map((result) => result.id),
      [initial.id, long.id],
    );
    assert.deepEqual(results[1].position, long.moves.at(-1)!.position);
    assert.equal(reads.length, 5);
    assert.deepEqual(
      reads.filter((read) => read.store === 'attemptMoves'),
      [{ store: 'attemptMoves', key: [long.id, 9999] }],
    );
    assert.deepEqual(scopes, [{ names: ['attemptMoves', 'attempts', 'timers'], mode: 'readonly' }]);
  } finally {
    IDBObjectStore.prototype.get = originalGet;
    IDBObjectStore.prototype.getAll = originalGetAll;
    IDBObjectStore.prototype.openCursor = originalCursor;
    IDBDatabase.prototype.transaction = originalTransaction;
  }
});
