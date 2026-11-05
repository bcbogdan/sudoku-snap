import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fireEvent, fn, userEvent, within } from 'storybook/test';
import { PhotoDropZone } from './PhotoDropZone';

const meta = {
  title: 'Kit/PhotoDropZone',
  component: PhotoDropZone,
  decorators: [
    (Story, context) => (
      <div className="kit-photo-drop-story" data-narrow={context.parameters.narrow === true}>
        <Story />
      </div>
    ),
  ],
  args: { busy: false, invalid: false, onUpload: fn<(file: File) => void>() },
} satisfies Meta<typeof PhotoDropZone>;
export default meta;
type Story = StoryObj<typeof meta>;

function dispatchDrag(target: Element, type: string, dataTransfer: DataTransfer) {
  // The drag helpers clone DataTransfer's own properties, losing native FileList getters.
  return fireEvent(target, new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer }));
}

export const Default: Story = {};
export const Invalid: Story = { args: { invalid: true } };
export const Narrow: Story = { parameters: { narrow: true } };
export const Busy: Story = {
  args: { busy: true },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByLabelText('Reading your photo…');
    await expect(input).toBeDisabled();
    const file = new File(['image fixture'], 'busy.png', { type: 'image/png' });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    await dispatchDrag(input, 'dragenter', transfer);
    await dispatchDrag(input, 'drop', transfer);
    await expect(args.onUpload).not.toHaveBeenCalled();
    await expect(canvasElement.querySelector('.kit-photo-drop')).toHaveAttribute(
      'data-dragging',
      'false',
    );
  },
};

export const UploadAndReselect: Story = {
  play: async ({ canvasElement, args }) => {
    const input = within(canvasElement).getByLabelText('Choose a Sudoku photo');
    const file = new File(['image fixture'], 'puzzle.png', { type: 'image/png' });
    await userEvent.upload(input, file);
    await expect(args.onUpload).toHaveBeenCalledTimes(1);
    await expect(args.onUpload).toHaveBeenLastCalledWith(file);
    await expect(input).toHaveValue('');
    await userEvent.upload(input, file);
    await expect(args.onUpload).toHaveBeenCalledTimes(2);
  },
};

export const DropAndNestedDrag: Story = {
  play: async ({ canvasElement, args }) => {
    const zone = canvasElement.querySelector('.kit-photo-drop')!;
    const camera = canvasElement.querySelector('.kit-photo-drop__camera')!;
    const transfer = new DataTransfer();
    const file = new File(['image fixture'], 'dropped.png', { type: 'image/png' });
    transfer.items.add(file);
    await dispatchDrag(zone, 'dragenter', transfer);
    await dispatchDrag(camera, 'dragenter', transfer);
    await dispatchDrag(camera, 'dragleave', transfer);
    await expect(zone).toHaveAttribute('data-dragging', 'true');
    await dispatchDrag(zone, 'dragover', transfer);
    await dispatchDrag(zone, 'dragleave', transfer);
    await expect(zone).toHaveAttribute('data-dragging', 'false');
    await dispatchDrag(zone, 'dragenter', transfer);
    await dispatchDrag(zone, 'drop', transfer);
    await expect(args.onUpload).toHaveBeenCalledTimes(1);
    await expect(args.onUpload).toHaveBeenLastCalledWith(file);
    await expect(zone).toHaveAttribute('data-dragging', 'false');
  },
};
