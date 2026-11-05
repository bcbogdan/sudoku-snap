import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'history-persistence.spec.ts',
  timeout: 60000,
  workers: 1,
  outputDir: process.env.HISTORY_ARTIFACT_DIR ?? '/tmp/opencode/history-persistence/results',
  use: { baseURL: 'http://127.0.0.1:3193', headless: true },
});
