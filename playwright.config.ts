import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  testMatch: '*.spec.ts',
  timeout: 180000,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:3187',
    channel: process.env.PLAYWRIGHT_CHANNEL,
    headless: true,
  },
  webServer: {
    command: 'npm start -- --hostname 127.0.0.1 --port 3187',
    url: 'http://127.0.0.1:3187',
    reuseExistingServer: false,
    timeout: 60000,
  },
});
