import { defineConfig } from '@playwright/test';
import path from 'node:path';
import { readRun } from './report';

// Read-only in both coordinator and workers; only the wrapper invalidates output.
readRun('browser', process.env.BENCH_RUN_ID);

export default defineConfig({
  testDir: '.',
  testMatch: 'browser.spec.ts',
  workers: 1,
  fullyParallel: false,
  timeout: Number(process.env.BENCH_TIMEOUT_MS ?? 3600000),
  retries: 0,
  reporter: 'list',
  outputDir: './results/playwright',
  use: {
    baseURL: 'http://127.0.0.1:3197',
    browserName: 'chromium',
    headless: true,
    viewport: { width: 1280, height: 900 },
    locale: 'en-US',
    timezoneId: 'UTC',
    actionTimeout: 180000,
    navigationTimeout: 180000,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  webServer: {
    command: 'npm start -- --hostname 127.0.0.1 --port 3197',
    cwd: path.resolve(__dirname, '..'),
    url: 'http://127.0.0.1:3197',
    reuseExistingServer: false,
    timeout: 60000,
  },
});
