import expected from '../tests/fixtures/expected.json';
import { initialPosition, type Attempt, type Puzzle } from '../lib/attempts';

export const fixtureVersion = 'baseline-v1';
export const histories = [0, 100, 1000, 10000];
export const clues = expected;
export const solution = [
  8, 6, 3, 1, 4, 5, 9, 2, 7, 5, 9, 7, 8, 2, 6, 4, 3, 1, 2, 4, 1, 9, 7, 3, 8, 6, 5, 9, 7, 4, 5, 3, 1,
  2, 8, 6, 3, 5, 2, 6, 8, 4, 7, 1, 9, 1, 8, 6, 7, 9, 2, 5, 4, 3, 4, 2, 9, 3, 1, 7, 6, 5, 8, 6, 1, 8,
  2, 5, 9, 3, 7, 4, 7, 3, 5, 4, 6, 8, 1, 9, 2,
];
export const encodedClues = '1.0akS0sxwaXMmYqtPti1q5e7ZJ9-YjpNO4bMSutV3xA';
export const cell = clues.indexOf(0);
export const epoch = 1700000000000;

// Linear setup with distinct snapshots, avoiding quadratic applyMove setup and
// structured-clone alias deduplication that would understate stored histories.
export function makeAttempt(length: number, id = 0): Attempt {
  return {
    id: `attempt-${id}`,
    puzzleId: `puzzle-${id}`,
    startedAt: epoch,
    completedAt: null,
    durationMs: null,
    activeMs: length * 100,
    initial: initialPosition(clues),
    revision: length,
    moves: Array.from({ length }, (_, i) => {
      const position = initialPosition(clues);
      position.board[cell] = i % 2 === 0 ? solution[cell] : 0;
      return {
        cell,
        kind: 'entry' as const,
        value: position.board[cell],
        at: epoch + i * 100,
        elapsedMs: i * 100,
        position,
      };
    }),
  };
}

export function makePuzzle(id: number): Puzzle {
  return {
    id: `puzzle-${id}`,
    name: `Benchmark ${id}`,
    createdAt: epoch + id,
    updatedAt: epoch,
    clues: clues.slice(),
    status: 'ready',
    uncertain: [],
    revision: 0,
  };
}
