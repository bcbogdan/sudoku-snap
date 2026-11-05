import type { AttemptRowModel } from './PuzzleDetail';
import { Badge } from './Badge';
import { Icon } from './Icon';
import './AttemptRow.css';

export interface AttemptRowProps {
  attempt: AttemptRowModel;
  mistakes?: number | null;
  progress?: { filled: number; total: number } | null;
}

export function AttemptRow({ attempt, mistakes, progress }: AttemptRowProps) {
  const knownProgress =
    progress &&
    Number.isFinite(progress.filled) &&
    Number.isFinite(progress.total) &&
    progress.total > 0 &&
    progress.filled >= 0 &&
    progress.filled <= progress.total
      ? progress
      : null;

  return (
    <div className="kit-attempt-row-container">
      <a className="kit-attempt-row" href={attempt.href} data-complete={attempt.complete}>
        <span className="kit-attempt-row__number" aria-hidden="true">
          {attempt.number}
        </span>
        <span className="kit-attempt-row__details">
          <strong className="kit-attempt-row__title">Attempt {attempt.number}</strong>
          <span className="kit-attempt-row__meta">
            Started {attempt.startedLabel}
            {mistakes != null ? ` · Mistakes ${mistakes}` : ''}
          </span>
          <span className="kit-attempt-row__meta">
            {attempt.moveCount} {attempt.moveCount === 1 ? 'move' : 'moves'}
          </span>
        </span>
        <span className="kit-attempt-row__result">
          <span className="kit-attempt-row__duration">
            <Icon name="clock" size={16} />
            {attempt.durationLabel ?? '—'}
          </span>
          <Badge kind={attempt.complete ? 'completed' : 'in-progress'}>
            {attempt.complete ? 'Completed' : 'In progress'}
          </Badge>
        </span>
        {knownProgress ? (
          <span className="kit-attempt-row__progress">
            <span className="kit-attempt-row__meta">
              {knownProgress.filled} of {knownProgress.total} squares filled
            </span>
            <progress
              aria-label={`Attempt ${attempt.number} squares filled`}
              value={knownProgress.filled}
              max={knownProgress.total}
            />
          </span>
        ) : null}
      </a>
    </div>
  );
}

export default AttemptRow;
