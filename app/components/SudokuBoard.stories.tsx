'use client';

import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fireEvent, fn, userEvent, waitFor, within } from 'storybook/test';
import SudokuBoard, { type SudokuBoardProps } from './SudokuBoard';
import StoryFrame from './StoryFrame';
import { useStoryInput } from './use-story-input';
import { clues, completedBoard, emptyNotes, mistakenBoard, pencilNotes } from './story-fixtures';

function BoardHarness(args: SudokuBoardProps) {
  const [selected, setSelected] = useStoryInput(args.selected);
  return (
    <SudokuBoard
      {...args}
      selected={selected}
      onSelect={(cell) => {
        args.onSelect(cell);
        setSelected(cell);
      }}
    />
  );
}

const meta = {
  title: 'Game/SudokuBoard',
  component: SudokuBoard,
  decorators: [
    (Story, context) => (
      <StoryFrame width={context.parameters.frameWidth}>
        <div className="board-wrap">
          <Story />
        </div>
      </StoryFrame>
    ),
  ],
  render: (args) => <BoardHarness {...args} />,
  args: {
    mode: 'play',
    board: clues,
    notes: emptyNotes,
    clues,
    uncertain: [],
    wrongCells: [],
    selected: 0,
    readOnly: false,
    busy: false,
    onSelect: fn(),
    onEnter: fn(),
    onToggleNotes: fn(),
    onOpenDial: fn(),
  },
} satisfies Meta<typeof SudokuBoard>;
export default meta;
type Story = StoryObj<typeof meta>;

function BoardLifecycleHarness(args: SudokuBoardProps) {
  const [inputs, setInputs] = useStoryInput(args);
  const [mounted, setMounted] = useState(true);
  const [updatedDialCell, setUpdatedDialCell] = useState<number | null>(null);
  const [updatedSelection, setUpdatedSelection] = useState<number | null>(null);
  return (
    <>
      <button onClick={() => setInputs({ ...inputs, busy: true })}>Set busy</button>
      <button onClick={() => setInputs({ ...inputs, readOnly: true })}>Set read-only</button>
      <button onClick={() => setInputs({ ...inputs, mode: 'review' })}>Change mode</button>
      <button
        onClick={() =>
          setInputs({
            ...inputs,
            clues: inputs.clues.map((value, cell) => (cell === 0 ? 5 : value)),
          })
        }
      >
        Change clues
      </button>
      <button
        onClick={() =>
          setInputs({ ...inputs, onSelect: setUpdatedSelection, onOpenDial: setUpdatedDialCell })
        }
      >
        Change callbacks
      </button>
      <button onClick={() => setInputs({ ...inputs, selected: 10 })}>Change selection</button>
      <button onClick={() => setMounted(false)}>Unmount board</button>
      <output aria-label="Updated dial cell">{updatedDialCell ?? 'Not called'}</output>
      <output aria-label="Updated selection">{updatedSelection ?? 'Not called'}</output>
      {mounted ? <BoardHarness {...inputs} /> : null}
    </>
  );
}

async function expectCancelledAfterUpdate(
  canvasElement: HTMLElement,
  args: SudokuBoardProps,
  update: string,
) {
  const canvas = within(canvasElement);
  const cell = canvas.getByRole('button', { name: 'Row 1 column 1, empty' });
  fireEvent.pointerDown(cell, { button: 0, isPrimary: true });
  // Avoid pointer movement/up: only the React commit should cancel this hold.
  fireEvent.click(canvas.getByRole('button', { name: update }));
  await new Promise((resolve) => setTimeout(resolve, 550));
  await expect(args.onOpenDial).not.toHaveBeenCalled();
  await expect(args.onSelect).not.toHaveBeenCalled();
}

export const BusyDuringHold: Story = {
  render: (args) => <BoardLifecycleHarness {...args} />,
  play: ({ canvasElement, args }) => expectCancelledAfterUpdate(canvasElement, args, 'Set busy'),
};
export const ReadOnlyDuringHold: Story = {
  render: (args) => <BoardLifecycleHarness {...args} />,
  play: ({ canvasElement, args }) =>
    expectCancelledAfterUpdate(canvasElement, args, 'Set read-only'),
};
export const ModeChangesDuringHold: Story = {
  render: (args) => <BoardLifecycleHarness {...args} />,
  play: ({ canvasElement, args }) => expectCancelledAfterUpdate(canvasElement, args, 'Change mode'),
};
export const CluesChangeDuringHold: Story = {
  render: (args) => <BoardLifecycleHarness {...args} />,
  play: ({ canvasElement, args }) =>
    expectCancelledAfterUpdate(canvasElement, args, 'Change clues'),
};
export const UnmountedDuringHold: Story = {
  render: (args) => <BoardLifecycleHarness {...args} />,
  play: ({ canvasElement, args }) =>
    expectCancelledAfterUpdate(canvasElement, args, 'Unmount board'),
};
export const CallbacksChangeDuringHold: Story = {
  render: (args) => <BoardLifecycleHarness {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const cell = canvas.getByRole('button', { name: 'Row 1 column 1, empty' });
    fireEvent.pointerDown(cell, { button: 0, isPrimary: true });
    fireEvent.click(canvas.getByRole('button', { name: 'Change callbacks' }));
    await waitFor(() => expect(canvas.getByLabelText('Updated dial cell')).toHaveTextContent('0'));
    await expect(canvas.getByLabelText('Updated selection')).toHaveTextContent('0');
    await expect(args.onOpenDial).not.toHaveBeenCalled();
    await expect(args.onSelect).not.toHaveBeenCalled();
    await expect(cell).toHaveFocus();
    fireEvent.pointerUp(cell);
  },
};
export const ControlsUpdates: Story = {
  render: (args) => <BoardLifecycleHarness {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Row 1 column 1, empty' }));
    await userEvent.keyboard('{ArrowRight}');
    await userEvent.click(canvas.getByRole('button', { name: 'Change selection' }));
    await expect(canvasElement.querySelector('#cell-10')).toHaveAttribute('aria-pressed', 'true');
    await expect(canvasElement.querySelector('#cell-10')).toHaveAttribute('tabindex', '0');
    await expect(canvasElement.querySelector('#cell-1')).toHaveAttribute('aria-pressed', 'false');
  },
};

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const cells = within(canvas.getByRole('group', { name: 'Sudoku board' })).getAllByRole(
      'button',
    );
    await expect(cells).toHaveLength(81);
    await userEvent.click(cells[0]);
    await userEvent.keyboard('{ArrowLeft}');
    await expect(cells[0]).toHaveFocus();
    await userEvent.click(cells[8]);
    await userEvent.keyboard('{ArrowRight}');
    await expect(cells[9]).toHaveFocus();
    await expect(cells[9]).toHaveAttribute('aria-pressed', 'true');
    await expect(cells.filter((cell) => cell.tabIndex === 0)).toHaveLength(1);
    await userEvent.keyboard('{ArrowDown}{ArrowUp}');
    await expect(cells[9]).toHaveFocus();
    await userEvent.click(cells[80]);
    await userEvent.keyboard('{ArrowRight}');
    await expect(cells[80]).toHaveFocus();
    await userEvent.click(cells[0]);
    await userEvent.keyboard('8');
    await expect(args.onEnter).toHaveBeenLastCalledWith(8, 0);
    for (const key of ['{Backspace}', '{Delete}', '0']) {
      await userEvent.keyboard(key);
      await expect(args.onEnter).toHaveBeenLastCalledWith(0, 0);
    }
    await userEvent.keyboard('n');
    await expect(args.onToggleNotes).toHaveBeenCalledOnce();
    await expect(cells[1]).toHaveAttribute('data-given', 'true');
  },
};
export const Draft: Story = {
  args: { mode: 'review', uncertain: [1, 4, 9] },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const clue = canvas.getByRole('button', { name: 'Row 1 column 2, 3' });
    await expect(clue).toHaveClass('uncertain');
    await expect(clue).toHaveAttribute('data-given', 'false');
    await expect(clue).toHaveAccessibleDescription('Needs review.');
    await userEvent.click(clue);
    await userEvent.keyboard('n');
    await expect(args.onToggleNotes).toHaveBeenCalledOnce();
  },
};
export const NotesAndMistakes: Story = {
  args: { board: mistakenBoard, notes: pencilNotes, wrongCells: [3], selected: 3 },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('#cell-2 .notes')).toHaveTextContent('148');
    await expect(canvasElement.querySelector('#cell-3')).toHaveAttribute('data-wrong', 'true');
    await expect(canvasElement.querySelector('#cell-2')).toHaveAccessibleDescription(
      'Pencil notes: 1, 4, 8.',
    );
    await expect(canvasElement.querySelector('#cell-3')).toHaveAccessibleDescription(
      'Incorrect number.',
    );
    await expect(canvasElement.querySelector('.note-match')).not.toBeInTheDocument();
  },
};
export const Historical: Story = {
  args: { readOnly: true },
  play: async ({ canvasElement, args }) => {
    await userEvent.click(
      within(canvasElement).getByRole('button', { name: 'Row 1 column 1, empty' }),
    );
    await userEvent.keyboard('n{ArrowRight}');
    await expect(args.onToggleNotes).not.toHaveBeenCalled();
    await expect(canvasElement.querySelector('#cell-1')).toHaveFocus();
  },
};
export const Completed: Story = { args: { board: completedBoard, readOnly: true } };
export const Saving: Story = {
  args: { busy: true },
  play: async ({ canvasElement, args }) => {
    await userEvent.click(
      within(canvasElement).getByRole('button', { name: 'Row 1 column 1, empty' }),
    );
    await userEvent.keyboard('n');
    await expect(args.onToggleNotes).toHaveBeenCalledOnce();
  },
};
export const LongPress: Story = {
  play: async ({ canvasElement, args }) => {
    const cell = within(canvasElement).getByRole('button', { name: 'Row 1 column 1, empty' });
    await userEvent.pointer({ target: cell, keys: '[MouseLeft>]' });
    try {
      await waitFor(() => expect(args.onOpenDial).toHaveBeenCalledWith(0));
    } finally {
      await userEvent.pointer({ target: cell, keys: '[/MouseLeft]' });
    }
  },
};
export const CancelledLongPress: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const cell = canvas.getByRole('button', { name: 'Row 1 column 1, empty' });
    // Dispatch coordinates explicitly: userEvent does not perform layout-based pointer movement.
    const pointer = (target: HTMLElement, type: string, x = 0) =>
      target.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          button: 0,
          isPrimary: true,
          clientX: x,
          clientY: 0,
        }),
      );
    for (const cancellation of ['pointerup', 'pointercancel', 'pointerout', 'pointermove']) {
      pointer(cell, 'pointerdown');
      pointer(cell, cancellation, cancellation === 'pointermove' ? 11 : 0);
      await new Promise((resolve) => setTimeout(resolve, 500));
      await expect(args.onOpenDial).not.toHaveBeenCalled();
    }
    const given = canvas.getByRole('button', { name: 'Row 1 column 2, 3, given' });
    pointer(given, 'pointerdown');
    await new Promise((resolve) => setTimeout(resolve, 500));
    pointer(given, 'pointerup');
    await expect(args.onOpenDial).not.toHaveBeenCalled();
  },
};
export const Mobile: Story = {
  args: { board: mistakenBoard, notes: pencilNotes, wrongCells: [3] },
  parameters: { frameWidth: 320 },
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
