import type { ReactNode } from 'react';

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
    <section className="library">
      <a className="back" href="/">
        ← My puzzles
      </a>
      <div className="section-heading">
        <div>
          <p className="eyebrow">{createdLabel}</p>
          {title}
          <p>{clueCount} original clues</p>
        </div>
        <button className="primary" disabled={busy} onClick={onBegin}>
          ＋ New attempt
        </button>
      </div>
      {actions}
      <h2>Attempts</h2>
      <div className="attempt-list">
        {attempts.map((attempt) => (
          <a href={attempt.href} key={attempt.id} className="attempt-row">
            <div>
              <strong>Attempt {attempt.number}</strong>
              <p>Started {attempt.startedLabel}</p>
            </div>
            <span className="badge">{attempt.complete ? 'Completed' : 'In progress'}</span>
            <span>{attempt.moveCount} moves</span>
            <span>{attempt.durationLabel !== null ? attempt.durationLabel : 'Resume →'}</span>
          </a>
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
