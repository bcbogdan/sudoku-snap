import { expect, type Page } from '@playwright/test';
import { initialPosition, type Attempt, type Puzzle } from '../lib/attempts';
import { attemptSummary, puzzleSummary, timerRecord } from '../lib/storage-records';
import { solve } from '../lib/sudoku';
import clues from './fixtures/expected.json';

export const captureTime = new Date('2026-05-14T10:30:00.000Z');
export const freshActiveMs = 245000;
export const screenIds = {
  draft: 'design-draft',
  mixed: 'design-mixed',
  ready: 'design-ready',
  completed: 'design-completed',
  active: 'design-active-attempt',
  zero: 'design-zero-attempt',
  finished: 'design-finished-attempt',
};

function puzzle(id: string, name: string, status: Puzzle['status'], daysAgo: number): Puzzle {
  const timestamp = captureTime.getTime() - daysAgo * 86400000;
  return {
    id,
    name,
    status,
    clues: [...clues],
    uncertain: status === 'draft' ? [0, 1] : [],
    createdAt: timestamp,
    updatedAt: timestamp,
    revision: 0,
  };
}

function attempt(id: string, puzzleId: string, daysAgo: number): Attempt {
  return {
    id,
    puzzleId,
    startedAt: captureTime.getTime() - daysAgo * 86400000,
    completedAt: null,
    durationMs: null,
    activeMs: 0,
    initial: initialPosition(clues),
    moves: [],
    revision: 0,
  };
}

function collection() {
  const puzzles = [
    puzzle(screenIds.draft, 'Sunday paper · review clues', 'draft', 4),
    puzzle(screenIds.mixed, 'Morning ritual', 'ready', 3),
    puzzle(screenIds.ready, 'WeekendPuzzle'.repeat(6), 'ready', 2),
    puzzle(screenIds.completed, 'A quiet finish', 'ready', 1),
  ];
  const solution = solve(clues).solution;
  if (!solution) throw new Error('Design fixture must have a solution.');
  const active = attempt(screenIds.active, screenIds.mixed, 1);
  const editable = clues.flatMap((value, cell) => (value ? [] : [cell]));
  let position = structuredClone(active.initial);
  for (const [index, cell] of editable.slice(0, 3).entries()) {
    position = structuredClone(position);
    if (index === 1) position.notes[cell] = [2, 5, 8];
    else position.board[cell] = solution[cell];
    active.moves.push({
      cell,
      kind: index === 1 ? 'note' : 'entry',
      value: index === 1 ? 5 : solution[cell],
      at: active.startedAt + (index + 1) * 10000,
      elapsedMs: (index + 1) * 10000,
      position,
    });
  }
  active.revision = active.moves.length;
  active.activeMs = 125000;
  const zero = attempt(screenIds.zero, screenIds.mixed, 2);
  const finished = attempt(screenIds.finished, screenIds.mixed, 3);
  finished.completedAt = finished.startedAt;
  finished.durationMs = 0;
  let completedPosition = structuredClone(finished.initial);
  finished.moves = editable.map((cell) => {
    completedPosition = structuredClone(completedPosition);
    completedPosition.board[cell] = solution[cell];
    return {
      cell,
      kind: 'entry',
      value: solution[cell],
      at: finished.startedAt,
      elapsedMs: 0,
      position: completedPosition,
    };
  });
  finished.revision = finished.moves.length;
  const completedOnly = {
    ...structuredClone(finished),
    id: 'design-completed-only-attempt',
    puzzleId: screenIds.completed,
    durationMs: 3723000,
    activeMs: 3723000,
    completedAt: finished.startedAt + 3723000,
    moves: finished.moves.map((move, index) => {
      const elapsedMs = Math.round(((index + 1) / finished.moves.length) * 3723000);
      return { ...move, elapsedMs, at: finished.startedAt + elapsedMs };
    }),
  };
  return { puzzles, attempts: [active, zero, finished, completedOnly] };
}

export async function seedDesignScreens(
  page: Page,
  mode: 'collection' | 'empty' | 'draft-only' | 'worst-case' = 'collection',
) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'My puzzles', exact: true })).toBeVisible();
  const data = collection();
  if (mode === 'worst-case') {
    data.puzzles[0].clues = clues.map((value, index) => (index === 5 ? value : 0));
    data.puzzles[0].uncertain = [5];
    data.puzzles[1].name =
      'SundayNewspaperChampionshipNovember2026QualifyingRoundSudokuCollectionVolumeTwenty';
    data.puzzles[2].name = '新聞の数独・秋の大会 👩🏽‍💻 家族と挑戦する週末のパズル';
    data.puzzles[3].name = 'J';
    data.attempts[0].activeMs = 1284 * 3600000;
  }
  const puzzles =
    mode === 'empty' ? [] : mode === 'draft-only' ? data.puzzles.slice(0, 1) : data.puzzles;
  const attempts = mode === 'collection' || mode === 'worst-case' ? data.attempts : [];
  const records = {
    puzzles,
    puzzleSummaries: puzzles.map(puzzleSummary),
    attempts: attempts.map(({ moves, ...fields }) => ({
      ...fields,
      moveCount: moves.length,
      historyId: `design-history-${fields.id}`,
    })),
    attemptSummaries: attempts.map(attemptSummary),
    // Timer-only checkpoints intentionally leave the header and summary stale.
    timers: attempts.map((item) =>
      item.id === screenIds.active && mode !== 'worst-case'
        ? { ...timerRecord(item), activeMs: freshActiveMs, fallbackMs: freshActiveMs }
        : timerRecord(item),
    ),
    attemptMoves: attempts.flatMap((item) =>
      item.moves.map((move, index) => ({ attemptId: item.id, index, move })),
    ),
  };
  await page.evaluate(async (records) => {
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('sudoku-local');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction(Object.keys(records), 'readwrite');
        for (const [name, values] of Object.entries(records)) {
          const store = tx.objectStore(name);
          store.clear();
          values.forEach((value) => store.put(value));
        }
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onabort = () => {
          db.close();
          reject(tx.error);
        };
      };
    });
  }, records);
  return { puzzles, attempts };
}

export function designURL(puzzleId: string, attemptId?: string) {
  return `/?puzzle=${puzzleId}${attemptId ? `&attempt=${attemptId}` : ''}`;
}
