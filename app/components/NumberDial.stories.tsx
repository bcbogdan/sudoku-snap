'use client';

import { useEffect, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import NumberDial, { type NumberDialProps } from '../NumberDial';
import StoryFrame from './StoryFrame';

function DialHarness(args: NumberDialProps) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    trigger.current?.focus();
    setOpen(true);
  }, []);
  return (
    <>
      <button ref={trigger} className="secondary" onClick={() => setOpen(true)}>
        Open number dial
      </button>
      {open ? (
        <NumberDial
          onChoose={(value) => {
            args.onChoose(value);
            setOpen(false);
          }}
          onClose={() => {
            args.onClose();
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

const meta = {
  title: 'Game/NumberDial',
  component: NumberDial,
  decorators: [
    (Story, context) => (
      <StoryFrame width={context.parameters.frameWidth}>
        <Story />
      </StoryFrame>
    ),
  ],
  render: (args) => <DialHarness {...args} />,
  args: { onChoose: fn(), onClose: fn() },
} satisfies Meta<typeof NumberDial>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const dialog = await within(canvasElement).findByRole('dialog', { name: 'Choose a number' });
    await expect(dialog).toBeVisible();
    await expect(within(dialog).getAllByRole('button')).toHaveLength(11);
  },
};
export const Choosing: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const dialog = await canvas.findByRole('dialog', { name: 'Choose a number' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Choose 8' }));
    await expect(args.onChoose).toHaveBeenLastCalledWith(8);
    await expect(canvas.queryByRole('dialog')).not.toBeInTheDocument();
    const trigger = canvas.getByRole('button', { name: 'Open number dial' });
    await waitFor(() => expect(trigger).toHaveFocus());
    await userEvent.click(trigger);
    await userEvent.click(canvas.getByRole('button', { name: 'Clear square' }));
    await expect(args.onChoose).toHaveBeenLastCalledWith(0);
    await expect(trigger).toHaveFocus();
    await userEvent.click(trigger);
  },
};
export const Dismissal: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const dialog = await canvas.findByRole('dialog', { name: 'Choose a number' });
    // userEvent's synthetic Escape does not invoke the browser's native dialog cancel action.
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    await expect(args.onClose).toHaveBeenCalledTimes(1);
    const trigger = canvas.getByRole('button', { name: 'Open number dial' });
    await expect(trigger).toHaveFocus();
    await userEvent.click(trigger);
    await userEvent.click(canvas.getByRole('button', { name: 'Cancel' }));
    await expect(args.onClose).toHaveBeenCalledTimes(2);
    await expect(trigger).toHaveFocus();
    await userEvent.click(trigger);
    await userEvent.click(canvas.getByRole('dialog', { name: 'Choose a number' }));
    await expect(args.onClose).toHaveBeenCalledTimes(3);
    await expect(args.onChoose).not.toHaveBeenCalled();
    await expect(trigger).toHaveFocus();
    await userEvent.click(trigger);
  },
};
export const Mobile: Story = {
  parameters: { frameWidth: 320 },
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
