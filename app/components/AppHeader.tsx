import type { ReactNode } from 'react';
import Icon from './Icon';
import './AppHeader.css';

export interface AppHeaderProps {
  screen: 'library' | 'create' | 'review' | 'detail' | 'play';
  backLink?: { href: string; label: string };
  status?: ReactNode;
}

export default function AppHeader({ screen, backLink, status }: AppHeaderProps) {
  return (
    <header className="kit-app-header">
      {backLink ? (
        <a href={backLink.href} className="kit-app-header__back">
          <Icon name="chevron-left" />
          {backLink.label}
        </a>
      ) : (
        <a href="/" className="brand kit-app-header__brand">
          <svg
            className="kit-app-header__mark"
            width="28"
            height="28"
            viewBox="0 0 28 28"
            fill="none"
            aria-hidden="true"
            focusable="false"
          >
            <path
              d="M9 3H5a2 2 0 00-2 2v4m16-6h4a2 2 0 012 2v4M3 19v4a2 2 0 002 2h4m10 0h4a2 2 0 002-2v-4"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            {[10, 14, 18].flatMap((y) =>
              [10, 14, 18].map((x) => (
                <circle
                  key={`${x}-${y}`}
                  cx={x}
                  cy={y}
                  r={x === 14 && y === 14 ? 2.3 : 1.2}
                  fill={x === 14 && y === 14 ? 'var(--color-button-flash-bg)' : 'currentColor'}
                />
              )),
            )}
          </svg>
          Sudoku Snap
        </a>
      )}
      {status ? <div className="kit-app-header__status">{status}</div> : null}
      {!backLink && screen !== 'library' && (
        <nav className="kit-app-header__nav" aria-label="Main navigation">
          <a href="/">My puzzles</a>
          <a href="/?new" aria-current={screen === 'create' ? 'page' : undefined}>
            New puzzle
          </a>
        </nav>
      )}
    </header>
  );
}
