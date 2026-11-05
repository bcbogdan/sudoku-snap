'use client';

import { useEffect, useId, useState } from 'react';
import './OriginalPhoto.css';

export interface OriginalPhotoProps {
  image: Blob;
}

export default function OriginalPhoto({ image }: OriginalPhotoProps) {
  const [url, setURL] = useState('');
  const [zoom, setZoom] = useState(1);
  const [failed, setFailed] = useState(false);
  const id = useId();
  useEffect(() => {
    const objectURL = URL.createObjectURL(image);
    setFailed(false);
    setURL(objectURL);
    return () => URL.revokeObjectURL(objectURL);
  }, [image]);
  return (
    <details className="original-photo kit-original-photo">
      <summary>Compare original photo</summary>
      <label htmlFor={id}>Photo zoom · {zoom}×</label>
      <input
        id={id}
        type="range"
        min="1"
        max="4"
        step="0.5"
        value={zoom}
        onChange={(event) => setZoom(Number(event.target.value))}
      />
      <div
        className="original-photo-viewport"
        tabIndex={0}
        role="region"
        aria-label="Original photo; scroll to inspect enlarged clues"
      >
        {failed ? (
          <p role="status">Could not open the original photo.</p>
        ) : url ? (
          <img
            src={url}
            alt="Original Sudoku photo for comparing recognized clues"
            loading="lazy"
            onError={() => setFailed(true)}
            style={{ width: `${zoom * 100}%` }}
          />
        ) : (
          <p>Opening photo…</p>
        )}
      </div>
    </details>
  );
}
