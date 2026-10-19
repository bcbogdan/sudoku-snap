import { expect, test } from '@playwright/test';
import { puzzleShareURL } from '../lib/sharing';
import { solve } from '../lib/sudoku';
import clues from './fixtures/expected.json';

test('copy feedback refreshes its dwell and reverses an interrupted exit', async ({ page }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(puzzleShareURL('http://127.0.0.1:3187', clues, 'Copy feedback'));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Copy feedback');
  await page.clock.install({ time: new Date('2026-10-19T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-19T12:00:01Z'));
  const share = page.getByRole('button', { name: 'Share puzzle', exact: true });
  const notice = page.locator('.copy-notice');
  await share.dispatchEvent('click');
  await expect(notice).toBeVisible();
  const original = await notice.elementHandle();
  await page.clock.runFor(2800);
  await share.dispatchEvent('click');
  await page.clock.runFor(400);
  await expect(notice).not.toHaveAttribute('data-closing');
  await page.clock.runFor(2600);
  await expect(notice).toHaveAttribute('data-closing', 'true');
  await share.dispatchEvent('click');
  await expect(notice).not.toHaveAttribute('data-closing');
  expect(await notice.evaluate((element, previous) => element === previous, original)).toBe(true);
  await page.clock.runFor(3000);
  await expect(notice).toHaveAttribute('data-closing', 'true');
  await page.clock.runFor(140);
  await expect(notice).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await share.dispatchEvent('click');
  await expect(notice).toHaveCSS('transition-duration', '0.1s');
});

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`completion animates only on the live transition (${reducedMotion})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await page.addInitScript(() => {
      const original = Element.prototype.animate;
      const calls: {
        frames: Keyframe[] | PropertyIndexedKeyframes | null;
        duration: number | undefined;
      }[] = [];
      Object.assign(window, { completionAnimations: calls });
      Element.prototype.animate = function (frames, options) {
        if (this.classList.contains('completion'))
          calls.push({
            frames,
            duration: typeof options === 'number' ? options : Number(options?.duration),
          });
        return original.call(this, frames, options);
      };
    });
    const solution = solve(clues).solution!;
    const almost = solution.slice();
    almost[0] = 0;
    await page.goto(puzzleShareURL('http://127.0.0.1:3187', almost, 'Completion feedback'));
    await page.getByRole('button', { name: 'Confirm clues & play' }).click();
    await expect(page.getByLabel('Attempt history')).toBeVisible();
    await page.locator('#cell-0').press(String(solution[0]));
    await expect(page.locator('.completion')).toBeVisible();
    const animations = () =>
      page.evaluate(
        () =>
          (
            window as typeof window & {
              completionAnimations: { frames: Keyframe[]; duration: number }[];
            }
          ).completionAnimations,
      );
    const calls = await animations();
    expect(calls).toHaveLength(1);
    expect(calls[0].duration).toBe(reducedMotion === 'reduce' ? 100 : 220);
    expect(calls[0].frames[0].transform).toBe(
      reducedMotion === 'reduce' ? 'none' : 'translateY(4px)',
    );
    await page.getByRole('button', { name: 'Previous move', exact: true }).click();
    await page.getByRole('button', { name: 'Latest move', exact: true }).click();
    expect(await animations()).toHaveLength(1);
    await page.reload();
    await expect(page.locator('.completion')).toBeVisible();
    expect(await animations()).toHaveLength(0);
  });
}
