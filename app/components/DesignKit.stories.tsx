import { useState } from 'react';
import type { ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Alert } from './Alert';
import AttemptTimer from './AttemptTimer';
import { Badge } from './Badge';
import BoardPreview from './BoardPreview';
import { Button } from './Button';
import { CornerFrame } from './CornerFrame';
import { Icon } from './Icon';
import { MistakeCounter } from './MistakeCounter';
import NumberKeypad from './NumberKeypad';
import { PhotoDropZone } from './PhotoDropZone';
import { SaveStatus } from './SaveStatus';
import SudokuBoard from './SudokuBoard';
import { Toggle } from './Toggle';
import { clues, completedBoard, mistakenBoard, pencilNotes } from './story-fixtures';
import './DesignKit.css';

const timer = { subscribe: () => () => {}, getSnapshot: () => 19_000, set: () => {} };
const noop = () => {};

function Specimen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="design-kit__specimen" aria-label={title}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function ReferenceKit() {
  const [notes, setNotes] = useState(false);
  const [check, setCheck] = useState(true);
  const [selected, setSelected] = useState(3);
  return (
    <main className="design-kit">
      <div className="design-kit__intro">
        <p>DESIGN LANGUAGE / COMPONENT SPECIMENS</p>
        <h1>Quiet until it matters.</h1>
        <p>Reference kit · static puzzle data, no storage or photo processing.</p>
      </div>
      <div className="design-kit__columns">
        <Specimen title="Buttons & toggles">
          <div className="design-kit__row">
            <Button variant="ink">
              Confirm clues &amp; play <Icon name="arrow-right" />
            </Button>
            <Button variant="flash">
              <Icon name="plus" /> New puzzle
            </Button>
            <Button>
              <Icon name="copy" /> Paste image
            </Button>
            <Button>
              <Icon name="pencil" /> Enter clues by hand
            </Button>
            <Toggle label="Pencil notes" pressed={notes} onClick={() => setNotes(!notes)} />
            <Toggle label="Mistake check" pressed={check} onClick={() => setCheck(!check)} />
            <Button>
              <Icon name="undo" /> Undo move
            </Button>
            <Button disabled>
              <Icon name="undo" /> Undo move
            </Button>
            <a className="kit-button" data-variant="quiet" href="#kit-preview">
              <Icon name="chevron-left" /> My puzzles
            </a>
          </div>
        </Specimen>
        <Specimen title="Number pad">
          <NumberKeypad disabled={false} onEnter={noop} board={mistakenBoard} selectedDigit={7} />
          <p className="design-kit__description">
            Digits 1–9 and Delete. Counts show how many of each remain.
          </p>
        </Specimen>
        <Specimen title="Badges, counters & timer">
          <div className="design-kit__row">
            <Badge kind="in-progress">In progress</Badge>
            <Badge kind="neutral">0 completed</Badge>
            <Badge kind="completed">1 completed</Badge>
            <Badge kind="draft">Review clues · Draft saved</Badge>
            <AttemptTimer store={timer} fixedElapsed={null} />
            <MistakeCounter count={0} />
            <MistakeCounter count={1} />
            <SaveStatus state="saved" />
          </div>
        </Specimen>
        <Specimen title="Photo drop zone">
          <PhotoDropZone busy={false} onUpload={noop} />
        </Specimen>
        <Specimen title="Alert">
          <Alert>Could not find a Sudoku grid. Try a clear photo of the whole board.</Alert>
        </Specimen>
        <Specimen title="Puzzle previews">
          <div className="design-kit__previews" id="kit-preview">
            <div>
              <CornerFrame state="checking">
                <BoardPreview clues={clues} />
              </CornerFrame>
              <h3>Misty Meadow 98FD</h3>
              <Badge kind="neutral">0 completed</Badge>
            </div>
            <div>
              <BoardPreview clues={clues} board={completedBoard} completed />
              <h3>Quiet Harbor 3C1A</h3>
              <Badge kind="completed">1 completed</Badge>
            </div>
          </div>
        </Specimen>
        <Specimen title="Board states">
          <SudokuBoard
            mode="play"
            board={mistakenBoard}
            notes={pencilNotes}
            clues={clues}
            uncertain={[]}
            wrongCells={[3]}
            selected={selected}
            readOnly
            busy={false}
            onSelect={setSelected}
            onEnter={noop}
            onToggleNotes={noop}
            onOpenDial={noop}
          />
          <p className="design-kit__description">
            Clues, entered digits, notes, peers, matching digits, selection, and a mistake ring.
          </p>
        </Specimen>
      </div>
    </main>
  );
}

const meta = {
  title: 'Kit/Reference',
  component: ReferenceKit,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ReferenceKit>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Components: Story = {};
