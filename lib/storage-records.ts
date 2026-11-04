import { activeDuration, type Attempt, type Puzzle } from './attempts';
import { attemptHeader, type AttemptHeader, type StoredMove } from './storage-history';

export type PuzzleSummary = Omit<Puzzle, 'image'>;
export type AttemptSummary = Pick<
  Attempt,
  'id' | 'puzzleId' | 'startedAt' | 'completedAt' | 'durationMs'
> & { moveCount: number };
export type ActiveTimer = Pick<Attempt, 'completedAt' | 'durationMs' | 'lastActiveEnd'> & {
  activeMs: number;
};
export type TimerRecord = Pick<
  Attempt,
  'id' | 'completedAt' | 'durationMs' | 'activeMs' | 'lastActiveEnd'
> & { fallbackMs: number };

export function puzzleSummary(puzzle: Puzzle): PuzzleSummary {
  const { image: _image, ...summary } = puzzle;
  return summary;
}
export function attemptSummary(attempt: Attempt): AttemptSummary {
  const { id, puzzleId, startedAt, completedAt, durationMs } = attempt;
  return { id, puzzleId, startedAt, completedAt, durationMs, moveCount: attempt.moves.length };
}
export function timerRecord(attempt: Attempt): TimerRecord {
  const timer: TimerRecord = {
    id: attempt.id,
    completedAt: attempt.completedAt,
    durationMs: attempt.durationMs,
    fallbackMs: activeDuration(attempt),
  };
  if ('activeMs' in attempt) timer.activeMs = attempt.activeMs;
  if ('lastActiveEnd' in attempt) timer.lastActiveEnd = attempt.lastActiveEnd;
  return timer;
}
export function mergeTimer(attempt: Attempt, timer?: TimerRecord): Attempt {
  if (!timer) return attempt;
  const { id: _id, fallbackMs: _fallback, ...fields } = timer;
  return { ...attempt, ...fields };
}
export function putPuzzle(tx: IDBTransaction, puzzle: Puzzle) {
  tx.objectStore('puzzles').put(puzzle);
  tx.objectStore('puzzleSummaries').put(puzzleSummary(puzzle));
}
export function putAttemptMetadata(tx: IDBTransaction, attempt: Attempt, header: AttemptHeader) {
  tx.objectStore('attempts').put(header);
  tx.objectStore('attemptSummaries').put(attemptSummary(attempt));
  tx.objectStore('timers').put(timerRecord(attempt));
}
export function putAttempt(tx: IDBTransaction, attempt: Attempt) {
  const header = attemptHeader(attempt);
  attempt.moves.forEach((move, index) =>
    tx.objectStore('attemptMoves').add({ attemptId: attempt.id, index, move } satisfies StoredMove),
  );
  putAttemptMetadata(tx, attempt, header);
}

export function upgradeStorage(db: IDBDatabase, tx: IDBTransaction, oldVersion: number) {
  if (oldVersion < 1) {
    db.createObjectStore('puzzles', { keyPath: 'id' });
    db.createObjectStore('attempts', { keyPath: 'id' }).createIndex('puzzleId', 'puzzleId');
  }
  if (oldVersion < 2) {
    db.createObjectStore('puzzleSummaries', { keyPath: 'id' });
    db.createObjectStore('attemptSummaries', { keyPath: 'id' }).createIndex('puzzleId', 'puzzleId');
    db.createObjectStore('timers', { keyPath: 'id' });
  }
  db.createObjectStore('attemptMoves', { keyPath: ['attemptId', 'index'] });
  const puzzles = tx.objectStore('puzzles').openCursor();
  puzzles.onsuccess = () => {
    const cursor = puzzles.result;
    if (!cursor) return;
    if (oldVersion < 2)
      tx.objectStore('puzzleSummaries').put(puzzleSummary(cursor.value as Puzzle));
    cursor.continue();
  };
  const attempts = tx.objectStore('attempts').openCursor();
  attempts.onsuccess = () => {
    const cursor = attempts.result;
    if (!cursor) return;
    const attempt = cursor.value as Attempt;
    if (oldVersion < 2) {
      tx.objectStore('attemptSummaries').put(attemptSummary(attempt));
      tx.objectStore('timers').put(timerRecord(attempt));
    }
    attempt.moves.forEach((move, index) =>
      tx
        .objectStore('attemptMoves')
        .add({ attemptId: attempt.id, index, move } satisfies StoredMove),
    );
    cursor.update(attemptHeader(attempt));
    cursor.continue();
  };
}
