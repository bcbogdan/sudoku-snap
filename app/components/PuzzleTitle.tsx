'use client';

import { useLayoutEffect, useRef } from 'react';

export interface PuzzleTitleProps {
  name: string;
  editing: boolean;
  value: string;
  busy: boolean;
  onEdit: () => void;
  onValueChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

export default function PuzzleTitle({
  name,
  editing,
  value,
  busy,
  onEdit,
  onValueChange,
  onSave,
  onCancel,
}: PuzzleTitleProps) {
  const rename = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const wasEditing = useRef(editing);
  const wasBusy = useRef(busy);
  useLayoutEffect(() => {
    if (wasEditing.current && !editing) rename.current?.focus();
    if (editing && wasBusy.current && !busy) input.current?.focus();
    wasEditing.current = editing;
    wasBusy.current = busy;
  }, [editing, busy]);
  return editing ? (
    <form
      className="name-editor"
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <label htmlFor="puzzle-name">Puzzle name</label>
      <input
        id="puzzle-name"
        ref={input}
        autoFocus
        value={value}
        maxLength={80}
        required
        disabled={busy}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            if (!busy) onCancel();
          }
        }}
      />
      <div>
        <button className="primary" disabled={busy || !value.trim()} type="submit">
          Save name
        </button>
        <button className="secondary" disabled={busy} type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  ) : (
    <div className="puzzle-title">
      <h1>{name}</h1>
      <button
        className="rename-button"
        ref={rename}
        aria-label="Rename puzzle"
        title="Rename puzzle"
        disabled={busy}
        onClick={onEdit}
      >
        ✎
      </button>
    </div>
  );
}
