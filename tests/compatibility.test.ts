import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import boards from '../benchmarks/fixtures/boards.json';
import sharing from '../benchmarks/fixtures/sharing.json';
import attempts from '../benchmarks/fixtures/attempts.json';
import persistence from '../benchmarks/fixtures/persistence.json';
import { solve, validBoard } from '../lib/sudoku';
import {
  activeDuration,
  addActiveInterval,
  applyMove,
  applyUndo,
  durationLabel,
  initialPosition,
  positionAt,
  undoTarget,
  type Attempt,
  type Move,
  type Position,
} from '../lib/attempts';
import { decodeSharedPuzzle, encodePuzzle, puzzleShareURL } from '../lib/sharing';
import { FocusClock } from '../lib/focus-clock';
import {
  importSharedPuzzle,
  listAttempts,
  listPuzzles,
  recordMove,
  saveActiveInterval,
  saveDraft,
  startAttempt,
  undoLastMove,
} from '../lib/storage';

function named<T>(items: Record<string, T | undefined>, id: string): T {
  assert.ok(Object.hasOwn(items, id), `Unknown fixture reference: ${id}`);
  const value = items[id];
  assert.notEqual(value, undefined, `Missing fixture value: ${id}`);
  return value!;
}

function boardFixture(id: string) {
  const fixture = boards.boards.find((item) => item.id === id);
  assert.ok(fixture, `Unknown board: ${id}`);
  return fixture;
}

const digits = (value: string) => Array.from(value, Number);
const board = (id: string) => digits(boardFixture(id).digits);
const text = (value: string | { repeat: string; count: number }) =>
  typeof value === 'string' ? value : value.repeat.repeat(value.count);

function expectedPosition(id: string): Position {
  const fixture = named(attempts.positions, id);
  const result: Position = {
    board: board(fixture.board),
    notes: Array.from({ length: 81 }, () => []),
    mistakes: fixture.mistakes,
  };
  for (const [cell, value] of Object.entries(fixture.entries)) result.board[Number(cell)] = value;
  for (const [cell, values] of Object.entries(fixture.notes))
    result.notes[Number(cell)] = [...values];
  return result;
}

// Independent Sudoku oracle: no peers/validBoard/solve calls, and no search-order dependency.
function assertCompletion(clues: number[], solution: number[]) {
  assert.equal(solution.length, 81);
  const all = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  for (let unit = 0; unit < 9; unit++) {
    assert.deepEqual(solution.slice(unit * 9, unit * 9 + 9).sort(), all, `row ${unit}`);
    assert.deepEqual(
      Array.from({ length: 9 }, (_, r) => solution[r * 9 + unit]).sort(),
      all,
      `column ${unit}`,
    );
    const start = Math.floor(unit / 3) * 27 + (unit % 3) * 3;
    assert.deepEqual(
      Array.from({ length: 9 }, (_, c) => solution[start + Math.floor(c / 3) * 9 + (c % 3)]).sort(),
      all,
      `box ${unit}`,
    );
  }
  clues.forEach((clue, cell) => {
    if (clue) assert.equal(solution[cell], clue, `given at cell ${cell}`);
  });
}

test('compatibility documents use fixture version 1 independently of database/share versions', () => {
  for (const document of [boards, sharing, attempts, persistence])
    assert.equal(document.fixtureVersion, 1);
  assert.equal(new Set(boards.boards.map((item) => item.id)).size, boards.boards.length);
});

for (const fixture of boards.boards) {
  test(`compatibility board: ${fixture.id}`, () => {
    assert.match(fixture.digits, /^[0-9]{81}$/);
    const input = digits(fixture.digits);
    const before = [...input];
    assert.equal(validBoard(input), fixture.valid);
    const actual = solve(input);
    assert.equal(actual.count, fixture.solutionCount);
    assert.deepEqual(input, before, 'solver must not mutate clues');
    if (fixture.solutionCount === 0) assert.equal(actual.solution, null);
    else {
      assert.ok(actual.solution);
      assertCompletion(input, actual.solution);
      if (fixture.solution) {
        assertCompletion(input, digits(fixture.solution));
        assert.deepEqual(actual.solution, digits(fixture.solution));
      }
    }
  });
}

for (const fixture of boards.malformed) {
  test(`compatibility rejects malformed board: ${fixture.id}`, () => {
    const input: unknown[] = fixture.board ? [...fixture.board] : board(fixture.base!);
    for (const [cell, value] of Object.entries(fixture.replace ?? {})) input[Number(cell)] = value;
    input.push(...(fixture.append ?? []));
    const before = structuredClone(input);
    // Deliberately cross the typed boundary: future serde adapters may reject these at decode time.
    assert.equal(validBoard(input as number[]), fixture.valid);
    assert.deepEqual(solve(input as number[]), { count: fixture.solutionCount, solution: null });
    assert.deepEqual(input, before);
  });
}

for (const encoding of sharing.encodings) {
  test(`compatibility wire bytes: ${encoding.board}`, () => {
    assert.equal(encodePuzzle(board(encoding.board)), encoding.versioned);
    for (const encoded of [encoding.versioned, encoding.legacy].filter((s) => s !== undefined)) {
      const decoded = decodeSharedPuzzle(encoded, null);
      assert.deepEqual(decoded.clues, board(encoding.board));
      assert.equal(decoded.name, 'Shared puzzle');
    }
  });
}

for (const fixture of sharing.names) {
  test(`compatibility sharing name: ${fixture.id}`, () => {
    const raw = fixture.raw === null ? null : text(fixture.raw);
    for (const encoded of [sharing.encodings[0].versioned, sharing.encodings[0].legacy!]) {
      if (fixture.error) {
        assert.throws(() => decodeSharedPuzzle(encoded, raw), {
          message: named(sharing.errors, fixture.error),
        });
        continue;
      }
      const name = text(fixture.name!);
      assert.deepEqual(decodeSharedPuzzle(encoded, raw), {
        clues: board('easy'),
        name,
        shareKey: JSON.stringify([boardFixture('easy').digits, name]),
        legacyShareKey: JSON.stringify([sharing.encodings[0].legacy, name]),
      });
      const url = new URL(
        puzzleShareURL(
          'https://sudoku.example/nested?old=1#fragment',
          board('easy'),
          raw ?? 'Shared puzzle',
        ),
      );
      assert.equal(url.origin, 'https://sudoku.example');
      assert.equal(url.pathname, '/');
      assert.equal(url.hash, '');
      assert.deepEqual([...url.searchParams.keys()], ['p', 'n']);
      assert.equal(url.searchParams.get('p'), sharing.encodings[0].versioned);
      assert.equal(url.searchParams.get('n'), raw ?? 'Shared puzzle');
      assert.equal(
        decodeSharedPuzzle(url.searchParams.get('p')!, url.searchParams.get('n')).name,
        name,
      );
    }
  });
}

for (const fixture of sharing.invalid) {
  test(`compatibility rejects sharing payload: ${fixture.id}`, () => {
    assert.throws(() => decodeSharedPuzzle(text(fixture.encoded), 'Valid name'), {
      message: named(sharing.errors, fixture.error),
    });
  });
}

test('sharing requires conflict-free clues, not a unique or solvable puzzle', () => {
  assert.throws(() => encodePuzzle(board('conflicting')), { message: sharing.errors.unshareable });
  for (const id of ['unsolvable', 'ambiguous']) {
    assert.deepEqual(decodeSharedPuzzle(encodePuzzle(board(id)), 'Draft').clues, board(id));
  }
});

type ExpectedMove = Omit<Move, 'position'> & { position: string };
type ExpectedState = {
  append?: string;
  position: string;
  revision: number;
  timer: string;
  undoTarget: number | null;
  completedAt?: number;
  durationMs?: number;
};
type Command = (
  | {
      op: 'move' | 'ui-digit';
      cell: number;
      value: number;
      note: boolean;
      check: boolean;
      at: number;
    }
  | { op: 'undo'; at: number }
  | { op: 'interval'; start: number; end: number }
  | { op: 'inspect' }
) & { expect?: ExpectedState; error?: string };
type Scenario = {
  id: string;
  board: string;
  initial?: { id: string; puzzleId: string; startedAt: number; activeMs?: number };
  persistedAttempt?: string;
  moves: Record<string, ExpectedMove>;
  commands: Command[];
};

function execute(command: Command, attempt: Attempt, clues: number[], solution: number[]): Attempt {
  switch (command.op) {
    case 'inspect':
      return attempt;
    case 'interval':
      return addActiveInterval(attempt, command.start, command.end);
    case 'undo':
      return applyUndo(attempt, command.at);
    case 'move':
    case 'ui-digit': {
      // UI policy only; applyMove itself SETS a digit. This is not a React integration test.
      const value =
        command.op === 'ui-digit' &&
        !command.note &&
        command.value !== 0 &&
        positionAt(attempt).board[command.cell] === command.value
          ? 0
          : command.value;
      return applyMove(
        attempt,
        clues,
        solution,
        command.cell,
        value,
        command.note,
        command.check,
        command.at,
      );
    }
  }
}

for (const scenario of attempts.scenarios as unknown as Scenario[]) {
  test(`compatibility attempt commands: ${scenario.id}`, () => {
    const clues = board(scenario.board);
    const solution = digits(boardFixture(scenario.board).solution!);
    const saved = persistence.attempts.find((a) => a.id === scenario.persistedAttempt);
    let actual: Attempt = saved
      ? (structuredClone(saved) as Attempt)
      : {
          ...scenario.initial!,
          completedAt: null,
          durationMs: null,
          initial: initialPosition(clues),
          moves: [],
          revision: 0,
        };
    const initial = structuredClone(actual.initial);
    const expectedHistory = structuredClone(actual.moves);
    const preservedClues = [...clues];
    const preservedSolution = [...solution];

    scenario.commands.forEach((command, index) => {
      const context = `${scenario.id} command ${index}: ${JSON.stringify(command)}`;
      const previous = actual;
      const before = structuredClone(previous);
      if (command.error) {
        assert.throws(
          () => execute(command, actual, clues, solution),
          { message: named(attempts.errors, command.error) },
          context,
        );
      } else {
        const expected = command.expect!;
        actual = execute(command, actual, clues, solution);
        if (expected.append) {
          const move = named(scenario.moves, expected.append);
          expectedHistory.push({ ...move, position: expectedPosition(move.position) });
        }
        const timer = named(attempts.timers, expected.timer);
        assert.deepEqual(
          actual,
          {
            id: before.id,
            puzzleId: before.puzzleId,
            startedAt: before.startedAt,
            initial,
            moves: expectedHistory,
            revision: expected.revision,
            completedAt: expected.completedAt ?? null,
            durationMs: expected.durationMs ?? null,
            ...(timer.activeMs === null ? {} : { activeMs: timer.activeMs }),
            ...(timer.lastActiveEnd === null ? {} : { lastActiveEnd: timer.lastActiveEnd }),
          },
          context,
        );
        assert.deepEqual(positionAt(actual), expectedPosition(expected.position), context);
        assert.equal(activeDuration(actual), timer.activeDuration, context);
        assert.equal(undoTarget(actual) ?? null, expected.undoTarget, context);
      }
      assert.deepEqual(previous, before, `input attempt mutated: ${context}`);
      assert.deepEqual(clues, preservedClues, context);
      assert.deepEqual(solution, preservedSolution, context);
      assert.deepEqual(positionAt(actual, 0), initial, context);
      expectedHistory.forEach((move, step) => {
        assert.deepEqual(
          positionAt(actual, step + 1),
          move.position,
          `history ${step + 1}: ${context}`,
        );
      });
    });
    for (const step of attempts.invalidHistorySteps) {
      assert.throws(() => positionAt(actual, step), {
        message: attempts.errors['invalid-history'],
      });
    }
  });
}

test('compatibility focus clock excludes unfocused gaps and clamps backwards checkpoints', () => {
  const clock = new FocusClock();
  for (const command of attempts.focusClock) {
    const actual =
      command.op === 'focus'
        ? clock.setFocused(command.focused!, command.at)
        : clock.checkpoint(command.at);
    assert.deepEqual(actual, command.interval, JSON.stringify(command));
  }
});

test('compatibility elapsed labels floor seconds and do not wrap after 24 hours', () => {
  for (const fixture of attempts.durationLabels)
    assert.equal(durationLabel(fixture.ms), fixture.label);
});

async function seedPersistedRecords() {
  // Seed the released schema before the application opens and upgrades it.
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(persistence.database.name, persistence.database.version);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('puzzles', { keyPath: 'id' });
      request.result
        .createObjectStore('attempts', { keyPath: 'id' })
        .createIndex('puzzleId', 'puzzleId');
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(['puzzles', 'attempts'], 'readwrite');
      for (const store of ['puzzles', 'attempts'] as const) {
        tx.objectStore(store).clear();
        for (const record of persistence[store]) tx.objectStore(store).add(record);
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
}

test('schema-v1 records reload losslessly, deduplicate both share keys, and preserve legacy time', async () => {
  await seedPersistedRecords();
  const puzzles = await listPuzzles();
  assert.deepEqual(
    puzzles.map((p) => p.id),
    persistence.expected.puzzleOrder,
  );
  for (const expected of persistence.puzzles)
    assert.deepEqual(
      puzzles.find((p) => p.id === expected.id),
      expected,
    );
  const loaded = await listAttempts();
  for (const expected of persistence.attempts) {
    assert.deepEqual(
      loaded.find((a) => a.id === expected.id),
      expected,
    );
    assert.equal(expected.initial.notes.length, 81);
    assert.deepEqual(
      expected.initial.board,
      puzzles.find((p) => p.id === expected.puzzleId)!.clues,
    );
    for (const move of expected.moves) assert.equal(move.position.notes.length, 81);
  }
  const legacy = loaded.find((a) => a.id === 'legacy-attempt')!;
  const completed = loaded.find((a) => a.id === 'completed-attempt')!;
  assert.deepEqual(positionAt(legacy), expectedPosition(persistence.expected.legacyPosition));
  assert.equal(activeDuration(legacy), persistence.expected.legacyActiveDuration);
  assert.equal(activeDuration(completed), persistence.expected.completedActiveDuration);
  assertCompletion(completed.initial.board, positionAt(completed).board);

  for (const fixture of persistence.expected.imports) {
    const encoded = named(sharing.encodings[0], fixture.encoding);
    assert.equal((await importSharedPuzzle(encoded!, fixture.name)).id, fixture.puzzleId);
  }
  assert.deepEqual(await listPuzzles(), puzzles);
  assert.deepEqual(await listAttempts(), loaded, 'import must not reset progress or completion');
  assert.deepEqual(await listAttempts(legacy.puzzleId), [legacy]);
  assert.deepEqual(await listAttempts('missing'), []);

  await assert.rejects(recordMove(completed, 0, 0, false, true), /read-only/);
  await assert.rejects(undoLastMove(completed), /read-only/);
  const frozenTimer = await saveActiveInterval(completed.id, 100000, 101000);
  assert.equal(frozenTimer!.completedAt, completed.completedAt);
  assert.equal(frozenTimer!.durationMs, completed.durationMs);
  assert.equal(frozenTimer!.activeMs, activeDuration(completed));
  assert.deepEqual((await listAttempts(completed.puzzleId))[0], completed);

  // A no-op entry through storage upgrades a legacy timer without charging the closed-page gap.
  const resumed = await recordMove(legacy, 2, 5, false, true);
  assert.deepEqual(resumed, { ...legacy, activeMs: persistence.expected.legacyActiveDuration });
  assert.deepEqual((await listAttempts(legacy.puzzleId))[0], resumed);

  const draft = puzzles.find((p) => p.id === 'conflicting-draft')!;
  assert.deepEqual(draft.clues, board('conflicting'));
  const savedDraft = await saveDraft(draft, draft.clues, draft.uncertain);
  assert.equal(savedDraft.status, 'draft');
  assert.deepEqual(savedDraft.clues, board('conflicting'));
  assert.deepEqual(savedDraft.uncertain, [2]);
  await assert.rejects(startAttempt(savedDraft), /conflict or cannot form/);
  assert.deepEqual(
    (await listPuzzles()).find((p) => p.id === draft.id),
    savedDraft,
  );
  assert.deepEqual(await listAttempts(draft.id), []);
});
