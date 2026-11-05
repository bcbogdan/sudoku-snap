import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import PuzzleDetail from './PuzzleDetail';
import PuzzleActions from './PuzzleActions';
import StoryFrame from './StoryFrame';
import { attemptRows, clues, completedBoard, mistakenBoard } from './story-fixtures';

const meta = {
  title: 'Library/PuzzleDetail',
  component: PuzzleDetail,
  decorators: [
    (Story, context) => (
      <StoryFrame width={context.parameters.frameWidth}>
        <Story />
      </StoryFrame>
    ),
  ],
  args: {
    createdLabel: 'Sep 10, 2026, 9:00 AM',
    clueCount: 29,
    attempts: attemptRows,
    busy: false,
    title: (
      <div className="puzzle-title">
        <h1>Weekend puzzle</h1>
      </div>
    ),
    actions: <PuzzleActions busy={false} onShare={fn()} onRemove={fn()} />,
    onBegin: fn(),
  },
} satisfies Meta<typeof PuzzleDetail>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('link', { name: /Attempt 2/ })).toHaveAttribute(
      'href',
      attemptRows[0].href,
    );
    await expect(canvas.getByRole('link', { name: /Attempt 1/ })).toHaveTextContent('00:12:34');
    await userEvent.click(canvas.getByRole('button', { name: /New attempt/ }));
    await expect(args.onBegin).toHaveBeenCalledOnce();
  },
};
export const Empty: Story = { args: { attempts: [] } };
export const Saving: Story = {
  args: { busy: true, actions: <PuzzleActions busy onShare={fn()} onRemove={fn()} /> },
};
export const Mobile: Story = {
  parameters: { frameWidth: 320 },
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};

export const FullPresentation: Story = {
  args: {
    clues,
    clueCount: clues.filter(Boolean).length,
    preview: { board: mistakenBoard, completed: false },
    bestTime: '00:12:34',
    totalTime: '00:12:34',
    continueHref: attemptRows[0].href,
    attempts: [
      {
        ...attemptRows[0],
        durationLabel: '00:00:00',
        mistakes: 0,
        progress: { filled: 1, total: clues.filter((value) => !value).length },
      },
      { ...attemptRows[1], mistakes: 2 },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('link', { name: 'Continue' })).toHaveAttribute(
      'href',
      attemptRows[0].href,
    );
    await expect(canvas.getByRole('link', { name: /Attempt 2/ })).toHaveTextContent('Mistakes 0');
    await expect(canvas.getByRole('link', { name: /Attempt 2/ })).toHaveTextContent('00:00:00');
    await expect(
      canvas.getByRole('progressbar', { name: 'Attempt 2 squares filled' }),
    ).toHaveAttribute('value', '1');
    await expect(canvas.getByLabelText('Attempt statistics')).toHaveTextContent(
      'Time played00:12:34',
    );
  },
};

export const CompletedOnly: Story = {
  args: {
    clues,
    preview: { board: completedBoard, completed: true },
    attempts: [{ ...attemptRows[1], durationLabel: '00:00:00', mistakes: 0 }],
    bestTime: '00:00:00',
    totalTime: '00:00:00',
    continueHref: null,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('link', { name: 'Continue' })).not.toBeInTheDocument();
    await expect(canvas.getByRole('link', { name: /Attempt 1/ })).toHaveAttribute(
      'href',
      attemptRows[1].href,
    );
    await expect(canvas.getByLabelText('Attempt statistics')).toHaveTextContent('00:00:00');
  },
};

export const FullPresentationMobile: Story = {
  args: {
    ...FullPresentation.args,
    createdLabel: 'Thursday, September 10, 2026, 9:00:00 AM Coordinated Universal Time',
    title: <h1>{'WeekendPuzzle'.repeat(6)}</h1>,
  },
  parameters: { frameWidth: 320 },
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async ({ canvasElement }) => {
    const detail = canvasElement.querySelector('.puzzle-detail')!;
    await expect(detail.scrollWidth).toBeLessThanOrEqual(detail.clientWidth);
    await expect(within(canvasElement).getByRole('link', { name: 'Continue' })).toBeVisible();
    await expect(canvasElement.querySelectorAll('.kit-board-preview__cell')).toHaveLength(81);
  },
};

export const UnknownStatistics: Story = {
  args: { clues, attempts: [], bestTime: null, totalTime: null },
  play: async ({ canvasElement }) => {
    const summary = within(within(canvasElement).getByLabelText('Attempt statistics'));
    await expect(summary.getByText('0')).toBeVisible();
    await expect(summary.getAllByText('—')).toHaveLength(2);
  },
};
