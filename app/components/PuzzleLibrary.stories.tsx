import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import type { CollectionFilter } from './CollectionFilters';
import PuzzleLibrary from './PuzzleLibrary';
import StoryFrame from './StoryFrame';
import { completedBoard, libraryItems, mistakenBoard } from './story-fixtures';

const meta = {
  title: 'Library/PuzzleLibrary',
  component: PuzzleLibrary,
  decorators: [
    (Story, context) => (
      <StoryFrame width={context.parameters.frameWidth}>
        <Story />
      </StoryFrame>
    ),
  ],
  args: { items: libraryItems },
} satisfies Meta<typeof PuzzleLibrary>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('link', { name: /Weekend puzzle/ })).toHaveAttribute(
      'href',
      '/?puzzle=weekend&attempt=latest',
    );
    await expect(canvas.getByRole('link', { name: /Quiet Maple/ })).toHaveAttribute(
      'href',
      '/?puzzle=draft',
    );
  },
};
export const Empty: Story = {
  args: { items: [] },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('link', { name: 'Create a puzzle' }),
    ).toHaveAttribute('href', '/?new');
  },
};
export const Draft: Story = { args: { items: [libraryItems[1]] } };
export const Mobile: Story = {
  args: { items: [{ ...libraryItems[0], name: 'WeekendPuzzle'.repeat(6) }, libraryItems[1]] },
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};

const mixedItems = [
  { ...libraryItems[0], unfinishedCount: 1, preview: { board: mistakenBoard, completed: false } },
  libraryItems[1],
  {
    ...libraryItems[0],
    id: 'completed-only',
    name: 'Finished puzzle',
    href: '/?puzzle=completed-only',
    attemptCount: 1,
    unfinishedCount: 0,
    preview: { board: completedBoard, completed: true },
  },
  {
    ...libraryItems[0],
    id: 'not-started',
    name: 'Not started',
    href: '/?puzzle=not-started',
    attemptCount: 0,
    completedCount: 0,
    unfinishedCount: 0,
  },
];

export const MixedCollection: Story = {
  args: { items: mixedItems },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('4 puzzles · 2 puzzles completed')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'All — 4 puzzles' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(canvas.getByRole('link', { name: /Not started/ })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'In progress — 1 puzzle' }));
    await expect(canvas.getByRole('link', { name: /Weekend puzzle/ })).toBeVisible();
    await expect(canvas.queryByRole('link', { name: /Quiet Maple/ })).not.toBeInTheDocument();
    await expect(canvas.queryByRole('link', { name: /Finished puzzle/ })).not.toBeInTheDocument();
    await expect(canvas.getByText('4 puzzles · 2 puzzles completed')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Completed — 2 puzzles' }));
    await expect(canvas.getByRole('link', { name: /Weekend puzzle/ })).toBeVisible();
    await expect(canvas.getByRole('link', { name: /Finished puzzle/ })).toBeVisible();
    const previews = canvasElement.querySelectorAll('.kit-board-preview');
    await expect(previews[0]).toHaveAttribute('data-completed', 'false');
    await expect(previews[1]).toHaveAttribute('data-completed', 'true');
  },
};

export const EmptyFilteredResult: Story = {
  args: { items: [libraryItems[1]], filter: 'completed' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('status')).toHaveTextContent('No completed puzzles yet.');
    await expect(canvas.queryByText('A place for every puzzle.')).not.toBeInTheDocument();
  },
};

function ControlledCollection() {
  const [filter, setFilter] = useState<CollectionFilter>('all');
  return <PuzzleLibrary items={mixedItems} filter={filter} onFilterChange={setFilter} />;
}

export const ControlledFilters: Story = {
  render: () => <ControlledCollection />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'In progress — 1 puzzle' }));
    await expect(canvas.getByRole('button', { name: 'In progress — 1 puzzle' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(canvas.queryByRole('link', { name: /Quiet Maple/ })).not.toBeInTheDocument();
  },
};

const stressItems = mixedItems.map((item, index) => ({
  ...item,
  name: [
    'SundayNewspaperChampionshipNovember2026QualifyingRoundSudokuCollectionVolumeTwenty',
    '新聞の数独・秋の大会 👩🏽‍💻 家族と挑戦する週末のパズル',
    'J',
    'Đặng Thị Ngọc Hân — Sunday paper',
  ][index],
  clues: index === 1 ? item.clues.map((value, cell) => (cell === 1 ? value : 0)) : item.clues,
}));

function StressCollection() {
  const [dataset, setDataset] = useState('Demo data');
  const items =
    dataset === 'Worst case'
      ? stressItems
      : dataset === 'Empty'
        ? []
        : dataset === 'One'
          ? stressItems.slice(1, 2)
          : dataset === 'Many'
            ? Array.from({ length: 1000 }, (_, index) => ({
                ...stressItems[index % stressItems.length],
                id: `stress-${index}`,
              }))
            : mixedItems;
  return (
    <>
      <div
        role="group"
        aria-label="Test dataset"
        style={{
          position: 'fixed',
          bottom: 12,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 10,
          display: 'flex',
          flexWrap: 'wrap',
          width: 'max-content',
          maxWidth: 'calc(100% - 24px)',
          padding: 4,
          borderRadius: 8,
          background: '#e5e7eb',
        }}
      >
        {['Demo data', 'Worst case', 'Empty', 'One', 'Many'].map((label) => (
          <button key={label} aria-pressed={dataset === label} onClick={() => setDataset(label)}>
            {label}
          </button>
        ))}
      </div>
      <PuzzleLibrary items={items} />
    </>
  );
}

export const StressCases: Story = {
  parameters: { frameWidth: 320 },
  render: () => <StressCollection />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Worst case' }));
    await expect(canvas.getByRole('heading', { name: stressItems[0].name })).toBeVisible();
    await expect(canvas.getByText('1 clue', { exact: true })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Empty' }));
    await expect(canvas.getByRole('link', { name: 'Create a puzzle' })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'One' }));
    await expect(canvas.getByText('1 puzzle · 0 puzzles completed')).toBeVisible();
  },
};
