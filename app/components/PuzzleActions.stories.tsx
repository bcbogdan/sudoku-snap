import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import PuzzleActions from './PuzzleActions';
import StoryFrame from './StoryFrame';

const meta = {
  title: 'Library/PuzzleActions',
  component: PuzzleActions,
  decorators: [
    (Story) => (
      <StoryFrame>
        <Story />
      </StoryFrame>
    ),
  ],
  args: { busy: false, onShare: fn(), onRemove: fn() },
} satisfies Meta<typeof PuzzleActions>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Share puzzle' }));
    await expect(args.onShare).toHaveBeenCalledOnce();
    await userEvent.click(canvas.getByRole('button', { name: 'Remove puzzle' }));
    await expect(args.onRemove).toHaveBeenCalledOnce();
  },
};
export const Saving: Story = {
  args: { busy: true },
  play: async ({ canvasElement, args }) => {
    for (const button of within(canvasElement).getAllByRole('button')) {
      await expect(button).toBeDisabled();
      await userEvent.click(button);
    }
    await expect(args.onShare).not.toHaveBeenCalled();
    await expect(args.onRemove).not.toHaveBeenCalled();
  },
};
