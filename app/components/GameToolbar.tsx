export interface ReviewToolbarProps {
  mode: 'review';
  clueCount: number;
  uncertainCount: number;
  busy: boolean;
  onBegin: () => void;
}

export interface PlayToolbarProps {
  mode: 'play';
  notesMode: boolean;
  check: boolean;
  mistakes: number;
  busy: boolean;
  readOnly: boolean;
  onToggleNotes: () => void;
  onToggleCheck: () => void;
}

export type GameToolbarProps = ReviewToolbarProps | PlayToolbarProps;

export default function GameToolbar(props: GameToolbarProps) {
  if (props.mode === 'review') {
    return (
      <div className="review-toolbar">
        <span>
          {props.clueCount} clues · Check the numbers before playing.
          {props.uncertainCount ? ` ${props.uncertainCount} cells need review.` : ''}
        </span>
        <button className="primary" disabled={props.busy} onClick={props.onBegin}>
          Confirm clues &amp; play →
        </button>
      </div>
    );
  }
  return (
    <div className="play-toolbar">
      <button
        className="secondary"
        aria-pressed={props.notesMode}
        disabled={props.readOnly || props.busy}
        onClick={props.onToggleNotes}
      >
        Pencil notes {props.notesMode ? 'On' : 'Off'}
      </button>
      <button className="secondary" aria-pressed={props.check} onClick={props.onToggleCheck}>
        Mistake check {props.check ? 'On' : 'Off'}
      </button>
      <span className="mistakes">Mistakes {props.mistakes}</span>
      <span className="save-state">{props.busy ? 'Saving…' : 'Saved'}</span>
    </div>
  );
}
