import { describe, it, expect } from 'vitest';
import {
  PRIMARY_NAV_ITEMS,
  DEFAULT_VIEW_ID,
  getNavItemConfig,
  isValidViewId,
} from '../../src/renderer/navigation/navigation-config.ts';
import type { NavViewId } from '../../src/renderer/navigation/types.ts';

describe('OpsReport Studio — Navigation Configuration & Contracts', () => {
  it('NAV-01: Registers authoritative navigation items with required properties', () => {
    expect(PRIMARY_NAV_ITEMS).toHaveLength(6);

    const ids = PRIMARY_NAV_ITEMS.map(item => item.id);
    expect(ids).toEqual(['dashboard', 'reports', 'templates', 'stations', 'history', 'settings']);

    for (const item of PRIMARY_NAV_ITEMS) {
      expect(item.id).toBeDefined();
      expect(item.label).toBeTruthy();
      expect(item.description).toBeTruthy();
      expect(item.iconName).toBeDefined();
      expect(['active', 'planned']).toContain(item.status);
    }
  });

  it('NAV-02: Dashboard is the default initial landing view', () => {
    expect(DEFAULT_VIEW_ID).toBe('dashboard');
    const defaultItem = getNavItemConfig(DEFAULT_VIEW_ID);
    expect(defaultItem.id).toBe('dashboard');
    expect(defaultItem.status).toBe('active');
  });

  it('NAV-03: getNavItemConfig returns correct item configuration for known IDs', () => {
    const settingsItem = getNavItemConfig('settings');
    expect(settingsItem.label).toBe('Settings');
    expect(settingsItem.status).toBe('active');

    const reportsItem = getNavItemConfig('reports');
    expect(reportsItem.label).toBe('Reports');
    expect(reportsItem.status).toBe('planned');
    expect(reportsItem.plannedStep).toBe('Step 17 & 18');
  });

  it('NAV-04: getNavItemConfig safely falls back to dashboard configuration for unknown destinations', () => {
    const fallbackItem = getNavItemConfig('unknown_destination' as NavViewId);
    expect(fallbackItem.id).toBe('dashboard');
  });

  it('NAV-05: isValidViewId accurately identifies valid and invalid view IDs', () => {
    expect(isValidViewId('dashboard')).toBe(true);
    expect(isValidViewId('reports')).toBe(true);
    expect(isValidViewId('templates')).toBe(true);
    expect(isValidViewId('stations')).toBe(true);
    expect(isValidViewId('history')).toBe(true);
    expect(isValidViewId('settings')).toBe(true);

    expect(isValidViewId('invalid')).toBe(false);
    expect(isValidViewId('')).toBe(false);
    expect(isValidViewId('admin')).toBe(false);
  });

  it('NAV-06: All planned destinations declare explicit roadmap step alignment', () => {
    const plannedItems = PRIMARY_NAV_ITEMS.filter(item => item.status === 'planned');
    expect(plannedItems.length).toBeGreaterThan(0);

    for (const item of plannedItems) {
      expect(item.plannedStep).toBeDefined();
      expect(item.plannedStep?.startsWith('Step ')).toBe(true);
    }
  });
});
