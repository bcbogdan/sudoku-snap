'use client';

import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fireEvent, fn, userEvent, within } from 'storybook/test';
import AttemptHistory, { type AttemptHistoryProps } from './AttemptHistory';
import StoryFrame from './StoryFrame';
import { useStoryInput } from './use-story-input';

function HistoryHarness(args: AttemptHistoryProps) {
  const [inputStep, setStep] = useStoryInput(args.step);
  const step = Math.max(0, Math.min(args.moveCount, inputStep));
  return (
    <AttemptHistory
      {...args}
      step={step}
      readOnly={args.complete || step < args.moveCount}
      moveDescription={step ? args.moveDescription : 'Original puzzle'}
      onStepChange={(next) => {
        args.onStepChange(next);
        setStep(next);
      }}
    />
  );
}

const meta = {
  title: 'Game/AttemptHistory',
  component: AttemptHistory,
  decorators: [
    (Story, context) => (
      <StoryFrame width={context.parameters.frameWidth}>
        <Story />
      </StoryFrame>
    ),
  ],
  render: (args) => <HistoryHarness {...args} />,
  argTypes: {
    readOnly: {
      control: false,
      description: 'Derived from completion and the displayed history step by this harness.',
    },
    moveDescription: {
      description: 'Description for a nonzero step; step zero always shows Original puzzle.',
    },
    step: { control: { type: 'number', min: 0 } },
    moveCount: { control: { type: 'number', min: 0 } },
  },
  args: {
    step: 3,
    moveCount: 3,
    busy: false,
    readOnly: false,
    complete: false,
    canUndo: true,
    moveDescription: 'Number entered · Row 1, column 4 · Sep 10, 2026, 9:15 AM',
    completionDuration: '00:12:34',
    onStepChange: fn(),
    onUndo: fn(),
    onBegin: fn(),
  },
} satisfies Meta<typeof AttemptHistory>;
export default meta;
type Story = StoryObj<typeof meta>;

function HistoryControlsHarness(args: AttemptHistoryProps) {
  const [inputs, setInputs] = useStoryInput(args);
  return (
    <>
      <button onClick={() => setInputs({ ...args, step: 1 })}>Update history controls</button>
      <button onClick={() => setInputs({ ...args, step: 1, moveCount: 0 })}>Shorten history</button>
      <HistoryHarness {...inputs} />
    </>
  );
}
export const ControlsUpdates: Story = {
  render: (args) => <HistoryControlsHarness {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Update history controls' }));
    await expect(canvas.getByRole('slider')).toHaveValue('1');
    await expect(canvas.getByRole('button', { name: 'Undo move' })).toBeDisabled();
    await userEvent.click(canvas.getByRole('button', { name: 'Shorten history' }));
    await expect(canvas.getByRole('slider')).toHaveValue('0');
    await expect(canvas.getByRole('slider')).toBeDisabled();
  },
};

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Latest move' })).toBeDisabled();
    await userEvent.click(canvas.getByRole('button', { name: 'Undo move' }));
    await expect(args.onUndo).toHaveBeenCalledOnce();
    await userEvent.click(canvas.getByRole('button', { name: 'Previous move' }));
    await expect(args.onStepChange).toHaveBeenLastCalledWith(2);
    await expect(canvas.getByRole('button', { name: 'Undo move' })).toBeDisabled();
    await userEvent.click(canvas.getByRole('button', { name: 'First move' }));
    await expect(canvas.getByRole('slider', { name: 'Attempt history' })).toHaveValue('0');
    await expect(canvas.getByRole('button', { name: 'Previous move' })).toBeDisabled();
    const slider = canvas.getByRole('slider');
    slider.focus();
    // Native range-key defaults need trusted browser input; exercise the change contract here.
    fireEvent.input(slider, { target: { value: '1' } });
    await expect(args.onStepChange).toHaveBeenLastCalledWith(1);
    await expect(slider).toHaveFocus();
    await userEvent.click(canvas.getByRole('button', { name: 'Latest move' }));
    await expect(args.onStepChange).toHaveBeenLastCalledWith(3);
    await expect(canvas.getByRole('button', { name: 'Undo move' })).toBeEnabled();
  },
};
export const Historical: Story = { args: { step: 1, readOnly: true } };
export const Completed: Story = {
  args: { complete: true, readOnly: true },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('button', { name: 'Undo move' })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Previous move' }));
    await expect(canvas.getByText(/This attempt is locked/)).toBeVisible();
    await expect(canvas.queryByRole('button', { name: 'Undo move' })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Start a new attempt' }));
    await expect(args.onBegin).toHaveBeenCalledOnce();
  },
};
export const Saving: Story = {
  args: { busy: true },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    for (const button of canvas.getAllByRole('button')) await expect(button).toBeDisabled();
    await expect(canvas.getByRole('slider')).toBeDisabled();
    await expect(args.onStepChange).not.toHaveBeenCalled();
  },
};
export const Empty: Story = { args: { step: 0, moveCount: 0, canUndo: false } };
export const Mobile: Story = {
  parameters: { frameWidth: 320 },
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
