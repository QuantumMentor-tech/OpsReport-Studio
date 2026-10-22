# OpsReport Studio — Application Shell & Navigation Specification

**Document Identifier:** SHELL-SPEC-001  
**Project ID:** stationops-reporter  
**Approved Product Name:** OpsReport Studio  
**Lifecycle Step:** Step 12 of 45 (Application Shell, Navigation, Dashboard & Shared UI Components)  
**Status:** Authoritative Engineering Specification  
**Last Updated:** 2026-10-20

---

## 1. Overview & Architectural Role

The Application Shell provides the persistent visual frame and navigation infrastructure for OpsReport Studio. It guarantees that future reporting, template vault, station configuration, and settings modules can be introduced without redesigning the primary desktop interface or destabilizing existing layouts.

### Core Principles

1. **Desktop-Optimized Ergonomics:** Clean two-column responsive desktop layout designed for 24/7 control room operators.
2. **Centralized Navigation Contract:** Single authoritative navigation configuration (`PRIMARY_NAV_ITEMS`) governing all view switching, avoiding scattered or duplicated route definitions.
3. **Truthful State Presentation:** Strict differentiation between active features, planned roadmap modules, empty workspaces, and error states. No fabricated metrics, mock counts, or simulated document outputs.
4. **Token-Driven Consistency:** 100% adherence to the Step 11 semantic CSS design tokens (`tokens.css`), ensuring seamless Dark and Light theme adaptation with zero hard-coded palette values.
5. **Accessibility-First Implementation:** Native HTML5 semantic landmarks (`<aside>`, `<header>`, `<main>`, `<nav>`), skip-to-content keyboard links, `aria-current="page"` indicators, and high-contrast visible focus rings.

---

## 2. Shell Layout Architecture

The shell is composed of three primary structural regions coordinated by `AppShell`:

```
+-----------------------------------------------------------------------------------+
|  Skip to Main Content Link (Keyboard Accessible: Tab navigation)                  |
+------------------------------------+----------------------------------------------+
|                                    |  AppHeader                                   |
|  Sidebar                           |  [Sidebar Toggle] [View Title]  [ThemeToggle]|
|  - Brand Logo & Version Info       +----------------------------------------------+
|  - Authoritative Navigation Nav    |  Main Content Surface (<main id="main-content">)|
|    * Dashboard (Active)            |                                              |
|    * Reports (Planned Step 17)     |  Active View:                                |
|    * Templates (Planned Step 14)   |  - DashboardView (Default)                   |
|    * Stations (Planned Step 16)    |  - SettingsView                              |
|    * History (Planned Step 20)     |  - PlaceholderView (Planned destinations)    |
|    * Settings (Active)             |                                              |
|  - Collapse/Expand Action Trigger  |                                              |
+------------------------------------+----------------------------------------------+
```

### Component Responsibilities

| Component                | File Path                                       | Key Responsibilities                                                                                                        |
| :----------------------- | :---------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------- |
| **`AppShell`**           | `src/renderer/components/shell/AppShell.tsx`    | Master frame container, keyboard skip-link, landmark layout coordination, full viewport height management.                  |
| **`Sidebar`**            | `src/renderer/components/shell/Sidebar.tsx`     | Brand banner, primary navigation list, active destination indicators, roadmap planned badges, collapse toggle.              |
| **`AppHeader`**          | `src/renderer/components/shell/AppHeader.tsx`   | View breadcrumb/title, sidebar toggle trigger, global actions, and accessible `ThemeToggle`.                                |
| **`NavigationProvider`** | `src/renderer/navigation/NavigationContext.tsx` | Centralized state management for `activeView`, `isSidebarCollapsed`, safe destination fallback, and `useNavigation()` hook. |

---

## 3. Authoritative Navigation Model

Primary navigation items are defined in `src/renderer/navigation/navigation-config.ts`. All destinations declare their identifier, display label, icon, accessible description, operational status (`active` vs. `planned`), and planned roadmap milestone.

### Primary Destinations Registry

```typescript
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
    label: 'Templates',
    description: 'Master Excel and Word template vault and field mapping',
    status: 'planned',
    plannedStep: 'Step 14 & 15',
    iconName: 'templates',
  },
  {
    id: 'stations',
    label: 'Stations',
    description: 'Authoritative ordered station configuration and sequence verification',
    status: 'planned',
    plannedStep: 'Step 16',
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
```

### Navigation Behavior & Safety Invariants

1. **Initial Destination:** The shell unconditionally boots to `dashboard`.
2. **Invalid Destination Fallback:** Navigating to an unrecognized string automatically falls back to `dashboard` without runtime crashes.
3. **Active State Representation:** The active destination is indicated with `aria-current="page"`, a distinct background token (`--color-bg-selected`), and accent coloration (`--color-action-primary`).
4. **Planned Feature Protection:** Planned destinations render an honest `PlaceholderView` explaining the assigned roadmap step and providing a "Return to Dashboard" action. No fake records or simulated exports are permitted.

---

## 4. Shared UI Component Primitives

The shell establishes reusable component primitives in `src/renderer/components/common/`:

### 4.1 Button (`Button.tsx`)

- **Variants:** `primary`, `secondary`, `ghost`, `outline`, `danger`.
- **Sizes:** `sm` (32px), `md` (40px), `lg` (48px).
- **Accessibility:** Semantic `<button>`, focus-visible ring (`--color-focus-ring`), `aria-busy` indicator during asynchronous operations, disabled opacity and pointer event prevention.

### 4.2 Card (`Card.tsx`)

- **Variants:** `default` (`--shadow-sm`, border), `subtle` (`--color-bg-subtle`), `outlined` (border, no shadow).
- **Slots:** Structured `title`, `subtitle`, `headerAction`, content children, and `footer`.

### 4.3 Badge (`Badge.tsx`)

- **Variants:** `success`, `warning`, `error`, `info`, `neutral`.
- **Tokens:** Fully integrated with Step 11 semantic feedback tokens (`--color-state-*-bg`, `--color-state-*`).

### 4.4 EmptyState (`EmptyState.tsx`)

Strictly adheres to Section 8.4 empty-state differentiation:

- `'no-data'`: Workspace is valid but currently empty.
- `'planned'`: Feature scheduled for subsequent roadmap delivery.
- `'error'`: Subsystem or data operation failed.
- `'config-missing'`: Prerequisite configuration or station list missing.

### 4.5 PageHeader (`PageHeader.tsx`)

Standardized header pattern across all views:

- Title (`text-h2`), description (`text-body-sm`), optional status badge, breadcrumb trail, and action buttons.

---

## 5. View Specifications

### 5.1 DashboardView (`src/renderer/views/DashboardView.tsx`)

1. **Welcome Header:** Displays application purpose: _"Manage reusable report templates and prepare operational reports from a single workspace."_
2. **Foundation Runtime Diagnostics Card:**
   - Preserves exact strings verified by `foundation.test.ts` (SMK-07):
     - `"OpsReport Studio is initialized."`
     - `"Phase 3 Foundation"`
   - Preload bridge status, Context Isolation indicator, and Main Process ping feedback.
3. **Operational Report Scope Overview:**
   - Authoritative static reference of the 7 standardized operational report categories:
     1. Security Incident Reports (Word `.docx`)
     2. Station Light Reports (Excel `.xlsx`)
     3. Fan Reports (Excel `.xlsx`)
     4. Pole Light Reports (Excel `.xlsx`)
     5. Fire Extinguisher Reports (Excel `.xlsx`)
     6. Pillar Reports (Excel `.xlsx`)
     7. Fence Reports (Excel `.xlsx`)
   - Explicitly labeled as a static scope reference to prevent user confusion with active template configurations.
4. **Recent Report Activity:**
   - Employs `EmptyState type="no-data"` stating that local reporting history will be persisted upon integration of SQLite (Step 13) and Document Generation (Step 17).

### 5.2 SettingsView (`src/renderer/views/SettingsView.tsx`)

1. **Display Appearance Card:** Functional interactive theme switcher (Dark, Light, Follow System) integrated directly with `ThemeProvider`.
2. **Desktop Runtime Diagnostics Card:** Real-time inspection of Electron version, Node.js version, platform architecture, sandbox status, and context isolation.
3. **Roadmap Alignment Card:** Explains Step 12 position and upcoming Step 13 scope boundaries.

### 5.3 PlaceholderView (`src/renderer/views/PlaceholderView.tsx`)

Rendered for `reports`, `templates`, `stations`, and `history`:

- Details roadmap assignment, explains upcoming capabilities, and includes a button to navigate back to the dashboard.

---

## 6. How Future Pages Should Integrate with the Shell

To introduce a new screen in upcoming roadmap steps (e.g. Station Configuration in Step 16):

1. **Create the View Component:**
   Place the view under `src/renderer/views/` (e.g., `StationsView.tsx`).
   Use `PageHeader` for consistent headers, `Card` for content surfaces, and `Button` for actions.
2. **Update Navigation Config:**
   In `src/renderer/navigation/navigation-config.ts`, transition the item's `status` from `'planned'` to `'active'`.
3. **Update View Router:**
   In `src/renderer/App.tsx`, route `activeView === 'stations'` to `<StationsView />`.
4. **Zero Layout Rework Required:**
   The sidebar, header, theme toggle, and responsive container remain unchanged.

---

## 7. Verification & Automated Testing

| Test Command           | Coverage                                                             |
| :--------------------- | :------------------------------------------------------------------- |
| `npm run typecheck`    | Validates strict TypeScript compilation across Node and Web targets. |
| `npm run lint`         | ESLint static analysis across all shell and component files.         |
| `npm run format:check` | Prettier formatting verification.                                    |
| `npm test`             | Complete Vitest test suite (52 tests across 9 suites).               |
| `npm run test:smoke`   | Shell landmarks, foundation strings, and design system tokens.       |
| `npm run build`        | Full production build of Vite web bundle and Electron main/preload.  |
