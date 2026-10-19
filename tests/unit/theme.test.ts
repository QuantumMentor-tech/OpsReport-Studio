import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getStoredThemePreference,
  setStoredThemePreference,
  getSystemTheme,
  THEME_STORAGE_KEY,
} from '../../src/renderer/theme/theme-storage.ts';

const storageMap = new Map<string, string>();
const mockStorage = {
  getItem: (key: string) => storageMap.get(key) ?? null,
  setItem: (key: string, value: string) => storageMap.set(key, value),
  removeItem: (key: string) => storageMap.delete(key),
  clear: () => storageMap.clear(),
  length: 0,
  key: () => null,
};

describe('Theme Context & Preference Persistence', () => {
  beforeEach(() => {
    mockStorage.clear();
    vi.restoreAllMocks();
  });

  it('THM-01: getStoredThemePreference returns default "system" when storage is empty', () => {
    expect(getStoredThemePreference(mockStorage)).toBe('system');
  });

  it('THM-02: getStoredThemePreference returns valid stored preference ("dark" or "light")', () => {
    mockStorage.setItem(THEME_STORAGE_KEY, 'light');
    expect(getStoredThemePreference(mockStorage)).toBe('light');

    mockStorage.setItem(THEME_STORAGE_KEY, 'dark');
    expect(getStoredThemePreference(mockStorage)).toBe('dark');
  });

  it('THM-03: getStoredThemePreference falls back to "system" when corrupted data is in storage', () => {
    mockStorage.setItem(THEME_STORAGE_KEY, 'invalid_neon_mode');
    expect(getStoredThemePreference(mockStorage)).toBe('system');
  });

  it('THM-04: setStoredThemePreference persists user choice to storage', () => {
    setStoredThemePreference('light', mockStorage);
    expect(mockStorage.getItem(THEME_STORAGE_KEY)).toBe('light');

    setStoredThemePreference('dark', mockStorage);
    expect(mockStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('THM-05: getSystemTheme defaults safely in headless environments', () => {
    const theme = getSystemTheme();
    expect(theme === 'dark' || theme === 'light').toBe(true);
  });
});
