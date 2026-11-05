import type { ReactNode } from 'react';
import { Icon } from './Icon';
import './Badge.css';

export interface BadgeProps {
  kind: 'in-progress' | 'neutral' | 'completed' | 'draft' | 'replaying';
  children: ReactNode;
}

const icons = {
  'in-progress': 'half-disc',
  neutral: 'circle',
  completed: 'check',
  draft: 'pencil',
  replaying: 'history',
} as const;

export function Badge({ kind, children }: BadgeProps) {
  return (
    <span className="kit-badge" data-kind={kind}>
      <Icon name={icons[kind]} size={16} className="kit-badge__icon" />
      <span className="kit-badge__content">{children}</span>
    </span>
  );
}
