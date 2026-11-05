import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import Toggle, { type ToggleProps } from './Toggle';
import { useStoryInput } from './use-story-input';
import './ControlsStories.css';

function ControlledToggle(args: ToggleProps) {
  const [pressed, setPressed] = useStoryInput(args.pressed);
  return (
    <Toggle
      {...args}
      pressed={pressed}
      onClick={(event) => {
        args.onClick(event);
        setPressed((value) => !value);
      }}
    />
  );
}

const meta = {
  title: 'Kit/Toggle',
  component: Toggle,
  decorators: [
    (Story) => (
      <div className="controls-stories">
        <Story />
      </div>
    ),
  ],
  args: { label: 'Pencil notes', pressed: false, onClick: fn() },
  render: (args) => <ControlledToggle {...args} />,
} satisfies Meta<typeof Toggle>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const button = within(canvasElement).getByRole('button', { name: 'Pencil notes' });
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await expect(button).toHaveTextContent('Off');
    await userEvent.click(button);
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(button).toHaveTextContent('On');
    await expect(args.onClick).toHaveBeenCalledOnce();
  },
};

export const On: Story = { args: { pressed: true } };

export const States: Story = {
  render: () => (
    <div className="controls-stories__stack">
      <div className="controls-stories__row">
        <Toggle label="Pencil notes" pressed={false} onClick={fn()} />
        <Toggle label="Pencil notes" pressed onClick={fn()} />
        <Toggle label="Mistake check" pressed onClick={fn()} />
      </div>
      <div className="controls-stories__row">
        <Toggle label="Pencil notes" pressed={false} disabled onClick={fn()} />
        <Toggle label="Mistake check" pressed disabled onClick={fn()} />
      </div>
    </div>
  ),
};

export const Disabled: Story = {
  args: { disabled: true, pressed: true },
  play: async ({ canvasElement, args }) => {
    const button = within(canvasElement).getByRole('button', { name: 'Pencil notes' });
    await userEvent.click(button);
    await expect(button).toBeDisabled();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(args.onClick).not.toHaveBeenCalled();
  },
};

export const Keyboard: Story = {
  play: async ({ canvasElement, args }) => {
    const button = within(canvasElement).getByRole('button', { name: 'Pencil notes' });
    button.focus();
    await userEvent.keyboard(' ');
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await userEvent.keyboard('{Enter}');
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await expect(args.onClick).toHaveBeenCalledTimes(2);
  },
};

export const NarrowLongLabel: Story = {
  args: { label: 'Automatically check mistakes in this puzzle as numbers are entered' },
  render: (args) => (
    <div className="controls-stories__narrow">
      <ControlledToggle {...args} />
    </div>
  ),
};
