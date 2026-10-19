/**
 * OpsReport Studio — Authoritative Theme Provider & Context
 *
 * Manages active application appearance (Dark / Light / System), handles persistent
 * preference storage in localStorage, and applies semantic tokens via data-theme attribute.
 *
 * @module renderer/theme/ThemeContext
 */

import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import type { ThemePreference, ResolvedTheme, ThemeContextValue } from './types.ts';

import {
  getStoredThemePreference,
  setStoredThemePreference,
  getSystemTheme,
} from './theme-storage.ts';

export {
  getStoredThemePreference,
  setStoredThemePreference,
  getSystemTheme,
  THEME_STORAGE_KEY,
  DEFAULT_PREFERENCE,
} from './theme-storage.ts';

export const ThemeContext = createContext<ThemeContextValue | null>(null);

interface ThemeProviderProps {
  children: React.ReactNode;
  initialPreference?: ThemePreference;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children, initialPreference }) => {
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>(() => {
    return initialPreference ?? getStoredThemePreference();
  });

  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => getSystemTheme());

  // Listen to OS system color scheme changes when themePreference is 'system'
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
    const handleChange = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? 'light' : 'dark');
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    } else if (mediaQuery.addListener) {
      // Legacy browsers / webview compatibility
      mediaQuery.addListener(handleChange);
      return () => mediaQuery.removeListener(handleChange);
    }
  }, []);

  const resolvedTheme: ResolvedTheme = useMemo(() => {
    if (themePreference === 'system') {
      return systemTheme;
    }
    return themePreference;
  }, [themePreference, systemTheme]);

  // Synchronize the DOM data-theme attribute and color-scheme style
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', resolvedTheme);
      document.documentElement.style.colorScheme = resolvedTheme;
    }
  }, [resolvedTheme]);

  const setThemePreference = useCallback((pref: ThemePreference) => {
    setThemePreferenceState(pref);
    setStoredThemePreference(pref);
  }, []);

  const toggleTheme = useCallback(() => {
    // Cycling toggles between explicit dark and light modes
    const next = resolvedTheme === 'dark' ? 'light' : 'dark';
    setThemePreference(next);
  }, [resolvedTheme, setThemePreference]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      themePreference,
      resolvedTheme,
      setThemePreference,
      toggleTheme,
    }),
    [themePreference, resolvedTheme, setThemePreference, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

/**
 * Custom hook providing access to the authoritative theme context.
 */
export const useTheme = (): ThemeContextValue => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within an enclosing ThemeProvider');
  }
  return context;
};
