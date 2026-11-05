'use client';

import type { ComponentPropsWithRef } from 'react';
import './Button.css';

export interface ButtonProps extends ComponentPropsWithRef<'button'> {
  variant?: 'ink' | 'flash' | 'outline' | 'quiet';
  busy?: boolean;
  iconOnly?: boolean;
}

export function Button({
  variant = 'outline',
  busy = false,
  iconOnly = false,
  type = 'button',
  className,
  onClick,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={['kit-button', className].filter(Boolean).join(' ')}
      data-variant={variant}
      data-icon-only={iconOnly || undefined}
      aria-busy={busy || undefined}
      aria-disabled={busy || props['aria-disabled']}
      onClick={(event) => {
        if (busy || props['aria-disabled'] === true || props['aria-disabled'] === 'true') {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        onClick?.(event);
      }}
    >
      {children}
    </button>
  );
}

export default Button;
