'use client';

import { useLayoutEffect, useRef } from 'react';
import Button from './Button';
import Icon from './Icon';
import './PuzzleTitle.css';

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
      className="name-editor kit-puzzle-title__editor"
      aria-busy={busy || undefined}
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy && value.trim()) onSave();
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
      <div className="kit-puzzle-title__editor-actions">
        <Button variant="ink" busy={busy} disabled={busy || !value.trim()} type="submit">
          Save name
        </Button>
        <Button disabled={busy} type="button" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  ) : (
    <div className="puzzle-title kit-puzzle-title">
      <h1>{name}</h1>
      <Button
        className="rename-button kit-puzzle-title__rename"
        iconOnly
        ref={rename}
        aria-label="Rename puzzle"
        title="Rename puzzle"
        disabled={busy}
        onClick={onEdit}
      >
        <Icon name="pencil" />
      </Button>
    </div>
  );
}
