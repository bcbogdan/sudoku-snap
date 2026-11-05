import type { ReactNode } from 'react';
import { Icon } from './Icon';
import './Alert.css';

export interface AlertProps {
  children: ReactNode;
  role?: 'alert' | 'status';
  className?: string;
}

export function Alert({ children, role = 'alert', className }: AlertProps) {
  return (
    <div className={['kit-alert', className].filter(Boolean).join(' ')} role={role}>
      <Icon name="alert" size={24} className="kit-alert__icon" />
      <div className="kit-alert__content">{children}</div>
    </div>
  );
}
