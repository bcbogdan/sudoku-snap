import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

export default defineConfig({
  testDir: '.',
  testMatch: '*.visual.ts',
  globalSetup: '../../scripts/storybook-environment.mjs',
  outputDir: '../../storybook-test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  updateSnapshots: 'none',
  workers: 2,
  reporter: [['list'], ['html', { outputFolder: '../../storybook-report', open: 'never' }]],
  snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{arg}{ext}',
  expect: {
    toHaveScreenshot: { animations: 'disabled', caret: 'hide', scale: 'css' },
  },
  use: {
    baseURL: 'http://127.0.0.1:6007',
    browserName: 'chromium',
    headless: true,
    locale: 'en-US',
    timezoneId: 'UTC',
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop-light',
      use: { viewport: { width: 1280, height: 900 }, colorScheme: 'light' },
    },
    {
      name: 'desktop-dark',
      testIgnore: ['isolation.visual.ts', 'native-interactions.visual.ts'],
      use: { viewport: { width: 1280, height: 900 }, colorScheme: 'dark' },
    },
    {
      name: 'mobile-light',
      testIgnore: ['isolation.visual.ts', 'native-interactions.visual.ts'],
      use: {
        viewport: { width: 390, height: 844 },
        colorScheme: 'light',
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'mobile-dark',
      testIgnore: ['isolation.visual.ts', 'native-interactions.visual.ts'],
      use: {
        viewport: { width: 390, height: 844 },
        colorScheme: 'dark',
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: 'node scripts/serve-storybook.mjs',
    cwd: resolve(__dirname, '../..'),
    url: 'http://127.0.0.1:6007',
    reuseExistingServer: false,
    timeout: 15000,
  },
});
