import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { AttemptSummary } from './AttemptSummary';
import StoryFrame from './StoryFrame';

const meta = {
  title: 'Kit/AttemptSummary',
  component: AttemptSummary,
  decorators: [
    (Story) => (
      <StoryFrame width={640}>
        <Story />
      </StoryFrame>
    ),
  ],
  args: { totalAttempts: 3, bestTime: '00:21:02', totalTime: '00:36:28' },
} satisfies Meta<typeof AttemptSummary>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const NoCompletedAttempt: Story = {
  args: { totalAttempts: 2, bestTime: null, totalTime: '00:05:45' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('—')).toBeVisible();
  },
};
export const NoAttempts: Story = {
  args: { totalAttempts: 0, bestTime: null, totalTime: '00:00:00' },
};
export const ZeroTime: Story = {
  args: { totalAttempts: 1, bestTime: '00:00:00', totalTime: '00:00:00' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getAllByText('00:00:00')).toHaveLength(2);
  },
};
export const LargeCounts: Story = {
  args: { totalAttempts: 123456789, bestTime: '12345:59:59', totalTime: '987654:59:59' },
};
