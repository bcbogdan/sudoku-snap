import { expect } from '@playwright/test';
import type { Locator } from '@playwright/test';
import { test } from './fixtures';

async function assertTargets(region: Locator) {
  const targets = await region
    .locator('button, a[href], input:not([type="hidden"]), summary')
    .evaluateAll((elements) =>
      elements
        .filter((element) => element.getClientRects().length > 0)
        .map((element) => {
          const bounds = element.getBoundingClientRect();
          return {
            name: element.getAttribute('aria-label') ?? element.textContent?.trim(),
            width: bounds.width,
            height: bounds.height,
          };
        }),
    );
  for (const target of targets) {
    expect(target.width, `${target.name}: target width`).toBeGreaterThanOrEqual(44);
    expect(target.height, `${target.name}: target height`).toBeGreaterThanOrEqual(44);
  }
}

async function assertContained(region: Locator) {
  const overflow = await region.evaluate((element) => {
    const parent = element.getBoundingClientRect();
    return [
      ...element.querySelectorAll('h1, h2, h3, p, button, a, input, summary, progress, dt, dd'),
    ]
      .filter((child) => child.getClientRects().length > 0)
      .filter((child) => {
        const bounds = child.getBoundingClientRect();
        return bounds.left < parent.left - 1 || bounds.right > parent.right + 1;
      })
      .map((child) => child.getAttribute('aria-label') ?? child.textContent?.trim());
  });
  expect(overflow, 'Composite content stays inside its region').toEqual([]);
  const clippedStats = await region
    .locator('.kit-attempt-summary dt, .kit-attempt-summary dd')
    .evaluateAll((elements) =>
      elements
        .filter((element) => element.scrollWidth > element.clientWidth + 1)
        .map((element) => element.textContent),
    );
  expect(clippedStats, 'Summary labels and even very large values remain unclipped').toEqual([]);
}

test.afterEach(async ({ page }) => {
  for (const width of [await page.evaluate(() => innerWidth), 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(() => document.fonts.ready);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
      'Composite fits the project viewport and 320px',
    ).toBeLessThanOrEqual(width);
    const region = page.locator('main').first();
    await assertContained(region);
    await assertTargets(region);
    for (const notice of await page.locator('.kit-copy-notice:visible').all()) {
      const bounds = await notice.boundingBox();
      expect(
        bounds!.x,
        'Floating notice stays inside the left viewport edge',
      ).toBeGreaterThanOrEqual(0);
      expect(
        bounds!.x + bounds!.width,
        'Floating notice stays inside the right viewport edge',
      ).toBeLessThanOrEqual(width);
      expect(
        await notice.evaluate((element) => element.scrollWidth - element.clientWidth),
        'Floating notice text wraps without clipping',
      ).toBeLessThanOrEqual(1);
    }
  }
});

const specimens = [
  'kit-scantips--default',
  'kit-scantips--narrow',
  'app-appheader--default',
  'app-appheader--create',
  'app-appheader--playing',
  'app-appheader--mobile',
  'library-puzzletitle--default',
  'library-puzzletitle--invalid',
  'library-puzzletitle--mobile',
  'library-puzzleactions--default',
  'library-puzzleactions--saving',
  'game-gametoolbar--default',
  'game-gametoolbar--draft',
  'game-gametoolbar--notes-and-mistakes',
  'game-gametoolbar--historical',
  'game-gametoolbar--saving',
  'game-gametoolbar--mobile',
  'app-statusnotice--loading',
  'app-statusnotice--copied',
  'app-statusnotice--narrow-long-message',
  'app-statusnotice--narrow-long-copied',
  'app-appheader--contextual-back',
  'app-appheader--review-status',
  'library-puzzleactions--mobile',
  'game-gametoolbar--busy-draft',
  'game-gametoolbar--narrow-review',
  'kit-puzzlecard--ready-zero-attempts',
  'kit-puzzlecard--draft',
  'kit-puzzlecard--in-progress',
  'kit-puzzlecard--completed',
  'kit-puzzlecard--mixed-attempts',
  'kit-puzzlecard--completed-without-preview',
  'kit-puzzlecard--many-attempts',
  'kit-puzzlecard--long-title-320',
  'kit-puzzlecard--collection-390',
  'kit-collectionfilters--all',
  'kit-collectionfilters--in-progress',
  'kit-collectionfilters--completed',
  'kit-collectionfilters--supplied-counts',
  'kit-collectionfilters--partial-counts',
  'kit-collectionfilters--wrapping-320',
  'kit-collectionfilters--zero-results-320',
  'kit-attemptrow--in-progress',
  'kit-attemptrow--completed',
  'kit-attemptrow--missing-data',
  'kit-attemptrow--zero-values',
  'kit-attemptrow--long-date-and-counts',
  'kit-attemptrow--grouped-attempts',
  'kit-attemptrow--compact-390',
  'kit-attemptrow--narrow-320',
  'kit-attemptsummary--default',
  'kit-attemptsummary--no-completed-attempt',
  'kit-attemptsummary--no-attempts',
  'kit-attemptsummary--zero-time',
  'kit-attemptsummary--large-counts',
  'kit-replaycontrols--middle',
  'kit-replaycontrols--first',
  'kit-replaycontrols--latest',
  'kit-replaycontrols--zero-moves',
  'kit-replaycontrols--busy',
  'kit-replaycontrols--long-timestamp',
  'kit-replaycontrols--clamped-boundary',
  'game-originalphoto--default',
  'app-copynotice--default',
  'app-copynotice--mobile',
  'kit-composites--reference',
] as const;

for (const id of specimens) {
  test(`Composite specimen: ${id}`, async ({ page, openStory }) => {
    await openStory(id);
    const region = page.locator('main').first();
    await expect(region).toBeVisible();
    if (id.startsWith('kit-puzzlecard--')) {
      const boards = region.locator('.kit-board-preview');
      expect(await boards.count()).toBeGreaterThan(0);
      for (const board of await boards.all()) {
        await expect(board.locator('.kit-board-preview__cell')).toHaveCount(81);
        const bounds = await board.boundingBox();
        expect(bounds).not.toBeNull();
        expect(Math.abs(bounds!.width - bounds!.height)).toBeLessThanOrEqual(1);
      }
    }
    const floatingNotice =
      id.startsWith('app-copynotice--') ||
      id === 'app-statusnotice--copied' ||
      id === 'app-statusnotice--narrow-long-copied';
    const capture = floatingNotice ? page.getByRole('status') : region;
    await expect(capture).toBeVisible();
    await expect(capture).toHaveScreenshot(`${id}.png`);
  });
}

test('Long puzzle title wraps without clipping its rename action', async ({ page, openStory }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await openStory('library-puzzletitle--mobile');
  const title = page.getByRole('heading', { level: 1 });
  const geometry = await title.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(element);
    return {
      height: bounds.height,
      lineHeight: Number.parseFloat(getComputedStyle(element).lineHeight),
      clipped: [...range.getClientRects()].some(
        (line) => line.left < bounds.left - 1 || line.right > bounds.right + 1,
      ),
    };
  });
  expect(geometry.height).toBeGreaterThan(geometry.lineHeight);
  expect(geometry.clipped, 'Every title line remains visible').toBe(false);
  await expect(page.getByRole('button', { name: 'Rename puzzle' })).toBeVisible();
});

test('Native replay keys preserve focus and disable boundary controls', async ({
  page,
  openStory,
}) => {
  await openStory('kit-replaycontrols--keyboard-and-callbacks');
  const range = page.getByRole('slider', { name: 'Attempt history' });
  await expect(range).toHaveValue('3');
  await expect(page.getByText('Move 3 of 5', { exact: true })).toBeVisible();
  await range.focus();
  await page.keyboard.press('ArrowRight');
  await expect(range).toHaveValue('4');
  await expect(page.getByText('Move 4 of 5', { exact: true })).toBeVisible();
  await expect(range).toBeFocused();
  await page.keyboard.press('Home');
  await expect(range).toHaveValue('0');
  await expect(page.getByText('Move 0 of 5', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'First move', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Previous move', exact: true })).toBeDisabled();
  await page.keyboard.press('ArrowRight');
  await expect(range).toHaveValue('1');
  await page.keyboard.press('End');
  await expect(range).toHaveValue('5');
  await expect(page.getByText('Move 5 of 5', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next move', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Latest move', exact: true })).toBeDisabled();
  await expect(range).toBeFocused();
  await expect(page.locator('main')).toHaveScreenshot('composite-replay-keyboard-focus.png');
});

test('Rename failure preserves the unsaved value and returns input focus', async ({
  page,
  openStory,
}) => {
  await openStory('library-puzzletitle--save-failure');
  const input = page.getByRole('textbox', { name: 'Puzzle name' });
  const value = await input.inputValue();
  await page.getByRole('button', { name: 'Save name' }).click();
  await expect(input).toBeDisabled();
  await page.getByRole('button', { name: 'Simulate save failure' }).click();
  await expect(page.getByRole('alert')).toContainText('Could not save the puzzle name.');
  await expect(input).toHaveValue(value);
  await expect(input).toBeFocused();
  await expect(page.locator('main')).toHaveScreenshot('composite-title-save-failure.png');
});

test('Original photo zoom scrolls inside its region and reports load failures', async ({
  page,
  openStory,
}) => {
  await openStory('game-originalphoto--narrow-zoomed');
  await page.getByText('Compare original photo', { exact: true }).click();
  const image = page.getByRole('img');
  await expect(image).toBeVisible();
  await image.evaluate(async (element) => (element as HTMLImageElement).decode());
  const zoom = page.getByRole('slider', { name: /Photo zoom/ });
  await expect(zoom).toHaveValue('1');
  expect(await image.evaluate((element) => (element as HTMLElement).style.width)).toBe('100%');
  await zoom.focus();
  await page.keyboard.press('ArrowRight');
  await expect(zoom).toHaveValue('1.5');
  expect(await image.evaluate((element) => (element as HTMLElement).style.width)).toBe('150%');
  await expect(zoom).toBeFocused();
  await page.keyboard.press('End');
  await expect(zoom).toHaveValue('4');
  expect(await image.evaluate((element) => (element as HTMLElement).style.width)).toBe('400%');
  await expect(zoom).toBeFocused();
  await expect(page.locator('main')).toHaveScreenshot('composite-photo-zoom.png');
  await page.keyboard.press('Home');
  await expect(zoom).toHaveValue('1');
  expect(await image.evaluate((element) => (element as HTMLElement).style.width)).toBe('100%');
  await expect(zoom).toBeFocused();
  await image.dispatchEvent('error');
  await expect(page.getByRole('status')).toHaveText('Could not open the original photo.');
  await expect(page.locator('main')).toHaveScreenshot('composite-photo-unreadable.png');
});

test('Composition navigation keeps explicit puzzle and attempt hrefs', async ({
  page,
  openStory,
}) => {
  await openStory('kit-composites--reference');
  const collection = page.getByRole('region', { name: 'Collection components' });
  const hrefs = await collection
    .locator('a[href]')
    .evaluateAll((links) => links.map((link) => link.getAttribute('href')));
  expect(hrefs).toEqual([
    '/?puzzle=misty&attempt=latest',
    '/?puzzle=quiet&attempt=latest',
    '/?puzzle=river&attempt=latest',
    '/?puzzle=draft',
  ]);
  const attempts = page.getByRole('region', { name: 'Attempt components' });
  await expect(attempts.locator('a[href]')).toHaveCount(3);
  for (const number of [3, 2, 1]) {
    await expect(attempts.locator(`a[href="/?puzzle=quiet&attempt=${number}"]`)).toBeVisible();
  }
});

test('Attempt rows retain the reference title/timer hierarchy at 390px', async ({
  page,
  openStory,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const id of ['kit-attemptrow--in-progress', 'kit-attemptrow--completed']) {
    await openStory(id);
    const title = await page.locator('.kit-attempt-row__title').boundingBox();
    const duration = await page.locator('.kit-attempt-row__duration').boundingBox();
    expect(title).not.toBeNull();
    expect(duration).not.toBeNull();
    expect(duration!.x, 'Timer remains to the right of the attempt title').toBeGreaterThanOrEqual(
      title!.x + title!.width,
    );
    expect(
      Math.abs(duration!.y - title!.y),
      'Timer and attempt title share the first row',
    ).toBeLessThanOrEqual(8);
    await assertContained(page.locator('main'));
    await assertTargets(page.locator('main'));
  }
});

test('Reference composition retains 320px target geometry', async ({ page, openStory }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await openStory('kit-composites--reference');
  const region = page.locator('main');
  await assertContained(region);
  await assertTargets(region);
  const geometry = await region.locator('button, a[href], input').evaluateAll((elements) =>
    elements.map((element) => {
      const bounds = element.getBoundingClientRect();
      return {
        name: element.getAttribute('aria-label') ?? element.textContent?.trim(),
        width: bounds.width,
        height: bounds.height,
      };
    }),
  );
  await test.info().attach('reference-320-geometry.json', {
    body: JSON.stringify(geometry, null, 2),
    contentType: 'application/json',
  });
  await expect(region).toHaveScreenshot('composite-reference-320.png');
});

test('Normal summary durations stay readable on one line in the phone composition', async ({
  page,
  openStory,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openStory('kit-composites--reference');
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    const durations = await page.locator('.kit-attempt-summary dd').evaluateAll((elements) =>
      elements
        .filter((element) => /^\d{2}:\d{2}:\d{2}$/.test(element.textContent ?? ''))
        .map((element) => {
          const range = document.createRange();
          range.selectNodeContents(element);
          return { text: element.textContent, lines: range.getClientRects().length };
        }),
    );
    expect(durations).toHaveLength(2);
    for (const duration of durations) {
      expect(
        duration.lines,
        `${width}px ${duration.text}: normal duration must not split its digits`,
      ).toBe(1);
    }
  }
});

test('Number dialog keeps every 44px choice inside a 320px viewport', async ({
  page,
  openStory,
}) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await openStory('game-numberdial--mobile');
  const dialog = page.getByRole('dialog', { name: 'Choose a number' });
  await expect(dialog).toBeVisible();
  await assertTargets(dialog);
  await assertContained(dialog);
  await expect(dialog.getByRole('button')).toHaveCount(11);
  for (const button of await dialog.getByRole('button').all())
    await expect(button).toBeInViewport();
  await expect(dialog).toHaveScreenshot('composite-number-dialog-320.png');
});

test('Composite actions expose native keyboard focus', async ({ page, openStory }) => {
  await openStory('library-puzzleactions--default');
  await page.keyboard.press('Tab');
  const share = page.getByRole('button', { name: 'Share puzzle' });
  await expect(share).toBeFocused();
  const outline = await share.evaluate((element) => {
    const style = getComputedStyle(element);
    return { width: Number.parseFloat(style.outlineWidth), style: style.outlineStyle };
  });
  expect(outline.width).toBeGreaterThanOrEqual(2);
  expect(outline.style).not.toBe('none');
  await expect(page.locator('main')).toHaveScreenshot('composite-actions-keyboard-focus.png');
});

test('Cards and grouped attempt links keep keyboard focus visible', async ({ page, openStory }) => {
  await openStory('kit-puzzlecard--keyboard-and-href');
  const cards = page.locator('main a[href]');
  await cards.first().focus();
  await page.keyboard.press('Tab');
  await expect(cards.nth(1)).toBeFocused();
  await expect(cards.nth(1)).toHaveAttribute('href', '/?puzzle=tomorrow');
  await expect(page.locator('main')).toHaveScreenshot('composite-card-keyboard-focus.png');

  await openStory('kit-attemptrow--grouped-attempts');
  const rows = page.locator('.kit-attempt-row');
  await expect(rows).toHaveCount(3);
  await rows.first().focus();
  await page.keyboard.press('Tab');
  await expect(rows.nth(1)).toBeFocused();
  await expect(rows.nth(1)).toHaveAttribute('href', '#attempt-2');
  const borders = await rows.evaluateAll((elements) =>
    elements.map((element) => {
      const style = getComputedStyle(element);
      return { radius: style.borderRadius, separator: style.borderBottomWidth };
    }),
  );
  expect(borders).toEqual([
    { radius: '0px', separator: '1px' },
    { radius: '0px', separator: '1px' },
    { radius: '0px', separator: '0px' },
  ]);
  await expect(page.locator('main')).toHaveScreenshot('composite-attempt-keyboard-focus.png');
});
