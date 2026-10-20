/**
 * OpsReport Studio — Shared Empty State Component
 *
 * Provides distinct visual and semantic treatments for four distinct operational scenarios:
 * 1. 'no-data': Operational list or workspace is currently empty.
 * 2. 'planned': Roadmap feature scheduled for future implementation.
 * 3. 'error': Data retrieval or subsystem operation failed.
 * 4. 'config-missing': Prerequisite setting or file mapping is required before continuing.
 *
 * Adheres strictly to Section 8.4 empty-state differentiation requirements.
 *
 * @module renderer/components/common/EmptyState
 */

import React from 'react';

export type EmptyStateType = 'no-data' | 'planned' | 'error' | 'config-missing';

export interface EmptyStateProps {
  title: string;
  description: string;
  type?: EmptyStateType;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  type = 'no-data',
  icon,
  action,
  className = '',
  style,
}) => {
  // Built-in accessible SVG icons if none provided
  const renderDefaultIcon = () => {
    switch (type) {
      case 'planned':
        return (
          <svg
            aria-hidden="true"
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-state-info)"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        );
      case 'error':
        return (
          <svg
            aria-hidden="true"
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-state-error)"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        );
      case 'config-missing':
        return (
          <svg
            aria-hidden="true"
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-state-warning)"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        );
      case 'no-data':
      default:
        return (
          <svg
            aria-hidden="true"
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-text-muted)"
            strokeWidth="1.75"
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
    }
  };

  const getBorderAndBg = (): React.CSSProperties => {
    switch (type) {
      case 'error':
        return {
          backgroundColor: 'var(--color-state-error-bg)',
          borderColor: 'var(--color-state-error-border)',
        };
      case 'config-missing':
        return {
          backgroundColor: 'var(--color-state-warning-bg)',
          borderColor: 'var(--color-state-warning-border)',
        };
      case 'planned':
        return {
          backgroundColor: 'var(--color-state-info-bg)',
          borderColor: 'var(--color-state-info-border)',
        };
      case 'no-data':
      default:
        return {
          backgroundColor: 'var(--color-bg-surface)',
          borderColor: 'var(--color-border-subtle)',
        };
    }
  };

  return (
    <div
      role="region"
      aria-label={title}
      className={`empty-state empty-state-${type} ${className}`.trim()}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: 'var(--space-8) var(--space-6)',
        borderRadius: 'var(--radius-lg)',
        borderWidth: '1px',
        borderStyle: 'dashed',
        ...getBorderAndBg(),
        ...style,
      }}
    >
      <div style={{ marginBottom: 'var(--space-3)' }}>{icon || renderDefaultIcon()}</div>

      <h4
        style={{
          fontSize: 'var(--font-size-base)',
          fontWeight: 'var(--font-weight-semibold)',
          color: 'var(--color-text-primary)',
          marginBottom: 'var(--space-1)',
        }}
      >
        {title}
      </h4>

      <p
        style={{
          fontSize: 'var(--font-size-sm)',
          color: 'var(--color-text-secondary)',
          maxWidth: '480px',
          lineHeight: 'var(--line-height-normal)',
          marginBottom: action ? 'var(--space-4)' : 0,
        }}
      >
        {description}
      </p>

      {action && <div>{action}</div>}
    </div>
  );
};
