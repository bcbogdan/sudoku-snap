import {
  activeDuration,
  applyMove,
  applyUndo,
  initialPosition,
  type Attempt,
  type Puzzle,
} from './attempts';
import { initializeCoreWasm, type CoreSession, type CoreWasm } from './core-wasm';
import type { PuzzleRecord, WasmBindings } from './core-wasm-types';
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
  prepare(
    puzzle: PuzzleRecord,
    attempt: Attempt,
    solution: Board | null,
    input: MoveInput,
  ): PreparedMove;
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

// Blob photos stay entirely in the host. Include every core-visible puzzle field.
function corePuzzle(puzzle: PuzzleRecord): PuzzleRecord {
  return {
    id: puzzle.id,
    name: puzzle.name,
    createdAt: puzzle.createdAt,
    updatedAt: puzzle.updatedAt,
    clues: puzzle.clues,
    status: puzzle.status,
    uncertain: puzzle.uncertain,
    revision: puzzle.revision,
    ...(puzzle.shareKey === undefined ? {} : { shareKey: puzzle.shareKey }),
  };
}

export function createWasmEngine(core: CoreWasm): GameEngine {
  // One resident attempt bounds memory. Full identity catches timer writes without a revision bump.
  let resident: { identity: string; session: CoreSession } | undefined;
  const invalidate = () => {
    resident?.session.free();
    resident = undefined;
  };
  const identity = (puzzle: PuzzleRecord, attempt: Attempt) => JSON.stringify([puzzle, attempt]);
  return {
    prepare(puzzle, attempt, _solution, input) {
      const record = corePuzzle(puzzle);
      const key = identity(record, attempt);
      if (resident?.identity !== key) {
        invalidate();
        resident = { identity: key, session: core.restore(record, attempt) };
      }
      const session = resident!.session;
      const command = input.undo
        ? { kind: 'undo' as const }
        : input.note && input.value !== 0
          ? { kind: 'toggleNote' as const, cell: input.cell, value: input.value }
          : { kind: 'setEntry' as const, cell: input.cell, value: input.value, check: input.check };
      const candidate = session.prepare(command, { at: input.at, normalizeLegacyTime: true });
      try {
        const projection = candidate.project();
        const updated: Attempt = {
          ...projection.header,
          initial: attempt.initial,
          moves: projection.appendedMove
            ? [...attempt.moves, projection.appendedMove]
            : attempt.moves,
        };
        return {
          attempt: updated,
          commit() {
            try {
              session.accept(candidate);
              if (resident?.session === session) resident.identity = identity(record, updated);
            } catch (error) {
              if (resident?.session === session) invalidate();
              throw error;
            }
          },
          discard() {
            candidate.free();
          },
        };
      } catch (error) {
        candidate.free();
        throw error;
      }
    },
    start(puzzle, id, at) {
      // Existing ready puzzles can start another attempt without becoming drafts again.
      const ready =
        puzzle.status === 'draft'
          ? core.finalizePuzzle(corePuzzle(puzzle), at)
          : { ...corePuzzle(puzzle), updatedAt: at, revision: puzzle.revision + 1 };
      const session = core.create(ready, id, at);
      try {
        return { puzzle: { ...puzzle, ...ready }, attempt: session.exportRecord() };
      } finally {
        session.free();
      }
    },
  };
}

interface WebWasmBindings extends WasmBindings {
  default(): Promise<unknown>;
}

let engine: Promise<GameEngine> | undefined;
export function getGameEngine(): Promise<GameEngine> {
  // Fixed for the document lifetime. Explicit opt-in fails closed; never switch mid-command.
  return (engine ??=
    process.env.NEXT_PUBLIC_SUDOKU_ENGINE === 'wasm'
      ? initializeCoreWasm(async () => {
          // Native ESM keeps generated Rust artifacts out of the default Node/Next build graph.
          const moduleURL = '/core-wasm/sudoku_wasm.js';
          const bindings = (await import(/* webpackIgnore: true */ moduleURL)) as WebWasmBindings;
          await bindings.default();
          return bindings;
        })
          .then(createWasmEngine)
          .catch((cause: unknown) => {
            throw new Error(
              'Could not initialize the selected Wasm Sudoku engine. Reload after checking the Wasm build.',
              { cause },
            );
          })
      : Promise.resolve(createTypeScriptEngine()));
}
