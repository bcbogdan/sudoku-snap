import type { ReactNode } from 'react';
import './CornerFrame.css';

export interface CornerFrameProps {
  state: 'waiting' | 'checking' | 'unreadable' | 'completed';
  children: ReactNode;
  className?: string;
}

export function CornerFrame({ state, children, className }: CornerFrameProps) {
  return (
    <div className={['kit-corner-frame', className].filter(Boolean).join(' ')} data-state={state}>
      {children}
      <span className="kit-corner-frame__corner" data-corner="top-left" aria-hidden="true" />
      <span className="kit-corner-frame__corner" data-corner="top-right" aria-hidden="true" />
      <span className="kit-corner-frame__corner" data-corner="bottom-left" aria-hidden="true" />
      <span className="kit-corner-frame__corner" data-corner="bottom-right" aria-hidden="true" />
    </div>
  );
}
