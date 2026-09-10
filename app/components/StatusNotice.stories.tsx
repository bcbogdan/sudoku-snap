import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import StatusNotice from './StatusNotice';
import StoryFrame from './StoryFrame';

const meta = {
  title: 'App/StatusNotice',
  component: StatusNotice,
  decorators: [
    (Story) => (
      <StoryFrame>
        <Story />
      </StoryFrame>
    ),
  ],
  args: { message: 'Your draft saves automatically.' },
} satisfies Meta<typeof StatusNotice>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Loading: Story = { args: { kind: 'loading', message: 'Opening your puzzles…' } };
export const SaveFailure: Story = {
  args: { message: 'Could not save. Please try again.' },
  play: async ({ canvasElement, args }) => {
    const status = within(canvasElement).getByRole('status');
    await expect(status).toHaveTextContent(args.message);
    await expect(status).toHaveAttribute('aria-live', 'polite');
  },
};
export const StaleConflict: Story = {
  args: {
    message: 'This attempt changed in another tab. Reload to continue without overwriting it.',
  },
};
export const Copied: Story = { args: { kind: 'copied', message: 'Link copied to clipboard.' } };
export const Empty: Story = {
  args: { message: '' },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.status')).not.toBeVisible();
  },
};
