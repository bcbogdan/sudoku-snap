import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadConfigFromFile } from 'vite';

test('Storybook browser files run serially without changing interaction or axe coverage', async () => {
  const loaded = await loadConfigFromFile({ command: 'serve', mode: 'test' }, 'vitest.config.mts');
  const project = loaded.config.test.projects.find((project) => project.test.name === 'storybook');
  assert.equal(project.test.browser.fileParallelism, false);
  assert.deepEqual(project.test.browser.instances, [{ browser: 'chromium' }]);
  assert.deepEqual(project.test.setupFiles, ['./.storybook/vitest.setup.ts']);
});

test('dedicated visual port keeps the canonical guard and refuses server reuse', async () => {
  const original = process.env.STORYBOOK_TEST_PORT;
  process.env.STORYBOOK_TEST_PORT = '6008';
  try {
    const loaded = await loadConfigFromFile(
      { command: 'serve', mode: 'test' },
      'tests/storybook/playwright.config.ts',
    );
    assert.equal(loaded.config.use.baseURL, 'http://127.0.0.1:6008');
    assert.equal(loaded.config.webServer.url, loaded.config.use.baseURL);
    assert.equal(loaded.config.webServer.command, 'node scripts/serve-storybook.mjs');
    assert.equal(loaded.config.webServer.reuseExistingServer, false);
    assert.equal(loaded.config.globalSetup, '../../scripts/storybook-environment.mjs');
    assert.equal(loaded.config.updateSnapshots, 'none');
  } finally {
    if (original === undefined) delete process.env.STORYBOOK_TEST_PORT;
    else process.env.STORYBOOK_TEST_PORT = original;
  }
});
