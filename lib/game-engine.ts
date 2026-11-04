import {
  activeDuration,
  applyMove,
  applyUndo,
  initialPosition,
  type Attempt,
  type Puzzle,
} from './attempts';
import type { Board } from './sudoku';

export interface MoveInput {
  cell: number;
  value: number;
  note: boolean;
  check: boolean;
  undo: boolean;
  at: number;
}
export interface PreparedMove {
  attempt: Attempt;
  commit(): void;
  discard(): void;
}
export interface GameEngine {
  prepare(puzzle: Puzzle, attempt: Attempt, solution: Board | null, input: MoveInput): PreparedMove;
  start(puzzle: Puzzle, id: string, at: number): { puzzle: Puzzle; attempt: Attempt };
}

export function createTypeScriptEngine(): GameEngine {
  return {
    prepare(puzzle, attempt, solution, input) {
      const timed =
        attempt.activeMs === undefined
          ? { ...attempt, activeMs: activeDuration(attempt) }
          : attempt;
      if (!input.undo && !solution) throw new Error('Invalid puzzle.');
      const updated = input.undo
        ? applyUndo(timed, input.at)
        : applyMove(
            timed,
            puzzle.clues,
            solution!,
            input.cell,
            input.value,
            input.note,
            input.check,
            input.at,
          );
      return { attempt: updated, commit() {}, discard() {} };
    },
    start(puzzle, id, at) {
      return {
        puzzle: { ...puzzle, status: 'ready', updatedAt: at, revision: puzzle.revision + 1 },
        attempt: {
          id,
          puzzleId: puzzle.id,
          startedAt: at,
          completedAt: null,
          durationMs: null,
          activeMs: 0,
          initial: initialPosition(puzzle.clues),
          moves: [],
          revision: 0,
        },
      };
    },
  };
}

let engine: Promise<GameEngine> | undefined;
export function getGameEngine(): Promise<GameEngine> {
  return (engine ??= Promise.resolve(createTypeScriptEngine()));
}
