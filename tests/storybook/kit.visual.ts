import { expect } from '@playwright/test';
import type { Locator } from '@playwright/test';
import { test } from './fixtures';

async function assertTextContrast(
  text: Locator,
  minimum = 4.5,
  paint: 'text' | 'before' | 'after' | 'outline' | 'selection' = 'text',
) {
  const readings = await text.evaluateAll((elements, paint) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    const luminance = () => {
      const channels = [...context.getImageData(0, 0, 1, 1).data].slice(0, 3).map((channel) => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    return elements.map((element) => {
      const ancestors: Element[] = [];
      for (let parent: Element | null = element; parent; parent = parent.parentElement) {
        ancestors.unshift(parent);
      }
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, 1, 1);
      for (const ancestor of ancestors) {
        context.fillStyle = getComputedStyle(ancestor).backgroundColor;
        context.fillRect(0, 0, 1, 1);
      }
      const background = luminance();
      const style = getComputedStyle(element);
      const color =
        paint === 'before' || paint === 'after'
          ? getComputedStyle(element, `::${paint}`).borderTopColor
          : paint === 'outline'
            ? style.outlineColor
            : paint === 'selection'
              ? style.boxShadow.match(/(?:rgba?|color)\([^)]*\)/)?.[0]
              : style.color;
      context.fillStyle = color ?? 'transparent';
      context.fillRect(0, 0, 1, 1);
      const foreground = luminance();
      return {
        text: element.textContent?.trim(),
        ratio:
          (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05),
      };
    });
  }, paint);
  expect(readings.length, 'Contrast assertions must measure real text').toBeGreaterThan(0);
  for (const reading of readings) {
    expect(reading.ratio, `${reading.text}: ${paint} contrast`).toBeGreaterThanOrEqual(minimum);
  }
}

async function assertControlTargets(controls: Locator, minimumHeight = 52) {
  const dimensions = await controls.evaluateAll((elements) =>
    elements.map((element) => {
      const bounds = element.getBoundingClientRect();
      return {
        label: element.getAttribute('aria-label') ?? element.textContent,
        width: bounds.width,
        height: bounds.height,
        textAndIcon: !!element.textContent?.trim() && !!element.querySelector('.kit-icon'),
        iconOnly: element.getAttribute('data-icon-only') === 'true',
        iconOnlyWidth: Number.parseFloat(
          getComputedStyle(element).getPropertyValue('--control-height'),
        ),
      };
    }),
  );
  expect(dimensions.length).toBeGreaterThan(0);
  for (const control of dimensions) {
    expect(control.height, `${control.label}: target height`).toBeGreaterThanOrEqual(minimumHeight);
    expect(control.width, `${control.label}: target width`).toBeGreaterThanOrEqual(44);
    if (control.textAndIcon) {
      expect(
        control.iconOnly,
        `${control.label}: text action must not opt into icon-only sizing`,
      ).toBe(false);
      expect(
        control.width,
        `${control.label}: text-plus-icon action must not use icon-only width`,
      ).toBeGreaterThan(control.iconOnlyWidth);
    }
    if (control.iconOnly) expect(control.width).toBe(control.iconOnlyWidth);
  }
}

async function assertSquareGrid(grid: Locator, cellSelector: string) {
  const geometry = await grid.evaluate((element, selector) => {
    const bounds = element.getBoundingClientRect();
    const cells = [...element.querySelectorAll(selector)].map((cell) =>
      cell.getBoundingClientRect(),
    );
    return {
      difference: Math.abs(bounds.width - bounds.height),
      count: cells.length,
      contained: cells.every(
        (cell) =>
          cell.left >= bounds.left - 1 &&
          cell.right <= bounds.right + 1 &&
          cell.top >= bounds.top - 1 &&
          cell.bottom <= bounds.bottom + 1,
      ),
    };
  }, cellSelector);
  expect(geometry.difference, 'Nine-by-nine grid stays square').toBeLessThanOrEqual(1);
  expect(geometry.count).toBe(81);
  expect(geometry.contained, 'All 81 cells fit inside the grid').toBe(true);
}

test.afterEach(async ({ page }) => {
  for (const width of [await page.evaluate(() => innerWidth), 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
      'Kit must fit at 320px and the project viewport',
    ).toBeLessThanOrEqual(width);
    const controls = page.locator('.kit-button, .kit-keypad__key');
    if (await controls.count()) await assertControlTargets(controls);
  }
});

const specimens = [
  { id: 'kit-icon--all-icons', region: '.controls-stories', kind: 'icons' },
  { id: 'kit-icon--sizes', region: '.controls-stories', kind: 'icon-sizes' },
  { id: 'kit-button--variants', region: '.controls-stories', kind: 'button-variants' },
  { id: 'kit-button--aria-disabled', region: '.controls-stories', kind: 'aria-disabled' },
  { id: 'kit-button--reference-kit', region: '.controls-stories', kind: 'buttons' },
  { id: 'kit-button--narrow-long-labels', region: '.controls-stories', kind: 'buttons' },
  { id: 'kit-toggle--states', region: '.controls-stories', kind: 'toggles' },
  { id: 'kit-toggle--narrow-long-label', region: '.controls-stories', kind: 'toggles' },
  { id: 'kit-badge--all-states', region: '.kit-status-story', kind: 'badges' },
  { id: 'kit-badge--narrow-long-text-and-counts', region: '.kit-status-story', kind: 'badges' },
  { id: 'kit-alert--default-alert', region: '.kit-status-story', kind: 'alert' },
  { id: 'kit-alert--polite-status', region: '.kit-status-story', kind: 'polite-alert' },
  { id: 'kit-alert--storage-failure', region: '.kit-status-story', kind: 'alert' },
  { id: 'kit-alert--narrow-long-content', region: '.kit-status-story', kind: 'alert' },
  { id: 'kit-cornerframe--all-states', region: '.kit-status-story', kind: 'frames' },
  { id: 'kit-cornerframe--narrow-long-content', region: '.kit-status-story', kind: 'frames' },
  { id: 'kit-boardpreview--clues-only', region: 'main', kind: 'preview' },
  { id: 'kit-boardpreview--in-progress', region: 'main', kind: 'preview' },
  { id: 'kit-boardpreview--completed', region: 'main', kind: 'preview' },
  { id: 'kit-boardpreview--empty', region: 'main', kind: 'preview' },
  { id: 'kit-boardpreview--narrow', region: 'main', kind: 'preview' },
  { id: 'kit-boardpreview--long-title-narrow', region: 'main', kind: 'preview' },
  { id: 'kit-photodropzone--default', region: '.kit-photo-drop-story', kind: 'upload' },
  { id: 'kit-photodropzone--invalid', region: '.kit-photo-drop-story', kind: 'upload' },
  { id: 'kit-photodropzone--busy', region: '.kit-photo-drop-story', kind: 'upload' },
  { id: 'kit-photodropzone--narrow', region: '.kit-photo-drop-story', kind: 'upload' },
  { id: 'game-numberkeypad--default', region: 'main', kind: 'keypad' },
  { id: 'game-numberkeypad--counts-and-selection', region: 'main', kind: 'keypad' },
  { id: 'game-numberkeypad--historical', region: 'main', kind: 'keypad' },
  { id: 'game-numberkeypad--saving', region: 'main', kind: 'keypad' },
  { id: 'game-numberkeypad--mobile', region: 'main', kind: 'keypad' },
  { id: 'game-attempttimer--running', region: 'main', kind: 'timer' },
  { id: 'game-attempttimer--historical', region: 'main', kind: 'timer' },
  { id: 'game-attempttimer--long-duration', region: 'main', kind: 'timer' },
  { id: 'kit-savestatus--saved', region: '.kit-status-story', kind: 'save' },
  { id: 'kit-savestatus--saving', region: '.kit-status-story', kind: 'save' },
  { id: 'kit-savestatus--error', region: '.kit-status-story', kind: 'save' },
  { id: 'kit-savestatus--narrow-long-error-text', region: '.kit-status-story', kind: 'save' },
  { id: 'kit-savestatus--saved-ignores-error-text', region: '.kit-status-story', kind: 'save' },
  { id: 'kit-mistakecounter--zero', region: '.kit-status-story', kind: 'mistakes' },
  { id: 'kit-mistakecounter--one', region: '.kit-status-story', kind: 'mistakes' },
  { id: 'kit-mistakecounter--many', region: '.kit-status-story', kind: 'mistakes' },
  { id: 'kit-mistakecounter--narrow', region: '.kit-status-story', kind: 'mistakes' },
] as const;

for (const { id, region: selector, kind } of specimens) {
  test(`Kit specimen: ${id}`, async ({ page, openStory }) => {
    await openStory(id);
    const region = page.locator(selector).first();
    await expect(region).toBeVisible();
    if (kind === 'icons' || kind === 'icon-sizes') {
      const icons = region.locator('svg');
      await expect(icons).toHaveCount(kind === 'icons' ? 21 : 4);
      for (const icon of await icons.all()) {
        await expect(icon).toHaveAttribute('aria-hidden', 'true');
        await expect(icon).toHaveAttribute('focusable', 'false');
        await expect(icon).toHaveAttribute('stroke', 'currentColor');
      }
      if (kind === 'icon-sizes')
        expect(
          await icons.evaluateAll((elements) =>
            elements.map((element) => element.getBoundingClientRect().width),
          ),
        ).toEqual([16, 20, 24, 32]);
    }
    if (kind === 'buttons' || kind === 'button-variants' || kind === 'toggles') {
      await assertControlTargets(region.locator('.kit-button'));
      await assertTextContrast(
        region.locator('.kit-button:not(:disabled):not([aria-disabled="true"])'),
      );
      if (kind === 'button-variants') {
        await expect(region.locator('button:disabled')).toHaveCount(4);
        await expect(region.locator('[aria-busy="true"][aria-disabled="true"]')).toHaveCount(4);
        await expect(region.getByRole('button', { name: 'Rename puzzle' })).toHaveCount(4);
      }
      if (kind === 'toggles') {
        for (const toggle of await region.locator('.kit-toggle').all()) {
          const pressed = await toggle.getAttribute('aria-pressed');
          expect(['true', 'false']).toContain(pressed);
          await expect(toggle).toContainText(pressed === 'true' ? 'On' : 'Off');
        }
      }
    }
    if (kind === 'aria-disabled') {
      await assertControlTargets(region.getByRole('button'));
      await expect(region.locator('button[aria-disabled="true"]:not(:disabled)')).toHaveCount(2);
      await expect(region.locator('button:disabled')).toHaveCount(1);
    }
    if (kind === 'badges') {
      const badges = region.locator('.kit-badge');
      expect(await badges.count()).toBeGreaterThan(0);
      await expect(badges.locator('svg[aria-hidden="true"]')).toHaveCount(await badges.count());
      await expect(region.getByRole('status')).toHaveCount(0);
      await expect(region.getByRole('alert')).toHaveCount(0);
      await assertTextContrast(region.locator('.kit-badge__content'));
    }
    if (kind === 'alert' || kind === 'polite-alert') {
      await expect(region.getByRole(kind === 'alert' ? 'alert' : 'status')).toBeVisible();
      await expect(region.locator('.kit-alert__icon')).toHaveAttribute('aria-hidden', 'true');
      await assertTextContrast(region.locator('.kit-alert__content'));
    }
    if (kind === 'frames') {
      const frames = region.locator('.kit-corner-frame');
      const count = id.endsWith('--all-states') ? 4 : 1;
      await expect(frames).toHaveCount(count);
      await expect(frames.locator('.kit-corner-frame__corner[aria-hidden="true"]')).toHaveCount(
        count * 4,
      );
      await expect(region.getByRole('status')).toHaveCount(0);
      await expect(region.getByRole('alert')).toHaveCount(0);
      if (count === 4)
        expect(
          await frames.evaluateAll((elements) =>
            elements.map((element) => element.getAttribute('data-state')),
          ),
        ).toEqual(['waiting', 'checking', 'unreadable', 'completed']);
    }
    if (kind === 'preview') {
      const preview = region.locator('.kit-board-preview');
      await expect(preview).toHaveAttribute('aria-hidden', 'true');
      await expect(preview.locator('button, [id], [tabindex]')).toHaveCount(0);
      await assertSquareGrid(preview, '.kit-board-preview__cell');
      if (id.endsWith('--completed'))
        await expect(preview).toHaveAttribute('data-completed', 'true');
      if (id.endsWith('--in-progress'))
        expect(await preview.locator('[data-entered="true"]').count()).toBeGreaterThan(0);
      if (id.endsWith('--empty')) expect((await preview.textContent())?.trim()).toBe('');
    }
    if (kind === 'upload') {
      const busy = id.endsWith('--busy');
      const input = region.getByLabel(busy ? 'Reading your photo…' : 'Choose a Sudoku photo', {
        exact: true,
      });
      await expect(input).toHaveAttribute('type', 'file');
      await expect(input).toHaveAttribute('accept', 'image/*');
      await expect(input).toHaveAccessibleDescription(
        /^or drop or paste an image up\s+to\s+20\s+MB$/,
      );
      if (busy) await expect(input).toBeDisabled();
      else await expect(input).toBeEnabled();
      await expect(region.locator('.kit-photo-drop')).toHaveAttribute('aria-busy', String(busy));
      await expect(region.locator('.kit-corner-frame')).toHaveAttribute(
        'data-state',
        busy ? 'checking' : id.endsWith('--invalid') ? 'unreadable' : 'waiting',
      );
      await assertTextContrast(
        region.locator('.kit-photo-drop__label, .kit-photo-drop__description'),
      );
    }
    if (kind === 'keypad') {
      const keys = region.getByRole('group', { name: 'Number pad' }).getByRole('button');
      await expect(keys).toHaveCount(10);
      await assertControlTargets(keys);
      const disabled = id.endsWith('--historical') || id.endsWith('--saving');
      await expect(region.locator('.kit-keypad__key:disabled')).toHaveCount(disabled ? 10 : 0);
      if (!disabled) await assertTextContrast(keys);
      if (id.endsWith('--counts-and-selection')) {
        await expect(
          region.getByRole('button', { name: 'Enter 1', exact: true }),
        ).toHaveAccessibleDescription('7 remaining');
        const exhausted = region.getByRole('button', { name: 'Enter 5', exact: true });
        await expect(exhausted).toHaveAttribute('data-exhausted', 'true');
        await expect(exhausted).toHaveAccessibleDescription('0 remaining');
        await expect(exhausted).toBeEnabled();
        await expect(region.getByRole('button', { name: 'Enter 7', exact: true })).toHaveAttribute(
          'aria-pressed',
          'true',
        );
        await expect(region.locator('.kit-keypad__count')).toHaveCount(9);
        await assertTextContrast(region.locator('.kit-keypad__count').filter({ hasText: /\d/ }));
      }
    }
    if (kind === 'timer') {
      const timer = region.getByLabel('Attempt duration');
      await expect(timer).toHaveText(
        id.endsWith('--long-duration')
          ? '100:00:00'
          : id.endsWith('--historical')
            ? '00:00:00'
            : '00:00:19',
      );
      await expect(timer).not.toHaveAttribute('aria-live');
      await expect(region.getByRole('status')).toHaveCount(0);
      await assertTextContrast(timer);
    }
    if (kind === 'save') {
      const status = region.getByRole('status');
      await expect(status).toHaveAttribute('aria-live', 'polite');
      await expect(status).toHaveAttribute('aria-atomic', 'true');
      await expect(status.locator('svg')).toHaveAttribute('aria-hidden', 'true');
      await expect(region.getByRole('alert')).toHaveCount(0);
      const state = id.endsWith('--saving')
        ? 'saving'
        : id.endsWith('--error') || id.endsWith('--narrow-long-error-text')
          ? 'error'
          : 'saved';
      await expect(status).toHaveAttribute('data-state', state);
      await expect(status).toContainText(
        { saving: 'Saving…', saved: 'Saved', error: 'Could not save' }[state],
      );
      if (id.endsWith('--saved-ignores-error-text')) await expect(status).toHaveText('Saved');
      if (id.endsWith('--narrow-long-error-text'))
        await expect(status).toContainText(
          'Device storage is full. Free some space, then try saving again.',
        );
      await assertTextContrast(region.locator('.kit-save-status__text'));
    }
    if (kind === 'mistakes') {
      const count = id.endsWith('--zero')
        ? 0
        : id.endsWith('--one')
          ? 1
          : id.endsWith('--many')
            ? 12345
            : 123456789;
      await expect(region.locator('.kit-mistake-counter')).toHaveText(`Mistakes ${count}`);
      await expect(region.locator('.kit-mistake-counter svg[aria-hidden="true"]')).toHaveCount(
        count > 0 ? 1 : 0,
      );
      await expect(region.locator('[aria-live], [role="status"], [role="alert"]')).toHaveCount(0);
      await assertTextContrast(region.locator('.kit-mistake-counter__text'));
    }
    await expect(region).toHaveScreenshot(`${id}.png`);
  });
}

for (const state of [
  'clues-and-entries',
  'selected-empty',
  'selected-clue-and-matching-digits',
  'selected-entry-and-peers',
  'all-nine-notes',
  'mistake-unselected',
  'wrong-selected',
  'unclear-unselected',
  'unclear-selected',
  'wrong-unclear-selected-and-focused',
  'current-replay',
  'replay-wrong-unclear-selected',
  'replay-notes-unclear-selected-and-focused',
  'narrow-combined-states',
]) {
  test(`Kit board state: ${state}`, async ({ page, openStory }) => {
    await openStory(`game-sudokuboard--${state}`);
    const board = page.getByRole('group', { name: 'Sudoku board', exact: true });
    await assertSquareGrid(board, '.cell');
    const cells = board.getByRole('button');
    await expect(board).toHaveCSS('border-top-width', '3px');
    await expect(cells.nth(0)).toHaveCSS('border-right-width', '1px');
    await expect(cells.nth(2)).toHaveCSS('border-right-width', '2px');
    await expect(cells.nth(18)).toHaveCSS('border-bottom-width', '2px');
    const wrong = board.locator('[data-wrong="true"]');
    for (const cell of await wrong.all()) {
      await expect(cell).toHaveAccessibleDescription(/Incorrect number\./);
      expect(
        await cell.evaluate((element) => getComputedStyle(element, '::before').borderTopStyle),
      ).toBe('solid');
      expect(
        await cell.evaluate((element) => getComputedStyle(element, '::before').borderTopWidth),
      ).toBe('2px');
    }
    for (const cell of await board.locator('[data-unclear="true"]').all()) {
      await expect(cell).toHaveAccessibleDescription(/Needs review\./);
      expect(
        await cell.evaluate((element) => getComputedStyle(element, '::after').borderTopStyle),
      ).toBe('dashed');
    }
    if (state.endsWith('and-focused')) {
      await page.keyboard.press('Tab');
      const selected = board.locator('.selected');
      await expect(selected).toBeFocused();
      if (state === 'wrong-unclear-selected-and-focused')
        await expect(selected).toHaveClass(/wrong/);
      await expect(selected).toHaveClass(/uncertain/);
      await expect(selected).toHaveCSS('outline-style', 'solid');
      await expect(selected).not.toHaveCSS('box-shadow', 'none');
    }
    if (state === 'current-replay' || state.startsWith('replay-')) {
      const replay = board.locator('[aria-current="step"]');
      await expect(replay).toHaveCount(1);
      await expect(replay).toHaveAccessibleDescription(/Current replay move\./);
      if (await replay.locator('.kit-sudoku-board__digit').count())
        await assertTextContrast(replay.locator('.kit-sudoku-board__digit'));
      if ((await replay.getAttribute('data-wrong')) === 'true')
        await assertTextContrast(replay, 3, 'before');
      if ((await replay.getAttribute('data-unclear')) === 'true')
        await assertTextContrast(replay, 3, 'after');
      if ((await replay.getAttribute('aria-pressed')) === 'true')
        await assertTextContrast(replay, 3, 'selection');
      if (state.endsWith('and-focused')) await assertTextContrast(replay, 3, 'outline');
    }
    if (state === 'all-nine-notes') {
      await expect(cells.nth(0)).toHaveAccessibleDescription(
        'Pencil notes: 1, 2, 3, 4, 5, 6, 7, 8, 9.',
      );
      await expect(cells.nth(0).locator('.notes')).toHaveText('123456789');
      const clipped = await board.locator('.notes > span').evaluateAll((notes) =>
        notes.some((note) => {
          const cell = note.closest('button')!.getBoundingClientRect();
          const bounds = note.getBoundingClientRect();
          return bounds.top < cell.top || bounds.bottom > cell.bottom;
        }),
      );
      expect(clipped, 'All nine note positions fit inside their cell').toBe(false);
    }
    if (state !== 'selected-empty' && state !== 'all-nine-notes') {
      await assertTextContrast(board.locator('.kit-sudoku-board__digit'));
    }
    const notes = board.locator('.notes > span').filter({ hasText: /\d/ });
    if (await notes.count()) await assertTextContrast(notes);
    await expect(board).toHaveScreenshot(`kit-board-${state}.png`);
    await page.setViewportSize({ width: 320, height: 844 });
    await assertSquareGrid(board, '.cell');
  });
}

test('Kit button pointer and keyboard feedback', async ({ page, openStory, isMobile }) => {
  await openStory('kit-button--default');
  const region = page.locator('.controls-stories');
  const button = region.getByRole('button', { name: 'Undo move' });
  await page.keyboard.press('Tab');
  await expect(button).toBeFocused();
  await expect(button).toHaveCSS('outline-style', 'solid');
  await expect(region).toHaveScreenshot('kit-button-focus.png');
  if (!isMobile) {
    await button.hover();
    await expect(region).toHaveScreenshot('kit-button-hover.png');
    await page.mouse.down();
    try {
      await expect(region).toHaveScreenshot('kit-button-pressed.png');
    } finally {
      await page.mouse.up();
    }
  }
});

test('Kit toggle exposes the changed state to keyboard users', async ({ page, openStory }) => {
  await openStory('kit-toggle--default');
  const toggle = page.getByRole('button', { name: 'Pencil notes', exact: true });
  await page.keyboard.press('Tab');
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Space');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(toggle).toContainText('On');
  await expect(page.locator('.controls-stories')).toHaveScreenshot('kit-toggle-keyboard-on.png');
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
});

test('Kit photo drop zone shows nested dragging and keyboard focus', async ({
  page,
  openStory,
}) => {
  await openStory('kit-photodropzone--default');
  const region = page.locator('.kit-photo-drop-story');
  const zone = region.locator('.kit-photo-drop');
  const input = region.getByLabel('Choose a Sudoku photo', { exact: true });
  await page.keyboard.press('Tab');
  await expect(input).toBeFocused();
  await expect(zone).toHaveCSS('outline-style', 'solid');
  await expect(region).toHaveScreenshot('kit-photo-drop-focus.png');
  const transfer = await page.evaluateHandle(() => new DataTransfer());
  try {
    await zone.dispatchEvent('dragenter', { dataTransfer: transfer });
    const camera = region.locator('.kit-photo-drop__camera');
    await camera.dispatchEvent('dragenter', { dataTransfer: transfer });
    await camera.dispatchEvent('dragleave', { dataTransfer: transfer });
    await expect(zone).toHaveAttribute('data-dragging', 'true');
    await expect(region.getByLabel('Drop to add', { exact: true })).toBeVisible();
    await expect(region).toHaveScreenshot('kit-photo-drop-dragging.png');
    await zone.dispatchEvent('dragleave', { dataTransfer: transfer });
    await expect(zone).toHaveAttribute('data-dragging', 'false');
  } finally {
    await transfer.dispose();
  }
});

test('Kit reference composition', async ({ page, openStory }) => {
  await openStory('kit-reference--components');
  const region = page.locator('.design-kit');
  await expect(region.getByRole('heading', { name: 'Quiet until it matters.' })).toBeVisible();
  await expect(region.getByRole('group', { name: 'Number pad' }).getByRole('button')).toHaveCount(
    10,
  );
  await assertSquareGrid(region.getByRole('group', { name: 'Sudoku board', exact: true }), '.cell');
  await expect(region.locator('.kit-board-preview')).toHaveCount(2);
  await expect(region.getByRole('alert')).toContainText('Could not find a Sudoku grid.');
  await expect(region).toHaveScreenshot('kit-reference-components.png');
});

for (const state of [
  'replay-wrong-unclear-selected',
  'replay-notes-unclear-selected-and-focused',
]) {
  test(`Alternate palette replay contrast: ${state}`, async ({ page, openStory }) => {
    await openStory(`game-sudokuboard--${state}`);
    await page.evaluate(() => {
      const root = document.documentElement;
      const dark = matchMedia('(prefers-color-scheme: dark)').matches;
      root.dataset.palette = 'custom';
      root.style.setProperty('--palette-pencil', dark ? '#C4ADFF' : '#6542B5');
      root.style.setProperty('--palette-flash', '#F3A4DE');
      root.style.setProperty('--palette-mistake', dark ? '#FFBCAF' : '#9B382D');
    });
    const board = page.getByRole('group', { name: 'Sudoku board', exact: true });
    const replay = board.locator('[aria-current="step"]');
    await page.keyboard.press('Tab');
    await expect(replay).toBeFocused();
    await assertTextContrast(replay, 3, 'selection');
    await assertTextContrast(replay, 3, 'outline');
    await assertTextContrast(replay, 3, 'after');
    if (state === 'replay-wrong-unclear-selected') {
      await assertTextContrast(replay, 3, 'before');
      await assertTextContrast(replay.locator('.kit-sudoku-board__digit'));
    } else {
      await assertTextContrast(replay.locator('.notes > span').filter({ hasText: /\d/ }));
    }
    await expect(board).toHaveScreenshot(`kit-alternate-${state}.png`);
  });
}
