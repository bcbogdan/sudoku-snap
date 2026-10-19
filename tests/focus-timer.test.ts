import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FocusClock } from '../lib/focus-clock';
import { activeDuration, addActiveInterval, initialPosition, type Attempt } from '../lib/attempts';
import {
  createPuzzle,
  getAttempt,
  startAttempt,
  saveActiveInterval,
  listAttempts,
  recordMove,
  removePuzzle,
} from '../lib/storage';
import { solve } from '../lib/sudoku';
import clues from './fixtures/expected.json';

test('clock counts focused slices and excludes blur, hidden time and closed-page gaps', () => {
  const clock = new FocusClock();
  assert.equal(clock.checkpoint(1000), null);
  assert.equal(clock.setFocused(true, 2000), null);
  assert.deepEqual(clock.checkpoint(3000), { start: 2000, end: 3000 });
  assert.deepEqual(clock.setFocused(false, 3500), { start: 3000, end: 3500 });
  assert.equal(clock.checkpoint(90000), null);
  assert.equal(clock.setFocused(false, 100000), null);
  assert.equal(clock.setFocused(true, 110000), null);
  assert.deepEqual(clock.setFocused(true, 111000), { start: 110000, end: 111000 });
  assert.deepEqual(clock.setFocused(false, 111500), { start: 111000, end: 111500 });
  assert.equal(new FocusClock().checkpoint(200000), null);
});

test('legacy attempts retain their last recorded time without charging time since their last move', () => {
  const legacy: Attempt = {
    id: 'legacy',
    puzzleId: 'p',
    startedAt: 1000,
    completedAt: null,
    durationMs: null,
    initial: initialPosition(clues),
    revision: 1,
    moves: [
      {
        cell: 0,
        kind: 'entry',
        value: 8,
        at: 6000,
        elapsedMs: 5000,
        position: initialPosition(clues),
      },
    ],
  };
  assert.equal(activeDuration(legacy), 5000);
  assert.equal(activeDuration(addActiveInterval(legacy, 100000, 101000)), 6000);
  const completed = { ...legacy, completedAt: 6000, durationMs: 5000 };
  assert.equal(addActiveInterval(completed, 100000, 101000), completed);
});

test('stored focused time survives reloads, ignores overlapping saves and timestamps moves', async () => {
  const puzzle = await createPuzzle(clues);
  const { attempt, puzzle: ready } = await startAttempt(puzzle);
  const start = attempt.startedAt;
  await saveActiveInterval(attempt.id, start, start + 1000);
  await saveActiveInterval(attempt.id, start + 500, start + 1500);
  await saveActiveInterval(attempt.id, start, start + 1000);
  const reloaded = (await listAttempts(puzzle.id))[0];
  assert.equal(activeDuration(reloaded), 1500);
  assert.equal(reloaded.revision, attempt.revision);
  await saveActiveInterval(attempt.id, start + 100000, start + 101000);
  const moved = await recordMove(attempt, 0, 1, true, true);
  assert.equal(moved.moves[0].elapsedMs, 2500);
  assert.equal(activeDuration(moved), 2500);
  await assert.rejects(
    saveActiveInterval(attempt.id, start + 10, start),
    /Invalid active interval/,
  );
  assert.equal(activeDuration((await listAttempts(puzzle.id))[0]), 2500);
});

test('completion freezes focused duration and late checkpoints cannot recreate removed attempts', async () => {
  const solution = solve(clues).solution!;
  const almost = solution.slice();
  almost[0] = 0;
  const puzzle = await createPuzzle(almost);
  const { attempt, puzzle: ready } = await startAttempt(puzzle);
  await saveActiveInterval(attempt.id, attempt.startedAt, attempt.startedAt + 2500);
  const completed = await recordMove(attempt, 0, solution[0], false, true);
  assert.equal(completed.durationMs, 2500);
  assert.equal(completed.moves[0].elapsedMs, 2500);
  assert.deepEqual(
    await saveActiveInterval(attempt.id, attempt.startedAt + 2500, attempt.startedAt + 5000),
    {
      completedAt: completed.completedAt,
      durationMs: completed.durationMs,
      activeMs: completed.activeMs,
      lastActiveEnd: completed.lastActiveEnd,
    },
  );
  assert.deepEqual(await getAttempt(attempt.id), completed);
  await removePuzzle(ready);
  assert.equal(await saveActiveInterval(attempt.id, 100000, 101000), null);
  assert.deepEqual(await listAttempts(puzzle.id), []);
});
