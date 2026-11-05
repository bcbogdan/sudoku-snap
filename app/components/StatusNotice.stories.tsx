import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import StatusNotice from './StatusNotice';
import StoryFrame from './StoryFrame';

const meta = {
  title: 'App/StatusNotice',
  component: StatusNotice,
  decorators: [
    (Story, context) => (
      <StoryFrame width={context.parameters.frameWidth}>
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

export const NarrowLongMessage: Story = {
  parameters: { frameWidth: 320 },
  args: {
    message:
      'This attempt changed in another tab. Reload to continue without overwriting it. Reference: abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz.',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    await expect(canvas.queryByRole('alert')).not.toBeInTheDocument();
  },
};

export const NarrowLongCopied: Story = {
  parameters: { frameWidth: 320 },
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  args: {
    kind: 'copied',
    message: 'Link copied to clipboard. Share this puzzle with someone who would like to play.',
  },
};
