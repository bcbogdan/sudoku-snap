export interface PuzzleActionsProps {
  busy: boolean;
  onShare: () => void;
  onRemove: () => void;
}

export default function PuzzleActions({ busy, onShare, onRemove }: PuzzleActionsProps) {
  return (
    <div className="puzzle-actions">
      <button className="secondary" disabled={busy} onClick={onShare}>
        Share puzzle
      </button>
      <button className="secondary remove-button" disabled={busy} onClick={onRemove}>
        Remove puzzle
      </button>
    </div>
  );
}
