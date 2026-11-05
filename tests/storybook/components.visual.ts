import { expect } from '@playwright/test';
import { test } from './fixtures';

test.afterEach(async ({ page }) => {
  const dimensions = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(
    dimensions.content,
    'The component must fit without horizontal scrolling',
  ).toBeLessThanOrEqual(dimensions.viewport);
});

for (const state of ['draft', 'notes-and-mistakes', 'historical', 'completed']) {
  test(`Sudoku board: ${state}`, async ({ page, openStory }) => {
    await openStory(`game-sudokuboard--${state}`);
    const board = page.getByRole('group', { name: 'Sudoku board', exact: true });
    await expect(board).toBeVisible();
    await expect(board.getByRole('button')).toHaveCount(81);
    if (state === 'notes-and-mistakes') {
      const clippedNotes = await board.locator('.notes > span').evaluateAll((notes) =>
        notes
          .filter((note) => {
            if (!note.textContent) return false;
            const cell = note.closest('button')!.getBoundingClientRect();
            const bounds = note.getBoundingClientRect();
            return bounds.top < cell.top || bounds.bottom > cell.bottom;
          })
          .map((note) => note.textContent),
      );
      expect(clippedNotes, 'Every pencil note must fit inside its cell').toEqual([]);
    }
    await expect(page).toHaveScreenshot(`board-${state}.png`, { fullPage: true });
  });
}

for (const scenario of ['empty', 'populated (long names on phones)']) {
  test(`Puzzle library: ${scenario}`, async ({ page, openStory, isMobile }) => {
    const state = scenario === 'empty' ? 'empty' : isMobile ? 'mobile' : 'default';
    await openStory(`library-puzzlelibrary--${state}`);
    await expect(page.getByRole('heading', { name: 'My puzzles', exact: true })).toBeVisible();
    if (state === 'empty') {
      await expect(page.getByRole('link', { name: 'Create a puzzle' })).toBeVisible();
    } else if (isMobile) {
      await expect(
        page.getByRole('heading', { name: 'WeekendPuzzle'.repeat(6), exact: true }),
      ).toBeVisible();
    } else {
      await expect(
        page.getByRole('heading', { name: 'Weekend puzzle', exact: true }),
      ).toBeVisible();
    }
    if (state !== 'empty') {
      const previews = await page.locator('.kit-board-preview').evaluateAll((boards) =>
        boards.map((board) => {
          const preview = board.getBoundingClientRect();
          const card = board.closest('.kit-puzzle-card')!.getBoundingClientRect();
          return {
            square: Math.abs(preview.width - preview.height) <= 1,
            contained:
              preview.left >= card.left &&
              preview.right <= card.right &&
              preview.top >= card.top &&
              preview.bottom <= card.bottom,
            cellsContained: [...board.children].every((cell) => {
              const bounds = cell.getBoundingClientRect();
              return (
                bounds.left >= preview.left &&
                bounds.right <= preview.right + 1 &&
                bounds.top >= preview.top &&
                bounds.bottom <= preview.bottom + 1
              );
            }),
          };
        }),
      );
      expect(previews, 'Board previews must remain square and inside their cards').toEqual([
        { square: true, contained: true, cellsContained: true },
        { square: true, contained: true, cellsContained: true },
      ]);
    }
    await expect(page).toHaveScreenshot(`library-${state}.png`, { fullPage: true });
  });
}

test('Number dialog fits and keeps all choices visible', async ({ page, openStory }) => {
  await openStory('game-numberdial--default');
  const dialog = page.getByRole('dialog', { name: 'Choose a number' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Choose 9', exact: true })).toBeInViewport();
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeInViewport();
  await expect(page).toHaveScreenshot('number-dialog.png', { fullPage: true });
});

for (const [state, message] of [
  ['save-failure', 'Could not save. Please try again.'],
  [
    'stale-conflict',
    'This attempt changed in another tab. Reload to continue without overwriting it.',
  ],
]) {
  test(`Status notice: ${state}`, async ({ page, openStory }) => {
    await openStory(`app-statusnotice--${state}`);
    await expect(page.getByRole('status')).toHaveText(message);
    await expect(page).toHaveScreenshot(`status-${state}.png`, { fullPage: true });
  });
}

for (const state of ['editing', 'saving']) {
  test(`Puzzle title: ${state}`, async ({ page, openStory }) => {
    await openStory(`library-puzzletitle--${state}`);
    const name = page.getByRole('textbox', { name: 'Puzzle name' });
    await expect(name).toHaveValue('Weekend puzzle');
    if (state === 'saving') await expect(name).toBeDisabled();
    else await expect(name).toBeFocused();
    await expect(page).toHaveScreenshot(`title-${state}.png`, { fullPage: true });
  });
}
