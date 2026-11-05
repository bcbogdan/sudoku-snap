import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fireEvent, fn, userEvent, within } from 'storybook/test';
import { ReplayControls, type ReplayControlsProps } from './ReplayControls';
import StoryFrame from './StoryFrame';

function ControlledReplay(args: ReplayControlsProps) {
  const [step, setStep] = useState(args.step);
  return (
    <ReplayControls
      {...args}
      step={step}
      onStepChange={(next) => {
        setStep(next);
        args.onStepChange(next);
      }}
    />
  );
}

const meta = {
  title: 'Kit/ReplayControls',
  component: ReplayControls,
  decorators: [
    (Story) => (
      <StoryFrame width={640}>
        <Story />
      </StoryFrame>
    ),
  ],
  args: {
    step: 3,
    moveCount: 5,
    busy: false,
    onStepChange: fn(),
    moveDescription: 'Number entered · Row 5, column 2',
    timestamp: 'Nov 3, 2026, 2:41 PM',
  },
} satisfies Meta<typeof ReplayControls>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Middle: Story = {};
export const First: Story = {
  args: { step: 0, moveDescription: 'Initial clues', timestamp: undefined },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'First move' })).toBeDisabled();
    await expect(canvas.getByRole('button', { name: 'Previous move' })).toBeDisabled();
    await expect(canvas.getByRole('button', { name: 'Next move' })).toBeEnabled();
  },
};
export const Latest: Story = {
  args: { step: 5 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Next move' })).toBeDisabled();
    await expect(canvas.getByRole('button', { name: 'Latest move' })).toBeDisabled();
    await expect(canvas.getByRole('slider', { name: 'Attempt history' })).toHaveValue('5');
  },
};
export const ZeroMoves: Story = {
  args: { step: 0, moveCount: 0, moveDescription: 'Initial clues', timestamp: undefined },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    for (const button of canvas.getAllByRole('button')) await expect(button).toBeDisabled();
    await expect(canvas.getByRole('slider')).toBeDisabled();
  },
};
export const Busy: Story = {
  args: { busy: true },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    for (const button of canvas.getAllByRole('button')) {
      await expect(button).toBeDisabled();
      await userEvent.click(button);
    }
    await expect(canvas.getByRole('slider')).toBeDisabled();
    await expect(args.onStepChange).not.toHaveBeenCalled();
  },
};
export const LongTimestamp: Story = {
  args: {
    timestamp:
      'Wednesday, November 25, 2026 at 11:59:59 PM Pacific Standard Time (America/Los_Angeles) 日本語',
  },
};
export const KeyboardAndCallbacks: Story = {
  render: (args) => <ControlledReplay {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const range = canvas.getByRole('slider', { name: 'Attempt history' });
    range.focus();
    // Playwright covers native range keys; synthetic input exercises the change contract.
    fireEvent.input(range, { target: { value: '4' } });
    await expect(range).toHaveValue('4');
    await expect(range).toHaveFocus();
    await expect(args.onStepChange).toHaveBeenLastCalledWith(4);
    fireEvent.input(range, { target: { value: '0' } });
    await expect(range).toHaveValue('0');
    await expect(range).toHaveFocus();
    await expect(args.onStepChange).toHaveBeenLastCalledWith(0);
    fireEvent.input(range, { target: { value: '5' } });
    await expect(range).toHaveValue('5');
    await expect(range).toHaveFocus();
    await expect(args.onStepChange).toHaveBeenLastCalledWith(5);
    await userEvent.click(canvas.getByRole('button', { name: 'Previous move' }));
    await expect(args.onStepChange).toHaveBeenLastCalledWith(4);
    await userEvent.click(canvas.getByRole('button', { name: 'First move' }));
    await expect(args.onStepChange).toHaveBeenLastCalledWith(0);
    await userEvent.click(canvas.getByRole('button', { name: 'Next move' }));
    await expect(args.onStepChange).toHaveBeenLastCalledWith(1);
    await userEvent.click(canvas.getByRole('button', { name: 'Latest move' }));
    await expect(args.onStepChange).toHaveBeenLastCalledWith(5);
  },
};
export const ClampedBoundary: Story = {
  args: { step: 99 },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('slider')).toHaveValue('5');
    await userEvent.click(canvas.getByRole('button', { name: 'Previous move' }));
    await expect(args.onStepChange).toHaveBeenLastCalledWith(4);
  },
};
