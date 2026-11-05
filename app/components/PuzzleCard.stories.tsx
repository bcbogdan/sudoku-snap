import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import PuzzleCard from './PuzzleCard';
import type { PuzzleCardModel } from './PuzzleLibrary';
import StoryFrame from './StoryFrame';
import { clues, completedBoard } from './story-fixtures';
import './CollectionStories.css';

const item: PuzzleCardModel = {
  id: 'misty-meadow',
  name: 'Misty Meadow 98FD',
  clues,
  createdLabel: 'Nov 3, 2026',
  status: 'ready',
  attemptCount: 0,
  completedCount: 0,
  href: '/?puzzle=misty-meadow',
};

const partialBoard = clues.map((value, index) => value || (index < 18 ? completedBoard[index] : 0));

const meta = {
  title: 'Kit/PuzzleCard',
  component: PuzzleCard,
  decorators: [
    (Story, context) => (
      <StoryFrame width={context.parameters.frameWidth ?? 230}>
        <Story />
      </StoryFrame>
    ),
  ],
  args: { item },
} satisfies Meta<typeof PuzzleCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ReadyZeroAttempts: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const card = canvas.getByRole('link', { name: /Misty Meadow 98FD/ });
    await expect(card).toHaveAttribute('href', item.href);
    await expect(card).toHaveTextContent('0 completed');
    await expect(card).toHaveTextContent('0 attempts');
    await expect(card.querySelectorAll('.kit-badge')).toHaveLength(1);
    await expect(card.querySelectorAll('button, [tabindex]')).toHaveLength(0);
    await expect(canvas.queryByText('In progress')).not.toBeInTheDocument();
    await expect(card.querySelector('.kit-board-preview')).toHaveAttribute(
      'data-completed',
      'false',
    );
  },
};

export const Draft: Story = {
  args: { item: { ...item, status: 'draft', href: '/?puzzle=draft-meadow' } },
  play: async ({ canvasElement }) => {
    const card = within(canvasElement).getByRole('link');
    await expect(card).toHaveTextContent('Draft');
    await expect(card.querySelectorAll('.kit-badge')).toHaveLength(1);
    await expect(card).not.toHaveTextContent('completed');
    await expect(card).toHaveAttribute('href', '/?puzzle=draft-meadow');
  },
};

export const InProgress: Story = {
  args: { item: { ...item, attemptCount: 1 }, preview: { board: partialBoard } },
  play: async ({ canvasElement }) => {
    const card = within(canvasElement).getByRole('link');
    await expect(card).not.toHaveTextContent('In progress');
    await expect(card.querySelectorAll('.kit-badge')).toHaveLength(1);
    await expect(card).toHaveAttribute('href', item.href);
    await expect(card).toHaveTextContent('1 attempt');
    await expect(card).toHaveTextContent('0 completed');
    await expect(card.querySelector('.kit-board-preview')).toHaveAttribute(
      'data-completed',
      'false',
    );
    const cells = card.querySelectorAll('.kit-board-preview__cell');
    await expect(cells[0]).toHaveAttribute('data-entered', 'true');
    await expect(cells[0]).toHaveTextContent(String(partialBoard[0]));
  },
};

export const Completed: Story = {
  args: {
    item: { ...item, name: 'Quiet Harbor 3C1A', attemptCount: 1, completedCount: 1 },
    preview: { board: completedBoard, completed: true },
  },
  play: async ({ canvasElement }) => {
    const card = within(canvasElement).getByRole('link');
    await expect(card).toHaveTextContent('1 completed');
    await expect(card).not.toHaveTextContent('In progress');
    await expect(card.querySelectorAll('.kit-badge')).toHaveLength(1);
    await expect(card).toHaveAttribute('href', item.href);
    await expect(card.querySelector('.kit-board-preview')).toHaveAttribute(
      'data-completed',
      'true',
    );
  },
};

export const MixedAttempts: Story = {
  args: {
    item: { ...item, attemptCount: 3, completedCount: 1 },
    preview: { board: partialBoard },
  },
  play: async ({ canvasElement }) => {
    const card = within(canvasElement).getByRole('link');
    await expect(card).toHaveTextContent('1 completed');
    await expect(card).not.toHaveTextContent('In progress');
    await expect(card.querySelectorAll('.kit-badge')).toHaveLength(1);
    await expect(card).toHaveTextContent('3 attempts');
    await expect(card).toHaveAttribute('href', item.href);
    await expect(card.querySelector('.kit-board-preview')).toHaveAttribute(
      'data-completed',
      'false',
    );
    const cells = card.querySelectorAll('.kit-board-preview__cell');
    await expect(cells[0]).toHaveAttribute('data-entered', 'true');
    await expect(cells[0]).toHaveTextContent(String(partialBoard[0]));
  },
};

export const CompletedWithoutPreview: Story = {
  args: { item: { ...item, attemptCount: 1, completedCount: 1 } },
  play: async ({ canvasElement }) => {
    const preview = canvasElement.querySelector('.kit-board-preview');
    await expect(preview).toHaveAttribute('data-completed', 'false');
    await expect(preview?.querySelectorAll('[data-entered="true"]')).toHaveLength(0);
  },
};

export const ManyAttempts: Story = {
  args: { item: { ...item, attemptCount: 12345, completedCount: 6789 } },
};

export const LongTitle320: Story = {
  parameters: { frameWidth: 320 },
  args: {
    item: {
      ...item,
      name: 'Quiet Harbor — 日本語 🧩 1234567890123456789012345678901234567890 / the extraordinarily long weekend collection',
      attemptCount: 12345,
      completedCount: 6789,
    },
  },
  play: async ({ canvasElement }) => {
    const card = within(canvasElement).getByRole('link');
    await expect(card.scrollWidth).toBeLessThanOrEqual(card.clientWidth);
    await expect(within(card).getByRole('heading')).toHaveTextContent(
      '1234567890123456789012345678901234567890',
    );
  },
};

export const KeyboardAndHref: Story = {
  render: (args) => (
    <div className="kit-collection-stories">
      <PuzzleCard {...args} />
      <PuzzleCard
        item={{ ...item, name: 'Draft for tomorrow', status: 'draft', href: '/?puzzle=tomorrow' }}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const cards = within(canvasElement).getAllByRole('link');
    cards[0].focus();
    await expect(cards[0]).toHaveFocus();
    await userEvent.tab();
    await expect(cards[1]).toHaveFocus();
    await expect(cards[1]).toHaveAttribute('href', '/?puzzle=tomorrow');
    await userEvent.tab({ shift: true });
    await expect(cards[0]).toHaveFocus();
    cards[0].blur();
  },
};

export const Collection390: Story = {
  parameters: { frameWidth: 390 },
  render: () => (
    <div className="kit-collection-stories__grid">
      <PuzzleCard item={{ ...item, attemptCount: 1 }} />
      <PuzzleCard
        item={{ ...item, name: 'Quiet Harbor 3C1A', attemptCount: 1, completedCount: 1 }}
        preview={{ board: completedBoard, completed: true }}
      />
      <PuzzleCard
        item={{ ...item, name: 'Amber Orchard 77B0', attemptCount: 2 }}
        preview={{ board: partialBoard }}
      />
      <PuzzleCard item={{ ...item, name: 'Slow River — review clues', status: 'draft' }} />
    </div>
  ),
};
