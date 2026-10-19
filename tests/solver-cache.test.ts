import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solveCached } from '../lib/solver-client';
import { solve } from '../lib/sudoku';
import clues from './fixtures/expected.json';

test('cached solutions match solver and isolate mutable callers', async () => {
  const input = clues.slice();
  const expected = solve(input);
  const first = await solveCached(input);
  assert.deepEqual(first, expected);
  first.solution![0] = 0;
  input.fill(1);
  assert.deepEqual(await solveCached(clues.slice()), expected);
  assert.deepEqual(await solveCached(input), { count: 0, solution: null });
  assert.deepEqual(await Promise.all([solveCached(clues), solveCached(clues)]), [
    expected,
    expected,
  ]);
});
