import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import AppHeader from './AppHeader';
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
