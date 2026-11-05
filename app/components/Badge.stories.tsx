import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { Badge } from './Badge';
import './StatusStories.css';

const meta = {
  title: 'Kit/Badge',
  component: Badge,
  decorators: [
    (Story) => (
      <div className="kit-status-story">
        <Story />
      </div>
    ),
  ],
  args: { kind: 'in-progress', children: 'In progress' },
  argTypes: {
    kind: {
      control: 'select',
      options: ['in-progress', 'neutral', 'completed', 'draft', 'replaying'],
    },
  },
} satisfies Meta<typeof Badge>;
export default meta;
type Story = StoryObj<typeof meta>;

export const InProgress: Story = {};
export const ZeroCompleted: Story = { args: { kind: 'neutral', children: '0 completed' } };
export const Completed: Story = { args: { kind: 'completed', children: '1 completed' } };
export const Draft: Story = { args: { kind: 'draft', children: 'Review clues · Draft saved' } };
export const Replaying: Story = { args: { kind: 'replaying', children: 'Replaying' } };
export const AllStates: Story = {
  render: () => (
    <div className="kit-status-story__row">
      <Badge kind="in-progress">In progress</Badge>
      <Badge kind="neutral">0 completed</Badge>
      <Badge kind="completed">1 completed</Badge>
      <Badge kind="draft">Review clues · Draft saved</Badge>
      <Badge kind="replaying">Replaying</Badge>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('status')).not.toBeInTheDocument();
    await expect(canvas.queryByRole('alert')).not.toBeInTheDocument();
    await expect(canvasElement.querySelectorAll('.kit-badge svg')).toHaveLength(5);
  },
};
export const NarrowLongTextAndCounts: Story = {
  render: () => (
    <div className="kit-status-story kit-status-story--narrow">
      <Badge kind="completed">1,234,567 completed attempts</Badge>
      <Badge kind="neutral">0 completed attempts across all saved puzzles</Badge>
      <Badge kind="draft">Review clues · Draft not saved because device storage is full</Badge>
      <Badge kind="replaying">Replaying attempt 1234567890123456789012345678901234567890</Badge>
    </div>
  ),
};
