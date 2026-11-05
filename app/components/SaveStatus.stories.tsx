import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { SaveStatus } from './SaveStatus';
import './StatusStories.css';

const meta = {
  title: 'Kit/SaveStatus',
  component: SaveStatus,
  decorators: [
    (Story) => (
      <div className="kit-status-story">
        <Story />
      </div>
    ),
  ],
  args: { state: 'saved' },
  argTypes: {
    state: { control: 'select', options: ['saving', 'saved', 'error'] },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const status = canvas.getByRole('status');
    const labels = { saving: 'Saving…', saved: 'Saved', error: 'Could not save' };
    await expect(status).toHaveTextContent(labels[args.state]);
    await expect(status).toHaveAttribute('aria-live', 'polite');
    await expect(status).toHaveAttribute('aria-atomic', 'true');
    await expect(status.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    await expect(canvas.queryByRole('alert')).not.toBeInTheDocument();
    await expect(canvas.queryByRole('button')).not.toBeInTheDocument();
  },
} satisfies Meta<typeof SaveStatus>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Saved: Story = {};
export const Saving: Story = { args: { state: 'saving' } };
export const Error: Story = { args: { state: 'error' } };
export const NarrowLongErrorText: Story = {
  args: {
    state: 'error',
    errorText: 'Device storage is full. Free some space, then try saving again.',
  },
  decorators: [
    (Story) => (
      <div style={{ inlineSize: 160, maxInlineSize: '100%' }}>
        <Story />
      </div>
    ),
  ],
  play: async (context) => {
    await meta.play(context);
    await expect(within(context.canvasElement).getByRole('status')).toHaveTextContent(
      context.args.errorText!,
    );
  },
};
export const SavedIgnoresErrorText: Story = {
  args: { state: 'saved', errorText: 'This stale error must not be announced.' },
  play: async (context) => {
    await meta.play(context);
    await expect(within(context.canvasElement).getByRole('status')).toHaveTextContent(/^Saved$/);
  },
};
