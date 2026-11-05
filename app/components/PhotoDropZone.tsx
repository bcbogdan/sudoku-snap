'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { CornerFrame } from './CornerFrame';
import { Icon } from './Icon';
import './PhotoDropZone.css';

export interface PhotoDropZoneProps {
  busy: boolean;
  onUpload: (file: File) => void;
  invalid?: boolean;
}

export function PhotoDropZone({ busy, onUpload, invalid = false }: PhotoDropZoneProps) {
  const id = useId();
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const activeDrag = dragging && !busy;

  useEffect(() => {
    if (busy) {
      dragDepth.current = 0;
      setDragging(false);
    }
  }, [busy]);

  return (
    <div
      className="kit-photo-drop"
      data-dragging={activeDrag}
      data-invalid={invalid}
      aria-busy={busy}
      onDragEnter={(event) => {
        event.preventDefault();
        if (busy) return;
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = busy ? 'none' : 'copy';
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        const file = event.dataTransfer.files[0];
        if (file && !busy) onUpload(file);
      }}
    >
      <CornerFrame
        state={busy ? 'checking' : invalid ? 'unreadable' : 'waiting'}
        className="kit-photo-drop__frame"
      >
        <label className="kit-photo-drop__target">
          <input
            className="kit-photo-drop__input"
            type="file"
            accept="image/*"
            disabled={busy}
            aria-labelledby={`${id}-label`}
            aria-describedby={`${id}-description`}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (file && !busy) onUpload(file);
            }}
          />
          <span className="kit-photo-drop__camera">
            <Icon name="camera" size={32} />
          </span>
          <span className="kit-photo-drop__label" id={`${id}-label`}>
            {busy ? 'Reading your photo…' : 'Choose a Sudoku photo'}
          </span>
          <span className="kit-photo-drop__description" id={`${id}-description`}>
            <span>or drop or paste an image</span>{' '}
            <span>
              up{'\u00a0'}to{'\u00a0'}20{'\u00a0'}MB
            </span>
          </span>
        </label>
      </CornerFrame>
    </div>
  );
}
