import { test } from 'node:test';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

test('compiled web Wasm initializes and runs the same contract in Chromium', async () => {
  const server = await createServer({ configFile: false, server: { host: '127.0.0.1', port: 0 } });
  await server.listen();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(server.resolvedUrls!.local[0]);
    const result = await page.evaluate(async () => {
      const modulePath = '/crates/sudoku-wasm/pkg/web/sudoku_wasm.js';
      const scenarioPath = '/tests/wasm/scenarios.ts';
      const bindings = await import(/* @vite-ignore */ modulePath);
      const start = performance.now();
      const { memory } = await bindings.default();
      const startupMs = performance.now() - start;
      const fixtures = await fetch('/benchmarks/fixtures/persistence.json').then((r) => r.json());
      const { scenarios, fixtureScenarios } = await import(/* @vite-ignore */ scenarioPath);
      const sharing = await fetch('/benchmarks/fixtures/sharing.json').then((r) => r.json());
      await fixtureScenarios(bindings, fixtures, sharing);
      await scenarios(bindings, fixtures.puzzles[0], fixtures.attempts[0]);
      const afterWarmup = memory.buffer.byteLength;
      await scenarios(bindings, fixtures.puzzles[0], fixtures.attempts[0]);
      if (memory.buffer.byteLength !== afterWarmup) throw new Error('Memory grew after warmup');
      return { startupMs, memoryBytes: memory.buffer.byteLength };
    });
    console.log('Wasm browser sample', result);
  } finally {
    await browser.close();
    await server.close();
  }
});
