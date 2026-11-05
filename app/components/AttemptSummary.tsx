import './AttemptSummary.css';

export interface AttemptSummaryProps {
  totalAttempts: number;
  bestTime: string | null;
  totalTime: string;
}

export function AttemptSummary({ totalAttempts, bestTime, totalTime }: AttemptSummaryProps) {
  return (
    <dl className="kit-attempt-summary" aria-label="Attempt statistics">
      <div>
        <dt>Attempts</dt>
        <dd>{totalAttempts}</dd>
      </div>
      <div>
        <dt>Best time</dt>
        <dd>{bestTime ?? '—'}</dd>
      </div>
      <div>
        <dt>Time played</dt>
        <dd>{totalTime}</dd>
      </div>
    </dl>
  );
}

export default AttemptSummary;
