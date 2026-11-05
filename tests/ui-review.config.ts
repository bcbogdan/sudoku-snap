import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'ui-review.spec.ts',
  timeout: 60000,
  workers: 1,
  outputDir: '/tmp/opencode/ui-review-fixes-results',
  use: { baseURL: 'http://127.0.0.1:3191', headless: true },
});
