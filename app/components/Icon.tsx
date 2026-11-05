import type { ReactNode } from 'react';
import './Icon.css';

const icons = {
  plus: <path d="M12 4v16M4 12h16" />,
  camera: (
    <>
      <path d="M8 5l1-2h6l1 2h3a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z" />
      <circle cx="12" cy="12" r="4" />
    </>
  ),
  pencil: (
    <>
      <path d="M4 16L16 4a2.1 2.1 0 013 3L7 19l-4 1zM14 6l3 3" />
    </>
  ),
  'shield-check': (
    <>
      <path d="M12 3l8 4v5c0 5-8 9-8 9s-8-4-8-9V7zM8 12l3 3 5-6" />
    </>
  ),
  undo: <path d="M9 4L4 9l5 5M4 9h10a6 6 0 010 12h-3" />,
  history: (
    <>
      <path d="M4 4v5h5M4 9a9 9 0 119 12M12 7v5l3 2" />
    </>
  ),
  delete: (
    <>
      <path d="M9 5h11v14H9l-6-7zM12 9l5 6M17 9l-5 6" />
    </>
  ),
  check: <path d="M5 12l4 4L19 6" />,
  alert: (
    <>
      <path d="M12 3l10 18H2zM12 9v5" />
      <circle cx="12" cy="17" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 6v6l4 3" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 018 0v3" />
    </>
  ),
  copy: (
    <>
      <rect x="8" y="3" width="12" height="15" rx="2" />
      <path d="M8 6H6a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2v-1" />
    </>
  ),
  close: <path d="M5 5l14 14M19 5L5 19" />,
  'arrow-right': <path d="M4 12h16M14 6l6 6-6 6" />,
  'chevron-left': <path d="M15 4l-8 8 8 8" />,
  first: (
    <>
      <path d="M5 5v14M18 5l-9 7 9 7z" />
    </>
  ),
  previous: <path d="M20 12H4M10 6l-6 6 6 6" />,
  next: <path d="M4 12h16M14 6l6 6-6 6" />,
  last: (
    <>
      <path d="M19 5v14M6 5l9 7-9 7z" />
    </>
  ),
  'half-disc': (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 000 18z" fill="currentColor" stroke="none" />
    </>
  ),
  circle: <circle cx="12" cy="12" r="9" />,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof icons;

export interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
}

export function Icon({ name, size = 20, className }: IconProps) {
  return (
    <svg
      className={['kit-icon', className].filter(Boolean).join(' ')}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {icons[name]}
    </svg>
  );
}

export default Icon;
