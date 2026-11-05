import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { Alert } from './Alert';
import './StatusStories.css';

const meta = {
  title: 'Kit/Alert',
  component: Alert,
  decorators: [
    (Story) => (
      <div className="kit-status-story">
        <Story />
      </div>
    ),
  ],
  args: { children: 'Could not find a Sudoku grid. Try a clear photo of the whole board.' },
  argTypes: { role: { control: 'select', options: ['alert', 'status'] } },
} satisfies Meta<typeof Alert>;
export default meta;
type Story = StoryObj<typeof meta>;

export const DefaultAlert: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('alert')).toHaveTextContent(String(args.children));
    await expect(canvas.queryByRole('status')).not.toBeInTheDocument();
    await expect(canvasElement.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  },
};
export const PoliteStatus: Story = {
  args: { role: 'status', children: 'Saving is taking longer than expected. Keep this tab open.' },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('status')).toHaveTextContent(String(args.children));
    await expect(canvas.queryByRole('alert')).not.toBeInTheDocument();
  },
};
export const StorageFailure: Story = {
  args: { children: 'Could not save this draft. Free some device storage, then try again.' },
};
export const NarrowLongContent: Story = {
  render: () => (
    <div className="kit-status-story kit-status-story--narrow">
      <Alert>
        <strong>Could not read this image.</strong>
        <p>Choose a clear photo of the whole board, without glare. The original error is:</p>
        <span>UnsupportedImageFormat_1234567890123456789012345678901234567890</span>
      </Alert>
    </div>
  ),
};
