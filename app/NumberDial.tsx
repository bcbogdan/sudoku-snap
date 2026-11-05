'use client';
import { useLayoutEffect, useRef } from 'react';
import Button from './components/Button';
import { Icon } from './components/Icon';
import './NumberDial.css';
export interface NumberDialProps {
  onChoose: (value: number) => void;
  onClose: () => void;
}

export default function NumberDial({ onChoose, onClose }: NumberDialProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const element = dialog.current!;
    const origin = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element.showModal();
    return () => {
      // Release modal inertness before restoring focus, while the dialog is still connected.
      element.close();
      if (origin?.isConnected) origin.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="number-dial kit-number-dial"
      aria-labelledby="dial-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <h2 id="dial-title">Choose a number</h2>
      <div className="dial-numbers">
        {Array.from({ length: 9 }, (_, i) => (
          <Button
            key={i}
            className="kit-number-dial__key"
            iconOnly
            aria-label={`Choose ${i + 1}`}
            onClick={() => onChoose(i + 1)}
            style={{
              left: 130 + 100 * Math.sin((i * Math.PI * 2) / 9),
              top: 130 - 100 * Math.cos((i * Math.PI * 2) / 9),
            }}
          >
            {i + 1}
          </Button>
        ))}
        <Button
          className="kit-number-dial__key"
          iconOnly
          aria-label="Clear square"
          style={{ left: 130, top: 130 }}
          onClick={() => onChoose(0)}
        >
          <Icon name="delete" />
        </Button>
      </div>
      <Button variant="quiet" onClick={onClose}>
        Cancel
      </Button>
    </dialog>
  );
}
