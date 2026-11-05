import assert from 'node:assert/strict';
import test from 'node:test';
import {
  attemptStatistics,
  continueAttempt,
  entryProgress,
  previewAttempt,
} from '../lib/collection-model';
import type { AttemptSummary } from '../lib/storage-records';

function attempt(id: string, startedAt: number, complete = false): AttemptSummary {
  return {
    id,
    puzzleId: 'puzzle',
    startedAt,
    completedAt: complete ? startedAt : null,
    durationMs: complete ? 0 : null,
    moveCount: 0,
  };
}

test('continue and preview prefer newest unfinished attempts, with deterministic ties', () => {
  const attempts = [
    attempt('z', 1),
    attempt('complete', 5, true),
    attempt('b', 3),
    attempt('a', 3),
  ];
  const original = attempts.map((item) => item.id);
  assert.equal(continueAttempt(attempts)?.id, 'a');
  assert.equal(previewAttempt(attempts)?.id, 'a');
  assert.deepEqual(
    attempts.map((item) => item.id),
    original,
  );
  assert.equal(continueAttempt([attempt('complete', 5, true)]), undefined);
  assert.equal(previewAttempt([attempt('old', 1, true), attempt('new', 2, true)])?.id, 'new');
  assert.equal(previewAttempt([]), undefined);
});

test('progress counts only filled originally empty cells, not clues or notes', () => {
  const clues = Array(81).fill(0);
  clues[0] = 8;
  const board = [...clues];
  board[1] = 2;
  assert.deepEqual(entryProgress(clues, board), { filled: 1, total: 80 });
  assert.deepEqual(entryProgress(Array(81).fill(1), Array(81).fill(1)), { filled: 0, total: 0 });
});

test('statistics retain zero completed times and sum only supplied recorded durations', () => {
  assert.deepEqual(attemptStatistics([]), {
    attemptCount: 0,
    completedCount: 0,
    bestMs: null,
    totalMs: 0,
  });
  assert.deepEqual(
    attemptStatistics([
      { completedAt: 1, elapsedMs: 0 },
      { completedAt: 2, elapsedMs: 5000 },
      { completedAt: null, elapsedMs: 9000 },
    ]),
    { attemptCount: 3, completedCount: 2, bestMs: 0, totalMs: 14000 },
  );
  assert.equal(attemptStatistics([{ completedAt: null, elapsedMs: 0 }]).bestMs, null);
  assert.deepEqual(
    attemptStatistics([
      { completedAt: 1, elapsedMs: null },
      { completedAt: 2, elapsedMs: 5000 },
    ]),
    { attemptCount: 2, completedCount: 2, bestMs: null, totalMs: null },
  );
});
