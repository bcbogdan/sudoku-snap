import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { CornerFrame } from './CornerFrame';
import './StatusStories.css';

const board = (
  <div className="kit-status-story__board" role="img" aria-label="Empty board placeholder" />
);

const meta = {
  title: 'Kit/CornerFrame',
  component: CornerFrame,
  decorators: [
    (Story) => (
      <div className="kit-status-story kit-status-story--narrow">
        <Story />
      </div>
    ),
  ],
  args: {
    state: 'waiting',
    className: 'kit-status-story__frame',
    children: <div className="kit-status-story__placeholder">Choose a Sudoku photo</div>,
  },
  argTypes: {
    state: { control: 'select', options: ['waiting', 'checking', 'unreadable', 'completed'] },
  },
} satisfies Meta<typeof CornerFrame>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Waiting: Story = {};
export const Checking: Story = { args: { state: 'checking', children: board } };
export const Unreadable: Story = {
  args: {
    state: 'unreadable',
    children: (
      <div className="kit-status-story__placeholder kit-status-story__placeholder--error">
        Could not read this photo
      </div>
    ),
  },
};
export const CompletedStaticSpecimen: Story = {
  args: { state: 'completed', children: board },
  parameters: {
    docs: {
      description: {
        story: 'Static proposed completed frame only; no completion animation or completion rules.',
      },
    },
  },
};
export const AllStates: Story = {
  render: () => (
    <>
      <CornerFrame state="waiting" className="kit-status-story__frame">
        <div className="kit-status-story__placeholder">Waiting · Choose a Sudoku photo</div>
      </CornerFrame>
      <CornerFrame state="checking" className="kit-status-story__frame">
        <p>Checking · Review detected clues</p>
        {board}
      </CornerFrame>
      <CornerFrame state="unreadable" className="kit-status-story__frame">
        <div className="kit-status-story__placeholder kit-status-story__placeholder--error">
          Could not read this photo
        </div>
      </CornerFrame>
      <CornerFrame state="completed" className="kit-status-story__frame">
        <p>Completed · Static proposed specimen</p>
        {board}
      </CornerFrame>
    </>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('status')).not.toBeInTheDocument();
    await expect(canvas.queryByRole('alert')).not.toBeInTheDocument();
    await expect(canvas.queryByRole('button')).not.toBeInTheDocument();
    const corners = canvasElement.querySelectorAll('.kit-corner-frame__corner');
    await expect(corners).toHaveLength(16);
    for (const corner of corners) await expect(corner).toHaveAttribute('aria-hidden', 'true');
  },
};
export const NarrowLongContent: Story = {
  args: {
    children: (
      <div className="kit-status-story__placeholder">
        Choose a Sudoku photo from your device to review the printed clues before starting a new
        attempt.
      </div>
    ),
  },
};
