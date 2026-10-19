import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodePuzzle, decodeSharedPuzzle, puzzleShareURL } from '../lib/sharing';
import {
  importSharedPuzzle,
  listPuzzles,
  listAttempts,
  startAttempt,
  recordMove,
  removePuzzle,
  renamePuzzle,
} from '../lib/storage';
import clues from './fixtures/expected.json';

test('sharing round-trips original clues and Unicode names in p/n URL parameters', () => {
  const name = 'Weekend & café 🧩';
  const url = new URL(puzzleShareURL('https://sudoku.example', clues, name));
  assert.deepEqual([...url.searchParams.keys()], ['p', 'n']);
  assert.equal(url.searchParams.get('n'), name);
  assert.deepEqual(
    decodeSharedPuzzle(url.searchParams.get('p')!, url.searchParams.get('n')).clues,
    clues,
  );
  assert.equal(url.origin, 'https://sudoku.example');
});
test('malformed encodings, conflicting clues and invalid names are rejected without importing', async () => {
  const before = (await listPuzzles()).length;
  for (const encoded of ['bad', 'A'.repeat(108), 'a'.repeat(109), btoa('1'.repeat(81))]) {
    await assert.rejects(importSharedPuzzle(encoded, 'Bad puzzle'));
  }
  await assert.rejects(importSharedPuzzle(encodePuzzle(clues), 'x'.repeat(81)));
  await assert.rejects(importSharedPuzzle(encodePuzzle(clues), ' '));
  assert.equal((await listPuzzles()).length, before);
});
test('repeated and concurrent shared imports create a single local draft and preserve progress', async () => {
  const encoded = encodePuzzle(clues);
  const [a, b] = await Promise.all([
    importSharedPuzzle(encoded, 'Repeated import'),
    importSharedPuzzle(encoded, 'Repeated import'),
  ]);
  assert.equal(a.id, b.id);
  assert.equal(a.status, 'draft');
  assert.deepEqual(a.clues, clues);
  assert.equal(a.image, undefined);
  const started = await startAttempt(a);
  const moved = await recordMove(started.attempt, 0, 1, true, true);
  const reopened = await importSharedPuzzle(encoded, 'Repeated import');
  assert.equal(reopened.id, a.id);
  assert.equal(reopened.status, 'ready');
  assert.deepEqual((await listAttempts(a.id))[0], moved);
});
test('removing a puzzle deletes its attempts atomically and leaves other puzzles intact', async () => {
  const p = await importSharedPuzzle(encodePuzzle(clues), 'Remove test');
  const first = await startAttempt(p);
  const second = await startAttempt(first.puzzle);
  const other = await importSharedPuzzle(encodePuzzle(clues), 'Keep test');
  const otherAttempt = await startAttempt(other);
  await removePuzzle(second.puzzle);
  assert.equal(
    (await listPuzzles()).some((x) => x.id === p.id),
    false,
  );
  assert.equal((await listAttempts(p.id)).length, 0);
  assert.deepEqual((await listAttempts(other.id))[0], otherAttempt.attempt);
  await assert.rejects(recordMove(second.attempt, 0, 1, false, true));
  const importedAgain = await importSharedPuzzle(encodePuzzle(clues), 'Remove test');
  assert.notEqual(importedAgain.id, p.id);
});
test('stale deletion is rejected after a concurrent rename', async () => {
  const p = await importSharedPuzzle(encodePuzzle(clues), 'Stale deletion');
  const renamed = await renamePuzzle(p, 'New name');
  await assert.rejects(removePuzzle(p), /another tab/);
  assert.ok((await listPuzzles()).some((x) => x.id === renamed.id));
});

test('compact encoding preserves empty cells and stays below 48 characters', () => {
  for (const board of [
    Array(81).fill(0),
    clues,
    ...clues.map((_, i) => clues.map((v, j) => (j <= i ? v : 0))),
  ]) {
    const encoded = encodePuzzle(board);
    assert.ok(encoded.length <= 47);
    assert.deepEqual(decodeSharedPuzzle(encoded, 'Test').clues, board);
  }
  assert.equal(encodePuzzle(Array(81).fill(0)), '1.A');
});
test('old and compact links identify the same local import', async () => {
  const legacy = btoa(clues.join(''));
  assert.deepEqual(decodeSharedPuzzle(legacy, 'Legacy').clues, clues);
  const old = await importSharedPuzzle(legacy, 'Legacy');
  assert.equal((await importSharedPuzzle(encodePuzzle(clues), 'Legacy')).id, old.id);
  // Simulate a record saved by the released legacy decoder, before this update.
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('sudoku-local');
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(['puzzles', 'puzzleSummaries'], 'readwrite');
      const record = { ...old, shareKey: JSON.stringify([legacy, 'Legacy']) };
      tx.objectStore('puzzles').put(record);
      const { image: _image, ...summary } = record;
      tx.objectStore('puzzleSummaries').put(summary);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onabort = () => reject(tx.error);
    };
    request.onerror = () => reject(request.error);
  });
  assert.equal((await importSharedPuzzle(encodePuzzle(clues), 'Legacy')).id, old.id);
});
test('oversized and malformed packed values are rejected', () => {
  for (const value of ['1.', '1.!', '2.A', '1.' + '_'.repeat(45), '1.' + 'A'.repeat(46)])
    assert.throws(() => decodeSharedPuzzle(value, 'Bad'));
});

test('version 1 has a fixed compatibility fixture, independent of future encoder changes', () => {
  const v1 = '1.0akS0sxwaXMmYqtPti1q5e7ZJ9-YjpNO4bMSutV3xA';
  assert.deepEqual(decodeSharedPuzzle(v1, 'Compatibility fixture').clues, clues);
  assert.equal(encodePuzzle(clues), v1);
});
