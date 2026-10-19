# OpsReport Studio — Project Structure Blueprint

**Document Identifier:** STRUCT-BLUEPRINT-001  
**Project ID:** stationops-reporter  
**Approved Product Name:** OpsReport Studio  
**Lifecycle Step:** Step 8 of 45 (Local Data Model, File Storage Strategy & Project Structure Design)  
**Status:** Authoritative Target Structure Blueprint  
**Last Updated:** 2026-10-19  

> [!IMPORTANT]
> **TARGET DESIGN BLUEPRINT ONLY — NOT AN ACTIVE SCAFFOLDING INSTRUCTION**  
> This document specifies the proposed directory structure, module placement, build targets, and separation boundaries for **Step 9: Repository Initialization, Development Environment & Build Configuration**. It does NOT initialize folders, create package manifests, or scaffold files in the current step.

---

## 1. Current Workspace Audit (Pre-Initialization State)

An audit of the actual workspace root confirms that the project remains in the specification and planning phase:
* **Root Files:** `OpsReport Studio Tech Logo.png` (Preserved intact).
* **Existing Directories:**
  * `docs/requirements/` — Requirements baseline, catalog, dictionary, station contracts, and traceability matrix.
  * `docs/architecture/` — Technology evaluations, ADRs, module contracts, threat models, and PoC results.
  * `poc/step-07-document-engines/` — Isolated Step 7 document engine benchmark harness.
* **Production Code Status:** Zero production application code, root `package.json`, or build scripts exist.

---

## 2. Proposed Production Project Directory Tree (Target for Step 9)

```
OpsReport Studio (working)/
├── .github/                         # Continuous Integration workflows
│   └── workflows/
│       ├── test.yml                 # Automated Vitest unit & integration test runner
│       └── build.yml                # Electron packaging & artifact build pipeline
├── assets/                          # Static application brand assets
│   ├── icons/                       # Application icons (.ico, .png, .icns)
│   └── OpsReport Studio Tech Logo.png # Official project logo (Preserved)
├── docs/                            # Authoritative lifecycle documentation
│   ├── architecture/                # Architecture specifications, ADRs, & test plans
│   └── requirements/                # Product requirements baseline & traceability
├── poc/                             # Disposable historical PoC harnesses (Isolated)
│   └── step-07-document-engines/    # Step 7 benchmark harness (Preserved isolated)
├── src/                             # Production TypeScript Source Tree
│   ├── main/                        # Electron Main Process (Trusted Zone 2)
│   │   ├── index.ts                 # Main process entry point & window lifecycle
│   │   ├── ipc/                     # Strongly-typed IPC handlers (MOD-02)
│   │   ├── worker/                  # Worker thread pool coordinator
│   │   └── app-menu.ts              # Native application menu
│   ├── preload/                     # Security Preload Bridge (Zone 1 / Zone 2 Boundary)
│   │   ├── index.ts                 # contextBridge.exposeInMainWorld ('opsreport')
│   │   └── schema-guards.ts         # IPC parameter validation schemas
│   ├── renderer/                    # Sandboxed React 18.3+ UI (Untrusted Zone 1)
│   │   ├── index.html               # Main application HTML shell with strict CSP
│   │   ├── main.tsx                 # React DOM mount entry point
│   │   ├── App.tsx                  # Root layout & routing coordinator
│   │   ├── components/              # Reusable UI component library (MOD-01)
│   │   │   ├── forms/               # Structured form controls (REQ-007)
│   │   │   ├── station-grid/        # Authoritative station row tables (REQ-008)
│   │   │   ├── catalog/             # Report category cards (REQ-001)
│   │   │   ├── feedback/            # Toast notifications & modal alerts (REQ-012)
│   │   │   └── theme/               # Dark/Light appearance switcher (REQ-011)
│   │   ├── views/                   # Full-screen report workflow views
│   │   ├── store/                   # Client state management (Zustand / Context)
│   │   └── styles/                  # Semantic CSS design tokens & CSS modules
│   ├── worker/                      # Headless Document Processing Engine (Zone 3)
│   │   ├── document-worker.ts       # Worker thread entry point (MOD-08)
│   │   ├── excel-engine.ts          # ExcelJS Open XML manipulation engine
│   │   └── word-engine.ts           # Docxtemplater + PizZip split-run engine
│   ├── domain/                      # Pure Business Logic & Domain Models
│   │   ├── categories/              # 7 report category schemas & rules (MOD-03)
│   │   ├── fields/                  # Field dictionary validators (MOD-03)
│   │   ├── stations/                # Station sequence domain invariants (MOD-04)
│   │   └── mappings/                # Template coordinate mapping domain (MOD-07)
│   ├── storage/                     # Persistence & Filesystem Boundary
│   │   ├── database/                # SQLite connection & repository layer (MOD-09)
│   │   │   ├── connection.ts        # better-sqlite3 WAL connection manager
│   │   │   ├── migrations/          # Versioned SQL migration scripts (user_version)
│   │   │   └── repositories/        # Typed repositories (Station, Template, Draft)
│   │   ├── vault/                   # Template Vault file manager (MOD-10)
│   │   └── file-manager/            # Scratch copy creation & atomic exporter (MOD-10)
│   ├── infrastructure/              # Cross-Cutting Infrastructure
│   │   ├── logging/                 # Centralized sanitized logging (MOD-12)
│   │   └── platform/                # Windows OS shell & native dialogs (MOD-13)
│   └── shared/                      # Shared Types & Contracts (Universal)
│       ├── types/                   # TypeScript DTOs, entity models, category enums
│       ├── contracts/               # Module boundary interfaces & error contracts
│       └── constants/               # System constants & error codes
├── tests/                           # Automated Verification Test Suites
│   ├── unit/                        # Vitest unit tests (Domain, UI, Logging)
│   ├── integration/                 # SQLite WAL, IPC serialization, Vault tests
│   ├── security/                    # Zip bomb, Zip slip, macro quarantine tests
│   └── fixtures/                    # Test document templates & synthetic data
├── .editorconfig                    # Universal code formatting rules
├── .eslintrc.json                   # Static code analysis & security lint rules
├── .gitignore                       # Git exclusion rules for artifacts & secrets
├── .prettierrc                      # Prettier code formatting rules
├── electron-builder.json5           # Windows NSIS & MSI installer packaging config
├── package.json                     # Root project manifest (Configured in Step 9)
├── tsconfig.json                    # Root TypeScript configuration
├── tsconfig.node.json               # Main process & worker TypeScript configuration
├── tsconfig.web.json                # Renderer process TypeScript configuration
└── vite.config.ts                   # Vite bundler configuration with Electron plugin
```

---

## 3. Mapping Proposed Structure to Architecture Modules

| Architectural Module | Primary Proposed Directory Path | Execution Boundary |
| :--- | :--- | :--- |
| **MOD-01: Presentation & UI** | `src/renderer/` | Renderer Process (Chromium Sandbox) |
| **MOD-02: Orchestration** | `src/main/ipc/`, `src/domain/orchestration/` | Main Process (Node.js) |
| **MOD-03: Category & Fields** | `src/domain/categories/`, `src/domain/fields/` | Pure Domain (Node.js) |
| **MOD-04: Station Sequence** | `src/domain/stations/` | Pure Domain (Node.js) |
| **MOD-05: Template Registry** | `src/storage/database/repositories/template.repo.ts` | Main Process (Node.js) |
| **MOD-06: Ingestion Sanitizer**| `src/storage/vault/ingestion-sanitizer.ts` | Main Process (Node.js) |
| **MOD-07: Template Mapping** | `src/domain/mappings/` | Pure Domain (Node.js) |
| **MOD-08: Document Engine** | `src/worker/` | Node.js Worker Thread Pool |
| **MOD-09: Persistence (DB)** | `src/storage/database/` | Main Process (better-sqlite3) |
| **MOD-10: File Vault / Scratch**| `src/storage/vault/`, `src/storage/file-manager/` | Main Process (Node.js) |
| **MOD-11: Settings & Theme** | `src/domain/settings/`, `src/renderer/components/theme/` | Shared Domain / UI |
| **MOD-12: Logging & Diag** | `src/infrastructure/logging/` | Main Process (Node.js) |
| **MOD-13: Platform Adapters** | `src/infrastructure/platform/` | Main Process (Electron native) |

---

## 4. Production Code vs. PoC Code Boundaries

* **Isolation Guarantee:** The experimental harness in `poc/step-07-document-engines/` will **never** be imported, bundled, or referenced by production application code in `src/`.
* **Zero Dependency Bleed:** The production `package.json` created in Step 9 will independently define certified production dependencies. Temporary scripts and test harnesses in `poc/` remain standalone historical records.

---

## 5. Source vs. Runtime Data Separation

The project enforces strict physical separation between the version-controlled application repository and mutable runtime data:

```
Version-Controlled Source Tree (Read-Only at Runtime)
E:\Projects\...\OpsReport Studio (working)\
├── src\
├── assets\
└── docs\

Mutable Local User Data (Created at Runtime by OS)
C:\Users\{Username}\AppData\Local\OpsReportStudio\
├── Templates\    (Managed Vault: Master Templates)
├── Scratch\      (Ephemeral Generation Sandbox)
├── Database\     (opsreport.db in WAL mode)
└── Logs\         (Rotated, Sanitized Log Files)

User Target Folders (External Host Filesystem)
C:\Users\{Username}\Desktop\ (or user-chosen operational share)
└── Generated Output Reports
```

---

## 6. Git Inclusion & Exclusion Rules (`.gitignore`)

The following rules will be established in Step 9 to prevent committing temporary files, binaries, or sensitive operational reports:

```gitignore
# Dependencies
node_modules/
npm-debug.log*

# Build and Packaging Outputs
dist/
dist-electron/
release/
*.exe
*.msi
*.zip

# Temporary Runtime Data & Sandboxes
scratch/
temp/
*.tmp
*.log

# Local Database Files (Never commit operational history)
*.db
*.db-wal
*.db-shm
*.sqlite

# User Exported Reports & Master Templates
output/
reports/
*.xlsx
*.docx
!assets/**/*.xlsx
!tests/fixtures/**/*.xlsx
!tests/fixtures/**/*.docx

# IDE & OS Files
.DS_Store
Thumbs.db
.vscode/*
!.vscode/settings.json
!.vscode/extensions.json
```
