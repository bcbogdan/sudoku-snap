import { expect } from '@playwright/test';
import { test } from './fixtures';

test('native range keys replay history and restore latest-move editing controls', async ({
  page,
  openStory,
}) => {
  await openStory('game-attempthistory--default');
  const history = page.getByRole('slider', { name: 'Attempt history' });
  const undo = page.getByRole('button', { name: 'Undo move' });
  await expect(history).toHaveValue('3');

  await history.focus();
  await page.keyboard.press('Home');
  await expect(history).toHaveValue('0');
  await expect(page.getByText('Original puzzle', { exact: false })).toContainText(
    'History is read-only',
  );
  await expect(undo).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Previous move' })).toBeDisabled();

  await page.keyboard.press('ArrowRight');
  await expect(history).toHaveValue('1');
  await expect(page.getByText('Move 1 of 3', { exact: true })).toBeVisible();
  await page.keyboard.press('End');
  await expect(history).toHaveValue('3');
  await expect(undo).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Latest move' })).toBeDisabled();
  await expect(history).toBeFocused();
});

test('native dialog supports Tab navigation and Escape returns focus to its trigger', async ({
  page,
  openStory,
}) => {
  await openStory('game-numberdial--default');
  const dialog = page.getByRole('dialog', { name: 'Choose a number' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Choose 1', exact: true }).focus();

  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Choose 2', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Choose 1', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');

  await expect(dialog).not.toBeVisible();
  const trigger = page.getByRole('button', { name: 'Open number dial' });
  await expect(trigger).toBeFocused();
  await trigger.press('Enter');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Choose 1', exact: true })).toBeFocused();
});
