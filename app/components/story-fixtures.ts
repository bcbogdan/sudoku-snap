import type { AttemptRowModel } from './PuzzleDetail';
import type { PuzzleCardModel } from './PuzzleLibrary';

export const clues: readonly number[] = [
  0, 3, 0, 0, 7, 0, 0, 0, 0, 6, 0, 0, 1, 9, 5, 0, 0, 0, 0, 9, 8, 0, 0, 0, 0, 6, 0, 8, 0, 0, 0, 6, 0,
  0, 0, 3, 4, 0, 0, 8, 0, 3, 0, 0, 1, 7, 0, 0, 0, 2, 0, 0, 0, 6, 0, 6, 0, 0, 0, 0, 2, 8, 0, 0, 0, 0,
  4, 1, 9, 0, 0, 5, 0, 0, 0, 0, 8, 0, 0, 7, 9,
];

export const completedBoard: readonly number[] = [
  5, 3, 4, 6, 7, 8, 9, 1, 2, 6, 7, 2, 1, 9, 5, 3, 4, 8, 1, 9, 8, 3, 4, 2, 5, 6, 7, 8, 5, 9, 7, 6, 1,
  4, 2, 3, 4, 2, 6, 8, 5, 3, 7, 9, 1, 7, 1, 3, 9, 2, 4, 8, 5, 6, 9, 6, 1, 5, 3, 7, 2, 8, 4, 2, 8, 7,
  4, 1, 9, 6, 3, 5, 3, 4, 5, 2, 8, 6, 1, 7, 9,
];

export const emptyNotes: readonly (readonly number[])[] = Array.from({ length: 81 }, () => []);
export const pencilNotes: readonly (readonly number[])[] = emptyNotes.map((notes, index) =>
  index === 2 ? [1, 4, 8] : notes,
);
export const mistakenBoard: readonly number[] = clues.map((value, index) =>
  index === 3 ? 2 : value,
);

export const libraryItems: readonly PuzzleCardModel[] = [
  {
    id: 'weekend',
    name: 'Weekend puzzle',
    clues,
    createdLabel: 'Sep 10, 2026, 9:00 AM',
    status: 'ready',
    attemptCount: 2,
    completedCount: 1,
    href: '/?puzzle=weekend&attempt=latest',
  },
  {
    id: 'draft',
    name: 'Quiet Maple',
    clues,
    createdLabel: 'Sep 9, 2026, 6:30 PM',
    status: 'draft',
    attemptCount: 0,
    completedCount: 0,
    href: '/?puzzle=draft',
  },
];

export const attemptRows: readonly AttemptRowModel[] = [
  {
    id: 'latest',
    href: '/?puzzle=weekend&attempt=latest',
    number: 2,
    startedLabel: 'Sep 10, 2026, 9:15 AM',
    complete: false,
    moveCount: 12,
    durationLabel: null,
  },
  {
    id: 'finished',
    href: '/?puzzle=weekend&attempt=finished',
    number: 1,
    startedLabel: 'Sep 10, 2026, 9:00 AM',
    complete: true,
    moveCount: 58,
    durationLabel: '00:12:34',
  },
];
