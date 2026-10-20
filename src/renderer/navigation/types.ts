/**
 * OpsReport Studio — Navigation Types & Contracts
 *
 * Defines the navigation model, view identifiers, and navigation configuration
 * structures for the desktop application shell.
 *
 * @module renderer/navigation/types
 */

export type NavViewId = 'dashboard' | 'reports' | 'templates' | 'stations' | 'history' | 'settings';

export type NavItemStatus = 'active' | 'planned';

export interface NavItemConfig {
  /** Unique stable navigation identifier */
  readonly id: NavViewId;
  /** Human-readable display label */
  readonly label: string;
  /** Accessible description for screen readers and tooltips */
  readonly description: string;
  /** Implementation status in current roadmap */
  readonly status: NavItemStatus;
  /** Roadmap step when this module is scheduled for implementation */
  readonly plannedStep?: string;
  /** Icon identifier for the navigation icon */
  readonly iconName: 'dashboard' | 'reports' | 'templates' | 'stations' | 'history' | 'settings';
}

export interface NavigationContextValue {
  /** Currently active view */
  readonly activeView: NavViewId;
  /** Active navigation item configuration */
  readonly activeItem: NavItemConfig;
  /** Authoritative list of navigation items */
  readonly navItems: readonly NavItemConfig[];
  /** Navigate to a specific view */
  readonly navigateTo: (viewId: NavViewId) => void;
  /** Whether the sidebar is in collapsed icon-only mode */
  readonly isSidebarCollapsed: boolean;
  /** Toggle sidebar expanded/collapsed state */
  readonly toggleSidebar: () => void;
}
