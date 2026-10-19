/**
 * OpsReport Studio — Theme Storage & System Scheme Detection
 *
 * Provides pure utility functions for reading and writing theme preferences
 * to local storage and detecting host operating system color scheme preferences.
 * Environment-safe across browser DOM, Node.js worker threads, and test runners.
 *
 * @module renderer/theme/theme-storage
 */

import type { ThemePreference, ResolvedTheme } from './types.ts';

export const THEME_STORAGE_KEY = 'opsreport_theme_preference';
export const DEFAULT_PREFERENCE: ThemePreference = 'system';

export interface ThemeStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function getBrowserStorage(): ThemeStorageLike | undefined {
  try {
    if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
      const storage = (globalThis as unknown as { localStorage?: ThemeStorageLike }).localStorage;
      if (storage && typeof storage.getItem === 'function') {
        return storage;
      }
    }
  } catch {
    // Non-blocking fallback if localStorage is restricted
  }
  return undefined;
}

/**
 * Safely reads the stored theme preference from storage or global localStorage.
 */
export const getStoredThemePreference = (customStorage?: ThemeStorageLike): ThemePreference => {
  try {
    const store = customStorage ?? getBrowserStorage();
    if (store) {
      const stored = store.getItem(THEME_STORAGE_KEY);
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        return stored;
      }
    }
  } catch {
    // Non-blocking fallback if storage is restricted
  }
  return DEFAULT_PREFERENCE;
};

/**
 * Safely persists the theme preference to storage or global localStorage.
 */
export const setStoredThemePreference = (
  pref: ThemePreference,
  customStorage?: ThemeStorageLike
): void => {
  try {
    const store = customStorage ?? getBrowserStorage();
    if (store) {
      store.setItem(THEME_STORAGE_KEY, pref);
    }
  } catch {
    // Non-blocking fallback if storage is restricted
  }
};

/**
 * Resolves the system dark mode preference via matchMedia.
 */
export const getSystemTheme = (): ResolvedTheme => {
  try {
    if (typeof globalThis !== 'undefined' && 'matchMedia' in globalThis) {
      const matchFn = (
        globalThis as unknown as { matchMedia?: (query: string) => { matches: boolean } }
      ).matchMedia;
      if (typeof matchFn === 'function') {
        return matchFn('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
      }
    }
  } catch {
    // Non-blocking fallback
  }
  return 'dark'; // Industrial control room baseline default
};
