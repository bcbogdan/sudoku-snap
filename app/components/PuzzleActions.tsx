import type { Ref } from 'react';
import Button from './Button';
import Icon from './Icon';
import './PuzzleActions.css';

export interface PuzzleActionsProps {
  busy: boolean;
  onShare: () => void;
  onRemove?: () => void;
  shareRef?: Ref<HTMLButtonElement>;
}

export default function PuzzleActions({ busy, onShare, onRemove, shareRef }: PuzzleActionsProps) {
  return (
    <div
      className="puzzle-actions kit-puzzle-actions"
      role="group"
      aria-label="Puzzle actions"
      aria-busy={busy || undefined}
    >
      <Button ref={shareRef} disabled={busy} onClick={onShare}>
        <Icon name="copy" />
        Share puzzle
      </Button>
      {onRemove ? (
        <Button
          variant="quiet"
          className="remove-button kit-puzzle-actions__remove"
          disabled={busy}
          onClick={onRemove}
        >
          <Icon name="delete" />
          Remove puzzle
        </Button>
      ) : null}
    </div>
  );
}
