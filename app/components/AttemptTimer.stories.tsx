import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import AttemptTimer from './AttemptTimer';
import StoryFrame from './StoryFrame';

const meta = {
  title: 'Game/AttemptTimer',
  component: AttemptTimer,
  decorators: [
    (Story) => (
      <StoryFrame>
        <Story />
      </StoryFrame>
    ),
  ],
  args: {
    store: { subscribe: () => () => {}, getSnapshot: () => 19_000, set: () => {} },
    fixedElapsed: null,
  },
} satisfies Meta<typeof AttemptTimer>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Running: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByLabelText('Attempt duration')).toHaveTextContent(
      '00:00:19',
    );
  },
};
export const Historical: Story = {
  args: { fixedElapsed: 0 },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByLabelText('Attempt duration')).toHaveTextContent(
      '00:00:00',
    );
  },
};
export const LongDuration: Story = { args: { fixedElapsed: 100 * 60 * 60 * 1000 } };
