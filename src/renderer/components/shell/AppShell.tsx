/**
 * OpsReport Studio — Application Shell Component
 *
 * Implements the reusable desktop application frame surrounding active views,
 * binding the Sidebar, AppHeader, and main content area with accessible landmarks.
 *
 * @module renderer/components/shell/AppShell
 */

import React from 'react';
import { Sidebar } from './Sidebar.tsx';
import { AppHeader } from './AppHeader.tsx';

export interface AppShellProps {
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ children }) => {
  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
        backgroundColor: 'var(--color-bg-app)',
        color: 'var(--color-text-primary)',
      }}
    >
      {/* Accessible Skip Link for Keyboard Navigation */}
      <a
        href="#main-content"
        style={{
          position: 'absolute',
          top: '-40px',
          left: '10px',
          backgroundColor: 'var(--color-action-primary)',
          color: 'var(--color-action-primary-text)',
          padding: 'var(--space-2) var(--space-4)',
          borderRadius: 'var(--radius-sm)',
          zIndex: 9999,
          fontSize: 'var(--font-size-sm)',
          fontWeight: 'var(--font-weight-medium)',
          transition: 'top var(--transition-fast)',
          textDecoration: 'none',
        }}
        onFocus={e => {
          e.currentTarget.style.top = '10px';
        }}
        onBlur={e => {
          e.currentTarget.style.top = '-40px';
        }}
      >
        Skip to main content
      </a>

      {/* Primary Navigation Sidebar */}
      <Sidebar />

      {/* Main Execution Region: Header + Content Surface */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
        }}
      >
        <AppHeader />

        <main
          id="main-content"
          tabIndex={-1}
          style={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            padding: 'var(--space-6)',
            backgroundColor: 'var(--color-bg-app)',
            outline: 'none',
          }}
        >
          {children}
        </main>
      </div>
    </div>
  );
};
