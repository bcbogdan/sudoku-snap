import { initializeCoreWasm, CoreWasmError } from '../../lib/core-wasm';
import type { AttemptRecord, PuzzleRecord, WasmBindings } from '../../lib/core-wasm-types';

function equal(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(`Mismatch: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
}
function fails(operation: () => unknown, code?: string): void {
  try {
    operation();
  } catch (e) {
    if (!code || (e instanceof CoreWasmError && e.code === code)) return;
    throw e;
  }
  throw new Error(`Expected failure ${code ?? ''}`);
}

export async function scenarios(
  bindings: WasmBindings,
  puzzle: PuzzleRecord,
  legacy: AttemptRecord,
): Promise<void> {
  const core = await initializeCoreWasm(async () => bindings);
  const restored = core.restore(puzzle, legacy);
  equal(restored.exportRecord(), legacy);
  restored.free();
  const disposed = core.create(puzzle, 'disposed-session', 1000);
  const orphan = disposed.prepare({ kind: 'checkpoint' }, { at: 1000, normalizeLegacyTime: false });
  disposed.free();
  fails(() => disposed.accept(orphan), 'Disposed');
  fails(() => orphan.project(), 'StaleCandidate');
  const session = core.create(puzzle, 'wasm-attempt', 1000);
  let durable = session.exportRecord();
  const context = { at: 1100, normalizeLegacyTime: true };
  const discarded = session.prepare({ kind: 'setEntry', cell: 2, value: 4, check: true }, context);
  discarded.free();
  equal(session.exportRecord(), durable);
  fails(() => session.accept(discarded), 'StaleCandidate');
  const candidate = session.prepare(
    { kind: 'enterDigit', cell: 2, value: 4, check: true },
    context,
  );
  const sibling = session.prepare({ kind: 'checkpoint' }, context);
  const projection = candidate.project();
  equal(projection.effect, 'appendedMove');
  equal(projection.current.board[2], 4);
  const detached = candidate.project();
  detached.current.board[2] = 9;
  equal(candidate.project().current.board[2], 4);
  equal(session.current().board[2], 0);
  const other = core.restore(puzzle, durable);
  const foreign = other.prepare({ kind: 'checkpoint' }, context);
  fails(() => session.accept(foreign), 'StaleCandidate');
  other.free();
  // Fake atomic host commit happens before accept, merging bounded fields only.
  durable = {
    ...durable,
    ...projection.header,
    moves: [...durable.moves, projection.appendedMove!],
  };
  session.accept(candidate);
  equal(session.exportRecord(), durable);
  fails(() => session.accept(candidate), 'StaleCandidate');
  fails(() => session.accept(sibling), 'StaleCandidate');
  const undo = session.prepare({ kind: 'undo' }, { ...context, at: 1200 });
  const undone = undo.project();
  durable = { ...durable, ...undone.header, moves: [...durable.moves, undone.appendedMove!] };
  session.accept(undo);
  equal(session.current().board[2], 0);
  const reloaded = core.restore(puzzle, durable);
  equal(reloaded.exportRecord(), session.exportRecord());
  equal(reloaded.positionAt(1).board[2], 4);
  reloaded.free();

  for (const invalid of [NaN, Infinity, -1, 1.5, 9007199254740992, '2', true, null]) {
    fails(() => session.prepare({ kind: 'erase', cell: invalid as number }, context));
    fails(() => core.create(puzzle, 'x', invalid as number));
  }
  for (const invalid of ['\ud800', '\udfff', 'ok\ud800x']) {
    fails(() => core.create({ ...puzzle, name: invalid }, 'x', 0), 'InvalidUnicode');
    fails(() => core.create(puzzle, invalid, 0), 'InvalidUnicode');
    fails(() => bindings.WasmSession.create(JSON.stringify(puzzle), invalid, '0'));
  }
  for (const field of ['activeMs', 'lastActiveEnd']) {
    fails(() => core.restore(puzzle, { ...legacy, [field]: null }));
  }
  fails(() => core.restore({ ...puzzle, shareKey: null } as unknown as PuzzleRecord, legacy));
  fails(() => core.restore({ ...puzzle, extra: 1 } as PuzzleRecord, legacy));
  fails(() =>
    core.restore(puzzle, { ...legacy, completedAt: undefined } as unknown as AttemptRecord),
  );
  fails(() =>
    core.restore(puzzle, {
      ...legacy,
      initial: { ...legacy.initial, notes: [[2, 1], ...legacy.initial.notes.slice(1)] },
    }),
  );
  if (legacy.moves.length) {
    fails(() =>
      core.restore(puzzle, {
        ...legacy,
        moves: [{ ...legacy.moves[0], undoOf: null }, ...legacy.moves.slice(1)],
      } as unknown as AttemptRecord),
    );
  }
  fails(() =>
    bindings.WasmSession.restore(
      JSON.stringify(puzzle).replace('"createdAt":100', '"createdAt":100.0'),
      JSON.stringify(legacy),
    ),
  );
  fails(() => session.prepare({ kind: 'checkpoint', extra: 1 } as { kind: 'checkpoint' }, context));
  fails(() =>
    session.prepare({ kind: 'checkpoint' }, {
      ...context,
      focusedInterval: null,
    } as unknown as typeof context),
  );
  const safe = core.create(puzzle, 'safe', Number.MAX_SAFE_INTEGER);
  equal(safe.exportRecord().startedAt, Number.MAX_SAFE_INTEGER);
  safe.free();
  const renamed = { ...puzzle, name: 'Café 🧩 "quoted" \\ key\u200b' };
  const unicode = core.create(renamed, 'unicode', 0);
  unicode.free();
  const packed = core.encodeShared(puzzle.clues);
  equal(core.decodeShared(packed, '\ufeff Café\u00a0🧩 ').name, 'Café 🧩');
  equal(core.decodeShared(packed, puzzle.name).clues, puzzle.clues);
  equal(core.finalizePuzzle({ ...puzzle, status: 'draft' }, 2000).status, 'ready');
  session.free();
  session.free();
  fails(() => session.current(), 'Disposed');
  const long = core.create(puzzle, 'bounded', 1000);
  const started = performance.now();
  for (let i = 0; i < 300; i++) {
    const c = long.prepare({ kind: 'enterDigit', cell: 2, value: 4, check: false }, context);
    const projected = c.project();
    if (JSON.stringify(projected).length > 2000) throw new Error('Unbounded candidate projection');
    long.accept(c);
  }
  console.log('Wasm 300 prepare/project/accept commands (ms)', performance.now() - started);
  equal(long.exportRecord().moves.length, 300);
  long.free();
  for (let i = 0; i < 200; i++) {
    const game = core.create(puzzle, `repeat-${i}`, 1000);
    const c = game.prepare({ kind: 'checkpoint' }, context);
    c.free();
    game.free();
  }
}

interface SharingFixtures {
  encodings: { board: string; versioned: string; legacy?: string }[];
  names: {
    raw: string | { repeat: string; count: number } | null;
    name?: string | { repeat: string; count: number };
    error?: string;
  }[];
  invalid: { encoded: string | { repeat: string; count: number }; error: string }[];
}
const expand = (value: string | { repeat: string; count: number }): string =>
  typeof value === 'string' ? value : value.repeat.repeat(value.count);

export async function fixtureScenarios(
  bindings: WasmBindings,
  persistence: { puzzles: PuzzleRecord[]; attempts: AttemptRecord[] },
  sharing: SharingFixtures,
): Promise<void> {
  const core = await initializeCoreWasm(async () => bindings);
  for (const attempt of persistence.attempts) {
    const puzzle = persistence.puzzles.find((p) => p.id === attempt.puzzleId)!;
    const game = core.restore(puzzle, attempt);
    equal(game.exportRecord(), attempt);
    if (attempt.completedAt !== null) {
      const at = attempt.completedAt;
      fails(() => game.prepare({ kind: 'undo' }, { at, normalizeLegacyTime: false }), 'Locked');
    }
    game.free();
  }
  for (const encoding of sharing.encodings) {
    const board =
      encoding.board === 'empty' ? Array<number>(81).fill(0) : persistence.puzzles[0].clues;
    equal(core.encodeShared(board), encoding.versioned);
    for (const wire of [encoding.versioned, encoding.legacy].filter((v): v is string => !!v)) {
      equal(core.decodeShared(wire).clues, board);
    }
  }
  for (const name of sharing.names) {
    const run = () => core.decodeShared('1.A', name.raw === null ? undefined : expand(name.raw));
    if (name.error) fails(run, 'InvalidName');
    else equal(run().name, expand(name.name!));
  }
  for (const invalid of sharing.invalid) fails(() => core.decodeShared(expand(invalid.encoded)));
}
