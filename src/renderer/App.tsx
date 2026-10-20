/**
 * OpsReport Studio — Desktop Application Shell & Entry Container
 *
 * Implements the primary desktop shell integrating the design system tokens,
 * theme management, centralized navigation context, and active view switching.
 *
 * Preserves the Phase 3 Foundation verification contract:
 * - Product Identity: "OpsReport Studio"
 * - Startup Status: "OpsReport Studio is initialized."
 * - Roadmap Milestone: "Phase 3 Foundation"
 *
 * @module renderer/App
 */

import React from 'react';
import { ThemeProvider } from './theme/index.ts';
import { NavigationProvider, useNavigation, type NavViewId } from './navigation/index.ts';
import { AppShell } from './components/shell/index.ts';
import {
  DashboardView,
  SettingsView,
  StationsView,
  TemplatesView,
  PlaceholderView,
} from './views/index.ts';

const ViewRouter: React.FC = () => {
  const { activeView, activeItem } = useNavigation();

  switch (activeView) {
    case 'dashboard':
      return <DashboardView />;
    case 'settings':
      return <SettingsView />;
    case 'stations':
      return <StationsView />;
    case 'templates':
      return <TemplatesView />;
    case 'reports':
    case 'history':
    default:
      return <PlaceholderView item={activeItem} />;
  }
};

export interface AppProps {
  initialView?: NavViewId;
}

/**
 * Root Application Container
 *
 * Provides theme context, navigation routing, and the persistent application shell.
 */
export const App: React.FC<AppProps> = ({ initialView = 'dashboard' }) => {
  return (
    <ThemeProvider>
      <NavigationProvider initialView={initialView}>
        <AppShell>
          <ViewRouter />
        </AppShell>
      </NavigationProvider>
    </ThemeProvider>
  );
};
