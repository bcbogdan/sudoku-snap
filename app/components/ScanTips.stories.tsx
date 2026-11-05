import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { ScanTips } from './ScanTips';
import StoryFrame from './StoryFrame';

const meta = {
  title: 'Kit/ScanTips',
  component: ScanTips,
  decorators: [
    (Story, context) => (
      <StoryFrame width={context.parameters.frameWidth}>
        <Story />
      </StoryFrame>
    ),
  ],
} satisfies Meta<typeof ScanTips>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('complementary', { name: 'For the best scan' })).toBeVisible();
    await expect(canvas.getAllByRole('listitem')).toHaveLength(2);
  },
};
export const Narrow: Story = { parameters: { frameWidth: 320 } };
