import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import Icon, { type IconName } from './Icon';
import './ControlsStories.css';

const names = [
  'plus',
  'camera',
  'pencil',
  'shield-check',
  'undo',
  'history',
  'delete',
  'check',
  'alert',
  'clock',
  'lock',
  'copy',
  'close',
  'arrow-right',
  'chevron-left',
  'first',
  'previous',
  'next',
  'last',
  'half-disc',
  'circle',
] as const satisfies readonly IconName[];

const meta = {
  title: 'Kit/Icon',
  component: Icon,
  decorators: [
    (Story) => (
      <div className="controls-stories">
        <Story />
      </div>
    ),
  ],
  args: { name: 'pencil', size: 20 },
  argTypes: { name: { control: 'select', options: names } },
} satisfies Meta<typeof Icon>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const AllIcons: Story = {
  render: () => (
    <div className="controls-stories__icons">
      {names.map((name) => (
        <div className="controls-stories__icon" key={name}>
          <Icon name={name} />
          <span className="controls-stories__caption">{name}</span>
        </div>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const icons = canvasElement.querySelectorAll('svg');
    await expect(icons).toHaveLength(names.length);
    for (const icon of icons) {
      await expect(icon).toHaveAttribute('aria-hidden', 'true');
      await expect(icon).toHaveAttribute('focusable', 'false');
      await expect(icon).toHaveAttribute('stroke', 'currentColor');
    }
  },
};

export const Sizes: Story = {
  render: () => (
    <div className="controls-stories__row">
      {[16, 20, 24, 32].map((size) => (
        <div className="controls-stories__icon" key={size}>
          <Icon name="camera" size={size} />
          <span className="controls-stories__caption">{size}px</span>
        </div>
      ))}
    </div>
  ),
};
