import type { ReactNode } from 'react';
import Button from './Button';
import { Icon } from './Icon';
import { MistakeCounter } from './MistakeCounter';
import Toggle from './Toggle';
import './GameToolbar.css';

export interface ReviewToolbarProps {
  mode: 'review';
  clueCount: number;
  uncertainCount: number;
  busy: boolean;
  onBegin: () => void;
  showConfirmation?: boolean;
}

export interface PlayToolbarProps {
  mode: 'play';
  notesMode: boolean;
  check: boolean;
  mistakes: number;
  status?: ReactNode;
  busy: boolean;
  readOnly: boolean;
  onToggleNotes: () => void;
  onToggleCheck: () => void;
}

export type GameToolbarProps = ReviewToolbarProps | PlayToolbarProps;

export default function GameToolbar(props: GameToolbarProps) {
  if (props.mode === 'review') {
    return (
      <div className="review-toolbar kit-game-toolbar kit-game-toolbar--review">
        <span>
          {props.clueCount} clues · Check the numbers before playing.
          {props.uncertainCount ? ` ${props.uncertainCount} cells need review.` : ''}
        </span>
        {props.showConfirmation !== false ? (
          <Button variant="ink" disabled={props.busy} onClick={props.onBegin}>
            <span>Confirm clues &amp; play</span>
            <Icon name="arrow-right" />
          </Button>
        ) : null}
      </div>
    );
  }
  return (
    <div className="play-toolbar kit-game-toolbar kit-game-toolbar--play">
      <div className="kit-game-toolbar__status">
        {props.status}
        <span className="mistakes kit-game-toolbar__mistakes">
          <MistakeCounter count={props.mistakes} />
        </span>
      </div>
      <Toggle
        label="Pencil notes"
        pressed={props.notesMode}
        disabled={props.readOnly || props.busy}
        onClick={props.onToggleNotes}
      />
      <Toggle label="Mistake check" pressed={props.check} onClick={props.onToggleCheck} />
    </div>
  );
}
