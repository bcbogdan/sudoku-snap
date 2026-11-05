import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import AppHeader from './AppHeader';
import AttemptRow from './AttemptRow';
import AttemptSummary from './AttemptSummary';
import { Button } from './Button';
import CollectionFilters, { type CollectionFilter } from './CollectionFilters';
import GameToolbar from './GameToolbar';
import { Icon } from './Icon';
import { PhotoDropZone } from './PhotoDropZone';
import PuzzleActions from './PuzzleActions';
import PuzzleCard from './PuzzleCard';
import type { PuzzleCardModel } from './PuzzleLibrary';
import PuzzleTitle from './PuzzleTitle';
import ReplayControls from './ReplayControls';
import { ScanTips } from './ScanTips';
import { clues, completedBoard } from './story-fixtures';
import './CompositeKit.css';

const noop = () => {};
const puzzles: readonly PuzzleCardModel[] = [
  {
    id: 'misty',
    name: 'Misty Meadow 98FD',
    clues,
    createdLabel: 'Nov 3, 2026',
    status: 'ready',
    attemptCount: 1,
    completedCount: 0,
    href: '/?puzzle=misty&attempt=latest',
  },
  {
    id: 'quiet',
    name: 'Quiet Harbor 3C1A',
    clues,
    createdLabel: 'Nov 1, 2026',
    status: 'ready',
    attemptCount: 3,
    completedCount: 1,
    href: '/?puzzle=quiet&attempt=latest',
  },
  {
    id: 'river',
    name: 'Slow River 21E4',
    clues,
    createdLabel: 'Nov 1, 2026',
    status: 'ready',
    attemptCount: 1,
    completedCount: 1,
    href: '/?puzzle=river&attempt=latest',
  },
  {
    id: 'draft',
    name: 'Amber Orchard 77B0',
    clues,
    createdLabel: 'Nov 3, 2026',
    status: 'draft',
    attemptCount: 0,
    completedCount: 0,
    href: '/?puzzle=draft',
  },
];

function CompositeKit() {
  const [filter, setFilter] = useState<CollectionFilter>('all');
  const [step, setStep] = useState(3);
  const [notes, setNotes] = useState(false);
  const [check, setCheck] = useState(true);
  const [name, setName] = useState('Quiet Harbor 3C1A');
  const [value, setValue] = useState(name);
  const [editing, setEditing] = useState(false);
  const visible = puzzles.filter(
    (puzzle) =>
      filter === 'all' ||
      (filter === 'completed'
        ? puzzle.completedCount > 0
        : puzzle.status === 'ready' && puzzle.attemptCount > puzzle.completedCount),
  );

  return (
    <main className="composite-kit">
      <AppHeader screen="library" />
      <div className="composite-kit__intro">
        <p>COMPOSITE COMPONENTS / ILLUSTRATIVE FIXTURES</p>
        <h1>The supporting cast.</h1>
        <p>
          Isolated components, not migrated app screens. No storage, timers, or photo processing.
        </p>
      </div>
      <div className="composite-kit__columns">
        <section className="composite-kit__specimen" aria-label="Collection components">
          <h2>Cards &amp; collection filters</h2>
          <CollectionFilters value={filter} onChange={setFilter} />
          <div className="composite-kit__cards">
            {visible.map((item) => (
              <PuzzleCard
                key={item.id}
                item={item}
                preview={
                  item.id === 'river' ? { board: completedBoard, completed: true } : undefined
                }
              />
            ))}
          </div>
        </section>
        <section className="composite-kit__specimen" aria-label="Attempt components">
          <h2>Attempt summary &amp; rows</h2>
          <AttemptSummary totalAttempts={3} bestTime="00:21:02" totalTime="00:36:28" />
          <ul className="composite-kit__attempts">
            {[
              { number: 3, complete: false, duration: '00:09:41', mistakes: 2, filled: 22 },
              { number: 2, complete: true, duration: '00:21:02', mistakes: 0, filled: 49 },
              { number: 1, complete: false, duration: '00:05:45', mistakes: 4, filled: 12 },
            ].map((attempt) => (
              <li key={attempt.number}>
                <AttemptRow
                  attempt={{
                    id: String(attempt.number),
                    href: `/?puzzle=quiet&attempt=${attempt.number}`,
                    number: attempt.number,
                    startedLabel: 'Nov 3, 2026',
                    complete: attempt.complete,
                    moveCount: attempt.filled,
                    durationLabel: attempt.duration,
                  }}
                  mistakes={attempt.mistakes}
                  progress={{ filled: attempt.filled, total: 49 }}
                />
              </li>
            ))}
          </ul>
        </section>
        <section className="composite-kit__specimen" aria-label="Replay components">
          <h2>Move navigation</h2>
          <ReplayControls
            step={step}
            moveCount={5}
            busy={false}
            onStepChange={setStep}
            moveDescription={step ? 'Number entered · Row 5, column 2' : 'Original puzzle'}
            timestamp="Nov 3, 2026, 2:41 PM"
          />
        </section>
        <section className="composite-kit__specimen" aria-label="Title and action components">
          <h2>Title, rename &amp; puzzle actions</h2>
          <PuzzleTitle
            name={name}
            value={value}
            editing={editing}
            busy={false}
            onEdit={() => {
              setValue(name);
              setEditing(true);
            }}
            onValueChange={setValue}
            onSave={() => {
              setName(value.trim());
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
          <PuzzleActions busy={false} onShare={noop} onRemove={noop} />
          <GameToolbar
            mode="play"
            notesMode={notes}
            check={check}
            mistakes={1}
            busy={false}
            readOnly={false}
            onToggleNotes={() => setNotes(!notes)}
            onToggleCheck={() => setCheck(!check)}
          />
        </section>
        <section className="composite-kit__specimen" aria-label="Import guidance components">
          <h2>Photo input &amp; scan guidance</h2>
          <PhotoDropZone busy={false} onUpload={noop} />
          <div className="composite-kit__actions">
            <Button>
              <Icon name="copy" /> Paste image
            </Button>
            <Button>
              <Icon name="pencil" /> Enter clues by hand
            </Button>
          </div>
          <ScanTips />
        </section>
      </div>
    </main>
  );
}

const meta = {
  title: 'Kit/Composites',
  component: CompositeKit,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof CompositeKit>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Reference: Story = {};
