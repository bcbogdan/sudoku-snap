'use client';

import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fireEvent, userEvent, within } from 'storybook/test';
import OriginalPhoto from './OriginalPhoto';
import StoryFrame from './StoryFrame';

const image = new Blob(
  [
    '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#f3f5f7"/><path d="M80 0v480M240 0v480M400 0v480M560 0v480M0 80h640M0 240h640M0 400h640" stroke="#0e1a2b" stroke-width="3"/><text x="110" y="180" font-size="48" fill="#0e1a2b">5</text></svg>',
  ],
  { type: 'image/svg+xml' },
);

const meta = {
  title: 'Game/OriginalPhoto',
  component: OriginalPhoto,
  decorators: [
    (Story, context) => (
      <StoryFrame width={context.parameters.frameWidth}>
        <Story />
      </StoryFrame>
    ),
  ],
  args: { image },
} satisfies Meta<typeof OriginalPhoto>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Expanded: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText('Compare original photo'));
    const photo = await canvas.findByRole('img');
    await expect(photo).toHaveAttribute('loading', 'lazy');
    await expect(photo.getAttribute('src')).toMatch(/^blob:/);
    await expect(canvas.getByRole('slider', { name: /Photo zoom/ })).toHaveValue('1');
  },
};
export const NarrowZoomed: Story = {
  parameters: { frameWidth: 320 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText('Compare original photo'));
    const slider = canvas.getByRole('slider', { name: /Photo zoom/ });
    slider.focus();
    // Playwright covers native range keys; synthetic input exercises the change contract.
    fireEvent.input(slider, { target: { value: '4' } });
    await expect(slider).toHaveFocus();
    await expect(slider).toHaveValue('4');
    await expect(canvas.getByRole('img').style.width).toBe('400%');
    await userEvent.tab();
    await expect(canvas.getByRole('region', { name: /Original photo/ })).toHaveFocus();
  },
};
export const Unreadable: Story = {
  parameters: { frameWidth: 320 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText('Compare original photo'));
    await fireEvent.error(await canvas.findByRole('img'));
    await expect(canvas.getByRole('status')).toHaveTextContent(
      'Could not open the original photo.',
    );
    await expect(canvas.queryByRole('img')).not.toBeInTheDocument();
  },
};
