# OpsReport Studio — Authoritative Visual Design System

**Document Identifier:** SPEC-DS-001  
**Project ID:** stationops-reporter  
**Approved Product Name:** OpsReport Studio  
**Lifecycle Step:** Step 11 of 45 (Design System, Typography, Color Tokens & Dark/Light Themes)  
**Lifecycle Phase:** Phase 3 — Project Foundation & Application Shell  
**Date:** 2026-10-19  
**Status:** Authoritative Visual Design Specification  
**Target Audience:** UI/UX Engineers, Frontend Architects & AI Coding Agents  

---

## 1. Visual Design Principles & Operational Philosophy

OpsReport Studio is a specialized desktop report-generation tool designed for industrial control rooms, security incident centers, and facility inspection audit desks.

The interface must adhere to four foundational principles:
1. **Calm, High-Clarity Aesthetic:** Control room personnel work extended 8-to-12-hour shifts. The UI avoids garish saturated backgrounds, loud gaming-style gradients, or aggressive animations. Visual hierarchy is clean, structured, and legible under varying ambient lighting conditions.
2. **Deterministic Functional Styling:** Styles describe operational purpose rather than decorative flourish. Every color token maps to a specific role (surface, border, text, interactive action, semantic state).
3. **WCAG 2.2 Level AA Accessibility:** Minimum 4.5:1 text contrast for body text, 3:1 for large headings and graphical UI boundaries, prominent keyboard focus rings (`--color-focus-ring`), and zero reliance on color alone to communicate system state.
4. **Systematic Tokenization:** No hard-coded hex codes, ad-hoc font sizes, or arbitrary pixel margins are permitted in component source code. All styling must consume the authoritative CSS custom properties defined in `src/renderer/styles/tokens.css`.

---

## 2. Color System & Semantic Roles

Colors are partitioned into reusable semantic roles across two primary appearance themes: **Dark Mode** (default for control consoles) and **Light Mode** (for high-glare daytime audit workstations).

### 2.1 Complete Semantic Color Palette Matrix

| Semantic Token Role | CSS Variable Name | Dark Theme Value | Light Theme Value | WCAG Contrast (Min 4.5:1 / 3:1) |
| :--- | :--- | :--- | :--- | :--- |
| **App Background** | `--color-bg-app` | `#0b1120` | `#f8fafc` | Base Surface |
| **Panel Surface** | `--color-bg-surface` | `#131d31` | `#ffffff` | Primary Surface |
| **Elevated Card** | `--color-bg-card` | `#1a263e` | `#f1f5f9` | Elevated Container |
| **Subtle / Secondary**| `--color-bg-subtle` | `#202e49` | `#e2e8f0` | Subtle Fill |
| **Input Background** | `--color-bg-input` | `#0e1726` | `#ffffff` | Input Control |
| **Hover Surface** | `--color-bg-hover` | `#263654` | `#e2e8f0` | Hover Interaction |
| **Active Surface** | `--color-bg-active` | `#2e4165` | `#cbd5e1` | Pressed State |
| **Selected Surface** | `--color-bg-selected` | `#1e3a5f` | `#e0f2fe` | Selected Item |
| **Primary Text** | `--color-text-primary` | `#f8fafc` | `#0f172a` | **17.5:1** (Dark) / **18.5:1** (Light) (AAA) |
| **Secondary Text** | `--color-text-secondary`| `#cbd5e1` | `#334155` | **12.6:1** (Dark) / **9.2:1** (Light) (AAA) |
| **Muted / Tertiary** | `--color-text-muted` | `#94a3b8` | `#64748b` | **7.3:1** (Dark) / **4.5:1** (Light) (AA) |
| **Inverse Text** | `--color-text-inverse` | `#0b1120` | `#f8fafc` | High contrast on inverse fills |
| **Placeholder** | `--color-text-placeholder`| `#64748b`| `#94a3b8` | Distinguishable from inputs |
| **Default Border** | `--color-border-default`| `#334155` | `#cbd5e1` | **3.1:1** Non-text contrast (AA) |
| **Subtle Border** | `--color-border-subtle` | `#1e293b` | `#e2e8f0` | Card & Section Dividers |
| **Strong Border** | `--color-border-strong` | `#475569` | `#64748b` | Active / Focus Outlines |
| **Keyboard Focus Ring**| `--color-focus-ring` | `#38bdf8` | `#0284c7` | High-visibility focus indicator |
| **Primary Action** | `--color-action-primary`| `#0284c7` | `#0284c7` | Core interactive buttons |
| **Primary Hover** | `--color-action-primary-hover`|`#0369a1`|`#0369a1` | Action hover feedback |
| **Primary Action Text**| `--color-action-primary-text`|`#ffffff`|`#ffffff` | Button label contrast |
| **Success Text** | `--color-state-success` | `#34d399` | `#065f46` | **9.8:1** (Dark) / **7.0:1** (Light) |
| **Success Background**| `--color-state-success-bg`|`rgba(6,78,59,0.4)`|`#ecfdf5`| Subtle status badge background |
| **Warning Text** | `--color-state-warning` | `#fbbf24` | `#92400e` | **11.5:1** (Dark) / **6.1:1** (Light) |
| **Warning Background**| `--color-state-warning-bg`|`rgba(120,53,15,0.4)`|`#fffbeb`| Subtle status badge background |
| **Error Text** | `--color-state-error` | `#f87171` | `#991b1b` | **7.2:1** (Dark) / **7.7:1** (Light) |
| **Error Background** | `--color-state-error-bg` |`rgba(127,29,29,0.4)`|`#fef2f2`| Subtle status badge background |
| **Info Text** | `--color-state-info` | `#38bdf8` | `#075985` | **10.3:1** (Dark) / **7.5:1** (Light) |
| **Info Background** | `--color-state-info-bg` |`rgba(12,74,110,0.4)`|`#f0f9ff`| Subtle status badge background |

---

## 3. Typography Scale & Hierarchy

OpsReport Studio employs a native system typography stack to maximize performance, ensure crisp subpixel antialiasing on Windows ClearType displays, and avoid external font network dependencies.

### 3.1 Font Stacks
* **Prose & UI Interface (`--font-sans`):** `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`
* **Tabular Code & Identifiers (`--font-mono`):** `'JetBrains Mono', 'Cascadia Code', Consolas, 'Courier New', monospace`

### 3.2 Type Hierarchy

| Scale Token | Font Size | Weight | Line Height | CSS Utility Class | Intended Usage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `--font-size-3xl` | `1.875rem` (30px) | Bold (700) | `1.25` | `.text-h1` | Top-level window / screen titles |
| `--font-size-2xl` | `1.5rem` (24px) | Bold (700) | `1.25` | `.text-h2` | Major modal & section headers |
| `--font-size-xl` | `1.25rem` (20px) | Semibold (600) | `1.5` | `.text-h3` | Card headers, table titles |
| `--font-size-lg` | `1.125rem` (18px) | Medium (500) | `1.5` | — | High-emphasis summaries |
| `--font-size-base`| `1rem` (16px) | Regular (400) | `1.5` | `.text-body` | Primary form labels, body text |
| `--font-size-sm` | `0.875rem` (14px) | Regular (400) | `1.5` | `.text-body-sm` | Secondary table cells, metadata |
| `--font-size-xs` | `0.75rem` (12px) | Medium (500) | `1.5` | `.text-caption` | Timestamp badges, micro-captions |

---

## 4. Spacing, Radii & Control Sizing

An 8pt harmonic grid governs layout rhythm, margins, and padding.

### 4.1 Spacing Scale
* `--space-0-5`: `0.125rem` (2px) — Micro-alignments & border offsets
* `--space-1`: `0.25rem` (4px) — Tight badge & icon padding
* `--space-2`: `0.5rem` (8px) — Standard control gap & internal padding
* `--space-3`: `0.75rem` (12px) — Table cell padding & sub-item spacing
* `--space-4`: `1rem` (16px) — Standard component padding
* `--space-5`: `1.25rem` (20px) — Panel margin
* `--space-6`: `1.5rem` (24px) — Card padding & section separation
* `--space-8`: `2rem` (32px) — Major layout gaps
* `--space-10`: `2.5rem` (40px) — Modal gutters
* `--space-12`: `3rem` (48px) — Screen edge margins

### 4.2 Standard Control Heights
* `--control-height-sm`: `32px` — Compact toolbar buttons & icon toggles
* `--control-height-md`: `40px` — Primary form inputs & standard action buttons
* `--control-height-lg`: `48px` — Major modal action buttons & drop-targets

### 4.3 Border Radii
* `--radius-none`: `0px` — Clean square edges (tables, tabs)
* `--radius-sm`: `4px` — Code snippets, small badges, input borders
* `--radius-md`: `8px` — Buttons, cards, dropdowns
* `--radius-lg`: `12px` — Main container panels, dialog windows
* `--radius-full`: `9999px` — Pill tags, circular avatar buttons

---

## 5. Interaction States & Accessibility Safeguards

### 5.1 Focus Visibility
All interactive elements enforce `:focus-visible` using high-contrast sky/blue rings:
```css
:focus-visible {
  outline: var(--focus-ring-width) solid var(--color-focus-ring);
  outline-offset: var(--focus-ring-offset);
}
```

### 5.2 Reduced Motion Overrides
When `prefers-reduced-motion: reduce` is detected in the operating system:
```css
@media (prefers-reduced-motion: reduce) {
  :root {
    --transition-fast: 0ms !important;
    --transition-normal: 0ms !important;
  }
}
```
Theme toggling, hover transitions, and layout adjustments occur instantly with zero visual distraction.

### 5.3 Non-Color-Only Indicators
Status badges and validation messages pair color fills with text labels and semantic icons (e.g., checkmarks, warning triangles, error octagons), ensuring full compliance for colorblind operators.

---

## 6. Rules for Extending the Design System

Future roadmap steps (Step 12 through Step 45) must follow these extension rules:
1. **Never Introduce Raw Hex Codes in Components:** Reference `var(--color-...)` tokens exclusively.
2. **Never Invent Component-Local Font Sizes:** Use `--font-size-sm`, `--font-size-base`, etc.
3. **Preserve High-Density Form Ergonomics:** Standard table row height is 36px; form input height is 40px (`--control-height-md`).
4. **Theme Synchronization:** Whenever a new semantic role is introduced, both `[data-theme='dark']` and `[data-theme='light']` definitions must be authored simultaneously.
