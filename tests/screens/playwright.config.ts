import { defineConfig } from '@playwright/test';
import appConfig from '../../playwright.config';

export default defineConfig(appConfig, {
  testDir: '..',
  testMatch: 'design-screens.spec.ts',
  globalSetup: '../../scripts/storybook-environment.mjs',
  outputDir: '../../screen-test-results',
  updateSnapshots: 'none',
  metadata: { guardedScreenshots: true },
  snapshotPathTemplate: '{testDir}/screens/__screenshots__/{testName}/{arg}{ext}',
  reporter: [['list'], ['html', { outputFolder: '../../screen-report', open: 'never' }]],
  use: {
    ...appConfig.use,
    channel: undefined,
    locale: 'en-US',
    timezoneId: 'UTC',
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
});
