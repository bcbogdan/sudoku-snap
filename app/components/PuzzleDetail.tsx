import type { ReactNode } from 'react';
import AttemptRow from './AttemptRow';
import { Button } from './Button';
import { Icon } from './Icon';

export interface AttemptRowModel {
  readonly id: string;
  readonly href: string;
  readonly number: number;
  readonly startedLabel: string;
  readonly complete: boolean;
  readonly moveCount: number;
  readonly durationLabel: string | null;
}

export interface PuzzleDetailProps {
  createdLabel: string;
  clueCount: number;
  attempts: readonly AttemptRowModel[];
  busy: boolean;
  title: ReactNode;
  actions: ReactNode;
  onBegin: () => void;
}

export default function PuzzleDetail({
  createdLabel,
  clueCount,
  attempts,
  busy,
  title,
  actions,
  onBegin,
}: PuzzleDetailProps) {
  return (
    <section className="library puzzle-detail">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{createdLabel}</p>
          {title}
          <p>{clueCount} original clues</p>
        </div>
      </div>
      {actions}
      <div className="puzzle-detail__attempts-heading">
        <h2>Attempts</h2>
        <Button variant="flash" disabled={busy} onClick={onBegin}>
          <Icon name="plus" /> New attempt
        </Button>
      </div>
      <div className="attempt-list">
        {attempts.map((attempt) => (
          <AttemptRow key={attempt.id} attempt={attempt} />
        ))}
      </div>
      {!attempts.length ? <p>No attempts yet. Start a fresh one whenever you’re ready.</p> : null}
      <p className="storage-note">
        Duration counts only while the attempt page is focused and visible. Completed attempts
        remain available to replay.
      </p>
    </section>
  );
}
