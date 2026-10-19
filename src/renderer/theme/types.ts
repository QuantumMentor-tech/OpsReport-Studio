/**
 * OpsReport Studio — Theme Types & Contract Definitions
 *
 * @module renderer/theme/types
 */

/** User-selectable theme options */
export type ThemePreference = 'dark' | 'light' | 'system';

/** Actual computed theme applied to the document element */
export type ResolvedTheme = 'dark' | 'light';

export interface ThemeContextValue {
  /** The saved or selected user preference ('dark' | 'light' | 'system') */
  readonly themePreference: ThemePreference;
  /** The currently active visual appearance ('dark' | 'light') */
  readonly resolvedTheme: ResolvedTheme;
  /** Explicitly set the theme preference */
  readonly setThemePreference: (preference: ThemePreference) => void;
  /** Quick toggle between 'light' and 'dark' */
  readonly toggleTheme: () => void;
}
