/**
 * OpsReport Studio — Shared Page Header Component
 *
 * Establishes a consistent page header pattern with screen titles, descriptions,
 * optional contextual status badges, breadcrumbs, and primary header actions.
 *
 * @module renderer/components/common/PageHeader
 */

import React from 'react';

export interface BreadcrumbItem {
  label: string;
  onClick?: () => void;
}

export interface PageHeaderProps {
  title: string;
  description?: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumbs?: BreadcrumbItem[];
  className?: string;
  style?: React.CSSProperties;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  badge,
  actions,
  breadcrumbs,
  className = '',
  style,
}) => {
  return (
    <header
      className={`page-header ${className}`.trim()}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        marginBottom: 'var(--space-6)',
        ...style,
      }}
    >
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" style={{ marginBottom: 'var(--space-1)' }}>
          <ol
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              listStyle: 'none',
              padding: 0,
              margin: 0,
              fontSize: 'var(--font-size-xs)',
              color: 'var(--color-text-muted)',
            }}
          >
            {breadcrumbs.map((crumb, idx) => {
              const isLast = idx === breadcrumbs.length - 1;
              return (
                <li
                  key={idx}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}
                >
                  {idx > 0 && <span aria-hidden="true">/</span>}
                  {crumb.onClick && !isLast ? (
                    <button
                      type="button"
                      onClick={crumb.onClick}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--color-action-primary)',
                        cursor: 'pointer',
                        padding: 0,
                        font: 'inherit',
                        textDecoration: 'underline',
                      }}
                    >
                      {crumb.label}
                    </button>
                  ) : (
                    <span
                      aria-current={isLast ? 'page' : undefined}
                      style={{
                        color: isLast ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                        fontWeight: isLast
                          ? 'var(--font-weight-medium)'
                          : 'var(--font-weight-normal)',
                      }}
                    >
                      {crumb.label}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 'var(--space-4)',
        }}
      >
        <div style={{ flex: '1 1 300px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
              flexWrap: 'wrap',
            }}
          >
            <h1
              className="text-h2"
              style={{
                margin: 0,
                color: 'var(--color-text-primary)',
                letterSpacing: '-0.01em',
              }}
            >
              {title}
            </h1>
            {badge && <div>{badge}</div>}
          </div>

          {description && (
            <p
              className="text-body-sm"
              style={{
                marginTop: 'var(--space-1)',
                color: 'var(--color-text-secondary)',
                margin: 0,
              }}
            >
              {description}
            </p>
          )}
        </div>

        {actions && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              flexWrap: 'wrap',
            }}
          >
            {actions}
          </div>
        )}
      </div>
    </header>
  );
};
