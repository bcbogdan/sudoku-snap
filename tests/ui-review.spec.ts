import { test, expect } from '@playwright/test';
import { designURL, screenIds, seedDesignScreens } from './design-screen-fixtures';
import { puzzleShareURL } from '../lib/sharing';
import { solve } from '../lib/sudoku';
import clues from './fixtures/expected.json';

test('arrows clamp at every board edge and preserve directional movement', async ({ page }) => {
  await seedDesignScreens(page);
  await page.goto(designURL(screenIds.mixed, screenIds.active));
  for (const [start, key, destination] of [
    [0, 'ArrowLeft', 0],
    [0, 'ArrowUp', 0],
    [8, 'ArrowRight', 8],
    [8, 'ArrowUp', 8],
    [9, 'ArrowLeft', 9],
    [72, 'ArrowDown', 72],
    [72, 'ArrowLeft', 72],
    [80, 'ArrowRight', 80],
    [80, 'ArrowDown', 80],
    [40, 'ArrowLeft', 39],
    [40, 'ArrowRight', 41],
    [40, 'ArrowUp', 31],
    [40, 'ArrowDown', 49],
  ] as const) {
    await page.locator(`#cell-${start}`).click();
    await page.keyboard.press(key);
    await expect(page.locator(`#cell-${destination}`)).toBeFocused();
  }
});

test('replay highlights only the current move and restores live selection', async ({ page }) => {
  const { attempts } = await seedDesignScreens(page);
  const active = attempts.find((attempt) => attempt.id === screenIds.active)!;
  await page.goto(designURL(screenIds.mixed, screenIds.active));
  await page.locator('#cell-40').click();
  await page.getByRole('button', { name: 'Move history', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Return to play' })).toBeFocused();
  for (const step of [1, 2, 3, 0]) {
    await page.getByRole('slider').fill(String(step));
    await expect(page.locator('.cell.selected, .cell.peer, .cell.match')).toHaveCount(0);
    await expect(page.locator('[data-replay-current="true"]')).toHaveCount(step ? 1 : 0);
    if (step)
      await expect(page.locator(`#cell-${active.moves[step - 1].cell}`)).toHaveAttribute(
        'aria-current',
        'step',
      );
  }
  await page.locator('#cell-8').click();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#cell-17')).toBeFocused();
  expect(
    await page.locator('#cell-17').evaluate((cell) => getComputedStyle(cell).outlineStyle),
  ).not.toBe('none');
  const before = await page
    .locator('.cell')
    .evaluateAll((cells) => cells.map((cell) => cell.getAttribute('data-value')));
  await page.keyboard.press('9');
  expect(
    await page
      .locator('.cell')
      .evaluateAll((cells) => cells.map((cell) => cell.getAttribute('data-value'))),
  ).toEqual(before);
  await page.getByRole('button', { name: 'Return to play' }).click();
  await expect(page.locator('#cell-40')).toHaveClass(/selected/);
  await expect(page.getByRole('button', { name: 'Move history', exact: true })).toBeFocused();
});

test('completion announces once without stealing focus or announcing on reload', async ({
  page,
  baseURL,
}) => {
  const solution = solve(clues).solution!;
  const almost = [...solution];
  almost[0] = 0;
  await page.goto(puzzleShareURL(baseURL!, almost, 'One final square'));
  await page.getByRole('button', { name: 'Confirm clues & play' }).click();
  const announcement = page.locator('.kit-attempt-history__announcement');
  await expect(announcement).toBeEmpty();
  await announcement.evaluate((element) => {
    const changes: string[] = [];
    Object.assign(window, { completionAnnouncements: changes });
    new MutationObserver(() => changes.push(element.textContent ?? '')).observe(element, {
      childList: true,
    });
  });
  await page.locator('#cell-0').click();
  await page.keyboard.press(String(solution[0]));
  await expect(announcement).toContainText(/Completed in .+ This attempt is locked\./);
  await expect(announcement).toHaveAttribute('role', 'status');
  await expect(announcement).toHaveAttribute('aria-atomic', 'true');
  await expect(page.locator('#cell-0')).toBeFocused();
  await page.getByRole('button', { name: 'Move history', exact: true }).click();
  await page.getByRole('button', { name: 'Return to play' }).click();
  expect(
    await page.evaluate(
      () => (window as unknown as { completionAnnouncements: string[] }).completionAnnouncements,
    ),
  ).toHaveLength(1);
  await page.reload();
  await expect(page.locator('.kit-attempt-history__completion')).toBeVisible();
  await expect(announcement).toBeEmpty();
});

for (const width of [320, 390]) {
  for (const theme of ['light', 'dark']) {
    test(`compact collection, detail and play at ${width}px in ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.emulateMedia({ colorScheme: theme as 'light' | 'dark', reducedMotion: 'reduce' });
      const { puzzles } = await seedDesignScreens(page);
      await page.goto('/');
      await page.evaluate(() => document.fonts.ready);
      await expect(page.getByRole('link', { name: 'New puzzle', exact: true })).toHaveCount(1);
      await expect(page.getByRole('navigation', { name: 'Main navigation' })).toHaveCount(0);
      const long = page.getByRole('heading', { name: puzzles[2].name, exact: true });
      expect(
        await long.evaluate(
          (element) =>
            element.clientHeight <= parseFloat(getComputedStyle(element).lineHeight) * 2 + 1,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `/tmp/opencode/ui-fixes-${width}-${theme}-library.png`,
        fullPage: true,
      });
      for (const id of [screenIds.mixed, screenIds.ready, screenIds.completed]) {
        await page.goto(designURL(id));
        await expect(page.getByRole('button', { name: 'New attempt', exact: true })).toBeVisible();
        if (id === screenIds.mixed) {
          const continuation = page.getByRole('link', { name: 'Continue attempt 3' });
          await expect(continuation).toBeVisible();
          expect((await continuation.boundingBox())!.y).toBeLessThan(600);
          await page.screenshot({
            path: `/tmp/opencode/ui-fixes-${width}-${theme}-detail.png`,
            fullPage: true,
          });
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
      }
      await page.goto(designURL(screenIds.mixed, screenIds.active));
      const undo = await page.getByRole('button', { name: 'Undo move' }).boundingBox();
      const history = await page
        .getByRole('button', { name: 'Move history', exact: true })
        .boundingBox();
      expect(undo!.y).toBe(history!.y);
      expect(undo!.height).toBeGreaterThanOrEqual(44);
      expect(history!.height).toBeGreaterThanOrEqual(44);
      await expect(page.getByRole('button', { name: 'Remove puzzle' })).toHaveCount(0);
      await page.screenshot({
        path: `/tmp/opencode/ui-fixes-${width}-${theme}-play.png`,
        fullPage: true,
      });
      await page.addStyleTag({ content: 'html { font-size: 200%; }' });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    });
  }
}
