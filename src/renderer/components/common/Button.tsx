/**
 * OpsReport Studio — Shared Button Component
 *
 * Provides a standardized, accessible button adhering to design system tokens,
 * supporting primary, secondary, ghost, outline, and danger variants with
 * focus-visible rings and screen-reader awareness.
 *
 * @module renderer/components/common/Button
 */

import React from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = 'secondary',
      size = 'md',
      loading = false,
      disabled = false,
      icon,
      iconPosition = 'left',
      fullWidth = false,
      className = '',
      style,
      type = 'button',
      ...rest
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    // Base styling using semantic CSS variables
    const getVariantStyle = (): React.CSSProperties => {
      switch (variant) {
        case 'primary':
          return {
            backgroundColor: 'var(--color-action-primary)',
            color: 'var(--color-action-primary-text)',
            borderColor: 'transparent',
          };
        case 'ghost':
          return {
            backgroundColor: 'transparent',
            color: 'var(--color-text-secondary)',
            borderColor: 'transparent',
          };
        case 'outline':
          return {
            backgroundColor: 'transparent',
            color: 'var(--color-text-primary)',
            borderColor: 'var(--color-border-default)',
          };
        case 'danger':
          return {
            backgroundColor: 'var(--color-state-error-bg)',
            color: 'var(--color-state-error)',
            borderColor: 'var(--color-state-error-border)',
          };
        case 'secondary':
        default:
          return {
            backgroundColor: 'var(--color-action-secondary-bg)',
            color: 'var(--color-action-secondary-text)',
            borderColor: 'var(--color-action-secondary-border)',
          };
      }
    };

    const getSizeStyle = (): React.CSSProperties => {
      switch (size) {
        case 'sm':
          return {
            height: 'var(--control-height-sm)',
            padding: '0 var(--space-3)',
            fontSize: 'var(--font-size-xs)',
            gap: 'var(--space-1-5, 6px)',
          };
        case 'lg':
          return {
            height: 'var(--control-height-lg)',
            padding: '0 var(--space-6)',
            fontSize: 'var(--font-size-base)',
            gap: 'var(--space-3)',
          };
        case 'md':
        default:
          return {
            height: 'var(--control-height-md)',
            padding: '0 var(--space-4)',
            fontSize: 'var(--font-size-sm)',
            gap: 'var(--space-2)',
          };
      }
    };

    const combinedStyle: React.CSSProperties = {
      display: fullWidth ? 'flex' : 'inline-flex',
      width: fullWidth ? '100%' : 'auto',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--font-sans)',
      fontWeight: 'var(--font-weight-medium)',
      borderRadius: 'var(--radius-md)',
      borderWidth: '1px',
      borderStyle: 'solid',
      cursor: isDisabled ? 'not-allowed' : 'pointer',
      opacity: isDisabled ? 0.6 : 1,
      userSelect: 'none',
      transition:
        'background-color var(--transition-fast), border-color var(--transition-fast), opacity var(--transition-fast)',
      ...getVariantStyle(),
      ...getSizeStyle(),
      ...style,
    };

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        aria-busy={loading ? 'true' : undefined}
        className={`btn ${className}`.trim()}
        style={combinedStyle}
        {...rest}
      >
        {loading && (
          <span
            aria-hidden="true"
            style={{
              display: 'inline-block',
              width: '14px',
              height: '14px',
              border: '2px solid currentColor',
              borderRightColor: 'transparent',
              borderRadius: '50%',
              animation: 'spin 0.75s linear infinite',
            }}
          />
        )}
        {!loading && icon && iconPosition === 'left' && (
          <span aria-hidden="true" style={{ display: 'inline-flex' }}>
            {icon}
          </span>
        )}
        {children && <span>{children}</span>}
        {!loading && icon && iconPosition === 'right' && (
          <span aria-hidden="true" style={{ display: 'inline-flex' }}>
            {icon}
          </span>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';
