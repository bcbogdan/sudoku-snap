import type { ReactNode } from 'react';
import AttemptRow from './AttemptRow';
import AttemptSummary from './AttemptSummary';
import BoardPreview from './BoardPreview';
import { Badge } from './Badge';
import { Button } from './Button';
import { Icon } from './Icon';
import './PuzzleDetail.css';

export interface AttemptRowModel {
  readonly id: string;
  readonly href: string;
  readonly number: number;
  readonly startedLabel: string;
  readonly complete: boolean;
  readonly moveCount: number;
  readonly durationLabel: string | null;
  readonly mistakes?: number | null;
  readonly progress?: { readonly filled: number; readonly total: number } | null;
}

export interface PuzzleDetailProps {
  createdLabel: string;
  clueCount: number;
  attempts: readonly AttemptRowModel[];
  busy: boolean;
  title: ReactNode;
  actions: ReactNode;
  onBegin: () => void;
  clues?: readonly number[];
  preview?: { readonly board: readonly number[]; readonly completed?: boolean };
  bestTime?: string | null;
  totalTime?: string | null;
  continueHref?: string | null;
}

export default function PuzzleDetail({
  createdLabel,
  clueCount,
  attempts,
  busy,
  title,
  actions,
  onBegin,
  clues,
  preview,
  bestTime,
  totalTime,
  continueHref,
}: PuzzleDetailProps) {
  const completedCount = attempts.filter((attempt) => attempt.complete).length;
  const continuation = attempts.find(
    (attempt) => !attempt.complete && attempt.href === continueHref,
  );

  return (
    <section className="library puzzle-detail">
      <div className="puzzle-detail__overview">
        {clues ? (
          <BoardPreview
            className="puzzle-detail__preview"
            clues={clues}
            board={preview?.board}
            completed={preview?.completed ?? false}
          />
        ) : null}
        <div className="puzzle-detail__information">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{createdLabel}</p>
              {title}
              <p>{clueCount} original clues</p>
            </div>
          </div>
          <Badge kind={completedCount > 0 ? 'completed' : 'neutral'}>
            {completedCount} {completedCount === 1 ? 'attempt' : 'attempts'} completed
          </Badge>
        </div>
      </div>
      <div className="puzzle-detail__primary-actions">
        {continuation ? (
          <a
            className="primary puzzle-detail__continue"
            href={continueHref ?? undefined}
            aria-disabled={busy || undefined}
            onClick={(event) => {
              if (busy) event.preventDefault();
            }}
          >
            Continue attempt {continuation.number} <Icon name="arrow-right" />
          </a>
        ) : null}
        <Button variant="flash" disabled={busy} onClick={onBegin}>
          <Icon name="plus" /> New attempt
        </Button>
      </div>
      <AttemptSummary
        totalAttempts={attempts.length}
        bestTime={bestTime ?? null}
        totalTime={totalTime ?? '—'}
      />
      <div className="puzzle-detail__attempts-heading">
        <h2>Attempts</h2>
      </div>
      {attempts.length > 0 ? (
        <div className="attempt-list">
          {attempts.map((attempt) => (
            <AttemptRow
              key={attempt.id}
              attempt={attempt}
              mistakes={attempt.mistakes}
              progress={attempt.progress}
            />
          ))}
        </div>
      ) : null}
      {!attempts.length ? <p>No attempts yet. Start a fresh one whenever you’re ready.</p> : null}
      <p className="storage-note">
        Duration counts only while the attempt page is focused and visible. Completed attempts
        remain available to replay.
      </p>
      <div className="puzzle-detail__management" aria-label="Puzzle management">
        {actions}
      </div>
    </section>
  );
}
