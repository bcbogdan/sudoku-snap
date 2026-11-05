import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import BoardPreview from './BoardPreview';
import StoryFrame from './StoryFrame';
import { clues, completedBoard, mistakenBoard } from './story-fixtures';

const meta = {
  title: 'Kit/BoardPreview',
  component: BoardPreview,
  decorators: [
    (Story, context) => (
      <StoryFrame width={context.parameters.frameWidth ?? 220}>
        <Story />
      </StoryFrame>
    ),
  ],
  args: { clues },
} satisfies Meta<typeof BoardPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CluesOnly: Story = {
  play: async ({ canvasElement }) => {
    const preview = canvasElement.querySelector('.kit-board-preview');
    await expect(preview).toHaveAttribute('aria-hidden', 'true');
    await expect(preview?.querySelectorAll('.kit-board-preview__cell')).toHaveLength(81);
    await expect(preview?.querySelectorAll('button, [id], [tabindex]')).toHaveLength(0);
  },
};

export const InProgress: Story = {
  args: { board: mistakenBoard },
  play: async ({ canvasElement }) => {
    const cells = canvasElement.querySelectorAll('.kit-board-preview__cell');
    await expect(cells[1]).toHaveAttribute('data-given', 'true');
    await expect(cells[3]).toHaveAttribute('data-entered', 'true');
  },
};

export const Completed: Story = { args: { board: completedBoard, completed: true } };
export const Empty: Story = { args: { clues: Array.from({ length: 81 }, () => 0) } };
export const Narrow: Story = { parameters: { frameWidth: 140 } };

export const LongTitleNarrow: Story = {
  parameters: { frameWidth: 160 },
  render: (args) => (
    <article style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
      <BoardPreview {...args} />
      <h2 style={{ font: 'var(--text-title)', marginBlock: 'var(--space-3)' }}>
        Quiet Harbor — a very long puzzle title 日本語 12345678901234567890
      </h2>
      <p style={{ font: 'var(--text-meta)' }}>38 clues · 123 attempts</p>
    </article>
  ),
};
