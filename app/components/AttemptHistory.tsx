export interface AttemptHistoryProps {
  step: number;
  moveCount: number;
  busy: boolean;
  readOnly: boolean;
  complete: boolean;
  canUndo: boolean;
  moveDescription: string;
  completionDuration: string;
  onStepChange: (step: number) => void;
  onUndo: () => void;
  onBegin: () => void;
}

export default function AttemptHistory({
  step,
  moveCount,
  busy,
  readOnly,
  complete,
  canUndo,
  moveDescription,
  completionDuration,
  onStepChange,
  onUndo,
  onBegin,
}: AttemptHistoryProps) {
  return (
    <div className="history">
      {!complete ? (
        <button className="secondary" disabled={busy || readOnly || !canUndo} onClick={onUndo}>
          Undo move
        </button>
      ) : null}
      <div className="history-buttons">
        <button
          className="secondary"
          aria-label="First move"
          disabled={step === 0 || busy}
          onClick={() => onStepChange(0)}
        >
          ↤
        </button>
        <button
          className="secondary"
          aria-label="Previous move"
          disabled={step === 0 || busy}
          onClick={() => onStepChange(step - 1)}
        >
          ←
        </button>
        <label>
          Move {step} of {moveCount}
          <input
            aria-label="Attempt history"
            type="range"
            min="0"
            max={moveCount}
            value={step}
            disabled={busy || !moveCount}
            onChange={(event) => onStepChange(Number(event.target.value))}
          />
        </label>
        <button
          className="secondary"
          aria-label="Next move"
          disabled={step === moveCount || busy}
          onClick={() => onStepChange(step + 1)}
        >
          →
        </button>
        <button
          className="secondary"
          aria-label="Latest move"
          disabled={step === moveCount || busy}
          onClick={() => onStepChange(moveCount)}
        >
          ↦
        </button>
      </div>
      <p>
        {moveDescription}
        {step < moveCount ? ' · History is read-only. Return to the latest move to continue.' : ''}
      </p>
      {complete ? (
        <div className="completion">
          <strong>Completed in {completionDuration}. This attempt is locked.</strong>
          <button className="primary" disabled={busy} onClick={onBegin}>
            Start a new attempt
          </button>
        </div>
      ) : null}
    </div>
  );
}
