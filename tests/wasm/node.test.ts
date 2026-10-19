import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fixtureScenarios, scenarios } from './scenarios';
import type { WasmBindings } from '../../lib/core-wasm-types';

test('compiled Node Wasm: commit, abort, undo, reload and boundaries', async () => {
  const bindings = createRequire(import.meta.url)(
    '../../crates/sudoku-wasm/pkg/nodejs/sudoku_wasm.js',
  ) as WasmBindings;
  const fixtures = JSON.parse(
    await readFile(new URL('../../benchmarks/fixtures/persistence.json', import.meta.url), 'utf8'),
  );
  await scenarios(bindings, fixtures.puzzles[0], fixtures.attempts[0]);
  const sharing = JSON.parse(
    await readFile(new URL('../../benchmarks/fixtures/sharing.json', import.meta.url), 'utf8'),
  );
  await fixtureScenarios(bindings, fixtures, sharing);
});
