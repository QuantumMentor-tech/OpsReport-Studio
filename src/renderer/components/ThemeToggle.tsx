/**
 * OpsReport Studio — Accessible Theme Toggle Component
 *
 * Provides a keyboard-navigable, screen-reader-friendly toggle button allowing operators
 * to switch between Light and Dark visual appearances.
 *
 * @module renderer/components/ThemeToggle
 */

import React from 'react';
import { useTheme } from '../theme/index.ts';

export const ThemeToggle: React.FC = () => {
  const { resolvedTheme, toggleTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  return (
    <button
      type="button"
      className="btn btn-secondary"
      onClick={toggleTheme}
      aria-label={`Current appearance: ${resolvedTheme}. Click to switch to ${isDark ? 'light' : 'dark'} mode.`}
      title={`Switch to ${isDark ? 'Light' : 'Dark'} Mode`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        height: 'var(--control-height-sm)',
        padding: '0 var(--space-3)',
        fontSize: 'var(--font-size-xs)',
      }}
    >
      {isDark ? (
        // Sun Icon for switching to light mode
        <svg
          aria-hidden="true"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      ) : (
        // Moon Icon for switching to dark mode
        <svg
          aria-hidden="true"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
      <span style={{ fontWeight: 'var(--font-weight-medium)' }}>
        {isDark ? 'Dark Mode' : 'Light Mode'}
      </span>
    </button>
  );
};
