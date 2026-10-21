# OpsReport Studio (`stationops-reporter`)

![OpsReport Studio Tech Logo](./OpsReport%20Studio%20Tech%20Logo.png)

**Desktop-Oriented Operational Report-Generation Application**  
*Automating structured operational reporting, security incident documentation, and asset inspections from reusable Excel and Word master templates.*

---

## 1. Project Overview & Current Status

* **Project Identity:** OpsReport Studio (`stationops-reporter`)
* **Target Users:** Control room representatives, facility security supervisors, and operational audit personnel.
* **Current Lifecycle Step:** **Step 19 of 45: Immutable Master Templates, Safe Cloning & Template Versioning**
* **Current Phase:** Phase 4 — Local Data & Configuration Management
* **Status:** Operational Local Desktop Architecture. All 196 unit and smoke tests passing (100% green).

> [!NOTE]
> **PHASE 4: LOCAL DATA & CONFIGURATION MANAGEMENT (COMPLETED TO STEP 19)**  
> OpsReport Studio has implemented a complete local-first storage and persistence foundation: SQLite database schema with migrations 001–004, station list management, report categories, draft session persistence with recovery detection, organized master template vault, Excel/Word template validation, and two-tier master template versioning with dual-layer immutability controls and cryptographic byte-preserving cloning.

---

## 2. Quick Start: Running the Project

OpsReport Studio includes an automated launcher script for Windows: [`run.bat`](./run.bat).

### Option A: Double-Click Launcher (Recommended for Windows)
1. Double-click **`run.bat`** in the project root folder.
2. The launcher will automatically:
   - Check that Node.js (v20+) and npm are installed in your PATH.
   - Detect if `node_modules` is missing and automatically install dependencies (`npm install`).
   - Present an interactive menu where pressing **Enter** (or choosing option `1`) immediately launches the application.

### Option B: Command Line via `run.bat`
```cmd
:: Launch the desktop application in development mode (Default)
run.bat

:: Or pass specific command-line arguments directly:
run.bat dev        :: Start desktop application in development mode
run.bat test       :: Run the complete Vitest automated test suite (196 tests)
run.bat typecheck  :: Run TypeScript compilation check across Node and Web targets
run.bat build      :: Compile and package production bundles
run.bat install    :: Clean reinstall project dependencies
```

### Option C: Standard npm Commands
```bash
# 1. Install dependencies
npm install

# 2. Launch in development mode with Electron and Vite hot reload
npm run dev

# 3. Run automated tests
npm test

# 4. Strict TypeScript type check
npm run typecheck

# 5. Build for production
npm run build
```

---

## 3. Approved Technology Stack

The project implements the decisions established in **Step 5** (`ADR-OPSREPORT-001`), **Step 6** (`ARCH-SPEC-002`), **Step 7** (`ADR-OPSREPORT-002`), **Step 8** (`STRUCT-BLUEPRINT-001`), **Step 13** (`DEC-029`), **Step 17** (`DEC-037`), and **Step 19** (`DEC-041`):

| Layer | Technology | Version | Purpose | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Desktop Host** | Electron | v32.1+ LTS | Native desktop window lifecycle, sandboxing, context isolation | Active |
| **UI Presentation** | React | 18.3+ | Component-based form workflows and reactive operational views | Active |
| **Language** | TypeScript | 5.5+ | End-to-end strict type safety across IPC and domain modules | Active |
| **Bundler & Dev Server**| Vite | 5.4+ | High-speed ESM development server and optimized bundling | Active |
| **Build Integration** | `vite-plugin-electron` | 0.28+ | Dual-compilation of Main, Preload, and Renderer | Active |
| **Test Framework** | Vitest | 2.1+ | Native ESM unit and integration testing (196 tests) | Active |
| **Embedded Database** | `better-sqlite3` | v13.0+ | Local structured metadata, migrations 001–004, sessions & templates | Active |
| **Archive / ZIP Engine** | `PizZip` | v3.3+ | Open XML document inspection, structure analysis, and validation | Active |
| **Document Engines** | `exceljs` / `docxtemplater` | v4.4+ / v3.71+ | Open XML workbook and Word document generation (Verified in Step 7) | Core PoC |

---

## 4. System Prerequisites

* **Operating System:** Windows 10 or Windows 11 (64-bit) certified (`NFR-COMP-01`).
* **Node.js:** v20.x LTS or higher (v20+ certified).
* **Package Manager:** `npm` v10.x or higher.
* **Git:** v2.30+ for version control.

---

## 5. Development & Build Commands Reference

| Command | Purpose | Verification Output |
| :--- | :--- | :--- |
| `run.bat` | Windows interactive desktop application launcher. | Starts dev app or runs tests/builds. |
| `npm run dev` | Starts Vite dev server and launches Electron desktop window with hot reload. | Desktop window loads `http://localhost:5173`. |
| `npm run typecheck` | Strict TypeScript compilation checks across all modules without emitting files. | `tsc --noEmit` exits with code 0. |
| `npm run build` | Compiles TypeScript, bundles React frontend, and packages Electron main and preload scripts. | Outputs to `dist/` and `dist-electron/`. |
| `npm test` | Runs the full Vitest automated unit and integration test suite. | 196 tests pass across 27 suites. |
| `npm run test:smoke`| Executes the foundation startup and configuration smoke test suite. | Runs `tests/smoke/`. |
| `npm run lint` | Runs ESLint across the codebase. | 0 errors, 0 warnings. |
| `npm run format:check`| Verifies code formatting compliance against Prettier rules. | Asserts formatting standards. |
| `npm run format:write`| Automatically reformats source files to project standards. | Formats `.ts`, `.tsx`, `.css`. |

---

## 6. Implemented Features & Architecture (Steps 1–19)

### 6.1 Application Shell & Reactive UI
* **Shell & Layout:** Collapsible sidebar navigation, persistent status footer with IPC connectivity indicators, and accessible view switching.
* **Theme System:** Dark and Light mode support with persistent user preferences in SQLite (`settings` table) and zero-flash startup.
* **Operational Views:**
  * **Station Configuration View:** View, filter, and reorder stations with real-time database persistence.
  * **Templates Catalog View:** Browse reusable templates by category, view format badges, active version IDs, and total version counts.
  * **Report Categories View:** Inspect approved operational categories with report type classifications.
  * **Draft Sessions & Recovery:** Track active report drafts, autosave status, and detect interrupted sessions.

### 6.2 SQLite Persistence & Database Migrations
* Local storage in `%LOCALAPPDATA%\OpsReportStudio\Data\opsreport.db` via `better-sqlite3`.
* Automated sequential migrations:
  * **Migration 001:** Schema version tracking table.
  * **Migration 002:** Core domain entities (`stations`, `report_categories`, `template_metadata`, `app_settings`).
  * **Migration 003:** Report drafting sessions (`report_sessions` and `report_session_snapshots`) with crash recovery support.
  * **Migration 004:** Two-tier template versioning (`template_versions`), sequential version numbers, and active version pointers.

### 6.3 Master Template Vault & Ephemeral Sandboxing
* **Vault Hierarchy:** Strict separation between protected masters (`Templates/`), working scratch files (`Scratch/`), draft staging (`Staging/`), and exports (`Outputs/`).
* **Format & Security Validation:** Multi-stage validation for `.xlsx` and `.docx` templates checking magic bytes, ZIP structure, Open XML package parts, macros, and external relationships.
* **Dual-Barrier Master Immutability:**
  * **Application-level boundary:** Service-layer write prohibitions prevent in-place modification or truncation of files inside the Master Template Vault.
  * **Host filesystem protection:** Accepted master files are marked read-only (`0o444`).
* **Cryptographic SHA-256 Integrity:** Physical files are hashed and verified against SQLite records on demand without executing active document content.
* **Safe Cloning Service:** Copy-first cloning creates verified working copies in `Scratch/` with SHA-256 verification, ensuring master templates remain 100% untouched.

---

## 7. Security Architecture & Sandboxing Model

OpsReport Studio enforces **Defense-in-Depth** security:

1. **Context Isolation:** `contextIsolation: true` strictly enforced on Electron BrowserWindow.
2. **Process Sandboxing:** `sandbox: true` enabled; renderer processes have zero direct access to Node.js or OS APIs.
3. **Restricted Preload API:** Communication between Renderer and Main occurs exclusively through typed IPC bridges exposed on `window.opsreport`.
4. **Content Security Policy (CSP):** Prohibits inline scripts, `eval()`, and external network calls (`connect-src 'self'`).
5. **Vault Protection & Invariant `INV-DAT-006`:** Master templates remain strictly read-only. Generation and processing operate exclusively on independent copies in the ephemeral Scratch sandbox.

---

## 8. Architecture & Requirements Documentation Index

Detailed architectural and requirement specifications reside under `docs/`:

* **Requirements Baseline:** [`docs/requirements/OPSREPORT_STUDIO_REQUIREMENTS_BASELINE.md`](./docs/requirements/OPSREPORT_STUDIO_REQUIREMENTS_BASELINE.md)
* **Requirements Traceability Matrix:** [`docs/requirements/OPSREPORT_STUDIO_REQUIREMENTS_TRACEABILITY.md`](./docs/requirements/OPSREPORT_STUDIO_REQUIREMENTS_TRACEABILITY.md)
* **Decision Register:** [`docs/requirements/OPSREPORT_STUDIO_DECISION_REGISTER.md`](./docs/requirements/OPSREPORT_STUDIO_DECISION_REGISTER.md)
* **Step 19 Implementation Report:** [`docs/development/STEP_19_TEMPLATE_VERSIONING_REPORT.md`](./docs/development/STEP_19_TEMPLATE_VERSIONING_REPORT.md)
* **Application Architecture Specification:** [`docs/architecture/OPSREPORT_STUDIO_APPLICATION_ARCHITECTURE.md`](./docs/architecture/OPSREPORT_STUDIO_APPLICATION_ARCHITECTURE.md)
* **Security Architecture & Threat Model:** [`docs/architecture/OPSREPORT_STUDIO_SECURITY_THREAT_MODEL.md`](./docs/architecture/OPSREPORT_STUDIO_SECURITY_THREAT_MODEL.md)
* **Local Storage Specification:** [`docs/architecture/OPSREPORT_STUDIO_FILE_STORAGE_SPECIFICATION.md`](./docs/architecture/OPSREPORT_STUDIO_FILE_STORAGE_SPECIFICATION.md)
* **Persistence Design Specification:** [`docs/architecture/OPSREPORT_STUDIO_PERSISTENCE_DESIGN.md`](./docs/architecture/OPSREPORT_STUDIO_PERSISTENCE_DESIGN.md)
