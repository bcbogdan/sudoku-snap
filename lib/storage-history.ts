import type { Attempt, Move, Position } from './attempts';

// Every authorized write replaces historyId; historical records are add-only.
// A fresh transactional header validates an owned reconstruction, not caller data.
export type AttemptHeader = Omit<Attempt, 'moves'> & { moveCount: number; historyId: string };
export type StoredMove = { attemptId: string; index: number; move: Move };
type Resident = { header: AttemptHeader; attempt: Attempt };
const residents = new Map<string, Resident>();
const residentLimit = 4;
const ownedAttempts = new WeakSet<Attempt>();

function sameHeader(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  if (
    !Array.isArray(left) &&
    (Object.getPrototypeOf(left) !== Object.prototype ||
      Object.getPrototypeOf(right) !== Object.prototype)
  )
    return false;
  if (Array.isArray(left) && left.length !== (right as unknown[]).length) return false;
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return false;
  return keys.every(
    (key) =>
      Object.hasOwn(right, key) &&
      sameHeader((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]),
  );
}

function freezePosition(position: Position): Position {
  Object.freeze(position.board);
  position.notes.forEach(Object.freeze);
  Object.freeze(position.notes);
  return Object.freeze(position);
}
function freezeMove(move: Move): Move {
  freezePosition(move.position);
  return Object.freeze(move);
}
function snapshot(header: AttemptHeader, moves: Move[]): Attempt {
  const { historyId: _historyId, moveCount: _moveCount, ...fields } = header;
  freezePosition(fields.initial);
  Object.freeze(moves);
  const attempt = Object.freeze({ ...fields, moves });
  ownedAttempts.add(attempt);
  return attempt;
}
export function moveRange(id: string): IDBKeyRange {
  return IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]);
}
export function attemptHeader(attempt: Attempt): AttemptHeader {
  const { moves, ...fields } = attempt;
  return { ...fields, moveCount: moves.length, historyId: crypto.randomUUID() };
}
export function forgetAttempt(id: string) {
  residents.delete(id);
}
export function forgetHistory() {
  residents.clear();
}
export function rememberAttempt(header: AttemptHeader, attempt: Attempt) {
  if (!ownedAttempts.has(attempt)) throw new Error('Cannot cache an unowned attempt.');
  residents.delete(header.id);
  residents.set(header.id, { header: Object.freeze({ ...header }), attempt });
  if (residents.size > residentLimit) residents.delete(residents.keys().next().value!);
}

// Only durable reads and appendAttempt create these snapshots. Public history is
// immutable: sharing nested snapshots is safe, without cloning history per input.
export function readAttemptHistory(
  tx: IDBTransaction,
  header: AttemptHeader,
  done: (attempt: Attempt) => void,
  fail: (error: Error) => void,
) {
  if (typeof header.historyId !== 'string' || !header.historyId || Object.hasOwn(header, 'moves')) {
    fail(new Error('Saved attempt header is invalid.'));
    return;
  }
  const resident = residents.get(header.id);
  if (resident && sameHeader(resident.header, header)) {
    done(resident.attempt);
    return;
  }
  const request = tx.objectStore('attemptMoves').getAll(moveRange(header.id));
  request.onsuccess = () => {
    try {
      const records = request.result as StoredMove[];
      if (
        !Number.isSafeInteger(header.moveCount) ||
        header.moveCount < 0 ||
        records.length !== header.moveCount
      )
        throw new Error('Saved attempt history is incomplete.');
      const moves = records.map((record, index) => {
        if (record.attemptId !== header.id || record.index !== index)
          throw new Error('Saved attempt history is out of order.');
        return freezeMove(record.move);
      });
      done(snapshot(header, moves));
    } catch (error) {
      fail(error instanceof Error ? error : new Error('Could not read saved history.'));
    }
  };
}

export function appendAttempt(
  tx: IDBTransaction,
  current: Attempt,
  updated: Attempt,
): { header: AttemptHeader; attempt: Attempt } {
  if (
    updated.id !== current.id ||
    updated.puzzleId !== current.puzzleId ||
    updated.startedAt !== current.startedAt ||
    updated.initial !== current.initial ||
    updated.moves.length < current.moves.length ||
    updated.moves.length > current.moves.length + 1 ||
    !current.moves.every((move, index) => updated.moves[index] === move)
  )
    throw new Error('Engine returned an invalid history append.');
  const appended = updated.moves.length > current.moves.length;
  if (updated.revision !== current.revision + (appended ? 1 : 0))
    throw new Error('Engine returned an invalid attempt revision.');
  const moves = current.moves.slice();
  if (appended) {
    const move = freezeMove(structuredClone(updated.moves.at(-1)!));
    tx.objectStore('attemptMoves').add({
      attemptId: current.id,
      index: current.moves.length,
      move,
    } satisfies StoredMove);
    moves.push(move);
  }
  const header = attemptHeader(updated);
  return { header, attempt: snapshot(header, moves) };
}
