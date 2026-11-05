import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { AttemptRow } from './AttemptRow';
import StoryFrame from './StoryFrame';
import './AttemptsStories.css';

const meta = {
  title: 'Kit/AttemptRow',
  component: AttemptRow,
  decorators: [
    (Story, context) => (
      <StoryFrame width={context.parameters.frameWidth ?? 640}>
        <div className="attempts-stories__group">
          <Story />
        </div>
      </StoryFrame>
    ),
  ],
  args: {
    attempt: {
      id: 'attempt-3',
      href: '#attempt-3',
      number: 3,
      startedLabel: 'Nov 3, 2026',
      complete: false,
      moveCount: 18,
      durationLabel: '00:09:41',
    },
    mistakes: 2,
    progress: { filled: 18, total: 43 },
  },
} satisfies Meta<typeof AttemptRow>;
export default meta;
type Story = StoryObj<typeof meta>;

export const InProgress: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('link')).toHaveAttribute('href', args.attempt.href);
    await expect(canvas.getByRole('progressbar')).toHaveAttribute('value', '18');
    await expect(canvas.getByText('18 of 43 squares filled')).toBeVisible();
  },
};
export const Completed: Story = {
  args: {
    attempt: { ...meta.args.attempt, complete: true, number: 2, durationLabel: '00:21:02' },
    mistakes: 0,
    progress: { filled: 43, total: 43 },
  },
};
export const MissingData: Story = {
  args: { attempt: { ...meta.args.attempt, durationLabel: null }, mistakes: null, progress: null },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('progressbar')).not.toBeInTheDocument();
    await expect(canvas.queryByText(/Mistakes/)).not.toBeInTheDocument();
    await expect(canvas.getByText('Resume')).toBeVisible();
  },
};
export const ZeroValues: Story = {
  args: {
    attempt: { ...meta.args.attempt, moveCount: 0, durationLabel: '00:00:00' },
    mistakes: 0,
    progress: { filled: 0, total: 43 },
  },
};
export const LongDateAndCounts: Story = {
  args: {
    attempt: {
      ...meta.args.attempt,
      number: 123456,
      moveCount: 123456,
      startedLabel: 'Wednesday, November 25, 2026 at 11:59:59 PM Pacific Standard Time 日本語',
      durationLabel: '12345:59:59',
    },
    mistakes: 123456,
  },
};

export const GroupedAttempts: Story = {
  render: (args) => (
    <>
      <AttemptRow {...args} />
      <AttemptRow
        attempt={{
          ...args.attempt,
          id: 'attempt-2',
          href: '#attempt-2',
          number: 2,
          complete: true,
          startedLabel: 'Mon',
          durationLabel: '00:21:02',
        }}
        mistakes={0}
        progress={{ filled: 43, total: 43 }}
      />
      <AttemptRow
        attempt={{
          ...args.attempt,
          id: 'attempt-1',
          href: '#attempt-1',
          number: 1,
          startedLabel: 'Sun',
          durationLabel: '00:05:45',
        }}
        mistakes={4}
        progress={{ filled: 12, total: 43 }}
      />
    </>
  ),
};

export const Compact390: Story = {
  ...GroupedAttempts,
  parameters: { frameWidth: 390 },
  play: async ({ canvasElement }) => {
    const row = canvasElement.querySelector('.kit-attempt-row')!;
    const details = row.querySelector('.kit-attempt-row__title')!;
    const result = row.querySelector('.kit-attempt-row__result')!;
    const detailsBox = details.getBoundingClientRect();
    const resultBox = result.getBoundingClientRect();
    if (row.parentElement!.clientWidth >= 320) {
      await expect(resultBox.left).toBeGreaterThanOrEqual(detailsBox.right);
      await expect(resultBox.top).toBeLessThan(detailsBox.bottom);
    } else {
      await expect(resultBox.top).toBeGreaterThanOrEqual(detailsBox.bottom);
    }
  },
};

export const Narrow320: Story = {
  ...LongDateAndCounts,
  parameters: { frameWidth: 320 },
  play: async ({ canvasElement }) => {
    const row = canvasElement.querySelector('.kit-attempt-row')!;
    await expect(row.scrollWidth).toBeLessThanOrEqual(row.clientWidth);
  },
};
