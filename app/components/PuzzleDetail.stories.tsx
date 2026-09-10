import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import PuzzleDetail from './PuzzleDetail';
import PuzzleActions from './PuzzleActions';
import StoryFrame from './StoryFrame';
import { attemptRows } from './story-fixtures';

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
