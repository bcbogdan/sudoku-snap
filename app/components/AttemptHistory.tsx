'use client';

import { useLayoutEffect, useRef } from 'react';
import { Button } from './Button';
import { Icon } from './Icon';
import ReplayControls from './ReplayControls';
import './AttemptHistory.css';

export interface AttemptHistoryProps {
  step: number;
  moveCount: number;
  busy: boolean;
  readOnly: boolean;
  replay?: boolean;
  onEnterReplay?: () => void;
  onExitReplay?: () => void;
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
  replay,
  onEnterReplay,
  onExitReplay,
  complete,
  canUndo,
  moveDescription,
  completionDuration,
  onStepChange,
  onUndo,
  onBegin,
}: AttemptHistoryProps) {
  const completion = useRef<HTMLDivElement>(null);
  const wasComplete = useRef(complete);
  useLayoutEffect(() => {
    const newlyComplete = complete && !wasComplete.current;
    wasComplete.current = complete;
    const element = completion.current;
    if (!newlyComplete || !element) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const animation = element.animate(
      [
        { opacity: 0, transform: reduced ? 'none' : 'translateY(4px)' },
        { opacity: 1, transform: reduced ? 'none' : 'translateY(0)' },
      ],
      {
        duration: reduced ? 100 : 220,
        easing: getComputedStyle(element).getPropertyValue('--ease-out').trim(),
      },
    );
    return () => animation.cancel();
  }, [complete]);
  return (
    <div className="history kit-attempt-history">
      {!complete && !replay ? (
        <Button disabled={busy || readOnly || !canUndo} onClick={onUndo}>
          <Icon name="undo" /> Undo move
        </Button>
      ) : null}
      {replay !== undefined ? (
        <Button disabled={busy} onClick={replay ? onExitReplay : onEnterReplay}>
          {replay ? 'Return to play' : 'Move history'}
        </Button>
      ) : null}
      {replay === false ? (
        <p className="hint">
          Move {step} of {moveCount}
        </p>
      ) : (
        <ReplayControls
          step={step}
          moveCount={moveCount}
          busy={busy}
          onStepChange={onStepChange}
          moveDescription={
            moveDescription +
            (replay
              ? ' · Replay is read-only. Return to play to restore the latest position.'
              : step < moveCount
                ? ' · History is read-only.'
                : '')
          }
        />
      )}
      {complete ? (
        <div ref={completion} className="completion kit-attempt-history__completion">
          <strong>Completed in {completionDuration}. This attempt is locked.</strong>
          <Button variant="ink" disabled={busy} onClick={onBegin}>
            Start a new attempt
          </Button>
        </div>
      ) : null}
    </div>
  );
}
