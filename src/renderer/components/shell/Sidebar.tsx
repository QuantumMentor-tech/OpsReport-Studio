/**
 * OpsReport Studio — Application Sidebar Component
 *
 * Implements primary desktop navigation, brand presentation, active state
 * identification, roadmap status badges, and accessible collapse/expand behavior.
 *
 * @module renderer/components/shell/Sidebar
 */

import React from 'react';
import { useNavigation } from '../../navigation/NavigationContext.tsx';
import type { NavItemConfig } from '../../navigation/types.ts';
import { Badge } from '../common/Badge.tsx';

// Accessible SVG icons for navigation destinations
const NavIcon: React.FC<{ name: NavItemConfig['iconName'] }> = ({ name }) => {
  switch (name) {
    case 'dashboard':
      return (
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
          <rect x="3" y="3" width="7" height="9" />
          <rect x="14" y="3" width="7" height="5" />
          <rect x="14" y="12" width="7" height="9" />
          <rect x="3" y="16" width="7" height="5" />
        </svg>
      );
    case 'reports':
      return (
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
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      );
    case 'templates':
      return (
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
          <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
          <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
        </svg>
      );
    case 'stations':
      return (
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
          <line x1="4" y1="9" x2="20" y2="9" />
          <line x1="4" y1="15" x2="20" y2="15" />
          <line x1="10" y1="3" x2="8" y2="21" />
          <line x1="16" y1="3" x2="14" y2="21" />
        </svg>
      );
    case 'history':
      return (
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
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 14 14" />
        </svg>
      );
    case 'settings':
      return (
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
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      );
  }
};

export const Sidebar: React.FC = () => {
  const { activeView, navItems, navigateTo, isSidebarCollapsed, toggleSidebar } = useNavigation();

  return (
    <aside
      aria-label="Application Sidebar"
      style={{
        width: isSidebarCollapsed ? '64px' : '260px',
        backgroundColor: 'var(--color-bg-surface)',
        borderRight: '1px solid var(--color-border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        transition: 'width var(--transition-fast)',
        userSelect: 'none',
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      {/* Top Brand Banner */}
      <div>
        <div
          style={{
            height: '60px',
            display: 'flex',
            alignItems: 'center',
            padding: isSidebarCollapsed ? '0 var(--space-4)' : '0 var(--space-5)',
            borderBottom: '1px solid var(--color-border-subtle)',
            gap: 'var(--space-3)',
          }}
        >
          <img
            src="/OpsReport Studio Tech Logo.png"
            alt="OpsReport Studio Logo"
            style={{ width: '28px', height: '28px', objectFit: 'contain', flexShrink: 0 }}
            onError={e => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
          {!isSidebarCollapsed && (
            <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <span
                style={{
                  fontWeight: 'var(--font-weight-bold)',
                  fontSize: 'var(--font-size-sm)',
                  color: 'var(--color-text-primary)',
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis',
                  overflow: 'hidden',
                }}
              >
                OpsReport Studio
              </span>
              <span
                style={{
                  fontSize: '0.6875rem',
                  color: 'var(--color-text-muted)',
                  whiteSpace: 'nowrap',
                }}
              >
                v0.1.0-alpha
              </span>
            </div>
          )}
        </div>

        {/* Primary Navigation Destinations */}
        <nav
          aria-label="Primary Navigation"
          style={{
            padding: 'var(--space-3) var(--space-2)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-1)',
          }}
        >
          {navItems.map(item => {
            const isActive = activeView === item.id;
            const isPlanned = item.status === 'planned';

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigateTo(item.id)}
                aria-current={isActive ? 'page' : undefined}
                aria-label={
                  isSidebarCollapsed
                    ? `${item.label}${isPlanned ? ` (${item.plannedStep || 'Planned'})` : ''}`
                    : undefined
                }
                title={
                  isSidebarCollapsed
                    ? `${item.label}${isPlanned ? ` (${item.plannedStep || 'Planned'})` : ''}`
                    : item.description
                }
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-3)',
                  padding: isSidebarCollapsed
                    ? 'var(--space-2-5, 10px)'
                    : 'var(--space-2-5, 10px) var(--space-3)',
                  justifyContent: isSidebarCollapsed ? 'center' : 'flex-start',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid transparent',
                  backgroundColor: isActive ? 'var(--color-bg-selected)' : 'transparent',
                  color: isActive
                    ? 'var(--color-action-primary)'
                    : isPlanned
                      ? 'var(--color-text-secondary)'
                      : 'var(--color-text-primary)',
                  fontWeight: isActive
                    ? 'var(--font-weight-semibold)'
                    : 'var(--font-weight-medium)',
                  fontSize: 'var(--font-size-sm)',
                  cursor: 'pointer',
                  width: '100%',
                  textAlign: 'left',
                  transition:
                    'background-color var(--transition-fast), color var(--transition-fast)',
                }}
                onMouseEnter={e => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)';
                  }
                }}
                onMouseLeave={e => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
              >
                <span
                  style={{
                    display: 'inline-flex',
                    flexShrink: 0,
                    color: isActive ? 'var(--color-action-primary)' : 'currentColor',
                  }}
                >
                  <NavIcon name={item.iconName} />
                </span>

                {!isSidebarCollapsed && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flex: 1,
                      overflow: 'hidden',
                    }}
                  >
                    <span
                      style={{
                        whiteSpace: 'nowrap',
                        textOverflow: 'ellipsis',
                        overflow: 'hidden',
                      }}
                    >
                      {item.label}
                    </span>
                    {isPlanned && (
                      <Badge variant="neutral" size="sm">
                        Planned
                      </Badge>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Sidebar Footer & Collapse Action */}
      <div
        style={{
          padding: 'var(--space-3) var(--space-2)',
          borderTop: '1px solid var(--color-border-subtle)',
        }}
      >
        <button
          type="button"
          onClick={toggleSidebar}
          aria-expanded={!isSidebarCollapsed}
          aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            padding: 'var(--space-2) var(--space-3)',
            justifyContent: isSidebarCollapsed ? 'center' : 'flex-start',
            width: '100%',
            background: 'none',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            color: 'var(--color-text-muted)',
            fontSize: 'var(--font-size-xs)',
            cursor: 'pointer',
            transition: 'color var(--transition-fast)',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.color = 'var(--color-text-primary)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.color = 'var(--color-text-muted)';
          }}
        >
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
            style={{
              transform: isSidebarCollapsed ? 'rotate(180deg)' : 'none',
              transition: 'transform var(--transition-fast)',
            }}
          >
            <polyline points="11 19 4 12 11 5" />
            <polyline points="18 19 11 12 18 5" />
          </svg>
          {!isSidebarCollapsed && <span>Collapse Sidebar</span>}
        </button>
      </div>
    </aside>
  );
};
