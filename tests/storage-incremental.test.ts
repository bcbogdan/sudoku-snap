import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyMove, applyUndo, type Attempt, type Puzzle } from '../lib/attempts';
import { getGameEngine } from '../lib/game-engine';
import {
  getAttempt,
  listAttempts,
  listAttemptSummaries,
  recordMove,
  removePuzzle,
  saveActiveInterval,
  undoLastMove,
} from '../lib/storage';
import {
  attemptSummary,
  puzzleSummary,
  putAttempt,
  putPuzzle,
  timerRecord,
  upgradeStorage,
  type TimerRecord,
} from '../lib/storage-records';
import {
  forgetHistory,
  moveRange,
  type AttemptHeader,
  type StoredMove,
} from '../lib/storage-history';
import { makeAttempt, makePuzzle, solution, cell } from '../benchmarks/data';

function committed(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
  });
}
function open(
  name = 'sudoku-local',
  version?: number,
  upgrade?: (db: IDBDatabase, tx: IDBTransaction, oldVersion: number) => void,
) {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, version);
    request.onupgradeneeded = (event) =>
      upgrade?.(request.result, request.transaction!, event.oldVersion);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function seedV2(name: string, puzzle: Puzzle, attempt: Attempt, timer: TimerRecord) {
  const db = await open(name, 2, (db) => {
    db.createObjectStore('puzzles', { keyPath: 'id' });
    db.createObjectStore('attempts', { keyPath: 'id' }).createIndex('puzzleId', 'puzzleId');
    db.createObjectStore('puzzleSummaries', { keyPath: 'id' });
    db.createObjectStore('attemptSummaries', { keyPath: 'id' }).createIndex('puzzleId', 'puzzleId');
    db.createObjectStore('timers', { keyPath: 'id' });
  });
  const tx = db.transaction(
    ['puzzles', 'attempts', 'puzzleSummaries', 'attemptSummaries', 'timers'],
    'readwrite',
  );
  tx.objectStore('puzzles').put(puzzle);
  tx.objectStore('attempts').put(attempt);
  tx.objectStore('puzzleSummaries').put(puzzleSummary(puzzle));
  tx.objectStore('attemptSummaries').put(attemptSummary(attempt));
  tx.objectStore('timers').put(timer);
  await committed(tx);
  db.close();
}
async function raw(id: string) {
  const db = await open();
  try {
    const tx = db.transaction(['attempts', 'attemptMoves', 'attemptSummaries', 'timers']);
    const header = tx.objectStore('attempts').get(id);
    const moves = tx.objectStore('attemptMoves').getAll(moveRange(id));
    const summary = tx.objectStore('attemptSummaries').get(id);
    const timer = tx.objectStore('timers').get(id);
    await committed(tx);
    return {
      header: header.result as AttemptHeader | undefined,
      moves: moves.result as StoredMove[],
      summary: summary.result,
      timer: timer.result,
    };
  } finally {
    db.close();
  }
}
async function seedCurrent(puzzle: Puzzle, attempt: Attempt) {
  const db = await open();
  try {
    const tx = db.transaction(
      ['puzzles', 'attempts', 'attemptMoves', 'puzzleSummaries', 'attemptSummaries', 'timers'],
      'readwrite',
    );
    tx.objectStore('attemptMoves').delete(moveRange(attempt.id));
    putPuzzle(tx, puzzle);
    putAttempt(tx, attempt);
    await committed(tx);
  } finally {
    db.close();
  }
}

test('v2 migration keeps authoritative timer checkpoints, photos and optional fields losslessly', async () => {
  const puzzle = { ...makePuzzle(201), image: new Blob(['legacy photo']), shareKey: 'legacy-link' };
  const attempt = makeAttempt(4, 201);
  delete attempt.activeMs;
  const timer = { ...timerRecord(attempt), activeMs: 12345, lastActiveEnd: 98765 };
  await seedV2('sudoku-local', puzzle, attempt, timer);
  const loaded = await getAttempt(attempt.id);
  assert.deepEqual(loaded, { ...attempt, activeMs: 12345, lastActiveEnd: 98765 });
  const stored = await raw(attempt.id);
  assert.equal('moves' in stored.header!, false);
  assert.equal(stored.header!.moveCount, attempt.moves.length);
  assert.deepEqual(
    stored.moves.map((record) => record.move),
    attempt.moves,
  );
  assert.deepEqual(stored.timer, timer);
  assert.equal('activeMs' in stored.header!, false);
  const db = await open();
  const tx = db.transaction('puzzles');
  const request = tx.objectStore('puzzles').get(puzzle.id);
  await committed(tx);
  assert.equal(await request.result.image.text(), 'legacy photo');
  assert.equal(request.result.shareKey, 'legacy-link');
  db.close();
});

test('an upgrade aborted after move writes rolls back v2 headers, timers and all new stores', async () => {
  const name = 'incremental-upgrade-abort';
  const puzzle = makePuzzle(202),
    attempt = makeAttempt(3, 202);
  const timer = { ...timerRecord(attempt), activeMs: 999 };
  await seedV2(name, puzzle, attempt, timer);
  const original = IDBObjectStore.prototype.add;
  IDBObjectStore.prototype.add = function (...args: Parameters<IDBObjectStore['add']>) {
    const request = original.apply(this, args);
    if (this.name === 'attemptMoves')
      request.addEventListener('success', () => this.transaction.abort(), { once: true });
    return request;
  };
  try {
    await assert.rejects(open(name, 3, upgradeStorage));
  } finally {
    IDBObjectStore.prototype.add = original;
  }
  const old = await open(name, 2);
  assert.equal(old.objectStoreNames.contains('attemptMoves'), false);
  const tx = old.transaction(['attempts', 'timers']);
  const saved = tx.objectStore('attempts').get(attempt.id),
    checkpoint = tx.objectStore('timers').get(attempt.id);
  await committed(tx);
  assert.deepEqual(saved.result, attempt);
  assert.deepEqual(checkpoint.result, timer);
  old.close();
  const upgraded = await open(name, 3, upgradeStorage);
  assert.equal(upgraded.version, 3);
  const read = upgraded.transaction('attemptMoves');
  const moves = read.objectStore('attemptMoves').getAll();
  await committed(read);
  assert.deepEqual(
    moves.result.map((record: StoredMove) => record.move),
    attempt.moves,
  );
  upgraded.close();
});

test('100/10k histories append bounded records without reading nested history on warm commands', async (t) => {
  t.mock.method(Date, 'now', () => 1800000000000);
  for (const length of [100, 10000]) {
    const source = makeAttempt(length, 300 + length),
      puzzle = makePuzzle(300 + length);
    await seedCurrent(puzzle, source);
    const loaded = (await getAttempt(source.id))!;
    let historyReads = 0;
    const writes: { store: string; bytes: number; hasMoves: boolean }[] = [];
    const getAll = IDBObjectStore.prototype.getAll,
      put = IDBObjectStore.prototype.put,
      add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.getAll = function (...args: Parameters<IDBObjectStore['getAll']>) {
      if (this.name === 'attemptMoves') historyReads++;
      return getAll.apply(this, args);
    };
    const capture = (store: IDBObjectStore, value: unknown) =>
      writes.push({
        store: store.name,
        bytes: JSON.stringify(value).length,
        hasMoves: Object.hasOwn(value as object, 'moves'),
      });
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
      capture(this, args[0]);
      return put.apply(this, args);
    };
    IDBObjectStore.prototype.add = function (...args: Parameters<IDBObjectStore['add']>) {
      capture(this, args[0]);
      return add.apply(this, args);
    };
    let moved: Attempt;
    try {
      moved = await recordMove(loaded, cell, 2, true, true);
      assert.equal(historyReads, 0);
      assert.deepEqual(
        writes.map((write) => write.store).sort(),
        ['attemptMoves', 'attemptSummaries', 'attempts', 'timers'].sort(),
      );
      assert.ok(writes.every((write) => write.bytes < 3000 && !write.hasMoves));
      const undone = await undoLastMove(moved);
      assert.equal(historyReads, 0);
      assert.deepEqual(undone, applyUndo(moved, Date.now()));
    } finally {
      IDBObjectStore.prototype.getAll = getAll;
      IDBObjectStore.prototype.put = put;
      IDBObjectStore.prototype.add = add;
    }
    assert.deepEqual(
      moved!,
      applyMove(source, puzzle.clues, solution, cell, 2, true, true, Date.now()),
    );
    forgetHistory();
    assert.deepEqual(await getAttempt(source.id), applyUndo(moved!, Date.now()));
    assert.deepEqual((await listAttempts(puzzle.id))[0], applyUndo(moved!, Date.now()));
    await removePuzzle(puzzle);
    assert.deepEqual(await raw(source.id), {
      header: undefined,
      moves: [],
      summary: undefined,
      timer: undefined,
    });
  }
});

test('caller history is untrusted and exposed nested snapshots cannot corrupt residents', async () => {
  const source = makeAttempt(5, 401),
    puzzle = makePuzzle(401);
  await seedCurrent(puzzle, source);
  const loaded = (await getAttempt(source.id))!;
  assert.throws(() => {
    loaded.moves[0].position.board[0] = 9;
  }, TypeError);
  assert.throws(() => {
    loaded.initial.notes[0].push(1);
  }, TypeError);
  loaded.moves.length = 0;
  const forged = { ...loaded, initial: { ...loaded.initial, board: Array(81).fill(9) }, moves: [] };
  const moved = await recordMove(forged, cell, 2, false, false);
  assert.deepEqual(moved.moves.slice(0, source.moves.length), source.moves);
  assert.deepEqual(moved.initial, source.initial);
  assert.equal(moved.moves.length, source.moves.length + 1);
  assert.deepEqual(await getAttempt(source.id), moved);
});

test('same-revision durable replacement invalidates the resident; concurrent stale writes cannot win', async () => {
  const source = makeAttempt(2, 402),
    puzzle = makePuzzle(402);
  await seedCurrent(puzzle, source);
  const stale = (await getAttempt(source.id))!;
  const replacement = structuredClone(source);
  replacement.moves[0].position.notes[1] = [8];
  await seedCurrent(puzzle, replacement);
  const results = await Promise.allSettled([
    recordMove(stale, cell, 2, true, false),
    recordMove(stale, cell, 3, true, false),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const rejected = results.find((result) => result.status === 'rejected') as PromiseRejectedResult;
  assert.match(rejected.reason.message, /another tab/);
  const loaded = (await getAttempt(source.id))!;
  assert.deepEqual(loaded.moves.slice(0, source.moves.length), replacement.moves);
  assert.equal(loaded.moves.length, 3);
  assert.equal((await raw(source.id)).moves.length, 3);
});

test('fresh bounded header metadata is checked even without a revision or history token change', async () => {
  const source = makeAttempt(2, 408),
    puzzle = makePuzzle(408);
  await seedCurrent(puzzle, source);
  const stale = (await getAttempt(source.id))!;
  const db = await open();
  const tx = db.transaction('attempts', 'readwrite');
  const request = tx.objectStore('attempts').get(source.id);
  request.onsuccess = () =>
    tx.objectStore('attempts').put({ ...request.result, startedAt: source.startedAt - 1 });
  await committed(tx);
  db.close();
  const updated = await recordMove(stale, cell, 2, true, false);
  assert.equal(updated.startedAt, source.startedAt - 1);
  assert.deepEqual(updated.moves.slice(0, 2), source.moves);
});

test('caller puzzle metadata cannot substitute a different same-revision solution precompute', async () => {
  const a = makeAttempt(2, 410),
    b = makeAttempt(2, 411);
  await seedCurrent(makePuzzle(410), a);
  await seedCurrent(makePuzzle(411), b);
  const before = await raw(a.id);
  await assert.rejects(
    recordMove({ ...a, puzzleId: b.puzzleId }, cell, 2, true, false),
    /another tab/,
  );
  assert.deepEqual(await raw(a.id), before);
});

test('failed append discards preparation and atomically rolls back header/move/summary/timer', async () => {
  const source = makeAttempt(3, 403),
    puzzle = makePuzzle(403);
  await seedCurrent(puzzle, source);
  await getAttempt(source.id);
  const before = await raw(source.id);
  const engine = await getGameEngine(),
    prepare = engine.prepare,
    put = IDBObjectStore.prototype.put;
  let discarded = 0,
    accepted = 0;
  engine.prepare = (...args) => {
    const candidate = prepare(...args);
    return {
      ...candidate,
      commit() {
        accepted++;
        candidate.commit();
      },
      discard() {
        discarded++;
        candidate.discard();
      },
    };
  };
  IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
    if (this.name === 'timers') throw new Error('Injected timer failure');
    return put.apply(this, args);
  };
  try {
    await assert.rejects(recordMove(source, cell, 2, false, false), /Injected timer failure/);
  } finally {
    engine.prepare = prepare;
    IDBObjectStore.prototype.put = put;
  }
  assert.equal(accepted, 0);
  assert.equal(discarded, 1);
  assert.deepEqual(await raw(source.id), before);
  assert.deepEqual(await getAttempt(source.id), source);
  const retry = await recordMove(source, cell, 2, false, false);
  assert.equal(retry.moves.length, 4);
});

test('postcommit acceptance failure reloads committed data once, without replay', async () => {
  const source = makeAttempt(2, 404),
    puzzle = makePuzzle(404);
  await seedCurrent(puzzle, source);
  const engine = await getGameEngine(),
    prepare = engine.prepare,
    log = console.error;
  let preparations = 0,
    discards = 0;
  engine.prepare = (...args) => {
    preparations++;
    const candidate = prepare(...args);
    return {
      ...candidate,
      commit() {
        candidate.commit();
        throw new Error('Injected acceptance failure');
      },
      discard() {
        discards++;
        candidate.discard();
      },
    };
  };
  console.error = () => {};
  let moved: Attempt;
  try {
    moved = await recordMove(source, cell, 2, true, false);
  } finally {
    engine.prepare = prepare;
    console.error = log;
  }
  assert.equal(preparations, 1);
  assert.equal(discards, 0);
  assert.equal(moved!.moves.length, 3);
  assert.deepEqual(await getAttempt(source.id), moved!);
  assert.equal((await raw(source.id)).moves.length, 3);
});

test('an asynchronous transaction abort after the append request cannot publish resident history', async () => {
  const source = makeAttempt(2, 409),
    puzzle = makePuzzle(409);
  await seedCurrent(puzzle, source);
  await getAttempt(source.id);
  const before = await raw(source.id);
  const add = IDBObjectStore.prototype.add;
  IDBObjectStore.prototype.add = function (...args: Parameters<IDBObjectStore['add']>) {
    const request = add.apply(this, args);
    if (this.name === 'attemptMoves')
      request.addEventListener('success', () => this.transaction.abort(), { once: true });
    return request;
  };
  try {
    await assert.rejects(recordMove(source, cell, 2, true, false), /Could not save/);
  } finally {
    IDBObjectStore.prototype.add = add;
  }
  assert.deepEqual(await raw(source.id), before);
  assert.deepEqual(await getAttempt(source.id), source);
  const moved = await recordMove(source, cell, 2, true, false);
  assert.equal(moved.moves.length, source.moves.length + 1);
});

test('independent attempts retain exact histories with overlapping timer transactions', async () => {
  const a = makeAttempt(4, 405),
    b = makeAttempt(6, 406);
  await seedCurrent(makePuzzle(405), a);
  await seedCurrent(makePuzzle(406), b);
  await Promise.all([
    saveActiveInterval(a.id, 100, 200),
    saveActiveInterval(a.id, 150, 250),
    saveActiveInterval(b.id, 100, 350),
  ]);
  const [first, second] = await Promise.all([
    recordMove(a, cell, 2, true, false),
    recordMove(b, cell, 3, true, false),
  ]);
  assert.equal(first.activeMs, a.activeMs! + 150);
  assert.equal(second.activeMs, b.activeMs! + 250);
  assert.deepEqual(first.moves.slice(0, 4), a.moves);
  assert.deepEqual(second.moves.slice(0, 6), b.moves);
  assert.deepEqual(await getAttempt(a.id), first);
  assert.deepEqual(await getAttempt(b.id), second);
  assert.equal((await listAttemptSummaries(a.puzzleId))[0].moveCount, 5);
});

test('cold reconstruction rejects missing or noncontiguous durable move records without changing metadata', async () => {
  const source = makeAttempt(3, 407),
    puzzle = makePuzzle(407);
  await seedCurrent(puzzle, source);
  await getAttempt(source.id);
  const db = await open();
  const tx = db.transaction('attemptMoves', 'readwrite');
  tx.objectStore('attemptMoves').delete([source.id, 1]);
  await committed(tx);
  db.close();
  forgetHistory();
  const before = await raw(source.id);
  await assert.rejects(getAttempt(source.id), /incomplete/);
  await assert.rejects(recordMove(source, cell, 2, true, false), /incomplete/);
  assert.deepEqual(await raw(source.id), before);
  const repair = await open();
  const misplaced = repair.transaction('attemptMoves', 'readwrite');
  misplaced
    .objectStore('attemptMoves')
    .add({ attemptId: source.id, index: 100, move: source.moves[1] });
  await committed(misplaced);
  repair.close();
  await assert.rejects(getAttempt(source.id), /out of order/);
  await assert.rejects(listAttempts(source.puzzleId), /out of order/);
});
