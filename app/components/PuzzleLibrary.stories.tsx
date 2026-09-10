import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import PuzzleLibrary from './PuzzleLibrary';
import StoryFrame from './StoryFrame';
import { libraryItems } from './story-fixtures';

const meta = {
  title: 'Library/PuzzleLibrary',
  component: PuzzleLibrary,
  decorators: [
    (Story, context) => (
      <StoryFrame width={context.parameters.frameWidth}>
        <Story />
      </StoryFrame>
    ),
  ],
  args: { items: libraryItems },
} satisfies Meta<typeof PuzzleLibrary>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('link', { name: /Weekend puzzle/ })).toHaveAttribute(
      'href',
      '/?puzzle=weekend&attempt=latest',
    );
    await expect(canvas.getByRole('link', { name: /Quiet Maple/ })).toHaveAttribute(
      'href',
      '/?puzzle=draft',
    );
  },
};
export const Empty: Story = {
  args: { items: [] },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('link', { name: 'Create a puzzle' }),
    ).toHaveAttribute('href', '/?new');
  },
};
export const Draft: Story = { args: { items: [libraryItems[1]] } };
export const Mobile: Story = {
  args: { items: [{ ...libraryItems[0], name: 'WeekendPuzzle'.repeat(6) }, libraryItems[1]] },
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
