import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { applyMove, applyUndo, positionAt, undoTarget } from '../lib/attempts';
import { decodeSharedPuzzle, encodePuzzle } from '../lib/sharing';
import { solve, validBoard } from '../lib/sudoku';
import { cell, clues, encodedClues, epoch, histories, makeAttempt, solution } from './data';
import { integerEnv, readRun, summary, writeReport } from './report';

const samples = integerEnv('BENCH_SAMPLES', 30);
const warmup = integerEnv('BENCH_WARMUP', 5, 0);
const iterations = integerEnv('BENCH_ITERATIONS', 100);
const results: unknown[] = [];
function bench<T>(
  name: string,
  history: number | null,
  run: () => T,
  verify: (result: T) => void,
  inputHistory = history,
) {
  const times: number[] = [];
  for (let sample = -warmup; sample < samples; sample++) {
    // Retain results until the clock stops; assertions and allocation of the
    // results array are excluded. Natural GC inside run remains part of cost.
    const output = new Array<T>(iterations);
    const start = performance.now();
    for (let i = 0; i < iterations; i++) output[i] = run();
    const elapsed = performance.now() - start;
    for (const value of output) verify(value);
    if (sample >= 0) times.push(elapsed / iterations);
  }
  results.push({
    name,
    history,
    inputHistory,
    unit: 'ms/operation',
    samples: times,
    summary: summary(times),
  });
}
assert.equal(solve(clues).count, 1);
assert(solution.every(Boolean));
assert(validBoard(solution));
clues.forEach((value, index) => {
  if (value) assert.equal(solution[index], value);
});
bench(
  'solver',
  null,
  () => solve(clues),
  (value) => {
    assert.equal(value.count, 1);
    assert.deepEqual(value.solution, solution);
  },
);
bench(
  'validation',
  null,
  () => validBoard(clues),
  (value) => assert.equal(value, true),
);
const invalid = clues.slice();
invalid[0] = invalid[1] = 1;
bench(
  'validation-invalid',
  null,
  () => validBoard(invalid),
  (value) => assert.equal(value, false),
);
const encoded = encodedClues;
bench(
  'codec-encode',
  null,
  () => encodePuzzle(clues),
  (value) => assert.equal(value, encoded),
);
bench(
  'codec-decode',
  null,
  () => decodeSharedPuzzle(encoded, 'Benchmark'),
  (value) => assert.deepEqual(value.clues, clues),
);
for (const history of histories) {
  const attempt = makeAttempt(history);
  const filled = applyMove(
    attempt,
    clues,
    solution,
    cell,
    solution[cell],
    false,
    true,
    epoch + 9999999,
  );
  assert.equal(filled.moves.length, history + 1);
  assert.equal(filled.moves.at(-1)!.value, solution[cell]);
  assert.deepEqual(filled.initial, attempt.initial);
  for (const kind of ['entry', 'note', 'erase'] as const) {
    const input = kind === 'erase' ? filled : attempt;
    bench(
      kind,
      history,
      () =>
        applyMove(
          input,
          clues,
          solution,
          cell,
          kind === 'erase' ? 0 : solution[cell],
          kind === 'note',
          true,
          epoch + 10000000,
        ),
      (value) => {
        assert.equal(value.moves.length, input.moves.length + 1);
        assert.equal(value.revision, input.revision + 1);
        assert.equal(value.completedAt, null);
        assert.deepEqual(
          positionAt(value).board,
          clues.map((v, index) => (index === cell && kind === 'entry' ? solution[cell] : v)),
        );
        assert.deepEqual(positionAt(value).notes[cell], kind === 'note' ? [solution[cell]] : []);
        assert.equal(positionAt(value).mistakes, 0);
      },
      input.moves.length,
    );
  }
  bench(
    'undo-target',
    history,
    () => undoTarget(attempt),
    (value) => assert.equal(value, history ? history - 1 : undefined),
  );
  bench(
    'undo',
    history,
    () => applyUndo(attempt, epoch + 10000000),
    (value) => {
      assert.equal(value.moves.length, history ? history + 1 : 0);
      assert.deepEqual(positionAt(value), positionAt(attempt, Math.max(0, history - 1)));
    },
  );
  const step = Math.floor(history / 2);
  bench(
    'history-position',
    history,
    () => positionAt(attempt, step),
    (value) => assert.deepEqual(value, step ? attempt.moves[step - 1].position : attempt.initial),
  );
}
writeReport('core', {
  ...readRun('core', process.env.BENCH_RUN_ID),
  complete: true,
  warmup,
  samples,
  iterations,
  cacheState: 'same process; JIT warmup; natural GC',
  results,
});
