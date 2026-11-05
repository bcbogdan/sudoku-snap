'use client';

import { useLayoutEffect, useRef } from 'react';
import { peers } from '../../lib/sudoku';
import './SudokuBoard.css';

export interface SudokuBoardProps {
  mode: 'review' | 'play';
  board: readonly number[];
  notes: readonly (readonly number[])[];
  clues: readonly number[];
  uncertain: readonly number[];
  wrongCells: readonly number[];
  selected: number;
  readOnly: boolean;
  busy: boolean;
  replayCurrentCell?: number;
  replay?: boolean;
  completed?: boolean;
  onSelect: (cell: number) => void;
  onEnter: (value: number, cell: number) => void;
  onToggleNotes: () => void;
  onOpenDial: (cell: number) => void;
}

export default function SudokuBoard({
  mode,
  board,
  notes,
  clues,
  uncertain,
  wrongCells,
  selected,
  readOnly,
  busy,
  replayCurrentCell,
  replay = false,
  completed = false,
  onSelect,
  onEnter,
  onToggleNotes,
  onOpenDial,
}: SudokuBoardProps) {
  const boardElement = useRef<HTMLDivElement>(null);
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdOrigin = useRef({ x: 0, y: 0 });
  const committedCallbacks = useRef({ onSelect, onOpenDial });
  useLayoutEffect(() => {
    committedCallbacks.current = { onSelect, onOpenDial };
  });
  function cancelHold() {
    if (hold.current !== null) clearTimeout(hold.current);
    hold.current = null;
  }
  // A pending gesture must not outlive the board state that made it editable.
  useLayoutEffect(() => cancelHold, [busy, readOnly, mode, clues]);

  return (
    <div
      ref={boardElement}
      className="board kit-sudoku-board"
      data-completed={completed}
      role="group"
      aria-label="Sudoku board"
      aria-description={completed ? 'Completed board.' : undefined}
      onKeyDown={(event) => {
        if (/^[1-9]$/.test(event.key)) {
          event.preventDefault();
          onEnter(Number(event.key), selected);
        } else if (['Backspace', 'Delete', '0'].includes(event.key)) {
          event.preventDefault();
          onEnter(0, selected);
        } else if (event.key.toLowerCase() === 'n' && !readOnly) {
          onToggleNotes();
        } else {
          const row = Math.floor(selected / 9);
          const column = selected % 9;
          const destinations: Record<string, number> = {
            ArrowUp: Math.max(0, row - 1) * 9 + column,
            ArrowDown: Math.min(8, row + 1) * 9 + column,
            ArrowLeft: row * 9 + Math.max(0, column - 1),
            ArrowRight: row * 9 + Math.min(8, column + 1),
          };
          if (event.key in destinations) {
            event.preventDefault();
            const next = destinations[event.key];
            onSelect(next);
            boardElement.current?.querySelector<HTMLButtonElement>(`#cell-${next}`)?.focus();
          }
        }
      }}
    >
      {board.map((value, index) => {
        const given = mode === 'play' && !!clues[index];
        const wrong = wrongCells.includes(index);
        const needsReview = mode === 'review' && uncertain.includes(index);
        const replayCurrent = replayCurrentCell === index;
        const peer = !replay && peers(selected, index);
        const match = !replay && !!value && value === board[selected];
        const active = !replay && selected === index;
        const description = [
          !value && notes[index].length ? `Pencil notes: ${notes[index].join(', ')}.` : '',
          wrong ? 'Incorrect number.' : '',
          needsReview ? 'Needs review.' : '',
          replayCurrent ? 'Current replay move.' : '',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <button
            key={index}
            id={`cell-${index}`}
            type="button"
            data-value={value}
            data-given={given}
            data-wrong={wrong}
            data-unclear={needsReview}
            data-replay-current={replayCurrent}
            data-peer={peer}
            data-match={match}
            aria-current={replayCurrent ? 'step' : undefined}
            aria-label={`Row ${Math.floor(index / 9) + 1} column ${(index % 9) + 1}, ${value || 'empty'}${given ? ', given' : ''}`}
            aria-description={description || undefined}
            aria-pressed={replay ? undefined : selected === index}
            tabIndex={selected === index ? 0 : -1}
            className={`cell ${given ? 'given' : ''} ${peer ? 'peer' : ''} ${match ? 'match' : ''} ${active ? 'selected' : ''} ${wrong ? 'wrong' : ''} ${needsReview ? 'uncertain' : ''}`}
            onPointerDown={(event) => {
              cancelHold();
              if (given || readOnly || busy || event.button !== 0 || !event.isPrimary) return;
              holdOrigin.current = { x: event.clientX, y: event.clientY };
              hold.current = setTimeout(() => {
                hold.current = null;
                boardElement.current?.querySelector<HTMLButtonElement>(`#cell-${index}`)?.focus();
                committedCallbacks.current.onSelect(index);
                committedCallbacks.current.onOpenDial(index);
              }, 450);
            }}
            onPointerMove={(event) => {
              if (
                Math.hypot(
                  event.clientX - holdOrigin.current.x,
                  event.clientY - holdOrigin.current.y,
                ) > 10
              )
                cancelHold();
            }}
            onPointerUp={cancelHold}
            onPointerCancel={cancelHold}
            onPointerLeave={cancelHold}
            onContextMenu={(event) => {
              if (!given && !readOnly) event.preventDefault();
            }}
            onClick={() => onSelect(index)}
          >
            {value ? (
              <span className="kit-sudoku-board__digit">{value}</span>
            ) : (
              <span className="notes">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((number) => (
                  <span key={number}>{notes[index].includes(number) ? number : ''}</span>
                ))}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
