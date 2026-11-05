'use client';

import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { Alert } from './Alert';
import Button from './Button';
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
    await expect(input).toBeRequired();
    await userEvent.clear(input);
    await userEvent.type(input, '   ');
    await expect(canvas.getByRole('button', { name: 'Save name' })).toBeDisabled();
    await userEvent.clear(input);
    await userEvent.type(input, 'Sunday puzzle{Enter}');
    await expect(args.onSave).toHaveBeenCalledOnce();
    await expect(canvas.getByRole('heading', { level: 1 })).toHaveTextContent('Sunday puzzle');
    await expect(canvas.getByRole('button', { name: 'Rename puzzle' })).toHaveFocus();
    await userEvent.click(canvas.getByRole('button', { name: 'Rename puzzle' }));
    await userEvent.type(canvas.getByRole('textbox'), ' discarded{Escape}');
    await expect(args.onCancel).toHaveBeenCalledOnce();
    await expect(canvas.getByRole('heading', { level: 1 })).toHaveTextContent('Sunday puzzle');
    await expect(canvas.getByRole('button', { name: 'Rename puzzle' })).toHaveFocus();
    await userEvent.click(canvas.getByRole('button', { name: 'Rename puzzle' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Cancel' }));
    await expect(canvas.getByRole('button', { name: 'Rename puzzle' })).toHaveFocus();
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

function SaveFailureHarness(args: PuzzleTitleProps) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [value, setValue] = useStoryInput(args.value);
  return (
    <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
      <PuzzleTitle
        {...args}
        value={value}
        onValueChange={setValue}
        busy={busy}
        onSave={() => {
          args.onSave();
          setBusy(true);
        }}
      />
      {busy ? (
        <Button
          onClick={() => {
            setBusy(false);
            setFailed(true);
          }}
        >
          Simulate save failure
        </Button>
      ) : null}
      {failed ? (
        <Alert>
          Could not save the puzzle name. Your changes are still here. Try again when device storage
          is available.
        </Alert>
      ) : null}
    </div>
  );
}

export const SaveFailure: Story = {
  args: {
    editing: true,
    value: 'An especially long puzzle title for a rainy weekend with friends and family',
  },
  parameters: { frameWidth: 320 },
  render: (args) => <SaveFailureHarness {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole('textbox', { name: 'Puzzle name' });
    await userEvent.click(canvas.getByRole('button', { name: 'Save name' }));
    await expect(input).toBeDisabled();
    await userEvent.click(canvas.getByRole('button', { name: 'Save name' }));
    await expect(args.onSave).toHaveBeenCalledOnce();
    await userEvent.click(canvas.getByRole('button', { name: 'Simulate save failure' }));
    await expect(canvas.getByRole('alert')).toHaveTextContent('Could not save the puzzle name.');
    await expect(input).toHaveFocus();
    await expect(input).toHaveValue(args.value);
  },
};

export const KeyboardFocus: Story = {
  parameters: { frameWidth: 320 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    canvas.getByRole('button', { name: 'Rename puzzle' }).focus();
    await userEvent.keyboard('{Enter}');
    await expect(canvas.getByRole('textbox')).toHaveFocus();
    await userEvent.tab();
    await expect(canvas.getByRole('button', { name: 'Save name' })).toHaveFocus();
    await userEvent.tab();
    await expect(canvas.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(canvas.getByRole('button', { name: 'Rename puzzle' })).toHaveFocus();
  },
};
