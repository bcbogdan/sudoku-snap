import type { AttemptSummary } from './storage-records';

export function attemptsByPuzzle(attempts: readonly AttemptSummary[]) {
  const grouped = new Map<string, AttemptSummary[]>();
  for (const attempt of attempts) {
    const group = grouped.get(attempt.puzzleId) ?? [];
    group.push(attempt);
    grouped.set(attempt.puzzleId, group);
  }
  return grouped;
}

export function newestAttempts(attempts: readonly AttemptSummary[]): AttemptSummary[] {
  return [...attempts].sort((a, b) => b.startedAt - a.startedAt || a.id.localeCompare(b.id));
}

export function continueAttempt(attempts: readonly AttemptSummary[]): AttemptSummary | undefined {
  return newestAttempts(attempts).find((attempt) => attempt.completedAt === null);
}

export function previewAttempt(attempts: readonly AttemptSummary[]): AttemptSummary | undefined {
  return continueAttempt(attempts) ?? newestAttempts(attempts)[0];
}

export function entryProgress(clues: readonly number[], board: readonly number[]) {
  let filled = 0;
  let total = 0;
  clues.forEach((clue, cell) => {
    if (clue) return;
    total++;
    if (board[cell]) filled++;
  });
  return { filled, total };
}

export function attemptStatistics(
  attempts: readonly { completedAt: number | null; elapsedMs: number | null }[],
) {
  const completed = attempts.filter((attempt) => attempt.completedAt !== null);
  return {
    attemptCount: attempts.length,
    completedCount: completed.length,
    bestMs:
      completed.length && completed.every((attempt) => attempt.elapsedMs !== null)
        ? completed.reduce((best, attempt) => Math.min(best, attempt.elapsedMs!), Infinity)
        : null,
    totalMs: attempts.every((attempt) => attempt.elapsedMs !== null)
      ? attempts.reduce((total, attempt) => total + attempt.elapsedMs!, 0)
      : null,
  };
}
