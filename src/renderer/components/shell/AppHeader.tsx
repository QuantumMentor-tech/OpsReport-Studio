/**
 * OpsReport Studio — Application Header Component
 *
 * Provides the global top bar with current view context, sidebar collapse trigger,
 * brand presence, and integrated accessible theme toggle.
 *
 * @module renderer/components/shell/AppHeader
 */

import React from 'react';
import { useNavigation } from '../../navigation/NavigationContext.tsx';
import { ThemeToggle } from '../ThemeToggle.tsx';
import { Badge } from '../common/Badge.tsx';

export const AppHeader: React.FC = () => {
  const { activeItem, isSidebarCollapsed, toggleSidebar } = useNavigation();

  return (
    <header
      role="banner"
      style={{
        height: '60px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 var(--space-6)',
        borderBottom: '1px solid var(--color-border-subtle)',
        backgroundColor: 'var(--color-bg-surface)',
        flexShrink: 0,
        userSelect: 'none',
      }}
    >
      {/* Left: Sidebar Toggle & Current View Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={
            isSidebarCollapsed ? 'Expand navigation sidebar' : 'Collapse navigation sidebar'
          }
          title={isSidebarCollapsed ? 'Expand navigation sidebar' : 'Collapse navigation sidebar'}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '32px',
            height: '32px',
            background: 'none',
            border: '1px solid var(--color-border-subtle)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--color-text-secondary)',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          <svg
            aria-hidden="true"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <span
            style={{
              fontWeight: 'var(--font-weight-semibold)',
              fontSize: 'var(--font-size-sm)',
              color: 'var(--color-text-primary)',
            }}
          >
            {activeItem.label}
          </span>
          {activeItem.status === 'planned' && (
            <Badge variant="neutral" size="sm">
              {activeItem.plannedStep || 'Planned'}
            </Badge>
          )}
        </div>
      </div>

      {/* Right: Global Actions & Accessible Theme Toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <ThemeToggle />
      </div>
    </header>
  );
};
