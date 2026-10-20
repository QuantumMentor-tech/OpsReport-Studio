/**
 * OpsReport Studio — Shared Badge Component
 *
 * Renders small status indicators, roadmap tags, and diagnostic markers
 * using semantic design tokens with WCAG AA compliant contrast.
 *
 * @module renderer/components/common/Badge
 */

import React from 'react';

export type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral';
export type BadgeSize = 'sm' | 'md';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  icon?: React.ReactNode;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'neutral',
  size = 'sm',
  icon,
  className = '',
  style,
  ...rest
}) => {
  const getVariantStyle = (): React.CSSProperties => {
    switch (variant) {
      case 'success':
        return {
          backgroundColor: 'var(--color-state-success-bg)',
          color: 'var(--color-state-success)',
          borderColor: 'var(--color-state-success-border)',
        };
      case 'warning':
        return {
          backgroundColor: 'var(--color-state-warning-bg)',
          color: 'var(--color-state-warning)',
          borderColor: 'var(--color-state-warning-border)',
        };
      case 'error':
        return {
          backgroundColor: 'var(--color-state-error-bg)',
          color: 'var(--color-state-error)',
          borderColor: 'var(--color-state-error-border)',
        };
      case 'info':
        return {
          backgroundColor: 'var(--color-state-info-bg)',
          color: 'var(--color-state-info)',
          borderColor: 'var(--color-state-info-border)',
        };
      case 'neutral':
      default:
        return {
          backgroundColor: 'var(--color-bg-subtle)',
          color: 'var(--color-text-secondary)',
          borderColor: 'var(--color-border-subtle)',
        };
    }
  };

  const getSizeStyle = (): React.CSSProperties => {
    switch (size) {
      case 'md':
        return {
          padding: 'var(--space-1) var(--space-3)',
          fontSize: 'var(--font-size-xs)',
          gap: 'var(--space-1-5, 6px)',
        };
      case 'sm':
      default:
        return {
          padding: 'var(--space-0-5) var(--space-2)',
          fontSize: '0.6875rem',
          gap: 'var(--space-1)',
        };
    }
  };

  return (
    <span
      className={`badge badge-${variant} ${className}`.trim()}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        fontFamily: 'var(--font-sans)',
        fontWeight: 'var(--font-weight-semibold)',
        lineHeight: 1,
        borderRadius: 'var(--radius-sm)',
        borderWidth: '1px',
        borderStyle: 'solid',
        letterSpacing: '0.02em',
        userSelect: 'none',
        ...getVariantStyle(),
        ...getSizeStyle(),
        ...style,
      }}
      {...rest}
    >
      {icon && (
        <span aria-hidden="true" style={{ display: 'inline-flex' }}>
          {icon}
        </span>
      )}
      <span>{children}</span>
    </span>
  );
};
