'use client';

import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fireEvent, userEvent, waitFor, within } from 'storybook/test';
import Button from './Button';
import CopyNotice from './CopyNotice';
import StoryFrame from './StoryFrame';

function CopyHarness({ sequence }: { sequence: number }) {
  const [value, setValue] = useState(sequence);
  return (
    <>
      <Button onClick={() => setValue((current) => current + 1)}>Copy again</Button>
      <CopyNotice sequence={value} />
    </>
  );
}

const meta = {
  title: 'App/CopyNotice',
  component: CopyNotice,
  decorators: [
    (Story, context) => (
      <StoryFrame width={context.parameters.frameWidth}>
        <Story />
      </StoryFrame>
    ),
  ],
  args: { sequence: 1 },
  render: (args) => <CopyHarness {...args} />,
} satisfies Meta<typeof CopyNotice>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Mobile: Story = {
  parameters: { frameWidth: 320 },
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
export const Idle: Story = {
  args: { sequence: 0 },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('status')).not.toBeInTheDocument();
  },
};
export const RepeatedCopy: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const notice = await canvas.findByRole('status');
    await expect(notice).toHaveAttribute('aria-atomic', 'true');
    await userEvent.click(canvas.getByRole('button', { name: 'Copy again' }));
    await expect(canvas.getByRole('status')).toBe(notice);
    await waitFor(() => expect(notice).toHaveAttribute('data-closing'), { timeout: 4000 });
    await fireEvent.click(canvas.getByRole('button', { name: 'Copy again' }));
    await expect(canvas.getByRole('status')).toBe(notice);
    await expect(notice).not.toHaveAttribute('data-closing');
  },
};
