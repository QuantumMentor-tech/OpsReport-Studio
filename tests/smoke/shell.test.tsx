import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { App } from '../../src/renderer/App.tsx';
import { Sidebar } from '../../src/renderer/components/shell/Sidebar.tsx';
import { AppHeader } from '../../src/renderer/components/shell/AppHeader.tsx';
import { DashboardView } from '../../src/renderer/views/DashboardView.tsx';
import { SettingsView } from '../../src/renderer/views/SettingsView.tsx';
import { PlaceholderView } from '../../src/renderer/views/PlaceholderView.tsx';
import { NavigationProvider } from '../../src/renderer/navigation/NavigationContext.tsx';
import { ThemeProvider } from '../../src/renderer/theme/ThemeContext.tsx';
import { getNavItemConfig } from '../../src/renderer/navigation/navigation-config.ts';

describe('OpsReport Studio — Application Shell & Views Smoke Tests', () => {
  it('SHL-01: Root App renders shell layout, landmarks, and dashboard initial view', () => {
    const markup = renderToStaticMarkup(<App />);

    // Landmarks and Accessible Skip Link
    expect(markup).toContain('Skip to main content');
    expect(markup).toContain('aria-label="Application Sidebar"');
    expect(markup).toContain('role="banner"');
    expect(markup).toContain('id="main-content"');

    // Product branding in sidebar
    expect(markup).toContain('OpsReport Studio');
    expect(markup).toContain('v0.1.0-alpha');

    // Initial Dashboard Landing View verification
    expect(markup).toContain('Welcome to OpsReport Studio');
    expect(markup).toContain('OpsReport Studio is initialized.');
    expect(markup).toContain('Phase 3 Foundation');
  });

  it('SHL-02: Sidebar renders all 6 authoritative navigation items with accessible semantics', () => {
    const markup = renderToStaticMarkup(
      <NavigationProvider initialView="dashboard">
        <Sidebar />
      </NavigationProvider>
    );

    expect(markup).toContain('Dashboard');
    expect(markup).toContain('Reports');
    expect(markup).toContain('Templates');
    expect(markup).toContain('Stations');
    expect(markup).toContain('Report History');
    expect(markup).toContain('Settings');

    // Active state aria-current
    expect(markup).toContain('aria-current="page"');

    // Collapse toggle button
    expect(markup).toContain('Collapse Sidebar');
  });

  it('SHL-03: AppHeader renders current view context and theme toggle control', () => {
    const markup = renderToStaticMarkup(
      <ThemeProvider>
        <NavigationProvider initialView="dashboard">
          <AppHeader />
        </NavigationProvider>
      </ThemeProvider>
    );

    expect(markup).toContain('Dashboard');
    expect(markup).toContain('role="banner"');
    // Theme toggle button with accessible label
    expect(markup).toContain('Current appearance:');
  });

  it('SHL-04: DashboardView renders static report category scope and honest recent activity state', () => {
    const markup = renderToStaticMarkup(
      <NavigationProvider initialView="dashboard">
        <DashboardView />
      </NavigationProvider>
    );

    // Static Scope Overview with all 7 categories
    expect(markup).toContain('Operational Report Scope Overview');
    expect(markup).toContain('Security Incident Reports');
    expect(markup).toContain('Station Light Reports');
    expect(markup).toContain('Fan Reports');
    expect(markup).toContain('Pole Light Reports');
    expect(markup).toContain('Fire Extinguisher Reports');
    expect(markup).toContain('Pillar Reports');
    expect(markup).toContain('Fence Reports');

    // Honest empty state
    expect(markup).toContain('No Recent Reports');
  });

  it('SHL-05: SettingsView renders appearance configuration and desktop environment specs', () => {
    const markup = renderToStaticMarkup(
      <ThemeProvider>
        <NavigationProvider initialView="settings">
          <SettingsView />
        </NavigationProvider>
      </ThemeProvider>
    );

    expect(markup).toContain('Settings &amp; Diagnostics');
    expect(markup).toContain('Display Appearance');
    expect(markup).toContain('Dark Mode (Default)');
    expect(markup).toContain('Light Mode');
    expect(markup).toContain('Follow System');
    expect(markup).toContain('Desktop Runtime &amp; Security Environment');
    expect(markup).toContain('stationops-reporter');
    expect(markup).toContain('Context Isolation: Enabled');
  });

  it('SHL-06: PlaceholderView renders roadmap attribution and return action for planned modules', () => {
    const reportsConfig = getNavItemConfig('reports');
    const markup = renderToStaticMarkup(
      <NavigationProvider initialView="reports">
        <PlaceholderView item={reportsConfig} />
      </NavigationProvider>
    );

    expect(markup).toContain('Reports Module Planned');
    expect(markup).toContain('Scheduled for Step 17 &amp; 18');
    expect(markup).toContain('Return to Dashboard');
  });

  it('SHL-07: Stations navigation view renders active StationsView rather than a placeholder', () => {
    const markup = renderToStaticMarkup(<App initialView="stations" />);

    expect(markup).toContain('Station Management');
    expect(markup).toContain('Authoritative operational station sequence');
    expect(markup).not.toContain('Module Planned');
  });
});
