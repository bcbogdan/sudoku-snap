import type { Meta, StoryObj } from '@storybook/react-vite';
import type { CSSProperties } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';
import Button from './Button';
import Icon from './Icon';
import Toggle from './Toggle';
import './ControlsStories.css';

const meta = {
  title: 'Kit/Button',
  component: Button,
  decorators: [
    (Story) => (
      <div className="controls-stories">
        <Story />
      </div>
    ),
  ],
  args: { children: 'Undo move', onClick: fn() },
} satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;

async function expectLabelGeometry(button: HTMLElement) {
  const style = getComputedStyle(button);
  const target = parseFloat(style.getPropertyValue('--control-height'));
  await expect(button.getBoundingClientRect().width).toBeGreaterThan(target * 2);
  await expect(button).not.toHaveAttribute('data-icon-only');
  for (const node of button.childNodes) {
    if (node.nodeType !== Node.TEXT_NODE || !node.textContent?.trim()) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    await expect(range.getBoundingClientRect().height).toBeLessThanOrEqual(
      parseFloat(style.lineHeight) * 3,
    );
  }
}

async function expectIconOnlyGeometry(canvasElement: HTMLElement, target: number) {
  const button = within(canvasElement).getByRole('button', { name: 'Rename puzzle' });
  await expect(button).toBeVisible();
  await expect(button).toHaveAttribute('aria-label', 'Rename puzzle');
  await expect(button).toHaveAttribute('data-icon-only', 'true');
  const box = button.getBoundingClientRect();
  await expect(box.width).toBeCloseTo(target, 1);
  await expect(box.height).toBeCloseTo(target, 1);
}

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const button = within(canvasElement).getByRole('button', { name: 'Undo move' });
    await expect(button).toHaveAttribute('type', 'button');
    await userEvent.click(button);
    await expect(args.onClick).toHaveBeenCalledOnce();
  },
};

export const Variants: Story = {
  render: () => (
    <div className="controls-stories__stack">
      {(['ink', 'flash', 'outline', 'quiet'] as const).map((variant) => (
        <div className="controls-stories__stack" key={variant}>
          <p className="controls-stories__caption">{variant}</p>
          <div className="controls-stories__row">
            <Button variant={variant}>Undo move</Button>
            <Button variant={variant} disabled>
              Undo move
            </Button>
            <Button variant={variant} busy>
              Undo move
            </Button>
            <Button variant={variant} iconOnly aria-label="Rename puzzle">
              <Icon name="pencil" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  ),
};

export const ReferenceKit: Story = {
  render: () => (
    <div className="controls-stories__stack controls-stories__panel">
      <div className="controls-stories__row">
        <Button variant="ink">
          Confirm clues &amp; play <Icon name="arrow-right" />
        </Button>
        <Button variant="flash">
          <Icon name="plus" /> New puzzle
        </Button>
      </div>
      <div className="controls-stories__row">
        <Button>Paste image</Button>
        <Button>Enter clues by hand</Button>
        <Button iconOnly aria-label="Rename puzzle">
          <Icon name="pencil" />
        </Button>
      </div>
      <div className="controls-stories__row">
        <Toggle label="Pencil notes" pressed={false} onClick={fn()} />
        <Toggle label="Pencil notes" pressed onClick={fn()} />
        <Toggle label="Mistake check" pressed onClick={fn()} />
      </div>
      <div className="controls-stories__row">
        <Button>Undo move</Button>
        <Button disabled>Undo move</Button>
        <a className="kit-button" data-variant="quiet" href="#my-puzzles">
          <Icon name="chevron-left" /> My puzzles
        </a>
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    for (const name of ['Confirm clues & play', 'New puzzle']) {
      await expectLabelGeometry(canvas.getByRole('button', { name }));
    }
    await expectLabelGeometry(canvas.getByRole('link', { name: 'My puzzles' }));
    await expectIconOnlyGeometry(canvasElement, 52);
  },
};

export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvasElement, args }) => {
    const button = within(canvasElement).getByRole('button', { name: 'Undo move' });
    await expect(button).toBeDisabled();
    await userEvent.click(button);
    await expect(args.onClick).not.toHaveBeenCalled();
    await expect(button).toHaveStyle({ opacity: '1' });
  },
};

export const Busy: Story = {
  args: { variant: 'ink', busy: true, type: 'submit', children: 'Confirm clues & play' },
  render: (args) => (
    <form>
      <Button {...args} />
    </form>
  ),
  play: async ({ canvasElement, args }) => {
    const button = within(canvasElement).getByRole('button', { name: 'Confirm clues & play' });
    const submit = fn((event: Event) => event.preventDefault());
    const form = canvasElement.querySelector('form')!;
    form.addEventListener('submit', submit);
    try {
      await expect(button).toHaveAttribute('aria-busy', 'true');
      await expect(button).toHaveAttribute('aria-disabled', 'true');
      await expect(button).not.toHaveAttribute('disabled');
      await userEvent.click(button);
      button.focus();
      await userEvent.keyboard('{Enter} ');
      await expect(button).toHaveFocus();
      await expect(args.onClick).not.toHaveBeenCalled();
      await expect(submit).not.toHaveBeenCalled();
    } finally {
      form.removeEventListener('submit', submit);
    }
  },
};

export const AriaDisabled: Story = {
  args: { variant: 'ink', type: 'submit' },
  render: (args) => (
    <form className="controls-stories__row">
      <Button {...args} aria-disabled={true}>
        Boolean aria-disabled
      </Button>
      <Button {...args} aria-disabled="true">
        String aria-disabled
      </Button>
      <Button {...args} disabled>
        Native disabled
      </Button>
    </form>
  ),
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const form = canvasElement.querySelector('form')!;
    const submit = fn((event: Event) => event.preventDefault());
    const clicks: Event[] = [];
    const captureClick = (event: Event) => clicks.push(event);
    form.addEventListener('submit', submit);
    form.addEventListener('click', captureClick, true);
    try {
      for (const name of ['Boolean aria-disabled', 'String aria-disabled']) {
        const button = canvas.getByRole('button', { name });
        await expect(button).toHaveAttribute('aria-disabled', 'true');
        await expect(button).not.toHaveAttribute('disabled');
        await expect(button).toHaveAttribute('data-variant', 'ink');
        await expect(button).toHaveStyle({ opacity: '1' });
        const style = getComputedStyle(button);
        await expect(style.getPropertyValue('--kit-button-bg').trim()).toBe(
          style.getPropertyValue('--color-button-primary-bg').trim(),
        );

        await userEvent.click(button);
        await expect(button).toHaveFocus();
        await userEvent.keyboard('{Enter} ');
        await expect(button).toHaveFocus();
      }
      await expect(clicks).toHaveLength(6);
      await expect(clicks.every((event) => event.defaultPrevented)).toBe(true);

      const disabled = canvas.getByRole('button', { name: 'Native disabled' });
      await expect(disabled).toBeDisabled();
      await expect(disabled).toHaveStyle({ opacity: '1' });
      await userEvent.click(disabled);
      await expect(args.onClick).not.toHaveBeenCalled();
      await expect(submit).not.toHaveBeenCalled();
    } finally {
      form.removeEventListener('submit', submit);
      form.removeEventListener('click', captureClick, true);
    }
  },
};

export const IconOnly: Story = {
  args: { iconOnly: true, 'aria-label': 'Rename puzzle', children: <Icon name="pencil" /> },
  play: async ({ canvasElement }) => {
    await expectIconOnlyGeometry(canvasElement, 52);
  },
};

export const CompactIconOnly: Story = {
  args: {
    ...IconOnly.args,
    style: { '--control-height': '44px' } as CSSProperties,
  },
  play: async ({ canvasElement }) => {
    await expectIconOnlyGeometry(canvasElement, 44);
  },
};

export const Keyboard: Story = {
  render: (args) => (
    <div className="controls-stories__row">
      <Button {...args}>Undo move</Button>
      <Button disabled>Unavailable action</Button>
      <Button {...args} variant="quiet">
        Move history
      </Button>
    </div>
  ),
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    canvas.getByRole('button', { name: 'Undo move' }).focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.tab();
    const history = canvas.getByRole('button', { name: 'Move history' });
    await expect(history).toHaveFocus();
    await expect(history.matches(':focus-visible')).toBe(true);
    await userEvent.keyboard(' ');
    await expect(args.onClick).toHaveBeenCalledTimes(2);
  },
};

export const NarrowLongLabels: Story = {
  render: () => (
    <div className="controls-stories__stack controls-stories__narrow">
      <Button variant="ink">Confirm all detected clues and start playing this puzzle</Button>
      <Button>
        <Icon name="pencil" /> Enter clues by hand with a longer translated label
      </Button>
      <Button>VeryLongUnbrokenNavigationActionLabelForOverflowChecks</Button>
    </div>
  ),
};
