/**
 * OpsReport Studio — Navigation Context & State Provider
 *
 * Provides centralized view switching, navigation item inspection, and sidebar
 * layout state to all shell and page components.
 *
 * @module renderer/navigation/NavigationContext
 */

import React, { createContext, useContext, useState, useMemo, useCallback } from 'react';
import type { NavViewId, NavigationContextValue } from './types.ts';
import {
  PRIMARY_NAV_ITEMS,
  DEFAULT_VIEW_ID,
  getNavItemConfig,
  isValidViewId,
} from './navigation-config.ts';

const NavigationContext = createContext<NavigationContextValue | null>(null);

export interface NavigationProviderProps {
  children: React.ReactNode;
  initialView?: NavViewId;
}

export const NavigationProvider: React.FC<NavigationProviderProps> = ({
  children,
  initialView = DEFAULT_VIEW_ID,
}) => {
  const [activeView, setActiveView] = useState<NavViewId>(() => {
    return isValidViewId(initialView) ? initialView : DEFAULT_VIEW_ID;
  });

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);

  const navigateTo = useCallback((viewId: NavViewId) => {
    if (isValidViewId(viewId)) {
      setActiveView(viewId);
    } else {
      // Safe fallback to dashboard on invalid destination
      setActiveView(DEFAULT_VIEW_ID);
    }
  }, []);

  const toggleSidebar = useCallback(() => {
    setIsSidebarCollapsed(prev => !prev);
  }, []);

  const activeItem = useMemo(() => {
    return getNavItemConfig(activeView);
  }, [activeView]);

  const value = useMemo<NavigationContextValue>(
    () => ({
      activeView,
      activeItem,
      navItems: PRIMARY_NAV_ITEMS,
      navigateTo,
      isSidebarCollapsed,
      toggleSidebar,
    }),
    [activeView, activeItem, navigateTo, isSidebarCollapsed, toggleSidebar]
  );

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
};

/**
 * Hook to access navigation context. Throws error if used outside of NavigationProvider.
 */
export function useNavigation(): NavigationContextValue {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return context;
}
