import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialPosition, type Attempt, type Puzzle } from '../lib/attempts';
import {
  getAttempt,
  getPuzzle,
  recordMove,
  renamePuzzle,
  saveActiveInterval,
  undoLastMove,
} from '../lib/storage';
import { solveCached } from '../lib/solver-client';
import { solve, type Board } from '../lib/sudoku';
import clues from './fixtures/expected.json';

test('worker precompute coalesces requests, rechecks puzzle revisions and merges fresh timers; undo never solves', async () => {
  const puzzle: Puzzle = {
    id: 'worker-puzzle',
    name: 'Worker',
    clues,
    status: 'ready',
    revision: 0,
    uncertain: [],
    createdAt: 1,
    updatedAt: 1,
  };
  const attempt: Attempt = {
    id: 'worker-attempt',
    puzzleId: puzzle.id,
    startedAt: 1,
    completedAt: null,
    durationMs: null,
    activeMs: 0,
    initial: initialPosition(clues),
    moves: [],
    revision: 0,
  };
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('sudoku-local', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('puzzles', { keyPath: 'id' }).put(puzzle);
      const store = request.result.createObjectStore('attempts', { keyPath: 'id' });
      store.createIndex('puzzleId', 'puzzleId');
      store.put(attempt);
    };
    request.onsuccess = () => {
      request.result.close();
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
  let notify: (() => void) | undefined;
  let posted = new Promise<void>((resolve) => {
    notify = resolve;
  });
  const requests: { id: number; clues: Board }[] = [];
  let instance: MockWorker;
  class MockWorker {
    onmessage?: (event: MessageEvent<{ id: number; result: ReturnType<typeof solve> }>) => void;
    onerror?: () => void;
    constructor() {
      instance = this;
    }
    postMessage(request: { id: number; clues: Board }) {
      requests.push(request);
      notify?.();
    }
    terminate() {}
    reply() {
      const request = requests.at(-1)!;
      this.onmessage?.({ data: { id: request.id, result: solve(request.clues) } } as MessageEvent<{
        id: number;
        result: ReturnType<typeof solve>;
      }>);
    }
  }
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const oldWorker = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
  Object.defineProperty(globalThis, 'Worker', { configurable: true, value: MockWorker });
  try {
    const restored = (await getAttempt(attempt.id))!;
    await undoLastMove(restored);
    assert.equal(requests.length, 0);
    const move = recordMove(restored, 0, 1, true, false);
    const rejected = assert.rejects(move, /another tab/);
    await posted;
    const shared = solveCached(clues.slice());
    assert.equal(requests.length, 1);
    await renamePuzzle((await getPuzzle(puzzle.id))!, 'Renamed during solve');
    await saveActiveInterval(attempt.id, 0, 1500);
    instance!.reply();
    await rejected;
    await shared;
    assert.equal((await getAttempt(attempt.id))!.moves.length, 0);
    const moved = await recordMove(restored, 0, 1, true, false);
    assert.equal(moved.moves[0].elapsedMs, 1500);
    assert.equal(requests.length, 1);
    await undoLastMove(moved);
    assert.equal(requests.length, 1);

    posted = new Promise<void>((resolve) => {
      notify = resolve;
    });
    const other = clues.map((value) => (value ? 10 - value : 0));
    const failure = assert.rejects(solveCached(other), /retry/);
    await posted;
    instance!.onerror?.();
    await failure;
    const retry = solveCached(other);
    assert.equal(requests.length, 3);
    instance!.reply();
    assert.deepEqual(await retry, solve(other));
  } finally {
    if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow);
    else Reflect.deleteProperty(globalThis, 'window');
    if (oldWorker) Object.defineProperty(globalThis, 'Worker', oldWorker);
    else Reflect.deleteProperty(globalThis, 'Worker');
  }
});
