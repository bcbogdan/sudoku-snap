import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import NumberKeypad from './NumberKeypad';
import StoryFrame from './StoryFrame';

const meta = {
  title: 'Game/NumberKeypad',
  component: NumberKeypad,
  decorators: [
    (Story, context) => (
      <StoryFrame width={context.parameters.frameWidth}>
        <div className="board-wrap">
          <Story />
        </div>
      </StoryFrame>
    ),
  ],
  args: { disabled: false, onEnter: fn() },
} satisfies Meta<typeof NumberKeypad>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Enter 8' }));
    await expect(args.onEnter).toHaveBeenLastCalledWith(8);
    await userEvent.click(canvas.getByRole('button', { name: 'Erase cell' }));
    await expect(args.onEnter).toHaveBeenLastCalledWith(0);
    await expect(canvas.getAllByRole('button')).toHaveLength(10);
  },
};
export const Historical: Story = {
  args: { disabled: true },
  play: async ({ canvasElement, args }) => {
    for (const button of within(canvasElement).getAllByRole('button')) {
      await expect(button).toBeDisabled();
      await userEvent.click(button);
    }
    await expect(args.onEnter).not.toHaveBeenCalled();
  },
};
export const Saving: Story = { args: { disabled: true } };
export const Mobile: Story = {
  parameters: { frameWidth: 320 },
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
