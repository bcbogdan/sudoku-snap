import { expect, test } from '@playwright/test';
import { THEME_COLORS, THEME_STORAGE_KEY } from '../lib/theme';

for (const colorScheme of ['light', 'dark'] as const) {
  test(`app loads bundled design fonts in system ${colorScheme} mode`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    const failedFonts: string[] = [];
    page.on('response', (response) => {
      if (response.url().includes('/fonts/') && !response.ok()) {
        failedFonts.push(response.url());
      }
    });
    const remoteFonts: string[] = [];
    page.on('request', (request) => {
      if (/fonts\.(googleapis|gstatic)\.com/.test(request.url())) remoteFonts.push(request.url());
    });

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'My puzzles', exact: true })).toBeVisible();
    const fonts = await page.evaluate(async () => {
      const interfaceFaces = await document.fonts.load('700 40px "Bricolage Grotesque"');
      const digitFaces = await document.fonts.load('600 28px "JetBrains Mono"', '0123456789:');
      await document.fonts.ready;
      return {
        interfaceLoaded:
          interfaceFaces.length > 0 && interfaceFaces.every((f) => f.status === 'loaded'),
        digitsLoaded: digitFaces.length > 0 && digitFaces.every((f) => f.status === 'loaded'),
        bodyFamily: getComputedStyle(document.body).fontFamily,
      };
    });
    expect(fonts.interfaceLoaded).toBe(true);
    expect(fonts.digitsLoaded).toBe(true);
    expect(fonts.bodyFamily).toContain('Bricolage Grotesque');
    expect(failedFonts).toEqual([]);
    expect(remoteFonts).toEqual([]);
    await expect(page.locator('html')).toHaveCSS('color-scheme', colorScheme);
    if (colorScheme === 'light') {
      await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(243, 245, 247)');
      await expect(page.locator('body')).toHaveCSS('color', 'rgb(14, 26, 43)');
    }
  });
}

test('theme preference persists, follows system on request, and updates browser chrome', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  const control = page.getByRole('combobox', { name: 'Theme', exact: true });
  await control.selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    'content',
    THEME_COLORS.dark,
  );
  await page.reload();
  await expect(control).toHaveValue('dark');
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark');
  expect(await page.evaluate((key) => localStorage.getItem(key), THEME_STORAGE_KEY)).toBe('dark');
  await control.selectOption('system');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(control).toHaveValue('system');
  expect(errors).toEqual([]);
});

test('stored theme is applied before hydration', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.addInitScript((key) => localStorage.setItem(key, 'dark'), THEME_STORAGE_KEY);
  await page.route('**/_next/**/*.js*', (route) => route.abort());
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(16, 23, 34)');
});

test('custom tints follow their seeds with CSS-only dark-system fallback', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'My puzzles', exact: true })).toBeVisible();
  const colors = await page.evaluate(() => {
    const root = document.documentElement;
    root.removeAttribute('data-theme');
    root.dataset.palette = 'custom';
    root.style.setProperty('--palette-pencil', '#c4b5fd');
    const actual = document.createElement('div');
    actual.style.backgroundColor = 'var(--pencil-soft)';
    const expected = document.createElement('div');
    expected.style.backgroundColor = 'color-mix(in srgb, #c4b5fd 14%, #192333)';
    document.body.append(actual, expected);
    const colors = {
      actual: getComputedStyle(actual).backgroundColor,
      expected: getComputedStyle(expected).backgroundColor,
    };
    actual.remove();
    expected.remove();
    return colors;
  });
  expect(colors.actual).toBe(colors.expected);
});
