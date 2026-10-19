import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import CreatePuzzle from './CreatePuzzle';
import StoryFrame from './StoryFrame';

const meta = {
  title: 'Create/CreatePuzzle',
  component: CreatePuzzle,
  decorators: [
    (Story, context) => (
      <StoryFrame width={context.parameters.frameWidth}>
        <Story />
      </StoryFrame>
    ),
  ],
  args: { busy: false, onUpload: fn(), onPasteImage: fn(), onCreateManual: fn() },
} satisfies Meta<typeof CreatePuzzle>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByLabelText('Choose a Sudoku photo', { exact: true });
    const file = new File(['story fixture'], 'puzzle.png', { type: 'image/png' });
    await userEvent.upload(input, file);
    await expect(args.onUpload).toHaveBeenCalledWith(file);
    await expect(input).toHaveValue('');
    await userEvent.upload(input, file);
    await expect(args.onUpload).toHaveBeenCalledTimes(2);
    await userEvent.click(canvas.getByRole('button', { name: 'Paste image' }));
    await expect(args.onPasteImage).toHaveBeenCalledOnce();
    await userEvent.click(canvas.getByRole('button', { name: 'Enter clues by hand' }));
    await expect(args.onCreateManual).toHaveBeenCalledOnce();
  },
};
export const Saving: Story = {
  args: { busy: true },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText('Choose a Sudoku photo', { exact: true })).toBeDisabled();
    for (const button of canvas.getAllByRole('button')) {
      await expect(button).toBeDisabled();
      await userEvent.click(button);
    }
    await expect(args.onPasteImage).not.toHaveBeenCalled();
    await expect(args.onCreateManual).not.toHaveBeenCalled();
  },
};
export const Mobile: Story = {
  parameters: { frameWidth: 320 },
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};

export const Reading: Story = {
  args: { busy: true, onCancel: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Cancel reading' }));
    await expect(args.onCancel).toHaveBeenCalledOnce();
  },
};
