import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { MistakeCounter } from './MistakeCounter';
import './StatusStories.css';

const meta = {
  title: 'Kit/MistakeCounter',
  component: MistakeCounter,
  decorators: [
    (Story) => (
      <div className="kit-status-story">
        <Story />
      </div>
    ),
  ],
  args: { count: 0 },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(`Mistakes ${args.count}`)).toBeVisible();
    await expect(canvas.queryByRole('status')).not.toBeInTheDocument();
    await expect(canvas.queryByRole('alert')).not.toBeInTheDocument();
    await expect(canvasElement.querySelector('[aria-live]')).not.toBeInTheDocument();
    await expect(canvasElement.querySelectorAll('.kit-mistake-counter svg')).toHaveLength(
      args.count > 0 ? 1 : 0,
    );
    const badge = canvasElement.querySelector('.kit-mistake-counter')!;
    const text = canvasElement.querySelector('.kit-mistake-counter__text')!;
    const bounds = badge.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(text);
    const textBounds = range.getBoundingClientRect();
    await expect(textBounds.left).toBeGreaterThanOrEqual(bounds.left - 1);
    await expect(textBounds.top).toBeGreaterThanOrEqual(bounds.top - 1);
    await expect(textBounds.right).toBeLessThanOrEqual(bounds.right + 1);
    await expect(textBounds.bottom).toBeLessThanOrEqual(bounds.bottom + 1);
    if (args.count > 0) {
      await expect(canvasElement.querySelector('.kit-mistake-counter svg')).toHaveAttribute(
        'aria-hidden',
        'true',
      );
    }
  },
} satisfies Meta<typeof MistakeCounter>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Zero: Story = {};
export const One: Story = { args: { count: 1 } };
export const Ten: Story = { args: { count: 10 } };
export const Many: Story = { args: { count: 12345 } };
export const Narrow: Story = {
  args: { count: 123456789 },
  decorators: [
    (Story) => (
      <div style={{ inlineSize: 120, maxInlineSize: '100%' }}>
        <Story />
      </div>
    ),
  ],
};
