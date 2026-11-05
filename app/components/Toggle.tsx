'use client';

import type { MouseEventHandler } from 'react';
import Button from './Button';
import './Toggle.css';

export interface ToggleProps {
  label: string;
  pressed: boolean;
  onClick: MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
}

export function Toggle({ label, pressed, onClick, disabled }: ToggleProps) {
  return (
    <Button
      className="kit-toggle"
      variant={pressed ? 'ink' : 'outline'}
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      disabled={disabled}
    >
      <span className="kit-toggle__label">{label}</span>
      <span className="kit-toggle__state" aria-hidden="true">
        {pressed ? 'On' : 'Off'}
      </span>
    </Button>
  );
}

export default Toggle;
