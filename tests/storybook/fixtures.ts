import { expect, test as base } from '@playwright/test';

export const test = base.extend<{ openStory: (id: string) => Promise<void> }>({
  openStory: async ({ page, baseURL }, use) => {
    const errors: string[] = [];
    const forbiddenRequests: string[] = [];
    const failedFonts: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('requestfailed', (request) => {
      if (new URL(request.url()).pathname.startsWith('/fonts/')) {
        failedFonts.push(request.url());
      }
    });
    page.on('response', (response) => {
      if (new URL(response.url()).pathname.startsWith('/fonts/') && !response.ok()) {
        failedFonts.push(response.url());
      }
    });
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== baseURL || /^\/(vendor|api)\//.test(url.pathname)) {
        forbiddenRequests.push(url.href);
        await route.abort();
      } else {
        await route.continue();
      }
    });
    await page.addInitScript(() => {
      // Fail immediately if a supposedly presentational story touches app storage.
      indexedDB.open = () => {
        throw new Error('Isolated stories must not open IndexedDB');
      };
    });

    await use(async (id) => {
      // Embed mode does not auto-run play functions: visuals capture the named
      // fixture state, while Vitest separately runs and checks interactions.
      await page.goto(`/iframe.html?id=${encodeURIComponent(id)}&viewMode=story&embed=true`);
      // Empty board previews have no text but still render a meaningful grid.
      await expect(page.locator('#storybook-root > *').first()).toBeVisible();
      await expect(page.locator('.sb-errordisplay')).not.toBeVisible();
      await page.evaluate(() => document.fonts.ready);
    });

    expect(errors, 'Story must render without browser exceptions').toEqual([]);
    expect(failedFonts, 'Bundled fonts must load successfully').toEqual([]);
    expect(
      forbiddenRequests,
      'Story must not request external services, app routes or OCR',
    ).toEqual([]);
    expect(
      await page.evaluate(() => indexedDB.databases()),
      'Stories must not create databases',
    ).toEqual([]);
  },
});
