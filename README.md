# OpsReport Studio (`stationops-reporter`)

![OpsReport Studio Tech Logo](./OpsReport%20Studio%20Tech%20Logo.png)

**Desktop-Oriented Operational Report-Generation Application**  
*Automating structured operational reporting, security incident documentation, and asset inspections from reusable Excel and Word master templates.*

---

## 1. Project Overview & Current Status

* **Project Identity:** OpsReport Studio (`stationops-reporter`)
* **Target Users:** Control room representatives, facility security supervisors, and operational audit personnel.
* **Current Lifecycle Step:** **Step 9 of 45: Repository Initialization, Development Environment & Build Configuration**.
* **Current Phase:** Phase 3 — Project Foundation & Application Shell.
* **Status:** Foundation Initialized. Application shell configured with Electron + React 18.3 + TypeScript 5.5 + Vite 5.

> [!NOTE]
> **DEVELOPMENT FOUNDATION PHASE**  
> This repository currently represents the verified development and build foundation. In accordance with the 45-step roadmap, production report generation, template vaults, and database schemas are assigned to upcoming steps (Steps 10 through 27).

---

## 2. Approved Technology Stack

The project foundation implements the decisions established in **Step 5** (`ADR-OPSREPORT-001`), **Step 6** (`ARCH-SPEC-002`), **Step 7** (`ADR-OPSREPORT-002`), and **Step 8** (`STRUCT-BLUEPRINT-001`):

| Layer | Technology | Version | Purpose |
| :--- | :--- | :--- | :--- |
| **Desktop Host** | Electron | v32.1+ LTS | Native desktop window lifecycle, sandboxing, context isolation |
| **UI Presentation** | React | 18.3+ | Component-based form workflows and reactive operational views |
| **Language** | TypeScript | 5.5+ | End-to-end strict type safety across IPC and domain modules |
| **Bundler & Dev Server**| Vite | 5.4+ | High-speed ESM development server and optimized bundling |
| **Build Integration** | `vite-plugin-electron` | 0.28+ | Seamless dual-compilation of Main, Preload, and Renderer |
| **Test Framework** | Vitest | 2.1+ | Native ESM unit and smoke testing |
| **Embedded Database** | `better-sqlite3` | v11+ | Local structured metadata & drafts (To be integrated in Step 10+) |
| **Document Engines** | `exceljs` / `docxtemplater` | v4.4+ / v3.71+ | Open XML workbook and Word document generation (Verified in Step 7) |

---

## 3. Prerequisites & Development Setup

### System Prerequisites
* **Operating System:** Windows 10 or Windows 11 (64-bit) certified (`NFR-COMP-01`).
* **Node.js:** v20.x LTS or higher (v26.8.1 verified).
* **Package Manager:** `npm` v10.x or higher (v11.19.0 verified).
* **Git:** v2.30+ for version control.

### Installation & Initialization
```bash
# 1. Clone or navigate to the project directory
cd "OpsReport Studio (working)"

# 2. Install production and development dependencies
npm install
```

---

## 4. Development & Build Commands

| Command | Purpose | Verification Output |
| :--- | :--- | :--- |
| `npm run dev` | Starts Vite dev server and launches Electron desktop window with hot reload. | Desktop window loads `http://localhost:5173`. |
| `npm run typecheck` | Executes strict TypeScript compilation checks across all modules without emitting files. | `tsc --noEmit` exits with code 0. |
| `npm run build` | Compiles TypeScript, bundles React frontend, and packages Electron main and preload scripts. | Outputs to `dist/` and `dist-electron/`. |
| `npm test` | Runs the automated Vitest test suite. | Executes all unit and smoke tests. |
| `npm run test:smoke`| Executes the foundation startup and configuration smoke test suite. | Runs `tests/smoke/foundation.test.ts`. |
| `npm run format:check`| Checks code formatting compliance against Prettier rules. | Asserts formatting standards. |
| `npm run format:write`| Automatically reformats all source files to project standards. | Formats `.ts`, `.tsx`, `.css`. |

---

## 5. Security Architecture & Sandboxing Model

OpsReport Studio enforces **Defense-in-Depth** security:
* **Context Isolation:** `contextIsolation: true` strictly enforced.
* **Process Sandboxing:** `sandbox: true` enabled; renderer processes have zero direct Node.js API access.
* **Restricted Preload API:** Communication occurs exclusively through `window.opsreport`.
* **Content Security Policy (CSP):** Prohibits inline scripts, `eval()`, and external network calls (`connect-src 'self'`).
* **Copy-First Sandboxing:** Master templates in `%LOCALAPPDATA%\OpsReportStudio\Templates\` remain strictly read-only. Generation operates exclusively on ephemeral scratch copies (`REQ-006`).

---

## 6. Architecture & Requirements Documentation Index

Detailed architectural and requirement specifications reside under `docs/`:

* **Requirements Baseline:** [`docs/requirements/OPSREPORT_STUDIO_REQUIREMENTS_BASELINE.md`](./docs/requirements/OPSREPORT_STUDIO_REQUIREMENTS_BASELINE.md)
* **Requirements Traceability Matrix:** [`docs/requirements/OPSREPORT_STUDIO_REQUIREMENTS_TRACEABILITY.md`](./docs/requirements/OPSREPORT_STUDIO_REQUIREMENTS_TRACEABILITY.md)
* **Decision Register:** [`docs/requirements/OPSREPORT_STUDIO_DECISION_REGISTER.md`](./docs/requirements/OPSREPORT_STUDIO_DECISION_REGISTER.md)
* **Application Architecture Specification:** [`docs/architecture/OPSREPORT_STUDIO_APPLICATION_ARCHITECTURE.md`](./docs/architecture/OPSREPORT_STUDIO_APPLICATION_ARCHITECTURE.md)
* **Module Boundary Contracts:** [`docs/architecture/OPSREPORT_STUDIO_MODULE_CONTRACTS.md`](./docs/architecture/OPSREPORT_STUDIO_MODULE_CONTRACTS.md)
* **Security Architecture & Threat Model:** [`docs/architecture/OPSREPORT_STUDIO_SECURITY_THREAT_MODEL.md`](./docs/architecture/OPSREPORT_STUDIO_SECURITY_THREAT_MODEL.md)
* **Conceptual Data Model:** [`docs/architecture/OPSREPORT_STUDIO_DATA_MODEL_SPECIFICATION.md`](./docs/architecture/OPSREPORT_STUDIO_DATA_MODEL_SPECIFICATION.md)
* **Local Storage Specification:** [`docs/architecture/OPSREPORT_STUDIO_FILE_STORAGE_SPECIFICATION.md`](./docs/architecture/OPSREPORT_STUDIO_FILE_STORAGE_SPECIFICATION.md)
* **Persistence Design Specification:** [`docs/architecture/OPSREPORT_STUDIO_PERSISTENCE_DESIGN.md`](./docs/architecture/OPSREPORT_STUDIO_PERSISTENCE_DESIGN.md)
* **Project Structure Blueprint:** [`docs/architecture/OPSREPORT_STUDIO_PROJECT_STRUCTURE_BLUEPRINT.md`](./docs/architecture/OPSREPORT_STUDIO_PROJECT_STRUCTURE_BLUEPRINT.md)
* **Step 7 PoC Decision Record:** [`docs/architecture/OPSREPORT_STUDIO_DOCUMENT_ENGINE_POC_DECISION.md`](./docs/architecture/OPSREPORT_STUDIO_DOCUMENT_ENGINE_POC_DECISION.md)
