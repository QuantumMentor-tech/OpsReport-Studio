/**
 * OpsReport Studio — Shared Card & Surface Component
 *
 * Provides a structured surface container using the design system's border,
 * background, radius, and elevation tokens. Supports headers, actions, and footers.
 *
 * @module renderer/components/common/Card
 */

import React from 'react';

export type CardVariant = 'default' | 'subtle' | 'outlined';

export interface CardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  headerAction?: React.ReactNode;
  footer?: React.ReactNode;
  variant?: CardVariant;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export const Card: React.FC<CardProps> = ({
  children,
  title,
  subtitle,
  headerAction,
  footer,
  variant = 'default',
  padding = 'md',
  className = '',
  style,
  ...rest
}) => {
  const getVariantStyle = (): React.CSSProperties => {
    switch (variant) {
      case 'subtle':
        return {
          backgroundColor: 'var(--color-bg-subtle)',
          border: '1px solid var(--color-border-subtle)',
          boxShadow: 'none',
        };
      case 'outlined':
        return {
          backgroundColor: 'var(--color-bg-surface)',
          border: '1px solid var(--color-border-default)',
          boxShadow: 'none',
        };
      case 'default':
      default:
        return {
          backgroundColor: 'var(--color-bg-surface)',
          border: '1px solid var(--color-border-default)',
          boxShadow: 'var(--shadow-sm)',
        };
    }
  };

  const getPaddingValue = (): string => {
    switch (padding) {
      case 'none':
        return '0';
      case 'sm':
        return 'var(--space-3) var(--space-4)';
      case 'lg':
        return 'var(--space-6) var(--space-8)';
      case 'md':
      default:
        return 'var(--space-5) var(--space-6)';
    }
  };

  const hasHeader = Boolean(title || subtitle || headerAction);

  return (
    <div
      className={`card ${className}`.trim()}
      style={{
        borderRadius: 'var(--radius-lg)',
        transition:
          'background-color var(--transition-fast), border-color var(--transition-fast), box-shadow var(--transition-fast)',
        ...getVariantStyle(),
        ...style,
      }}
      {...rest}
    >
      {hasHeader && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: getPaddingValue(),
            borderBottom: '1px solid var(--color-border-subtle)',
            gap: 'var(--space-4)',
          }}
        >
          <div>
            {title && (
              <h3
                style={{
                  fontSize: 'var(--font-size-base)',
                  fontWeight: 'var(--font-weight-semibold)',
                  color: 'var(--color-text-primary)',
                  margin: 0,
                }}
              >
                {title}
              </h3>
            )}
            {subtitle && (
              <p
                style={{
                  fontSize: 'var(--font-size-xs)',
                  color: 'var(--color-text-secondary)',
                  marginTop: 'var(--space-0-5)',
                  margin: 0,
                }}
              >
                {subtitle}
              </p>
            )}
          </div>
          {headerAction && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              {headerAction}
            </div>
          )}
        </div>
      )}

      <div style={{ padding: getPaddingValue() }}>{children}</div>

      {footer && (
        <div
          style={{
            padding: getPaddingValue(),
            borderTop: '1px solid var(--color-border-subtle)',
            backgroundColor: 'var(--color-bg-subtle)',
            borderBottomLeftRadius: 'var(--radius-lg)',
            borderBottomRightRadius: 'var(--radius-lg)',
          }}
        >
          {footer}
        </div>
      )}
    </div>
  );
};
