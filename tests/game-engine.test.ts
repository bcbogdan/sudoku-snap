import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTypeScriptEngine, getGameEngine, type MoveInput } from '../lib/game-engine';
import type { Puzzle } from '../lib/attempts';
import { solve } from '../lib/sudoku';
import clues from './fixtures/expected.json';

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

test('the document engine is stable and starts independent attempts without native assets', async () => {
  const engine = await getGameEngine();
  assert.equal(await getGameEngine(), engine);
  const first = engine.start(puzzle, 'first', 1000);
  const second = engine.start(first.puzzle, 'second', 1100);
  assert.equal(first.puzzle.status, 'ready');
  assert.equal(second.puzzle.revision, 2);
  assert.equal(second.attempt.id, 'second');
  assert.deepEqual(second.attempt.moves, []);
  assert.equal(first.attempt.id, 'first');
  assert.equal(puzzle.status, 'draft');
});

test('preparation and discard leave committed input untouched; retry appends only once', () => {
  const engine = createTypeScriptEngine();
  const started = engine.start(puzzle, 'a', 1000);
  const original = structuredClone(started.attempt);
  const discarded = engine.prepare(started.puzzle, started.attempt, solution, input());
  discarded.discard();
  assert.deepEqual(started.attempt, original);
  const retried = engine.prepare(started.puzzle, started.attempt, solution, input());
  assert.deepEqual(retried.attempt, discarded.attempt);
  retried.commit();
  assert.equal(retried.attempt.moves.length, 1);
  assert.deepEqual(started.attempt, original);
});

test('unchanged moves preserve attempt identity while legacy normalization publishes metadata', () => {
  const engine = createTypeScriptEngine();
  const started = engine.start(puzzle, 'noop', 1000);
  for (const command of [input({ value: 0 }), input({ undo: true })]) {
    const prepared = engine.prepare(started.puzzle, started.attempt, solution, command);
    assert.equal(prepared.attempt, started.attempt);
    prepared.commit();
  }
  const { activeMs: _active, ...legacy } = started.attempt;
  const normalized = engine.prepare(started.puzzle, legacy, null, input({ undo: true }));
  assert.notEqual(normalized.attempt, legacy);
  assert.equal(normalized.attempt.activeMs, 0);
  assert.equal(normalized.attempt.moves.length, 0);
  normalized.commit();
});

test('fresh authoritative timing reaches entries and undo without charging a closed gap', () => {
  const engine = createTypeScriptEngine();
  const started = engine.start(puzzle, 'timed', 1000);
  const timed = { ...started.attempt, activeMs: 777, lastActiveEnd: 2500 };
  const entry = engine.prepare(started.puzzle, timed, solution, input({ at: 3000 }));
  entry.commit();
  assert.equal(entry.attempt.moves.at(-1)!.elapsedMs, 777);
  const undo = engine.prepare(started.puzzle, entry.attempt, null, input({ undo: true, at: 4000 }));
  undo.commit();
  assert.equal(undo.attempt.moves.at(-1)!.elapsedMs, 777);
  assert.deepEqual(undo.attempt.moves.at(-1)!.position, started.attempt.initial);
});
