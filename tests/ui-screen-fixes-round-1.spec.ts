import { test, expect } from '@playwright/test';
import { designURL, screenIds, seedDesignScreens } from './design-screen-fixtures';

// Exactly 80 UTF-16 units: the accepted rename from the round-1 F3 finding.
const acceptedName =
  'SundayNewspaperChampionshipNovember2026QualifyingRoundSudokuCollectionVolumeTwen';

test.describe('round-1 F1 · unavailable puzzle link', () => {
  test('a missing link shows the real collection, an explanation and keyboard recovery', async ({
    page,
  }, testInfo) => {
    await seedDesignScreens(page);
    await page.goto('/?puzzle=not-in-this-browser');
    await expect(page.getByRole('heading', { name: 'My puzzles', exact: true })).toBeVisible();
    await expect(page.locator('.kit-puzzle-card')).toHaveCount(4);
    await expect(page.getByText(/isn.t saved in this browser/i)).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath('unavailable.png'),
      fullPage: true,
    });
    const recovery = page.getByRole('link', { name: 'Go to My puzzles' });
    await expect(recovery).toBeVisible();
    await recovery.focus();
    await Promise.all([
      page.waitForURL((url) => !url.searchParams.has('puzzle')),
      page.keyboard.press('Enter'),
    ]);
    await expect(page.getByText(/isn.t saved in this browser/i)).toHaveCount(0);
    await expect(page.locator('.kit-puzzle-card')).toHaveCount(4);
  });

  test('a missing link with a genuinely empty collection keeps the real empty state', async ({
    page,
  }, testInfo) => {
    await seedDesignScreens(page, 'empty');
    await page.goto('/?puzzle=not-in-this-browser');
    await expect(page.getByRole('heading', { name: 'My puzzles', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'A place for every puzzle.' })).toBeVisible();
    await expect(page.locator('.kit-puzzle-card')).toHaveCount(0);
    await expect(page.getByText(/isn.t saved in this browser/i)).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath('unavailable-empty.png'),
      fullPage: true,
    });
  });
});

test.describe('round-1 F2 · denied share fallback focus', () => {
  for (const screen of ['review', 'play', 'history', 'detail'] as const) {
    test(`closing the fallback returns focus to Share puzzle on ${screen}`, async ({
      page,
    }, testInfo) => {
      await seedDesignScreens(page);
      await page.goto(
        designURL(
          screen === 'review' ? screenIds.draft : screenIds.mixed,
          screen === 'play' || screen === 'history' ? screenIds.active : undefined,
        ),
      );
      await expect(page.locator('h1')).toBeVisible();
      if (screen === 'history')
        await page.getByRole('button', { name: 'Move history', exact: true }).click();
      await page.evaluate(() => {
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: { writeText: () => Promise.reject(new DOMException('Denied', 'NotAllowedError')) },
        });
      });
      const share = page.getByRole('button', { name: 'Share puzzle', exact: true });
      await share.focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('#share-link')).toBeAttached();
      const input = page.locator('#share-link');
      await page.keyboard.press('Tab');
      if (screen === 'review' || screen === 'detail') await page.keyboard.press('Tab');
      await expect(input).toBeFocused();
      expect(
        await input.evaluate(
          (element) =>
            (element as HTMLInputElement).selectionStart === 0 &&
            (element as HTMLInputElement).selectionEnd ===
              (element as HTMLInputElement).value.length,
        ),
      ).toBe(true);
      const close = page.getByRole('button', { name: 'Close link', exact: true });
      await page.keyboard.press('Tab');
      await expect(close).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(share).toBeFocused();
      expect(await share.evaluate((element) => element.matches(':focus-visible'))).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`share-focus-${screen}.png`),
      });
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('BODY');
    });
  }

  test('permitted clipboard copy still shows the notice without a fallback', async ({ page }) => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await seedDesignScreens(page);
    await page.goto(designURL(screenIds.mixed));
    await expect(page.locator('h1')).toBeVisible();
    await page.getByRole('button', { name: 'Share puzzle' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Link copied to clipboard.' }),
    ).toBeVisible();
    await expect(page.locator('#share-link')).toHaveCount(0);
  });
});

test.describe('round-1 F3 · detail title reflow', () => {
  for (const width of [320, 360, 390]) {
    test(`accepted 80-character title uses at most six 28px lines at ${width}px`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 844 });
      await seedDesignScreens(page);
      await page.goto(designURL(screenIds.mixed));
      await expect(page.locator('h1')).toBeVisible();
      await page.getByRole('button', { name: 'Rename puzzle' }).click();
      await page.getByRole('textbox', { name: 'Puzzle name' }).fill(acceptedName);
      await page.getByRole('button', { name: 'Save name' }).click();
      const h1 = page.locator('h1');
      await expect(h1).toHaveText(acceptedName);
      const geometry = await h1.evaluate((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        const rects = [...range.getClientRects()];
        return {
          lines: new Set(rects.map((rect) => Math.round(rect.y))).size,
          lineHeight: parseFloat(getComputedStyle(element).lineHeight),
          fontSize: parseFloat(getComputedStyle(element).fontSize),
          width: element.getBoundingClientRect().width,
        };
      });
      expect(geometry.lines).toBeLessThanOrEqual(6);
      expect(geometry.lineHeight).toBe(28);
      expect(geometry.fontSize).toBeGreaterThanOrEqual(24);
      expect(geometry.width).toBeGreaterThan(200);
      const preview = await page.locator('.puzzle-detail__preview').boundingBox();
      const title = await h1.boundingBox();
      expect(preview!.y + preview!.height).toBeLessThanOrEqual(title!.y + 1);
      const rename = page.getByRole('button', { name: 'Rename puzzle' });
      await expect(rename).toBeVisible();
      const box = await rename.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: testInfo.outputPath(`${width}-detail-title.png`),
        fullPage: true,
      });
    });
  }

  test('CJK/emoji and one-letter names stay readable at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 });
    await seedDesignScreens(page, 'worst-case');
    for (const id of [screenIds.ready, screenIds.completed]) {
      await page.goto(designURL(id));
      await expect(page.locator('h1')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
  });

  test('the desktop overview still keeps the preview beside the title', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await seedDesignScreens(page);
    await page.goto(designURL(screenIds.mixed));
    await expect(page.locator('h1')).toBeVisible();
    const preview = await page.locator('.puzzle-detail__preview').boundingBox();
    const information = await page.locator('.puzzle-detail__information').boundingBox();
    expect(preview!.x + preview!.width).toBeLessThanOrEqual(information!.x + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
});
