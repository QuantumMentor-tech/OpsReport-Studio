import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

/**
 * Calculates the relative luminance of an sRGB hex color according to WCAG 2.2 guidelines.
 */
function getLuminance(hex: string): number {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255;

  const a = [r, g, b].map(v => {
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });

  return a[0]! * 0.2126 + a[1]! * 0.7152 + a[2]! * 0.0722;
}

/**
 * Calculates the contrast ratio between two hex colors according to WCAG 2.2.
 */
function getContrastRatio(hex1: string, hex2: string): number {
  const lum1 = getLuminance(hex1);
  const lum2 = getLuminance(hex2);
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
}

describe('Design System Tokens & Accessibility Standards', () => {
  const tokensPath = path.join(projectRoot, 'src/renderer/styles/tokens.css');
  const tokensCss = fs.readFileSync(tokensPath, 'utf8');

  it('DS-01: Verifies tokens.css exists and defines shared scales', () => {
    expect(fs.existsSync(tokensPath)).toBe(true);

    // Typography scale
    expect(tokensCss).toContain('--font-size-xs:');
    expect(tokensCss).toContain('--font-size-sm:');
    expect(tokensCss).toContain('--font-size-base:');
    expect(tokensCss).toContain('--font-size-lg:');
    expect(tokensCss).toContain('--font-size-xl:');
    expect(tokensCss).toContain('--font-size-2xl:');
    expect(tokensCss).toContain('--font-size-3xl:');

    // Spacing scale
    expect(tokensCss).toContain('--space-1:');
    expect(tokensCss).toContain('--space-2:');
    expect(tokensCss).toContain('--space-4:');
    expect(tokensCss).toContain('--space-8:');
    expect(tokensCss).toContain('--space-12:');

    // Radii
    expect(tokensCss).toContain('--radius-sm:');
    expect(tokensCss).toContain('--radius-md:');
    expect(tokensCss).toContain('--radius-lg:');
  });

  it('DS-02: Verifies dark theme palette defines all required semantic roles', () => {
    expect(tokensCss).toContain('--color-bg-app: #0b1120');
    expect(tokensCss).toContain('--color-bg-surface: #131d31');
    expect(tokensCss).toContain('--color-bg-card: #1a263e');
    expect(tokensCss).toContain('--color-text-primary: #f8fafc');
    expect(tokensCss).toContain('--color-text-secondary: #cbd5e1');
    expect(tokensCss).toContain('--color-text-muted: #94a3b8');
    expect(tokensCss).toContain('--color-border-default: #334155');
    expect(tokensCss).toContain('--color-border-focus: #38bdf8');
    expect(tokensCss).toContain('--color-action-primary: #0284c7');
    expect(tokensCss).toContain('--color-state-success: #34d399');
    expect(tokensCss).toContain('--color-state-warning: #fbbf24');
    expect(tokensCss).toContain('--color-state-error: #f87171');
    expect(tokensCss).toContain('--color-state-info: #38bdf8');
  });

  it('DS-03: Verifies light theme palette defines all corresponding semantic roles', () => {
    expect(tokensCss).toContain("[data-theme='light']");
    expect(tokensCss).toContain('--color-bg-app: #f8fafc');
    expect(tokensCss).toContain('--color-bg-surface: #ffffff');
    expect(tokensCss).toContain('--color-bg-card: #f1f5f9');
    expect(tokensCss).toContain('--color-text-primary: #0f172a');
    expect(tokensCss).toContain('--color-text-secondary: #334155');
    expect(tokensCss).toContain('--color-text-muted: #64748b');
    expect(tokensCss).toContain('--color-border-default: #cbd5e1');
    expect(tokensCss).toContain('--color-border-focus: #0284c7');
    expect(tokensCss).toContain('--color-state-success: #065f46');
    expect(tokensCss).toContain('--color-state-warning: #92400e');
    expect(tokensCss).toContain('--color-state-error: #991b1b');
    expect(tokensCss).toContain('--color-state-info: #075985');
  });

  it('DS-04: Asserts WCAG 2.2 AA text contrast in Dark Theme (>= 4.5:1)', () => {
    const bgDark = '#0b1120';
    const textPrimaryDark = '#f8fafc';
    const textSecondaryDark = '#cbd5e1';
    const stateSuccessDark = '#34d399';
    const stateWarningDark = '#fbbf24';
    const stateErrorDark = '#f87171';

    expect(getContrastRatio(textPrimaryDark, bgDark)).toBeGreaterThanOrEqual(4.5);
    expect(getContrastRatio(textSecondaryDark, bgDark)).toBeGreaterThanOrEqual(4.5);
    expect(getContrastRatio(stateSuccessDark, bgDark)).toBeGreaterThanOrEqual(4.5);
    expect(getContrastRatio(stateWarningDark, bgDark)).toBeGreaterThanOrEqual(4.5);
    expect(getContrastRatio(stateErrorDark, bgDark)).toBeGreaterThanOrEqual(4.5);
  });

  it('DS-05: Asserts WCAG 2.2 AA text contrast in Light Theme (>= 4.5:1)', () => {
    const bgLight = '#ffffff';
    const textPrimaryLight = '#0f172a';
    const textSecondaryLight = '#334155';
    const textMutedLight = '#64748b';
    const stateSuccessLight = '#065f46';
    const stateWarningLight = '#92400e';
    const stateErrorLight = '#991b1b';

    expect(getContrastRatio(textPrimaryLight, bgLight)).toBeGreaterThanOrEqual(4.5);
    expect(getContrastRatio(textSecondaryLight, bgLight)).toBeGreaterThanOrEqual(4.5);
    expect(getContrastRatio(textMutedLight, bgLight)).toBeGreaterThanOrEqual(4.5);
    expect(getContrastRatio(stateSuccessLight, bgLight)).toBeGreaterThanOrEqual(4.5);
    expect(getContrastRatio(stateWarningLight, bgLight)).toBeGreaterThanOrEqual(4.5);
    expect(getContrastRatio(stateErrorLight, bgLight)).toBeGreaterThanOrEqual(4.5);
  });

  it('DS-06: Asserts accessibility reduced-motion overrides are present', () => {
    expect(tokensCss).toContain('@media (prefers-reduced-motion: reduce)');
    expect(tokensCss).toContain('--transition-fast: 0ms !important;');
  });
});
