import { getGameEngine } from './game-engine';
import { decodeSharedPuzzle } from './sharing';
import { randomName, type Puzzle, type Attempt, type Position } from './attempts';
import { emptyBoard, type Board } from './sudoku';
import { solveCached } from './solver-client';
import {
  mergeTimer,
  putAttempt,
  putAttemptMetadata,
  putPuzzle,
  upgradeStorage,
  type ActiveTimer as StoredActiveTimer,
  type AttemptSummary as StoredAttemptSummary,
  type PuzzleSummary as StoredPuzzleSummary,
  type TimerRecord,
} from './storage-records';
import {
  appendAttempt,
  forgetAttempt,
  forgetHistory,
  moveRange,
  readAttemptHistory,
  rememberAttempt,
  type AttemptHeader,
  type StoredMove,
} from './storage-history';
export type ActiveTimer = StoredActiveTimer;
export type AttemptSummary = StoredAttemptSummary;
export type PuzzleSummary = StoredPuzzleSummary;
export type AttemptPresentation = AttemptSummary & {
  position: Position;
  // Recorded active time; null only when a completed duration is unavailable.
  elapsedMs: number | null;
};
let connection: Promise<IDBDatabase> | undefined;
function database() {
  if (connection) return connection;
  connection = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('sudoku-local', 3);
    let blocked = false;
    request.onupgradeneeded = (event) => {
      upgradeStorage(request.result, request.transaction!, event.oldVersion);
    };
    request.onerror = () => reject(request.error ?? new Error('Could not open local storage.'));
    request.onblocked = () => {
      blocked = true;
      reject(new Error('Close other Sudoku tabs, then reload to open storage.'));
    };
    request.onsuccess = () => {
      const db = request.result;
      if (blocked) {
        db.close();
        return;
      }
      db.onversionchange = () => {
        db.close();
        connection = undefined;
        forgetHistory();
      };
      resolve(db);
    };
  }).catch((error) => {
    connection = undefined;
    throw error;
  });
  return connection;
}
async function readAll<T>(name: string, puzzleId?: string): Promise<T[]> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(name, 'readonly'),
      store = tx.objectStore(name),
      request = puzzleId === undefined ? store.getAll() : store.index('puzzleId').getAll(puzzleId);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function listPuzzles() {
  return (await readAll<Puzzle>('puzzles')).sort((a, b) => b.createdAt - a.createdAt);
}
export async function listAttempts(puzzleId?: string) {
  const db = await database();
  return new Promise<Attempt[]>((resolve, reject) => {
    const tx = db.transaction(['attempts', 'attemptMoves', 'timers'], 'readonly');
    const store = tx.objectStore('attempts');
    const request =
      puzzleId === undefined ? store.getAll() : store.index('puzzleId').getAll(puzzleId);
    const results: Attempt[] = [];
    let error: Error | undefined;
    request.onsuccess = () => {
      for (const header of request.result as AttemptHeader[]) {
        readAttemptHistory(
          tx,
          header,
          (attempt) => {
            const timer = tx.objectStore('timers').get(attempt.id);
            timer.onsuccess = () => {
              results.push(
                publicAttempt(mergeTimer(attempt, timer.result as TimerRecord | undefined)),
              );
            };
          },
          (cause) => {
            error = cause;
            tx.abort();
          },
        );
      }
    };
    tx.oncomplete = () => resolve(results.sort((a, b) => b.startedAt - a.startedAt));
    tx.onabort = () => reject(error ?? tx.error);
  });
}
async function readById<T>(store: string, id: string): Promise<T | undefined> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction(store).objectStore(store).get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export function getPuzzle(id: string): Promise<Puzzle | undefined> {
  return readById<Puzzle>('puzzles', id);
}
export function getPuzzleSummary(id: string): Promise<PuzzleSummary | undefined> {
  return readById<PuzzleSummary>('puzzleSummaries', id);
}
function publicAttempt(attempt: Attempt): Attempt {
  return { ...attempt, moves: attempt.moves.slice() };
}
export async function getAttempt(id: string): Promise<Attempt | undefined> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['attempts', 'attemptMoves', 'timers']);
    const header = tx.objectStore('attempts').get(id);
    const timer = tx.objectStore('timers').get(id);
    let attempt: Attempt | undefined;
    let error: Error | undefined;
    header.onsuccess = () => {
      if (!header.result) return;
      readAttemptHistory(
        tx,
        header.result as AttemptHeader,
        (value) => {
          attempt = value;
        },
        (cause) => {
          error = cause;
          tx.abort();
        },
      );
    };
    tx.oncomplete = () => {
      if (attempt) rememberAttempt(header.result as AttemptHeader, attempt);
      resolve(
        attempt
          ? publicAttempt(mergeTimer(attempt, timer.result as TimerRecord | undefined))
          : undefined,
      );
    };
    tx.onabort = () => reject(error ?? tx.error);
  });
}
export async function listPuzzleSummaries(): Promise<PuzzleSummary[]> {
  return (await readAll<PuzzleSummary>('puzzleSummaries')).sort(
    (a, b) => b.createdAt - a.createdAt,
  );
}
export async function listAttemptSummaries(puzzleId?: string): Promise<AttemptSummary[]> {
  return (await readAll<AttemptSummary>('attemptSummaries', puzzleId)).sort(
    (a, b) => b.startedAt - a.startedAt,
  );
}
// Reads only the requested headers, timers, and final positions, never histories or photos.
// Missing attempts/moves reject; missing timers use recorded time, not wall-clock gaps.
export async function listAttemptPresentations(
  ids: readonly string[],
): Promise<readonly AttemptPresentation[]> {
  const selected = [...new Set(ids)];
  if (!selected.length) return [];
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['attempts', 'attemptMoves', 'timers'], 'readonly');
    const results = new Map<string, AttemptPresentation>();
    let error: Error | undefined;
    const fail = (cause: Error) => {
      error = cause;
      tx.abort();
    };
    for (const id of selected) {
      const headerRequest = tx.objectStore('attempts').get(id);
      const timerRequest = tx.objectStore('timers').get(id);
      headerRequest.onsuccess = transactionCallback(fail, () => {
        const header = headerRequest.result as AttemptHeader | undefined;
        if (!header) throw new Error(`Saved attempt is unavailable: ${id}.`);
        if (!Number.isSafeInteger(header.moveCount) || header.moveCount < 0)
          throw new Error('Saved attempt header is invalid.');
        let last: StoredMove | undefined;
        const project = () => {
          const timer = timerRequest.result as TimerRecord | undefined;
          const position = last ? last.move.position : header.initial;
          const elapsedMs =
            header.completedAt !== null
              ? (header.durationMs ?? timer?.durationMs ?? null)
              : (timer?.activeMs ??
                header.activeMs ??
                timer?.fallbackMs ??
                last?.move.elapsedMs ??
                0);
          results.set(id, {
            id: header.id,
            puzzleId: header.puzzleId,
            startedAt: header.startedAt,
            completedAt: header.completedAt,
            durationMs: header.durationMs,
            moveCount: header.moveCount,
            position,
            elapsedMs,
          });
        };
        // Timer requests precede the dependent final-move read in this transaction.
        if (header.moveCount === 0) {
          timerRequest.onsuccess = transactionCallback(fail, project);
          return;
        }
        const move = tx.objectStore('attemptMoves').get([id, header.moveCount - 1]);
        move.onsuccess = transactionCallback(fail, () => {
          last = move.result as StoredMove | undefined;
          if (
            !last ||
            last.attemptId !== id ||
            last.index !== header.moveCount - 1 ||
            !last.move?.position
          )
            throw new Error('Saved attempt history is incomplete.');
          project();
        });
      });
    }
    tx.oncomplete = () => resolve(selected.map((id) => results.get(id)!));
    tx.onabort = () => reject(error ?? tx.error ?? new Error('Could not read saved attempts.'));
  });
}
function transactionCallback(fail: (error: Error) => void, operation: () => void) {
  return () => {
    try {
      operation();
    } catch (error) {
      fail(error instanceof Error ? error : new Error('Could not save. Please try again.'));
    }
  };
}
// Resolve writes only after transaction completion; never present unsaved moves as saved.
async function write<T>(
  stores: string[],
  operation: (
    tx: IDBTransaction,
    done: (
      value: T,
      hooks?: {
        commit(): void;
        discard(): void;
        recover(): Promise<T>;
      },
    ) => void,
    fail: (error: Error) => void,
  ) => void,
): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const scope = new Set(stores);
    if (scope.has('puzzles')) scope.add('puzzleSummaries');
    if (scope.has('attempts')) {
      scope.add('attemptMoves');
      scope.add('attemptSummaries');
      scope.add('timers');
    }
    const tx = db.transaction([...scope], 'readwrite');
    let value: T;
    let error: Error | undefined;
    let hooks: { commit(): void; discard(): void; recover(): Promise<T> } | undefined;
    tx.oncomplete = () => {
      try {
        hooks?.commit();
        resolve(value);
      } catch (error) {
        console.error(
          'Engine acceptance failed after persistence; reloading committed state.',
          error,
        );
        // Persistence already won. Never retry the command or substitute another engine.
        if (hooks) hooks.recover().then(resolve, reject);
        else reject(error);
      }
    };
    tx.onabort = () => {
      hooks?.discard();
      reject(
        error ?? tx.error ?? new Error('Could not save. Local storage may be full or unavailable.'),
      );
    };
    tx.onerror = () => {};
    const fail = (e: Error) => {
      error = e;
      tx.abort();
    };
    try {
      operation(
        tx,
        (v, lifecycle) => {
          value = v;
          hooks = lifecycle;
        },
        fail,
      );
    } catch (e) {
      fail(e instanceof Error ? e : new Error('Could not save.'));
    }
  });
}
export async function createPuzzle(
  clues: Board = emptyBoard(),
  image?: Blob,
  uncertain: number[] = [],
  options: { signal?: AbortSignal } = {},
): Promise<Puzzle> {
  const now = Date.now(),
    puzzle: Puzzle = {
      id: crypto.randomUUID(),
      name: randomName(),
      createdAt: now,
      updatedAt: now,
      clues: clues.slice(),
      status: 'draft',
      image,
      uncertain,
      revision: 0,
    };
  return write(['puzzles'], (tx, done, fail) => {
    const { signal } = options;
    signal?.throwIfAborted();
    const cancel = () => {
      try {
        fail(new DOMException('Photo processing cancelled.', 'AbortError'));
      } catch (error) {
        // A completed transaction wins a cancellation arriving before its callback.
        if (!(error instanceof DOMException && error.name === 'InvalidStateError')) throw error;
      }
    };
    signal?.addEventListener('abort', cancel, { once: true });
    const cleanup = () => signal?.removeEventListener('abort', cancel);
    tx.addEventListener('complete', cleanup, { once: true });
    tx.addEventListener('abort', cleanup, { once: true });
    putPuzzle(tx, puzzle);
    done(puzzle);
  });
}
export async function saveDraft(
  puzzle: Puzzle,
  clues: Board,
  uncertain: number[],
): Promise<Puzzle> {
  return write(['puzzles'], (tx, done, fail) => {
    const store = tx.objectStore('puzzles'),
      request = store.get(puzzle.id);
    request.onsuccess = transactionCallback(fail, () => {
      const current = request.result as Puzzle | undefined;
      if (!current || current.status !== 'draft' || current.revision !== puzzle.revision) {
        fail(new Error('This puzzle changed in another tab. Reload to see its latest state.'));
        return;
      }
      const updated = {
        ...current,
        clues: clues.slice(),
        uncertain,
        updatedAt: Date.now(),
        revision: current.revision + 1,
      };
      putPuzzle(tx, updated);
      done(updated);
    });
  });
}
export async function startAttempt(puzzle: Puzzle): Promise<{ puzzle: Puzzle; attempt: Attempt }> {
  const engine = await getGameEngine();
  if (puzzle.clues.filter(Boolean).length < 17)
    throw new Error('Add at least 17 clues before starting.');
  if (puzzle.clues.every(Boolean))
    throw new Error('Leave the unprinted cells empty so there is a puzzle to play.');
  const result = await solveCached(puzzle.clues);
  if (result.count !== 1)
    throw new Error(
      result.count === 0
        ? 'These clues conflict or cannot form a solved Sudoku. Please check them.'
        : 'This puzzle has more than one solution. Please check for missing clues.',
    );
  return write(['puzzles', 'attempts'], (tx, done, fail) => {
    const store = tx.objectStore('puzzles'),
      request = store.get(puzzle.id);
    request.onsuccess = transactionCallback(fail, () => {
      const current = request.result as Puzzle | undefined;
      if (!current || current.revision !== puzzle.revision) {
        fail(new Error('This puzzle changed in another tab. Reload to continue.'));
        return;
      }
      const { puzzle: ready, attempt } = engine.start(current, crypto.randomUUID(), Date.now());
      putPuzzle(tx, ready);
      putAttempt(tx, attempt);
      done({ puzzle: ready, attempt });
    });
  });
}
export async function recordMove(
  attempt: Attempt,
  cell: number,
  value: number,
  note: boolean,
  check: boolean,
  undo = false,
): Promise<Attempt> {
  const engine = await getGameEngine();
  const precomputedPuzzle = undo
    ? undefined
    : await readById<PuzzleSummary>('puzzleSummaries', attempt.puzzleId);
  const solution = precomputedPuzzle ? (await solveCached(precomputedPuzzle.clues)).solution : null;
  return write(['puzzleSummaries', 'attempts'], (tx, done, fail) => {
    const store = tx.objectStore('attempts'),
      request = store.get(attempt.id);
    request.onsuccess = () => {
      const header = request.result as AttemptHeader | undefined;
      if (!header || header.revision !== attempt.revision) {
        fail(
          new Error(
            'This attempt changed in another tab. Reload to continue without overwriting it.',
          ),
        );
        return;
      }
      if (header.completedAt !== null) {
        fail(new Error('Completed attempts are read-only.'));
        return;
      }
      readAttemptHistory(
        tx,
        header,
        (current) => {
          const getPuzzle = tx.objectStore('puzzleSummaries').get(current.puzzleId);
          getPuzzle.onsuccess = () => {
            try {
              const puzzle = getPuzzle.result as Puzzle | undefined;
              if (!puzzle || puzzle.status !== 'ready') throw new Error('Puzzle is unavailable.');
              if (
                !undo &&
                (!precomputedPuzzle ||
                  puzzle.id !== precomputedPuzzle.id ||
                  puzzle.revision !== precomputedPuzzle.revision)
              )
                throw new Error('This puzzle changed in another tab. Reload to continue.');
              if (!undo && !solution) throw new Error('Invalid puzzle.');
              const timer = tx.objectStore('timers').get(current.id);
              timer.onsuccess = () => {
                try {
                  const merged = mergeTimer(current, timer.result as TimerRecord | undefined);
                  const prepared = engine.prepare(puzzle, merged, solution, {
                    cell,
                    value,
                    note,
                    check,
                    undo,
                    at: Date.now(),
                  });
                  // Register disposal before issuing writes, which can throw synchronously.
                  let saved: { header: AttemptHeader; attempt: Attempt } | undefined;
                  const lifecycle = {
                    commit() {
                      try {
                        prepared.commit();
                        rememberAttempt(saved?.header ?? header, saved?.attempt ?? current);
                      } catch (error) {
                        forgetAttempt(current.id);
                        throw error;
                      }
                    },
                    discard() {
                      prepared.discard();
                    },
                    async recover() {
                      try {
                        const committed = await getAttempt(current.id);
                        if (!committed) throw new Error('Saved attempt is unavailable.');
                        return committed;
                      } catch (cause) {
                        throw new Error(
                          'The move was saved, but its state could not be reloaded. Reload before continuing.',
                          { cause },
                        );
                      }
                    },
                  };
                  done(prepared.attempt, lifecycle);
                  if (prepared.attempt !== merged) {
                    saved = appendAttempt(tx, merged, prepared.attempt);
                    putAttemptMetadata(tx, saved.attempt, saved.header);
                  }
                  done(publicAttempt(saved?.attempt ?? prepared.attempt), lifecycle);
                } catch (error) {
                  fail(error instanceof Error ? error : new Error('Could not save move.'));
                }
              };
            } catch (error) {
              fail(error instanceof Error ? error : new Error('Could not save move.'));
            }
          };
        },
        fail,
      );
    };
  });
}

export async function renamePuzzle(puzzle: Puzzle, input: string): Promise<Puzzle> {
  const name = input.trim().replace(/\s+/g, ' ');
  if (!name || name.length > 80) throw new Error('Use a puzzle name between 1 and 80 characters.');
  return write(['puzzles'], (tx, done, fail) => {
    const store = tx.objectStore('puzzles'),
      request = store.get(puzzle.id);
    request.onsuccess = transactionCallback(fail, () => {
      const current = request.result as Puzzle | undefined;
      if (!current || current.revision !== puzzle.revision) {
        fail(new Error('This puzzle changed in another tab. Reload before renaming it.'));
        return;
      }
      const updated = { ...current, name, updatedAt: Date.now(), revision: current.revision + 1 };
      putPuzzle(tx, updated);
      done(updated);
    });
  });
}

// Serialized read/write transactions make repeated imports idempotent, including
// React Strict Mode remounts and concurrent tabs.
export async function importSharedPuzzle(encoded: string, name: string | null): Promise<Puzzle> {
  const shared = decodeSharedPuzzle(encoded, name);
  return write(['puzzles'], (tx, done, fail) => {
    const store = tx.objectStore('puzzles');
    const request = tx.objectStore('puzzleSummaries').getAll();
    request.onsuccess = transactionCallback(fail, () => {
      const existing = (request.result as Puzzle[]).find(
        (p) => p.shareKey === shared.shareKey || p.shareKey === shared.legacyShareKey,
      );
      if (existing) {
        const full = store.get(existing.id);
        full.onsuccess = () => done(full.result as Puzzle);
        return;
      }
      const now = Date.now();
      const puzzle: Puzzle = {
        id: crypto.randomUUID(),
        name: shared.name,
        clues: shared.clues,
        createdAt: now,
        updatedAt: now,
        status: 'draft',
        uncertain: [],
        revision: 0,
        shareKey: shared.shareKey,
      };
      putPuzzle(tx, puzzle);
      done(puzzle);
    });
  });
}

export async function removePuzzle(puzzle: Puzzle): Promise<void> {
  return write(['puzzles', 'attempts'], (tx, done, fail) => {
    const store = tx.objectStore('puzzles');
    const request = store.get(puzzle.id);
    request.onsuccess = transactionCallback(fail, () => {
      const current = request.result as Puzzle | undefined;
      if (current && current.revision !== puzzle.revision) {
        fail(new Error('This puzzle changed in another tab. Reload before removing it.'));
        return;
      }
      store.delete(puzzle.id);
      tx.objectStore('puzzleSummaries').delete(puzzle.id);
      const cursorRequest = tx
        .objectStore('attempts')
        .index('puzzleId')
        .openCursor(IDBKeyRange.only(puzzle.id));
      cursorRequest.onsuccess = transactionCallback(fail, () => {
        const cursor = cursorRequest.result;
        if (cursor) {
          tx.objectStore('timers').delete(cursor.primaryKey);
          tx.objectStore('attemptSummaries').delete(cursor.primaryKey);
          tx.objectStore('attemptMoves').delete(moveRange(String(cursor.primaryKey)));
          const id = String(cursor.primaryKey);
          tx.addEventListener('complete', () => forgetAttempt(id), { once: true });
          cursor.delete();
          cursor.continue();
        } else done(undefined);
      });
    });
  });
}

export async function saveActiveInterval(
  id: string,
  start: number,
  end: number,
): Promise<ActiveTimer | null> {
  return write(['timers'], (tx, done, fail) => {
    const store = tx.objectStore('timers'),
      request = store.get(id);
    request.onsuccess = () => {
      const current = request.result as TimerRecord | undefined;
      if (!current) {
        done(null);
        return;
      }
      try {
        if (
          current.completedAt === null &&
          (!Number.isFinite(start) || !Number.isFinite(end) || end < start)
        )
          throw new Error('Invalid active interval.');
        const updated =
          current.completedAt !== null
            ? current
            : {
                ...current,
                activeMs:
                  (current.activeMs ?? current.fallbackMs) +
                  Math.max(0, end - Math.max(start, current.lastActiveEnd ?? start)),
                lastActiveEnd: Math.max(end, current.lastActiveEnd ?? end),
              };
        if (updated !== current) store.put(updated);
        done({
          completedAt: updated.completedAt,
          durationMs: updated.durationMs,
          activeMs: updated.activeMs ?? updated.fallbackMs,
          ...(updated.lastActiveEnd === undefined ? {} : { lastActiveEnd: updated.lastActiveEnd }),
        });
      } catch (error) {
        fail(error instanceof Error ? error : new Error('Could not save timer.'));
      }
    };
  });
}

export function undoLastMove(attempt: Attempt): Promise<Attempt> {
  return recordMove(attempt, 0, 0, false, false, true);
}
