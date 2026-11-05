import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import CollectionFilters, { type CollectionFiltersProps } from './CollectionFilters';
import StoryFrame from './StoryFrame';
import { useStoryInput } from './use-story-input';
import './CollectionStories.css';

function ControlledFilters(args: CollectionFiltersProps) {
  const [value, setValue] = useStoryInput(args.value);
  return (
    <CollectionFilters
      {...args}
      value={value}
      onChange={(next) => {
        args.onChange(next);
        setValue(next);
      }}
    />
  );
}

function EmptyResults(args: CollectionFiltersProps) {
  const [value, setValue] = useStoryInput(args.value);
  return (
    <div className="kit-collection-stories">
      <CollectionFilters
        {...args}
        value={value}
        onChange={(next) => {
          args.onChange(next);
          setValue(next);
        }}
      />
      <section className="kit-collection-stories__empty" aria-live="polite">
        <h2 className="kit-collection-stories__title">
          {value === 'completed'
            ? 'No completed puzzles yet.'
            : value === 'in-progress'
              ? 'No puzzles in progress.'
              : 'A place for every puzzle.'}
        </h2>
        <p className="kit-collection-stories__copy">
          {value === 'all'
            ? 'Choose a photo or enter clues to start your collection.'
            : 'Choose All to see your collection.'}
        </p>
      </section>
    </div>
  );
}

const meta = {
  title: 'Kit/CollectionFilters',
  component: CollectionFilters,
  decorators: [
    (Story, context) => (
      <StoryFrame width={context.parameters.frameWidth ?? 390}>
        <Story />
      </StoryFrame>
    ),
  ],
  args: { value: 'all', onChange: fn() },
  render: (args) => <ControlledFilters {...args} />,
} satisfies Meta<typeof CollectionFilters>;

export default meta;
type Story = StoryObj<typeof meta>;

export const All: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const all = canvas.getByRole('button', { name: 'All' });
    const inProgress = canvas.getByRole('button', { name: 'In progress' });
    const completed = canvas.getByRole('button', { name: 'Completed' });
    await expect(canvas.getByRole('group', { name: 'Filter puzzles' })).toBeVisible();
    await expect(canvas.queryByRole('tablist')).not.toBeInTheDocument();
    await expect(all).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(inProgress);
    await expect(args.onChange).toHaveBeenLastCalledWith('in-progress');
    await expect(inProgress).toHaveAttribute('aria-pressed', 'true');
    await expect(all).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(completed);
    await expect(args.onChange).toHaveBeenLastCalledWith('completed');
    await expect(completed).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(all);
    await expect(args.onChange).toHaveBeenLastCalledWith('all');
    all.blur();
  },
};

export const InProgress: Story = { args: { value: 'in-progress' } };
export const Completed: Story = { args: { value: 'completed' } };

export const SuppliedCounts: Story = {
  args: { counts: { all: 4, 'in-progress': 2, completed: 2 } },
};

export const PartialCounts: Story = {
  args: { counts: { completed: 0 } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'All' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: /Completed.*0 puzzles/ })).toBeEnabled();
  },
};

export const Keyboard: Story = {
  play: async ({ canvasElement, args }) => {
    const buttons = within(canvasElement).getAllByRole('button');
    buttons[0].focus();
    await userEvent.tab();
    await expect(buttons[1]).toHaveFocus();
    await userEvent.keyboard(' ');
    await expect(buttons[1]).toHaveAttribute('aria-pressed', 'true');
    await expect(args.onChange).toHaveBeenLastCalledWith('in-progress');
    await userEvent.tab();
    await expect(buttons[2]).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(buttons[2]).toHaveAttribute('aria-pressed', 'true');
    await expect(args.onChange).toHaveBeenLastCalledWith('completed');
    await userEvent.tab({ shift: true });
    await expect(buttons[1]).toHaveFocus();
    buttons[1].blur();
  },
};

export const ControlledValue: Story = {
  render: (args) => <CollectionFilters {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Completed' }));
    await expect(args.onChange).toHaveBeenLastCalledWith('completed');
    await expect(canvas.getByRole('button', { name: 'All' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  },
};

export const Wrapping320: Story = {
  parameters: { frameWidth: 320 },
  args: { counts: { all: 123456, 'in-progress': 12345, completed: 67890 } },
  play: async ({ canvasElement }) => {
    const group = within(canvasElement).getByRole('group');
    await expect(group.scrollWidth).toBeLessThanOrEqual(group.clientWidth);
    for (const button of within(group).getAllByRole('button')) {
      await expect(button.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    }
  },
};

export const ZeroResults320: Story = {
  parameters: { frameWidth: 320 },
  args: { value: 'completed', counts: { all: 0, 'in-progress': 0, completed: 0 } },
  render: (args) => <EmptyResults {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'No completed puzzles yet.' })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: /^All/ }));
    await expect(canvas.getByRole('heading', { name: 'A place for every puzzle.' })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: /^Completed/ }));
    await expect(canvas.getByRole('heading', { name: 'No completed puzzles yet.' })).toBeVisible();
  },
};
