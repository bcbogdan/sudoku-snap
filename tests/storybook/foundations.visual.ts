import { expect } from '@playwright/test';
import type { Locator } from '@playwright/test';
import { test } from './fixtures';

async function assertContrast(region: Locator) {
  const pairs = await region.locator('[data-contrast-pair]').evaluateAll((elements) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    const luminance = (color: string) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      const rgb = [...context.getImageData(0, 0, 1, 1).data].slice(0, 3).map((channel) => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    };
    return elements.map((element) => {
      const style = getComputedStyle(element);
      const foreground = luminance(style.color);
      const background = luminance(style.backgroundColor);
      return {
        label: element.getAttribute('data-contrast-pair'),
        ratio:
          (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05),
      };
    });
  });
  expect(pairs).toHaveLength(9);
  for (const pair of pairs)
    expect(pair.ratio, `${pair.label} text contrast`).toBeGreaterThanOrEqual(4.5);
}

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => innerWidth),
  );
});

for (const section of ['palette', 'typography', 'geometry', 'semantic-pairs']) {
  test(`Foundation specimen: ${section}`, async ({ page, openStory }) => {
    await openStory(`design-foundations--${section}`);
    const region = page.locator('[data-foundation]');
    await expect(region).toBeVisible();
    await expect(page.locator('.design-foundations')).toHaveScreenshot(
      `foundations-${section}.png`,
    );
    if (section === 'palette') {
      expect(await page.locator('html').getAttribute('data-theme')).toBeNull();
      const dark = await page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches);
      await expect(page.locator('.design-foundations')).toHaveCSS(
        'background-color',
        dark ? 'rgb(16, 23, 34)' : 'rgb(243, 245, 247)',
      );
    }
    if (section === 'geometry') {
      expect(
        await page
          .locator('.foundation-spacing span')
          .evaluateAll((elements) =>
            elements.map((element) => element.getBoundingClientRect().width),
          ),
      ).toEqual([4, 8, 12, 16, 24, 32]);
      expect(
        await page
          .locator('.foundation-radii div')
          .evaluateAll((elements) =>
            elements.map((element) => getComputedStyle(element).borderRadius),
          ),
      ).toEqual(['0px', '8px', '14px', '20px']);
      expect(
        await page
          .locator('.foundation-strokes span')
          .evaluateAll((elements) =>
            elements.map((element) => getComputedStyle(element).borderTopWidth),
          ),
      ).toEqual(['1px', '2px', '3px']);
      expect(
        await page
          .locator('.foundation-targets span')
          .evaluateAll((elements) =>
            elements.map((element) => element.getBoundingClientRect().height),
          ),
      ).toEqual([44, 52]);
    }
    if (section === 'semantic-pairs') await assertContrast(region);
    if (section === 'typography') {
      const loaded = await page.evaluate(() => [
        document.fonts.check('700 40px "Bricolage Grotesque"'),
        document.fonts.check('600 22px "JetBrains Mono"'),
      ]);
      expect(loaded).toEqual([true, true]);
      await expect(page.locator('[data-font="interface"]')).toHaveCSS(
        'font-family',
        /Bricolage Grotesque/,
      );
      await expect(page.locator('[data-font="mono"]')).toHaveCSS('font-family', /JetBrains Mono/);
    }
  });
}

for (const theme of ['light', 'dark']) {
  test(`Explicit ${theme} overrides the opposite OS theme`, async ({ page, openStory }) => {
    await page.emulateMedia({ colorScheme: theme === 'light' ? 'dark' : 'light' });
    await openStory(`design-foundations--forced-${theme}`);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page.locator('.design-foundations')).toHaveCSS(
      'background-color',
      theme === 'light' ? 'rgb(243, 245, 247)' : 'rgb(16, 23, 34)',
    );
    await assertContrast(page.locator('.design-foundations'));
  });
}

test('Alternate main colors propagate through semantic roles and retain contrast', async ({
  page,
  openStory,
}) => {
  const swatch = (token: string) =>
    page
      .locator(`[data-token="${token}"]`)
      .evaluate((element) => getComputedStyle(element).backgroundColor);
  await openStory('design-foundations--forced-light');
  const defaults = await Promise.all(
    ['pencil', 'pencil-soft', 'flash', 'flash-soft', 'completed-soft', 'mistake-soft'].map(swatch),
  );
  await page.emulateMedia({ colorScheme: 'light' });
  await openStory('design-foundations--alternate-palette');
  const alternate = await Promise.all(
    ['pencil', 'pencil-soft', 'flash', 'flash-soft', 'completed-soft', 'mistake-soft'].map(swatch),
  );
  for (let index = 0; index < defaults.length; index++)
    expect(alternate[index]).not.toBe(defaults[index]);
  await assertContrast(page.locator('.design-foundations'));
  await expect(page.locator('[data-contrast-pair="Flash action"]')).toHaveCSS(
    'background-color',
    alternate[2],
  );
  await expect(page.locator('.design-foundations')).toHaveScreenshot(
    'foundations-alternate-light.png',
  );
  await page.emulateMedia({ colorScheme: 'dark' });
  await openStory('design-foundations--forced-dark');
  const darkDefaults = await Promise.all(
    ['pencil', 'pencil-soft', 'flash', 'flash-soft', 'completed-soft', 'mistake-soft'].map(swatch),
  );
  await openStory('design-foundations--alternate-palette');
  const darkAlternate = await Promise.all(
    ['pencil', 'pencil-soft', 'flash', 'flash-soft', 'completed-soft', 'mistake-soft'].map(swatch),
  );
  for (let index = 0; index < darkDefaults.length; index++)
    expect(darkAlternate[index]).not.toBe(darkDefaults[index]);
  await assertContrast(page.locator('.design-foundations'));
  await expect(page.locator('.design-foundations')).toHaveScreenshot(
    'foundations-alternate-dark.png',
  );
});

test('Foundation focus ring and narrow layouts remain visible', async ({ page, openStory }) => {
  await openStory('design-foundations--semantic-pairs');
  await page.keyboard.press('Tab');
  const focus = page.getByRole('button', { name: 'Keyboard focus specimen' });
  await expect(focus).toBeFocused();
  await expect(focus).toHaveCSS('outline-style', 'solid');
  await expect(focus).toHaveCSS('outline-width', '3px');
  await expect(focus).toHaveCSS('outline-offset', '4px');
  await expect(page.locator('.design-foundations')).toHaveScreenshot('foundations-focus.png');
  for (const width of [320, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await focus.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    await expect(focus).toBeInViewport();
  }
});
