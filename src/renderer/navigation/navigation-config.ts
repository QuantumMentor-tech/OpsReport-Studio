/**
 * OpsReport Studio — Authoritative Navigation Configuration
 *
 * Central repository of primary navigation items, labels, statuses, and roadmap
 * alignment. Prevents duplicate definitions across components.
 *
 * @module renderer/navigation/navigation-config
 */

import type { NavItemConfig, NavViewId } from './types.ts';

export const DEFAULT_VIEW_ID: NavViewId = 'dashboard';

export const PRIMARY_NAV_ITEMS: readonly NavItemConfig[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    description: 'Operational overview, runtime diagnostics, and quick launch',
    status: 'active',
    iconName: 'dashboard',
  },
  {
    id: 'reports',
    label: 'Reports',
    description: 'Standardized operational and security report generation workflows',
    status: 'planned',
    plannedStep: 'Step 17 & 18',
    iconName: 'reports',
  },
  {
    id: 'templates',
    label: 'Templates & Categories',
    description: 'Report category registry and template metadata management',
    status: 'active',
    iconName: 'templates',
  },
  {
    id: 'stations',
    label: 'Stations',
    description: 'Authoritative ordered station configuration and sequence verification',
    status: 'active',
    iconName: 'stations',
  },
  {
    id: 'history',
    label: 'Report History',
    description: 'Generated document archive, export logs, and audit trails',
    status: 'planned',
    plannedStep: 'Step 20',
    iconName: 'history',
  },
  {
    id: 'settings',
    label: 'Settings',
    description: 'Application appearance, runtime environment, and diagnostics',
    status: 'active',
    iconName: 'settings',
  },
] as const;

/**
 * Retrieves configuration for a specific navigation view identifier.
 * Defaults to the dashboard configuration if an unknown ID is provided.
 */
export function getNavItemConfig(viewId: NavViewId): NavItemConfig {
  const item = PRIMARY_NAV_ITEMS.find(nav => nav.id === viewId);
  return item ?? PRIMARY_NAV_ITEMS[0];
}

/**
 * Checks whether a given string is a valid NavViewId.
 */
export function isValidViewId(id: string): id is NavViewId {
  return PRIMARY_NAV_ITEMS.some(nav => nav.id === id);
}
