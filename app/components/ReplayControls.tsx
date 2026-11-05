'use client';

import { useId } from 'react';
import { Button } from './Button';
import { Icon } from './Icon';
import './ReplayControls.css';

export interface ReplayControlsProps {
  step: number;
  moveCount: number;
  busy: boolean;
  onStepChange: (step: number) => void;
  moveDescription?: string;
  timestamp?: string;
}

export function ReplayControls({
  step,
  moveCount,
  busy,
  onStepChange,
  moveDescription,
  timestamp,
}: ReplayControlsProps) {
  const id = useId();
  const count = Number.isFinite(moveCount) ? Math.max(0, Math.floor(moveCount)) : 0;
  const current = Number.isFinite(step) ? Math.min(count, Math.max(0, Math.floor(step))) : 0;
  const changeStep = (next: number) => {
    if (busy || count === 0 || !Number.isFinite(next)) return;
    const clamped = Math.min(count, Math.max(0, Math.floor(next)));
    if (clamped !== current) onStepChange(clamped);
  };

  return (
    <div className="kit-replay-controls" role="group" aria-label="Move history" aria-busy={busy}>
      <label className="kit-replay-controls__position" htmlFor={id}>
        Move {current} of {count}
      </label>
      <div className="kit-replay-controls__navigation">
        <Button
          iconOnly
          aria-label="First move"
          disabled={busy || current === 0}
          onClick={() => changeStep(0)}
        >
          <Icon name="first" />
        </Button>
        <Button
          iconOnly
          aria-label="Previous move"
          disabled={busy || current === 0}
          onClick={() => changeStep(current - 1)}
        >
          <Icon name="previous" />
        </Button>
        <input
          id={id}
          className="kit-replay-controls__range"
          type="range"
          min={0}
          max={count}
          step={1}
          value={current}
          aria-label="Attempt history"
          aria-valuetext={`Move ${current} of ${count}`}
          disabled={busy || count === 0}
          onChange={(event) => changeStep(Number(event.target.value))}
        />
        <Button
          iconOnly
          aria-label="Next move"
          disabled={busy || current === count}
          onClick={() => changeStep(current + 1)}
        >
          <Icon name="next" />
        </Button>
        <Button
          iconOnly
          aria-label="Latest move"
          disabled={busy || current === count}
          onClick={() => changeStep(count)}
        >
          <Icon name="last" />
        </Button>
      </div>
      {moveDescription || timestamp ? (
        <p className="kit-replay-controls__description">
          {moveDescription}
          {moveDescription && timestamp ? ' · ' : null}
          {timestamp}
        </p>
      ) : null}
    </div>
  );
}

export default ReplayControls;
