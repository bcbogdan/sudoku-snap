import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import AppHeader from './AppHeader';
import { Badge } from './Badge';
import StoryFrame from './StoryFrame';

const meta = {
  title: 'App/AppHeader',
  component: AppHeader,
  decorators: [
    (Story, context) => (
      <StoryFrame width={context.parameters.frameWidth}>
        <Story />
      </StoryFrame>
    ),
  ],
  args: { screen: 'library' },
} satisfies Meta<typeof AppHeader>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('link', { name: 'My puzzles' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(canvas.getByRole('link', { name: 'New puzzle' })).toHaveAttribute('href', '/?new');
  },
};
export const Create: Story = { args: { screen: 'create' } };
export const Playing: Story = { args: { screen: 'play' } };
export const Mobile: Story = {
  parameters: { frameWidth: 320 },
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
export const ContextualBack: Story = {
  args: {
    screen: 'play',
    backLink: { href: '/?puzzle=example', label: 'All attempts' },
    status: <Badge kind="in-progress">In progress</Badge>,
  },
  parameters: { frameWidth: 390 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('link', { name: 'All attempts' })).toHaveAttribute(
      'href',
      '/?puzzle=example',
    );
    await expect(canvas.queryByRole('navigation')).not.toBeInTheDocument();
    await expect(canvas.getAllByRole('link')).toHaveLength(1);
  },
};
export const ReviewStatus: Story = {
  args: {
    screen: 'review',
    backLink: { href: '/', label: 'My puzzles' },
    status: <Badge kind="draft">Review clues · Draft saved</Badge>,
  },
  parameters: { frameWidth: 320 },
};
export const KeyboardFocus: Story = {
  parameters: { frameWidth: 320 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    canvas.getByRole('link', { name: 'Sudoku Snap' }).focus();
    await userEvent.tab();
    await expect(canvas.getByRole('link', { name: 'My puzzles' })).toHaveFocus();
    await userEvent.tab();
    await expect(canvas.getByRole('link', { name: 'New puzzle' })).toHaveFocus();
  },
};
