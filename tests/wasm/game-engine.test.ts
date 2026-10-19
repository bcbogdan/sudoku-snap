import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createTypeScriptEngine, createWasmEngine, type MoveInput } from '../../lib/game-engine';
import { initializeCoreWasm } from '../../lib/core-wasm';
import type { WasmBindings } from '../../lib/core-wasm-types';
import type { Puzzle } from '../../lib/attempts';
import { solve } from '../../lib/sudoku';
import clues from '../fixtures/expected.json';

const puzzle: Puzzle = {
  id: 'p',
  name: 'Fixture',
  createdAt: 1,
  updatedAt: 1,
  status: 'draft',
  revision: 0,
  uncertain: [],
  clues,
};
const solution = solve(clues).solution!;
const input = (overrides: Partial<MoveInput> = {}): MoveInput => ({
  cell: 0,
  value: 8,
  note: false,
  check: true,
  undo: false,
  at: 2000,
  ...overrides,
});

test('compiled Wasm host matches TypeScript; discarded candidates and timer identity are safe', async () => {
  const require = createRequire(import.meta.url);
  const bindings = require('../../crates/sudoku-wasm/pkg/nodejs/sudoku_wasm.js') as WasmBindings;
  const wasm = createWasmEngine(await initializeCoreWasm(async () => bindings));
  const ts = createTypeScriptEngine();
  const expected = ts.start(puzzle, 'a', 1000);
  const actual = wasm.start(puzzle, 'a', 1000);
  assert.deepEqual(actual, expected);
  assert.deepEqual(wasm.start(actual.puzzle, 'b', 1100), ts.start(expected.puzzle, 'b', 1100));
  let a = actual.attempt;
  let b = expected.attempt;
  const discarded = wasm.prepare(actual.puzzle, a, solution, input());
  discarded.discard();
  for (const command of [
    input({ note: true, value: 1 }),
    input({ note: true, value: 2 }),
    input(),
    input(),
    input({ value: 0 }),
    input({ undo: true }),
  ]) {
    const left = wasm.prepare(actual.puzzle, a, solution, command);
    const right = ts.prepare(expected.puzzle, b, solution, command);
    assert.deepEqual(left.attempt, right.attempt);
    left.commit();
    right.commit();
    a = left.attempt;
    b = right.attempt;
  }
  // A timer transaction does not increment revision, but must invalidate the resident state.
  a = { ...a, activeMs: 777, lastActiveEnd: 2500 };
  b = { ...b, activeMs: 777, lastActiveEnd: 2500 };
  const left = wasm.prepare(actual.puzzle, a, solution, input({ at: 3000, value: 1 }));
  const right = ts.prepare(expected.puzzle, b, solution, input({ at: 3000, value: 1 }));
  assert.deepEqual(left.attempt, right.attempt);
  assert.equal(left.attempt.moves.at(-1)?.elapsedMs, 777);
  left.commit();
  right.commit();
});

test('acceptance of an invalidated resident does not dispose a newer session', async () => {
  const require = createRequire(import.meta.url);
  const bindings = require('../../crates/sudoku-wasm/pkg/nodejs/sudoku_wasm.js') as WasmBindings;
  const wasm = createWasmEngine(await initializeCoreWasm(async () => bindings));
  const first = wasm.start(puzzle, 'first', 1000);
  const second = wasm.start(puzzle, 'second', 1000);
  const old = wasm.prepare(first.puzzle, first.attempt, solution, input());
  const current = wasm.prepare(second.puzzle, second.attempt, solution, input());
  assert.throws(() => old.commit(), /Session disposed/);
  current.commit();
  const next = wasm.prepare(second.puzzle, current.attempt, solution, input({ value: 0 }));
  next.commit();
  assert.equal(next.attempt.moves.length, 2);
});
