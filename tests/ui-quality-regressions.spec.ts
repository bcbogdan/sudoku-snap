import { test, expect, type Page } from '@playwright/test';
import { designURL, screenIds, seedDesignScreens } from './design-screen-fixtures';
import clues from './fixtures/expected.json';
import { solve } from '../lib/sudoku';

test.use({ isMobile: true, hasTouch: true });

async function boardState(page: Page) {
  return page.locator('.cell').evaluateAll((cells) =>
    cells.map((cell) => ({
      value: cell.getAttribute('data-value'),
      notes: cell.textContent,
      selected: cell.getAttribute('aria-pressed'),
      tabIndex: cell.getAttribute('tabindex'),
    })),
  );
}

for (const modifier of ['ctrlKey', 'metaKey', 'altKey'] as const) {
  test(`${modifier} chords leave board, notes, selection and browser defaults untouched`, async ({
    page,
  }) => {
    await seedDesignScreens(page);
    for (const mode of ['review', 'play', 'replay']) {
      await page.goto(
        designURL(
          mode === 'review' ? screenIds.draft : screenIds.mixed,
          mode === 'review' ? undefined : screenIds.active,
        ),
      );
      if (mode === 'replay')
        await page.getByRole('button', { name: 'Move history', exact: true }).click();
      await page.locator('#cell-40').click();
      const before = await boardState(page);
      const notesBefore =
        mode === 'play'
          ? await page.getByRole('button', { name: 'Pencil notes' }).getAttribute('aria-pressed')
          : null;
      for (const key of [
        '1',
        'Delete',
        'Backspace',
        '0',
        'ArrowLeft',
        'ArrowRight',
        'ArrowUp',
        'ArrowDown',
        'n',
      ]) {
        const prevented = await page.locator('#cell-40').evaluate(
          (cell, input) => {
            const event = new KeyboardEvent('keydown', {
              key: input.key,
              [input.modifier]: true,
              bubbles: true,
              cancelable: true,
            });
            cell.dispatchEvent(event);
            return event.defaultPrevented;
          },
          { key, modifier },
        );
        expect(prevented, `${mode}: ${modifier} + ${key}`).toBe(false);
        expect(await boardState(page)).toEqual(before);
        await expect(page.locator('#cell-40')).toBeFocused();
        if (mode === 'play')
          await expect(page.getByRole('button', { name: 'Pencil notes' })).toHaveAttribute(
            'aria-pressed',
            notesBefore!,
          );
      }
      if (mode === 'play') {
        await page.getByRole('button', { name: 'Move history', exact: true }).click();
        await expect(page.getByRole('slider')).toHaveAttribute('max', '3');
      }
    }
  });
}

test('physical modified digit chords do not enter a number', async ({ page }) => {
  await seedDesignScreens(page);
  await page.goto(designURL(screenIds.mixed, screenIds.zero));
  await page.locator('#cell-0').click();
  const before = await boardState(page);
  for (const modifier of ['Control', 'Meta', 'Alt']) {
    await page.keyboard.press(`${modifier}+1`);
    expect(await boardState(page)).toEqual(before);
    await expect(page.locator('#cell-0')).toBeFocused();
  }
  await page.getByRole('button', { name: 'Move history', exact: true }).click();
  await expect(page.getByRole('slider')).toHaveAttribute('max', '0');
});

test('plain review/play commands still edit, navigate and toggle notes; replay stays read-only', async ({
  page,
}) => {
  await seedDesignScreens(page);
  await page.goto(designURL(screenIds.draft));
  await page.locator('#cell-0').click();
  await page.keyboard.press('1');
  await expect(page.locator('#cell-0')).toHaveAttribute('data-value', '1');
  await page.keyboard.press('Delete');
  await expect(page.locator('#cell-0')).toHaveAttribute('data-value', '0');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#cell-1')).toBeFocused();
  await page.goto(designURL(screenIds.mixed, screenIds.zero));
  await page.locator('#cell-0').click();
  await page.keyboard.press('n');
  await expect(page.getByRole('button', { name: 'Pencil notes' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.keyboard.press('2');
  await expect(page.locator('#cell-0')).toHaveAttribute('aria-description', 'Pencil notes: 2.');
  await page.keyboard.press('n');
  await page.keyboard.press('1');
  await expect(page.locator('#cell-0')).toHaveAttribute('data-value', '1');
  await page.keyboard.press('Backspace');
  await expect(page.locator('#cell-0')).toHaveAttribute('data-value', '0');
  await page.getByRole('button', { name: 'Move history', exact: true }).click();
  await page.locator('#cell-0').click();
  const before = await boardState(page);
  for (const key of ['1', 'Delete', 'n']) await page.keyboard.press(key);
  expect(await boardState(page)).toEqual(before);
});

for (const theme of ['light', 'dark'] as const) {
  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    for (const invalid of ['blank', 'too-few', 'contradictory'] as const) {
      test(`${invalid} confirmation is visible and correctable at 320px in ${theme}, motion ${reducedMotion}`, async ({
        page,
      }, testInfo) => {
        await page.setViewportSize({ width: 320, height: 740 });
        await page.emulateMedia({ colorScheme: theme, reducedMotion });
        await page.goto('/?new');
        await page.getByRole('button', { name: 'Enter clues by hand', exact: true }).click();
        await expect(page.locator('.cell')).toHaveCount(81);
        const entries =
          invalid === 'blank'
            ? []
            : invalid === 'too-few'
              ? [[0, 1]]
              : clues
                  .flatMap((value, cell) => (value ? [[cell, value]] : []))
                  .concat([[0, clues[5]]]);
        for (const [cell, value] of entries) {
          await page.locator(`#cell-${cell}`).click();
          await page.keyboard.press(String(value));
          await expect(page.locator(`#cell-${cell}`)).toHaveAttribute('data-value', String(value));
        }
        const before = await boardState(page);
        await page.getByRole('button', { name: 'Confirm clues & play' }).click();
        const error = page.locator('.board-save-error');
        await expect(error).toContainText(
          invalid === 'contradictory'
            ? /conflict|contradict|repeat/i
            : 'Add at least 17 clues before starting.',
        );
        await expect(error).toHaveAttribute('role', 'alert');
        await expect(error).toBeInViewport({ ratio: 1 });
        await expect(error).toBeFocused();
        expect(await boardState(page)).toEqual(before);
        await page.screenshot({
          path: testInfo.outputPath(`quality-${theme}-${reducedMotion}-${invalid}.png`),
        });
        await page.getByRole('button', { name: 'Confirm clues & play' }).click();
        await expect(error).toBeFocused();
        await expect(error).toBeInViewport({ ratio: 1 });
        await page.locator('#cell-0').click();
        await page.keyboard.press('9');
        await expect(page.locator('#cell-0')).toHaveAttribute('data-value', '9');
        await expect(page.locator('#cell-0')).toBeFocused();
        await page.reload();
        await expect(page.locator('#cell-0')).toHaveAttribute('data-value', '9');
      });
    }
  }
  for (const width of [320, 390]) {
    test(`mistake counts 0, 1 and 10 stay whole at ${width}px in ${theme}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: width === 320 ? 740 : 844 });
      await page.emulateMedia({ colorScheme: theme });
      await seedDesignScreens(page);
      await page.goto(designURL(screenIds.mixed, screenIds.zero));
      const solution = solve(clues).solution!;
      const wrong = solution[0] === 1 ? '2' : '1';
      for (let count = 0; count <= 10; count++) {
        if (count) {
          await page.locator('#cell-0').click();
          await page.keyboard.press(wrong);
          await expect(page.locator('.kit-mistake-counter')).toHaveText(`Mistakes ${count}`);
        }
        if ([0, 1, 10].includes(count)) {
          const counter = page.locator('.kit-mistake-counter');
          await expect(counter).toHaveText(`Mistakes ${count}`);
          const lines = await page.locator('.kit-mistake-counter__text').evaluate((element) => {
            const range = document.createRange();
            range.selectNodeContents(element);
            return [...range.getClientRects()].map((rect) => rect.y);
          });
          expect(new Set(lines).size, 'Mistakes label must not wrap').toBe(1);
          await expect(page.locator('.kit-attempt-timer')).toBeInViewport();
          await expect(page.getByText('Saved', { exact: true })).toBeInViewport();
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          ).toBe(true);
          await page.screenshot({
            path: testInfo.outputPath(`quality-${width}-${theme}-mistakes-${count}.png`),
          });
        }
        if (count && count < 10) {
          await page.keyboard.press('Delete');
          await expect(page.locator('#cell-0')).toHaveAttribute('data-value', '0');
        }
      }
    });
  }
}
