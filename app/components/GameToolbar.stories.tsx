'use client';

import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import GameToolbar, { type PlayToolbarProps, type ReviewToolbarProps } from './GameToolbar';
import StoryFrame from './StoryFrame';
import { useStoryInput } from './use-story-input';

interface ToolbarStoryArgs
  extends Omit<PlayToolbarProps, 'mode'>, Omit<ReviewToolbarProps, 'mode'> {
  mode: 'play' | 'review';
}

function ToolbarHarness(args: ToolbarStoryArgs) {
  const [notesMode, setNotesMode] = useStoryInput(args.notesMode);
  const [check, setCheck] = useStoryInput(args.check);
  if (args.mode === 'review') return <GameToolbar {...args} mode="review" />;
  return (
    <GameToolbar
      {...args}
      mode="play"
      notesMode={notesMode}
      check={check}
      onToggleNotes={() => {
        args.onToggleNotes();
        setNotesMode((value) => !value);
      }}
      onToggleCheck={() => {
        args.onToggleCheck();
        setCheck((value) => !value);
      }}
    />
  );
}

const meta = {
  title: 'Game/GameToolbar',
  component: GameToolbar,
  decorators: [
    (Story, context) => (
      <StoryFrame width={context.parameters.frameWidth}>
        <Story />
      </StoryFrame>
    ),
  ],
  render: (args) => <ToolbarHarness {...args} />,
  args: {
    mode: 'play',
    notesMode: false,
    check: true,
    mistakes: 0,
    busy: false,
    readOnly: false,
    onToggleNotes: fn(),
    onToggleCheck: fn(),
    clueCount: 29,
    uncertainCount: 0,
    onBegin: fn(),
  },
} satisfies Meta<ToolbarStoryArgs>;
export default meta;
type Story = StoryObj<typeof meta>;

function ToolbarControlsHarness(args: ToolbarStoryArgs) {
  const [inputs, setInputs] = useStoryInput(args);
  return (
    <>
      <button onClick={() => setInputs({ ...args, notesMode: true, check: false })}>
        Update toolbar controls
      </button>
      <ToolbarHarness {...inputs} />
    </>
  );
}
export const ControlsUpdates: Story = {
  render: (args) => <ToolbarControlsHarness {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Update toolbar controls' }));
    await expect(canvas.getByRole('button', { name: 'Pencil notes' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(canvas.getByRole('button', { name: 'Mistake check' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  },
};

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    if (args.mode !== 'play') throw new Error('Expected play toolbar');
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Pencil notes' }));
    await expect(args.onToggleNotes).toHaveBeenCalledOnce();
    await expect(canvas.getByRole('button', { name: 'Pencil notes' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Mistake check' }));
    await expect(args.onToggleCheck).toHaveBeenCalledOnce();
    await expect(canvas.getByRole('button', { name: 'Mistake check' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  },
};
export const Draft: Story = {
  args: { mode: 'review', clueCount: 29, uncertainCount: 3, busy: false, onBegin: fn() },
  play: async ({ canvasElement, args }) => {
    if (args.mode !== 'review') throw new Error('Expected review toolbar');
    await userEvent.click(within(canvasElement).getByRole('button', { name: /Confirm clues/ }));
    await expect(args.onBegin).toHaveBeenCalledOnce();
  },
};
export const NotesAndMistakes: Story = { args: { mode: 'play', notesMode: true, mistakes: 2 } };
export const Historical: Story = {
  args: { mode: 'play', readOnly: true },
  play: async ({ canvasElement, args }) => {
    if (args.mode !== 'play') throw new Error('Expected play toolbar');
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: /Pencil notes/ })).toBeDisabled();
    await userEvent.click(canvas.getByRole('button', { name: /Mistake check/ }));
    await expect(args.onToggleCheck).toHaveBeenCalledOnce();
  },
};
export const Saving: Story = {
  args: { mode: 'play', busy: true },
  play: async ({ canvasElement, args }) => {
    if (args.mode !== 'play') throw new Error('Expected play toolbar');
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: /Pencil notes/ })).toBeDisabled();
    await expect(canvas.queryByText('Saved')).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: /Mistake check/ }));
    await expect(args.onToggleCheck).toHaveBeenCalledOnce();
  },
};
export const Mobile: Story = {
  parameters: { frameWidth: 320 },
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};

export const BusyDraft: Story = {
  args: { mode: 'review', busy: true },
  parameters: { frameWidth: 320 },
  play: async ({ canvasElement, args }) => {
    const button = within(canvasElement).getByRole('button', { name: /Confirm clues/ });
    await expect(button).toBeDisabled();
    await userEvent.click(button);
    await expect(args.onBegin).not.toHaveBeenCalled();
  },
};

export const NarrowReview: Story = {
  args: { mode: 'review', clueCount: 81, uncertainCount: 81 },
  parameters: { frameWidth: 320 },
};

export const Keyboard: Story = {
  play: async ({ canvasElement, args }) => {
    const notes = within(canvasElement).getByRole('button', { name: 'Pencil notes' });
    notes.focus();
    await userEvent.keyboard(' ');
    await expect(args.onToggleNotes).toHaveBeenCalledOnce();
    await expect(notes).toHaveAttribute('aria-pressed', 'true');
    await expect(within(notes).getByText('On')).toBeVisible();
    await userEvent.tab();
    const check = within(canvasElement).getByRole('button', { name: 'Mistake check' });
    await expect(check).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(args.onToggleCheck).toHaveBeenCalledOnce();
    await expect(check).toHaveAttribute('aria-pressed', 'false');
  },
};
