'use client';

import { useEffect, useState } from 'react';
import { parseThemePreference, setThemePreference, watchTheme } from '../../lib/theme';
import type { ThemePreference } from '../../lib/theme';

export function ThemeControl() {
  const [preference, setPreference] = useState<ThemePreference>('system');
  useEffect(() => watchTheme(setPreference), []);

  return (
    <label className="theme-control">
      <span>Theme</span>{' '}
      <select
        aria-label="Theme"
        value={preference}
        onChange={(event) => setThemePreference(parseThemePreference(event.target.value))}
        style={{
          minHeight: 'var(--control-min)',
          font: 'var(--text-body)',
          color: 'var(--color-text)',
          background: 'var(--color-surface)',
          border: 'var(--border-thin) solid var(--color-border)',
          borderRadius: 'var(--radius-sm)',
        }}
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}
