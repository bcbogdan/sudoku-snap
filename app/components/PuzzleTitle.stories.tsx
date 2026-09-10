'use client';

import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import PuzzleTitle, { type PuzzleTitleProps } from './PuzzleTitle';
import StoryFrame from './StoryFrame';
import { useStoryInput } from './use-story-input';

function TitleHarness(args: PuzzleTitleProps) {
  const [name, setName] = useStoryInput(args.name);
  const [editing, setEditing] = useStoryInput(args.editing);
  const [value, setValue] = useStoryInput(args.value);
  return (
    <PuzzleTitle
      {...args}
      name={name}
      editing={editing}
      value={value}
      onEdit={() => {
        args.onEdit();
        setValue(name);
        setEditing(true);
      }}
      onValueChange={(next) => {
        args.onValueChange(next);
        setValue(next);
      }}
      onSave={() => {
        args.onSave();
        setName(value.trim());
        setEditing(false);
      }}
      onCancel={() => {
        args.onCancel();
        setEditing(false);
      }}
    />
  );
}

const meta = {
  title: 'Library/PuzzleTitle',
  component: PuzzleTitle,
  decorators: [
    (Story, context) => (
      <StoryFrame width={context.parameters.frameWidth}>
        <Story />
      </StoryFrame>
    ),
  ],
  render: (args) => <TitleHarness {...args} />,
  args: {
    name: 'Weekend puzzle',
    editing: false,
    value: 'Weekend puzzle',
    busy: false,
    onEdit: fn(),
    onValueChange: fn(),
    onSave: fn(),
    onCancel: fn(),
  },
} satisfies Meta<typeof PuzzleTitle>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
function TitleControlsHarness(args: PuzzleTitleProps) {
  const [inputs, setInputs] = useStoryInput(args);
  return (
    <>
      <button
        onClick={() =>
          setInputs({ ...args, name: 'Updated title', editing: true, value: 'Updated input' })
        }
      >
        Update title controls
      </button>
      <button onClick={() => setInputs({ ...args, name: 'Updated title', editing: false })}>
        Show updated title
      </button>
      <TitleHarness {...inputs} />
    </>
  );
}
export const ControlsUpdates: Story = {
  render: (args) => <TitleControlsHarness {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Rename puzzle' }));
    await userEvent.type(canvas.getByRole('textbox'), ' local edit');
    await userEvent.click(canvas.getByRole('button', { name: 'Update title controls' }));
    await expect(canvas.getByRole('textbox')).toHaveValue('Updated input');
    await userEvent.click(canvas.getByRole('button', { name: 'Show updated title' }));
    await expect(canvas.getByRole('heading')).toHaveTextContent('Updated title');
  },
};
export const Editing: Story = {
  args: { editing: true },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole('textbox', { name: 'Puzzle name' });
    await expect(input).toHaveFocus();
    await expect(input).toHaveAttribute('maxlength', '80');
    await userEvent.clear(input);
    await userEvent.type(input, '   ');
    await expect(canvas.getByRole('button', { name: 'Save name' })).toBeDisabled();
    await userEvent.clear(input);
    await userEvent.type(input, 'Sunday puzzle{Enter}');
    await expect(args.onSave).toHaveBeenCalledOnce();
    await expect(canvas.getByRole('heading', { level: 1 })).toHaveTextContent('Sunday puzzle');
    await userEvent.click(canvas.getByRole('button', { name: 'Rename puzzle' }));
    await userEvent.type(canvas.getByRole('textbox'), ' discarded{Escape}');
    await expect(args.onCancel).toHaveBeenCalledOnce();
    await expect(canvas.getByRole('heading', { level: 1 })).toHaveTextContent('Sunday puzzle');
  },
};
export const Saving: Story = {
  args: { editing: true, busy: true },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('textbox')).toBeDisabled();
    await userEvent.click(canvas.getByRole('button', { name: 'Save name' }));
    await expect(args.onSave).not.toHaveBeenCalled();
    await expect(canvas.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  },
};
export const Invalid: Story = { args: { editing: true, value: '   ' } };
export const Mobile: Story = {
  args: { name: 'WeekendPuzzle'.repeat(6) },
  parameters: { frameWidth: 320 },
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
