# OpsReport Studio — Requirements Traceability Matrix (RTM)

**Document Identifier:** RTM-OPSREPORT-001  
**Project ID:** stationops-reporter  
**Approved Product Name:** OpsReport Studio  
**Lifecycle Step:** Step 1 of 45 (Requirements Baseline & Project Scope Definition)  
**Status:** Authoritative Traceability Baseline  
**Last Updated:** 2026-10-19  

---

## 1. Traceability Architecture & Methodology

The Requirements Traceability Matrix guarantees that every user requirement, operational constraint, and engineering specification remains verifiable and connected across the entire 45-step software development lifecycle.

### Column Definitions:
* **Req ID:** Unique functional or non-functional identifier.
* **Requirement Summary:** Terse statement of capability or constraint.
* **Originating Source:** Explicit user mandate or secondary engineering recommendation.
* **Workflow Linkage:** Associated operational workflow (Workflow A: Import, Workflow B: Station Inspection, Workflow C: Incident, Workflow D: In-App Template Creation, or Cross-Cutting).
* **Priority & Scope:** Priority tier (P0, P1, P2, Deferred) and scope category (Mandatory Core, Candidate, Deferred).
* **Roadmap Step Mapping:** Planned delivery phase across the 45-step roadmap.
* **Verification Method:** Test or validation technique (Unit, Integration, File Diff/Hash, UI End-to-End, Security Audit).
* **Current Status:** Lifecycle verification state.

---

## 2. Functional Requirements Traceability Matrix

| Req ID | Requirement Summary | Originating Source | Workflow Linkage | Priority & Scope | Roadmap Step Mapping (Provisional) | Verification Method | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **REQ-001** | Report-type selection catalog by operational category | User Explicit (Req #3, Sec 3.1) | Cross-Cutting / Catalog | P0 — Mandatory Core | Step 8 (Catalog Architecture) & Step 18 (UI Scaffolding) | Automated UI test verifying category filter and card selection | Confirmed Baseline |
| **REQ-002** | Excel (`.xlsx`) template processing and population | User Explicit (Req #1, Sec 3.1) | Workflow B, D | P0 — Mandatory Core | Step 3 (Engine Spike) & Step 11 (Excel Engine Implementation) | Automated integration test populating test `.xlsx`; verify cell values, formulas, and formatting preservation | Confirmed Baseline |
| **REQ-003** | Word (`.docx`) template processing and population | User Explicit (Req #1, Sec 3.1) | Workflow C, D | P0 — Mandatory Core | Step 3 (Engine Spike) & Step 12 (Word Engine Implementation) | Automated integration test populating test `.docx`; verify bookmarks, tables, and XML structure | Confirmed Baseline |
| **REQ-004** | Existing template import and library cataloging | User Explicit (Req #2, Sec 3.1) | Workflow A | P0 — Mandatory Core | Step 13 (Template Manager Core) & Step 22 (Import UI) | Unit test validating file reader, schema validator, and secure template vault persistence | Confirmed Baseline |
| **REQ-005** | Separate output-copy generation (dedicated target file) | User Explicit (Req #5, Sec 3.1) | Workflow B, C | P0 — Mandatory Core | Step 10 (Document Generation Orchestration) | Filesystem test asserting target file path is completely distinct from master template path | Confirmed Baseline |
| **REQ-006** | Strict master-template preservation & immutability | User Explicit (Req #6, Sec 3.1) | Workflow B, C, Cross-Cutting | P0 — Mandatory Core | Step 10 (Generation Core) & Step 35 (Reliability QA) | Pre- and post-generation cryptographic SHA-256 hash comparison under both successful and aborted runs | Confirmed Baseline |
| **REQ-007** | Structured form-based data entry (no raw spreadsheet) | User Explicit (Req #4, #8, Sec 3.1) | Workflow B, C | P0 — Mandatory Core | Step 19 (Form Component System) & Step 20 (Data Entry Views) | UI inspection and usability test confirming data is collected via specialized controls without sheet grids | Confirmed Baseline |
| **REQ-008** | Authoritative station ordering enforcement | User Explicit (Req #7, Sec 3.1) | Workflow B | P0 — Mandatory Core | Step 2 (Schema Analysis) & Step 14 (Station Domain Engine) | Automated assertion comparing rendered station dropdown/rows against authoritative station sequence | Confirmed Baseline (Awaiting List) |
| **REQ-009** | Reusable template field mapping engine | Engineering / User Req #5, #9 | Workflow A, D | P0 — Mandatory Core | Step 9 (Mapping Engine) & Step 23 (Mapping UI) | Unit tests verifying field-to-coordinate and field-to-token mapping transformations | Confirmed Baseline |
| **REQ-010** | In-app reusable template authoring & configuration | User Explicit (Req #9, Sec 3.1) | Workflow D | P0 — Mandatory Core | Step 15 (Template Authoring Engine) & Step 24 (Authoring UI) | End-to-end test creating a template in-app, registering in vault, and successfully generating a report | Confirmed Baseline |
| **REQ-011** | Dark / Light visual theme toggle | User Explicit (Req #10, Sec 3.1) | Cross-Cutting / UI | P1 — Mandatory Core | Step 6 (Design System Tokens) & Step 17 (Theme Switcher Component) | Automated visual regression test verifying CSS variable switching and WCAG contrast ratios in both themes | Confirmed Baseline |
| **REQ-012** | Input validation and clear diagnostic feedback | Engineering / User Req #11 | Workflow B, C, Cross-Cutting | P0 — Mandatory Core | Step 16 (Validation Pipeline) & Step 21 (Feedback Toasts/Modals) | Negative testing with missing mandatory fields and simulated I/O errors; verify clear user error display | Confirmed Baseline |

---

## 3. Non-Functional Requirements Traceability Matrix

| Req ID | Constraint Summary | Originating Domain | Priority & Scope | Roadmap Step Mapping | Verification Method | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **NFR-REL-01** | Master template zero-corruption guarantee | Reliability & Safety | P0 — Mandatory | Step 10, Step 35 | Stress test generation with unexpected process kills; assert template SHA-256 hash invariance | Confirmed Baseline |
| **NFR-REL-02** | Atomic file generation and clean rollback on error | Data Integrity | P0 — Mandatory | Step 10, Step 36 | Fault-injection test simulating write failures; verify zero orphaned or corrupted partial files | Confirmed Baseline |
| **NFR-PERF-01** | UI responsiveness at 60 FPS (asynchronous I/O) | Performance | P1 — Mandatory | Step 7, Step 26 | Profiler analysis during large document generation; assert UI thread never blocks | Confirmed Baseline |
| **NFR-PERF-02** | Report generation completion under 3.0 seconds | Performance | P1 — Mandatory | Step 11, Step 12, Step 37 | Automated benchmark executing 100-row station audits across 50 iterations | Confirmed Baseline |
| **NFR-SEC-01** | 100% Local data containment (no external leaks) | Security & Privacy | P0 — Mandatory | Step 5, Step 38 | Network traffic sniffer during generation; assert zero outbound HTTP/WebSocket requests | Confirmed Baseline |
| **NFR-SEC-02** | Safe document handling & macro quarantine | Security & Privacy | P0 — Mandatory | Step 13, Step 38 | Malicious file injection test; verify `.xlsm` and macro streams are blocked/isolated | Confirmed Baseline |
| **NFR-USE-01** | Rapid keyboard navigation across form controls | Usability & Ergonomics | P1 — Mandatory | Step 19, Step 39 | End-to-end keyboard-only workflow automation (Playwright/Webdriver) completing full station report | Confirmed Baseline |
| **NFR-USE-02** | Dark/Light theme WCAG 2.1 AA contrast compliance | Accessibility | P1 — Mandatory | Step 6, Step 39 | Automated accessibility audit (axe-core) validating minimum 4.5:1 text contrast | Confirmed Baseline |
| **NFR-COMP-01** | Windows 10 & 11 (64-bit) certified desktop execution | Compatibility | P0 — Mandatory | Step 4, Step 40 | Installation, smoke testing, and generation on clean Windows 10 and 11 environments | Confirmed Baseline |
| **NFR-COMP-02** | Standalone headless processing without Office installed | Compatibility | P0 — Mandatory | Step 3, Step 11, Step 12 | Test execution on virtual machine with zero Microsoft Office software installed | Confirmed Baseline |

---

## 4. Candidate & Optional Features Traceability

| Feature ID | Feature Description | Originating Source | Initial Priority | Scope Decision | Roadmap Step Mapping |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **OPT-001** | Direct PDF export engine | Research Spec / TPM | P2 — Candidate | Deferred to Phase 2 | Post-V1 Extension |
| **OPT-002** | In-progress report session auto-save (Drafts) | Architecture / TPM | P1 — Candidate | Approved for V1 Scope (Targeting Step 25) | Step 25 (Session Persistence) |
| **OPT-003** | Local report generation history log & audit trail | Architecture / QA | P1 — Candidate | Approved for V1 Scope (Targeting Step 27) | Step 27 (Local History Store) |
| **OPT-004** | Corporate network drive auto-sync & retry queue | Research Spec | P2 — Candidate | Standard File Path Routing in V1; Auto-Queue Deferred | Post-V1 Extension |
| **OPT-005** | Digital cryptographic signatures | Research Spec | Deferred | Excluded from Initial Release | Post-V1 Extension |
| **OPT-006** | Voice-to-text audio dictation | Research Spec | Deferred | Excluded from Initial Release | Post-V1 Extension |
| **OPT-007** | Generative AI / LLM incident drafting | Research Spec | Excluded | Excluded (Deterministic compliance mandated) | Rejected for Core |

---

## 5. Report Category & Schema Traceability (Step 2 Baseline)

| Category / Schema ID | Item Name | Associated Requirements | Applicable Document Format | Form Granularity Model | Primary Traceability Artifact | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **RPT-INCIDENT** | Security Incident Report | REQ-001, REQ-003, REQ-005, REQ-007 | Microsoft Word (`.docx`) | Single Event Record / Single Station Ref | `OPSREPORT_STUDIO_REPORT_CATALOG.md` | Preliminary Specification |
| **RPT-STATION-LIGHT** | Station Light Report | REQ-001, REQ-002, REQ-007, REQ-008 | Microsoft Excel (`.xlsx`) | Ordered Stations / Multi-Row Fixtures | `OPSREPORT_STUDIO_REPORT_CATALOG.md` | Preliminary Specification |
| **RPT-FAN** | Fan / Ventilation Report | REQ-001, REQ-002, REQ-007, REQ-008 | Microsoft Excel (`.xlsx`) | Ordered Stations / Asset Rows | `OPSREPORT_STUDIO_REPORT_CATALOG.md` | Preliminary Specification |
| **RPT-POLE-LIGHT** | Pole Light Report | REQ-001, REQ-002, REQ-007, REQ-008 | Microsoft Excel (`.xlsx`) | Ordered Stations / Pole Rows | `OPSREPORT_STUDIO_REPORT_CATALOG.md` | Preliminary Specification |
| **RPT-FIRE-EXTINGUISHER** | Fire Extinguisher Report | REQ-001, REQ-002, REQ-007, REQ-008 | Microsoft Excel (`.xlsx`) | Ordered Stations / Cylinder Compliance | `OPSREPORT_STUDIO_REPORT_CATALOG.md` | Preliminary Specification |
| **RPT-PILLAR** | Pillar Report | REQ-001, REQ-002, REQ-007, REQ-008 | Microsoft Excel (`.xlsx`) | Ordered Stations / Structural Pillars | `OPSREPORT_STUDIO_REPORT_CATALOG.md` | Preliminary Specification |
| **RPT-FENCE** | Fence Report | REQ-001, REQ-002, REQ-007, REQ-008 | Microsoft Excel (`.xlsx`) / Word (`.docx`) | Ordered Stations / Boundary Segments | `OPSREPORT_STUDIO_REPORT_CATALOG.md` | Preliminary Specification |
| **SCH-CORE-META** | Common Metadata Fields | REQ-007, REQ-012 | Excel & Word | Universal Header Form Component | `OPSREPORT_STUDIO_FIELD_DICTIONARY.md` | Confirmed Baseline |
| **SCH-VAL-RULES** | Validation & Cross-Field Checks | REQ-012, NFR-REL-01, NFR-REL-02 | Cross-Cutting Engine | Schema-Level Validator | `OPSREPORT_STUDIO_VALIDATION_RULES.md` | Preliminary Specification |
| **SCH-EVD-DISCO** | Template Evidence Register | REQ-002, REQ-003, REQ-004 | Open XML Templates | External File Registry | `OPSREPORT_STUDIO_TEMPLATE_EVIDENCE_REGISTER.md` | Active Discovery Register |

---

## 6. Station Sequence & Ordering Traceability (Step 3 Baseline)

| Item ID | Item Name | Associated Requirements | Operational Role | Primary Traceability Artifact | Test Reference | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **STN-ORD-001** | Authoritative Sequence Invariant | REQ-008, REQ-005 | Prohibits alphabetical/numerical inferred re-sorting | `OPSREPORT_STUDIO_STATION_SEQUENCE_SPECIFICATION.md` | TC-STN-001, TC-STN-002, TC-STN-003 | Confirmed Architectural Baseline |
| **STN-ORD-002** | Filter Isolation Invariant | REQ-008 | Search/filtering does not mutate underlying sequence | `OPSREPORT_STUDIO_STATION_SEQUENCE_SPECIFICATION.md` | TC-STN-004 | Confirmed Architectural Baseline |
| **STN-CTR-001** | Conceptual Station Entity Contract | REQ-008, REQ-007 | Immutable ID, display name, sequence order, active flag | `OPSREPORT_STUDIO_STATION_CONFIGURATION_CONTRACT.md` | TC-STN-011, TC-STN-012 | Confirmed Conceptual Baseline |
| **STN-CTR-002** | Contiguous Ordinality Invariant | REQ-008, NFR-REL-01 | Enforces gapless sequence indices `{1..N}` | `OPSREPORT_STUDIO_STATION_CONFIGURATION_CONTRACT.md` | TC-STN-008 | Confirmed Conceptual Baseline |
| **STN-VAL-001** | Configuration Lifecycle Validator | REQ-008, REQ-012 | Evaluates 14 operational validation scenarios | `OPSREPORT_STUDIO_STATION_VALIDATION_SPECIFICATION.md` | TC-STN-005 through TC-STN-010 | Confirmed Validation Baseline |
| **STN-VAL-002** | Atomic Configuration Persistence | NFR-REL-01, NFR-REL-02 | Staged write, rollback on failure, backup archive | `OPSREPORT_STUDIO_STATION_VALIDATION_SPECIFICATION.md` | TC-STN-010 | Confirmed Architectural Baseline |
| **STN-SES-001** | Report Session Snapshot Isolation | REQ-008, NFR-REL-01 | Pins station sequence at session start; isolates drafts | `OPSREPORT_STUDIO_STATION_SEQUENCE_SPECIFICATION.md` | TC-STN-013, TC-STN-014 | Confirmed Architectural Baseline |
| **STN-EVD-001** | Station Evidence & Dependency Registry | REQ-008, DEC-009 | Tracks pending authoritative list and blocker status | `OPSREPORT_STUDIO_STATION_EVIDENCE_REGISTER.md` | N/A (Discovery Register) | Active Discovery Register |

---

---

## 7. Template Compatibility & Document Processing Traceability (Step 4 Baseline)

| Item ID | Item Name | Associated Requirements | Format Target | Primary Assessment Focus | Primary Traceability Artifact | Test Reference | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **TPL-XLS-001** | Excel High-Fidelity Workbook Preservation | REQ-002, REQ-006, NFR-REL-01 | `.xlsx` | Preserves formulas, cell styles, merged ranges, print areas, and drawing logos | `OPSREPORT_STUDIO_EXCEL_TEMPLATE_ANALYSIS.md` | POC-XLS-01 through POC-XLS-07 | Confirmed Technical Specification |
| **TPL-DOC-001** | Word Split-Run Token Replacement | REQ-003, REQ-006, NFR-REL-01 | `.docx` | Paragraph-level run consolidation for fragmented `{{tokens}}` | `OPSREPORT_STUDIO_WORD_TEMPLATE_ANALYSIS.md` | POC-DOC-01, POC-DOC-02 | Confirmed Technical Specification |
| **TPL-DOC-002** | Word Multi-Paragraph & Table Formatting | REQ-003, REQ-007 | `.docx` | Multi-paragraph narrative formatting and table grid preservation | `OPSREPORT_STUDIO_WORD_TEMPLATE_ANALYSIS.md` | POC-DOC-03, POC-DOC-04, POC-DOC-05 | Confirmed Technical Specification |
| **TPL-FMT-001** | Core Open XML Format Standardization | REQ-002, REQ-003, DEC-004 | `.xlsx`, `.docx` | Macro-free Open XML standards adopted; legacy binary formats excluded | `OPSREPORT_STUDIO_DOCUMENT_COMPATIBILITY_MATRIX.md` | N/A (Format Matrix) | Confirmed Technical Policy |
| **TPL-SEC-001** | Copy-First Master Immutability Pipeline | REQ-005, REQ-006, NFR-REL-01 | `.xlsx`, `.docx` | Dedicated ephemeral scratch copy; master template read-only isolation | `OPSREPORT_STUDIO_TEMPLATE_INTEGRITY_SECURITY.md` | POC-SEC-01, POC-SEC-02 | Confirmed Architectural Baseline |
| **TPL-SEC-002** | Open XML Archive Security Defenses | NFR-SEC-01, NFR-SEC-02 | Open XML ZIPs | Zip bomb decompression ceilings, path traversal checks, XXE mitigation | `OPSREPORT_STUDIO_TEMPLATE_INTEGRITY_SECURITY.md` | POC-SEC-03, POC-SEC-04 | Confirmed Security Specification |
| **TPL-TST-001** | Document Library PoC Benchmark Plan | REQ-002, REQ-003, REQ-006 | `.xlsx`, `.docx` | 18 benchmark tests evaluating candidate engines (`exceljs` & `docxtemplater`) | `OPSREPORT_STUDIO_TEMPLATE_COMPATIBILITY_TEST_PLAN.md` | All POC Tests (18 Scenarios) | **100% Passed in Step 7 PoC** (`poc_benchmark_summary.json`) |
| **TPL-EVD-001** | Template Evidence & Open-Question Register | REQ-002, REQ-003, DEC-006 | All 7 Categories | Tracks missing customer master templates and user confirmation items | `OPSREPORT_STUDIO_TEMPLATE_ASSESSMENT_EVIDENCE.md` | N/A (Discovery Register) | Active Discovery Register |

---

---

## 8. Technology Stack & Architecture Traceability (Step 5 Baseline)

| Item ID | Item Name | Associated Requirements | Evaluated Option | Selected Architecture Component | Primary Traceability Artifact | Decision Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **STK-DSK-001** | Desktop Application Framework | REQ-001, REQ-011, DEC-003 | Electron vs. Tauri v2 vs. .NET vs. Python | Electron (v32+ LTS) with Context Isolation & Sandboxing | `OPSREPORT_STUDIO_TECHNOLOGY_EVALUATION.md` | Approved Architectural Baseline |
| **STK-UI-001** | User Interface & Theming Engine | REQ-007, REQ-011, NFR-USE-01 | React vs. Svelte vs. Vanilla | React 18.3+ with TypeScript 5.5+ and Vanilla CSS Modules | `OPSREPORT_STUDIO_TARGET_ARCHITECTURE.md` | Approved Architectural Baseline |
| **STK-XLS-001** | Native Excel Processing Engine | REQ-002, REQ-006, NFR-REL-01 | ExcelJS vs. Umya vs. OpenPyXL | `exceljs` (v4.4+) running in Node.js background worker thread | `OPSREPORT_STUDIO_EXCEL_POC_RESULTS.md` | **Verified & Confirmed in Step 7 PoC** (`ADR-OPSREPORT-002`) |
| **STK-DOC-001** | Native Word Split-Run Engine | REQ-003, REQ-006, NFR-REL-01 | Docxtemplater vs. docx-rs vs. docxtpl | `docxtemplater` (v3.71+) + `pizzip` (MIT Core) | `OPSREPORT_STUDIO_WORD_POC_RESULTS.md` | **Verified & Confirmed in Step 7 PoC** (`ADR-OPSREPORT-002`) |
| **STK-DB-001** | Embedded Structured Storage | REQ-008, NFR-REL-02 | SQLite vs. Flat JSON | `better-sqlite3` (v11+) in Write-Ahead Logging (WAL) mode | `OPSREPORT_STUDIO_TARGET_ARCHITECTURE.md` | Approved Architectural Baseline |
| **STK-SEC-001** | Sandbox & Defense-in-Depth Model | NFR-SEC-01, NFR-SEC-02, REQ-006 | Context Bridge vs. Unrestricted IPC | `contextBridge` with strict schema validation, 100% offline CSP | `OPSREPORT_STUDIO_SECURITY_ARCHITECTURE.md` | Approved Architectural Baseline |
| **STK-LIC-001** | Open-Source Permissive Licensing | NFR-MNT-01 | MIT / Apache 2.0 vs. Paid / GPL | 100% MIT-licensed runtime core dependencies (Zero paid modules) | `OPSREPORT_STUDIO_DEPENDENCY_LICENSE_REGISTER.md` | Approved Legal Baseline |
| **STK-PRF-001** | Asynchronous 60 FPS Worker Threads | NFR-PERF-01, NFR-PERF-02 | Main Thread vs. Worker Threads | Heavy document ZIP serialization offloaded to Node Worker Threads | `OPSREPORT_STUDIO_PERFORMANCE_TEST_PLAN.md` | Approved Architectural Baseline |

---

## 9. Application Architecture & Security Model Traceability (Step 6 Baseline)

| Item ID | Item Name | Associated Requirements | Architectural Role / Boundary | Key Specifications & Constraints | Primary Traceability Artifact | Decision Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **ARC-MOD-001** | Modular Monolith Topology | REQ-001–012, NFR-COMP-01 | Main Process, Sandboxed Renderer, Worker Threads | Clear separation across 13 logical modules; zero microservices | `OPSREPORT_STUDIO_APPLICATION_ARCHITECTURE.md` | Approved Architectural Baseline |
| **ARC-CNT-001** | Module Interface Contracts | REQ-001–012, NFR-MNT-01 | Cross-Module TypeScript Contracts | Strongly-typed DTOs, explicit inputs/outputs, forbidden duties | `OPSREPORT_STUDIO_MODULE_CONTRACTS.md` | Approved Architectural Baseline |
| **ARC-SEC-001** | STRIDE Threat Model & Defense | NFR-SEC-01, NFR-SEC-02, REQ-006 | Trust Boundaries, Permission Matrix | 18 threat scenarios mitigated; Zip bomb/slip guards; macro quarantine | `OPSREPORT_STUDIO_SECURITY_THREAT_MODEL.md` | Approved Architectural Baseline |
| **ARC-DAT-001** | Data & Operation Lifecycles | REQ-004, REQ-006, REQ-008 | Vault, Mappings, Stations, Drafts, DB | Two-phase reservation pattern; 14 cross-resource failure recoveries | `OPSREPORT_STUDIO_DATA_LIFECYCLE.md` | Approved Architectural Baseline |
| **ARC-TST-001** | Architectural Testability Plan | NFR-REL-01, NFR-REL-02, REQ-012 | In-Memory, Integration, Chaos Tiers | 9 mandatory criteria; single-job execution lock (`DEC-022`) | `OPSREPORT_STUDIO_ARCHITECTURE_TEST_PLAN.md` | Approved Architectural Baseline |
| **ARC-COL-001** | Destination Collision Policy | REQ-005, NFR-REL-02, DEC-021 | Filesystem Export Boundary | Safe auto-incrementation (`RENAME_SAFE`) prevents silent overwrites | `OPSREPORT_STUDIO_DECISION_REGISTER.md` | Approved Policy Baseline |
| **ARC-LOG-001** | Log Interceptor Redaction | NFR-SEC-01, DEC-019, DEC-024 | Logging Subsystem (`MOD-12`) | Structural redaction of narratives, witnesses, and badge IDs | `OPSREPORT_STUDIO_SECURITY_THREAT_MODEL.md` | Approved Security Baseline |

---

## 10. Data Model, Local Storage & Project Structure Traceability (Step 8 Baseline)

| Item ID | Item Name | Associated Requirements | Architectural Role / Boundary | Key Specifications & Constraints | Primary Traceability Artifact | Decision Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **DAT-MOD-001** | Conceptual Data Model | REQ-001–012, NFR-MNT-01 | Domain & Relational Mappings | 10 core entities, strict separation of files vs DB records | `OPSREPORT_STUDIO_DATA_MODEL_SPECIFICATION.md` | Approved Design Baseline |
| **DAT-STR-001** | Local Storage Layout | REQ-004, REQ-006, NFR-SEC-01 | Filesystem Organization | Vault (`%LOCALAPPDATA%/Templates`), Scratch, DB, Logs | `OPSREPORT_STUDIO_FILE_STORAGE_SPECIFICATION.md` | Approved Design Baseline |
| **DAT-PST-001** | SQLite WAL Persistence | REQ-008, NFR-REL-02, STK-DB-001 | Embedded Storage Layer | `better-sqlite3` WAL mode, `PRAGMA user_version` migrations | `OPSREPORT_STUDIO_PERSISTENCE_DESIGN.md` | Approved Design Baseline |
| **DAT-REC-001** | Data Lifecycle & Recovery | REQ-005, REQ-006, REQ-008 | State Machines & Failure Handling | Two-phase reservation pattern; 10 failure recovery scenarios | `OPSREPORT_STUDIO_DATA_LIFECYCLE_AND_RECOVERY.md` | Approved Design Baseline |
| **DAT-TST-001** | Data Integrity Test Plan | NFR-REL-01, NFR-REL-02, REQ-012 | Automated Verification Matrix | 10 automated test scenarios (immutability, drift, rollbacks) | `OPSREPORT_STUDIO_DATA_INTEGRITY_TEST_PLAN.md` | Approved Design Baseline |
| **DAT-BLU-001** | Project Structure Blueprint | REQ-001–012, NFR-MNT-01 | Step 9 Target Directory Tree | Clean process separation (`src/main`, `preload`, `renderer`, `worker`)| `OPSREPORT_STUDIO_PROJECT_STRUCTURE_BLUEPRINT.md`| Approved Design Baseline |
| **DAT-VLT-001** | Master Template Vault Storage| REQ-004, REQ-006, DEC-026 | Vault File Boundary | Read-only attribute on vault files; write streams blocked | `OPSREPORT_STUDIO_DECISION_REGISTER.md` | Approved Policy Baseline |

---

---

## 11. Repository Foundation & Build Configuration Traceability (Step 9 Baseline)

| Item ID | Item Name | Associated Requirements | Architectural Role / Boundary | Key Specifications & Constraints | Primary Traceability Artifact | Decision Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **FND-REP-001** | Git Repository Initialization | REQ-012, NFR-MNT-01 | Source Control & Hygiene | Initialized Git on `main`; comprehensive `.gitignore` for DBs, XLSX, DOCX | `STEP_09_FOUNDATION_REPORT.md` | Verified Foundation Baseline |
| **FND-PKG-001** | Dependency & Lockfile Manifest | NFR-MNT-01, NFR-SEC-01 | Dependency Management | `package.json` & `package-lock.json` with pinned versions; zero vulnerabilities | `STEP_09_FOUNDATION_REPORT.md` | Verified Foundation Baseline |
| **FND-TSC-001** | Multi-Target TypeScript Config | NFR-MNT-01, NFR-REL-01 | Static Type Checking | Dual `tsconfig.node.json` and `tsconfig.web.json`; zero `any` emissions | `BUILD_AND_TEST_COMMANDS.md` | Verified Foundation Baseline |
| **FND-BLD-001** | Dual Vite + Electron Build | NFR-PERF-01, NFR-COMP-01 | Build & Asset Bundling | Vite 5 bundler; emits `dist/` and `dist-electron/`; isolated preload bundle | `BUILD_AND_TEST_COMMANDS.md` | Verified Foundation Baseline |
| **FND-SEC-001** | Hardened Electron Startup Shell | NFR-SEC-01, NFR-SEC-02 | Native Desktop Shell | `contextIsolation: true`, `sandbox: true`, strict CSP, `will-navigate` guard | `DEVELOPMENT_ENVIRONMENT.md` | Verified Foundation Baseline |
| **FND-SMK-001** | Automated Foundation Smoke Tests | NFR-REL-01, REQ-012 | Automated Verification | 7 automated Vitest smoke tests (`tests/smoke/foundation.test.ts`) passing | `STEP_09_FOUNDATION_REPORT.md` | Verified Foundation Baseline |
| **FND-DOC-001** | Developer Onboarding Guides | NFR-MNT-01 | Project Documentation | Complete `README.md`, `DEVELOPMENT_ENVIRONMENT.md`, `BUILD_AND_TEST_COMMANDS.md` | `README.md` | Verified Foundation Baseline |

---

---

## 12. TypeScript Standards, Shared Types & Error Foundation Traceability (Step 10 Baseline)

| Item ID | Item Name | Associated Requirements | Architectural Role / Boundary | Key Specifications & Constraints | Primary Traceability Artifact | Decision Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **TYP-STD-001** | Strict Compiler Standards | NFR-MNT-01, NFR-REL-01 | Compile-Time Quality Gate | `strict`, `noImplicitOverride`, `noUnusedLocals`, `noEmit`; dual tsconfigs | `TYPESCRIPT_STANDARDS.md` | Verified Architecture Baseline |
| **TYP-BRN-001** | Semantic Branded Identifiers | REQ-001–012, NFR-MNT-01 | Domain Type Safety | Nominal IDs: `StationId`, `TemplateId`, `ReportCategoryId`, `ReportSessionId` | `src/shared/types/identifiers.ts` | Verified Architecture Baseline |
| **TYP-RES-001** | Discriminated Result Pattern | NFR-REL-01, NFR-REL-02 | Operational Outcome Handling | `Result<T, E>` with `Ok`, `Err`, `isOk`, `isErr`, `unwrapOr`, `mapResult` | `src/shared/types/result.ts` | Verified Architecture Baseline |
| **ERR-MOD-001** | Centralized AppError Hierarchy | NFR-REL-01, NFR-SEC-01 | Application-Wide Error Model | `AppError` class with code, userMessage, isOperational, operationId, cause | `ERROR_HANDLING_STANDARDS.md` | Verified Architecture Baseline |
| **ERR-COD-001** | Authoritative Error Codes | NFR-REL-01, NFR-MNT-01 | Error Taxonomy | 24 standardized codes across validation, templates, DB, files, generation | `src/shared/errors/error-codes.ts` | Verified Architecture Baseline |
| **ERR-NRM-001** | Safe Error Normalization | NFR-REL-01, NFR-SEC-01 | Exception Boundaries | Normalizes caught values; handles non-Errors; strips stack from user view | `src/shared/errors/normalize-error.ts` | Verified Architecture Baseline |
| **ERR-SER-001** | IPC Boundary Serialization | NFR-COMP-01, NFR-SEC-01 | Process Boundary Bridge | `toSerializableError()` DTO without prototypes or circular references | `ERROR_HANDLING_STANDARDS.md` | Verified Architecture Baseline |
| **ERR-RED-001** | Sensitive Field Redaction | NFR-SEC-01, DEC-019, DEC-024 | Privacy & Data Protection | Automatic redaction of narratives, witnesses, passwords, badge numbers | `src/shared/errors/normalize-error.ts` | Verified Architecture Baseline |
| **TYP-LNT-001** | ESLint 10 Flat Configuration | NFR-MNT-01 | Static Analysis Gate | ESLint 10 + typescript-eslint parser rules across all `.ts`/`.tsx` | `eslint.config.js` | Verified Architecture Baseline |

---

---

## 13. Design System, Typography & Theming Traceability (Step 11 Baseline)

| Item ID | Item Name | Associated Requirements | Architectural Role / Boundary | Key Specifications & Constraints | Primary Traceability Artifact | Decision Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **DS-TOK-001** | Semantic CSS Custom Properties | NFR-MNT-01, NFR-COMP-01 | Visual Token Architecture | Surfaces, borders, text, actions, status indicators; zero raw hex codes in UI | `OPSREPORT_STUDIO_DESIGN_SYSTEM.md` | Verified Design Baseline |
| **DS-TYP-001** | System Font & Typography Scale | NFR-MNT-01, NFR-PERF-01 | Visual Hierarchy & Legibility | System font stack (`--font-sans`, `--font-mono`); 7 harmonic size steps | `OPSREPORT_STUDIO_DESIGN_SYSTEM.md` | Verified Design Baseline |
| **DS-THM-001** | Dual Dark & Light Appearance | REQ-011, NFR-COMP-01 | Operator Ergonomics | Obsidian slate navy (`#0b1120`) & Crisp daylight (`#ffffff`); `[data-theme]` | `OPSREPORT_STUDIO_THEME_SPECIFICATION.md` | Verified Design Baseline |
| **DS-ACC-001** | WCAG 2.2 AA Contrast Compliance | NFR-COMP-01, NFR-REL-01 | Accessibility Assurance | Mathematical contrast verification: >= 4.5:1 text, >= 3:1 controls | `OPSREPORT_STUDIO_DESIGN_SYSTEM.md` | Verified Design Baseline |
| **DS-MOT-001** | Reduced Motion Adaptation | NFR-COMP-01 | Accessibility Safeguards | `@media (prefers-reduced-motion: reduce)` overrides transitions to 0ms | `src/renderer/styles/tokens.css` | Verified Design Baseline |
| **DS-PST-001** | Theme Preference Persistence | REQ-011, DAT-STR-001 | Local Storage Preference | `localStorage.opsreport_theme_preference`; safe fallback to 'system'/'dark' | `src/renderer/theme/theme-storage.ts` | Verified Design Baseline |
| **DS-TGL-001** | Accessible Theme Toggle Button | REQ-011, NFR-COMP-01 | UI Interaction Primitive | Screen-reader accessible toggle with SVG icons, aria-label, focus rings | `src/renderer/components/ThemeToggle.tsx` | Verified Design Baseline |

---

## 14. Application Shell, Navigation & Shared UI Traceability (Step 12 Baseline)

| Item ID | Item Name | Associated Requirements | Architectural Role / Boundary | Key Specifications & Constraints | Primary Traceability Artifact | Decision Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **SHL-LAY-001** | Desktop Application Shell (`AppShell`) | NFR-MNT-01, NFR-COMP-01 | Main Frame Layout | Responsive 2-column layout; HTML5 landmarks (`<aside>`, `<header>`, `<main>`); keyboard skip-link | `src/renderer/components/shell/AppShell.tsx` | Verified UI Baseline |
| **SHL-NAV-001** | Centralized Primary Navigation | REQ-001, NFR-MNT-01 | View Switching Model | Authoritative `PRIMARY_NAV_ITEMS` registry; `NavigationContext`; safe fallback to dashboard | `src/renderer/navigation/` | Verified UI Baseline |
| **SHL-SDB-001** | Desktop Sidebar with Collapse Mode | NFR-USE-01, NFR-COMP-01 | Primary Navigation Menu | Brand logo, version, accessible nav list, active tokens, planned badges, collapse toggle | `src/renderer/components/shell/Sidebar.tsx` | Verified UI Baseline |
| **SHL-HDR-001** | Global Application Header (`AppHeader`) | NFR-USE-01, REQ-011 | Top Context Bar | Active view title, sidebar toggle trigger, accessible `ThemeToggle` integration | `src/renderer/components/shell/AppHeader.tsx` | Verified UI Baseline |
| **SHL-DSH-001** | Operational Landing Dashboard | REQ-001, NFR-USE-01 | Initial Destination | SMK-07 foundation status, 7 static report category scope cards, honest empty state | `src/renderer/views/DashboardView.tsx` | Verified UI Baseline |
| **SHL-SET-001** | Functional Settings & Diagnostics | REQ-011, NFR-SEC-01 | Preferences & Diagnostics | Display theme selector (Dark/Light/System), desktop security runtime specs, roadmap alignment | `src/renderer/views/SettingsView.tsx` | Verified UI Baseline |
| **SHL-PLC-001** | Honest Planned Module Placeholder | NFR-MNT-01, DEC-034 | Scope Protection | Displays assigned roadmap milestone, explains capabilities, return to dashboard button | `src/renderer/views/PlaceholderView.tsx` | Verified UI Baseline |
| **SHL-CMP-001** | Shared UI Component Primitives | NFR-MNT-01, NFR-USE-01 | Reusable UI Elements | `Button` (5 variants, 3 sizes), `Card`, `Badge`, `EmptyState` (4 scenarios), `PageHeader` | `src/renderer/components/common/` | Verified UI Baseline |

---

## 15. SQLite Database Schema & Persistence Traceability (Step 13 Baseline)

| Item ID | Item Name | Associated Requirements | Architectural Role / Boundary | Key Specifications & Constraints | Primary Traceability Artifact | Decision Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **DB-ENG-001** | `better-sqlite3` Native Engine | NFR-PERF-01, NFR-REL-01, DEC-015 | Local Persistence Engine | Synchronous C++ binding to SQLite v3.45+; thread-affinity safe; sub-millisecond execution | `OPSREPORT_STUDIO_PERSISTENCE_GUIDE.md` | Verified Persistence Baseline |
| **DB-CFG-001** | Production PRAGMA Configuration | NFR-REL-01, NFR-SEC-01, DEC-035 | Storage Durability & Integrity | `journal_mode = WAL`, `foreign_keys = ON`, `busy_timeout = 5000`, `synchronous = NORMAL` | `src/storage/database/config.ts` | Verified Persistence Baseline |
| **DB-PTH-001** | Local Application Data Directory | DAT-STR-001, NFR-SEC-01 | Secure File Storage | `%LOCALAPPDATA%\OpsReportStudio\Database\opsreport.db`; isolated from source & web assets | `src/storage/database/config.ts` | Verified Persistence Baseline |
| **DB-MIG-001** | Deterministic Migration Runner | NFR-REL-01, NFR-MNT-01 | Schema Evolution Authority | Sequential version tracking (`PRAGMA user_version`), SHA-256 checksums, downgrade protection | `src/storage/database/migrations/migrator.ts` | Verified Persistence Baseline |
| **DB-SCH-001** | Initial V1 Foundational Schema | REQ-008, REQ-012, DAT-STR-001 | Relational Data Integrity | `schema_migrations`, `report_categories` (7 confirmed seeds), `stations`, `app_settings` | `src/storage/database/migrations/001_initial_schema.ts` | Verified Persistence Baseline |
| **DB-REP-STN-001** | Station Repository & Ordering API | REQ-008, REQ-012, CTR-STN-001 | Station Persistence | Stable branded IDs, non-empty names, explicit `display_order`, atomic transactional reordering | `src/storage/database/repositories/station-repository.ts` | Verified Persistence Baseline |
| **DB-REP-CAT-001** | Report Category Registry Repository | REQ-001, REQ-002, DEC-014 | Category Persistence | Read-only access to 7 approved category reference records; format, schema, active indicators | `src/storage/database/repositories/category-repository.ts` | Verified Persistence Baseline |
| **DB-REP-SET-001** | Application Settings Repository | REQ-011, DAT-STR-001 | Key-Value Store | Typed configuration storage, upsert/get/delete, JSON validation, isolation from credentials | `src/storage/database/repositories/settings-repository.ts` | Verified Persistence Baseline |
| **DB-ERR-001** | Database Error Domain Integration | NFR-REL-01, DEC-024 | Reliability & Diagnostics | Maps SQLite constraints/locks/corruption to `AppError` codes; redacts queries from logs | `src/storage/database/connection.ts` | Verified Persistence Baseline |

---

## 16. Station Management & Configuration Editor Traceability (Step 14 Baseline)

| Item ID | Item Name | Associated Requirements | Architectural Role / Boundary | Key Specifications & Constraints | Primary Traceability Artifact | Decision Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **STN-UI-001** | Station Management View (`StationsView`) | REQ-008, REQ-012, NFR-USE-01 | Configuration Editor UI | Responsive desktop view with summary counters, search, active filter, empty state | `src/renderer/views/StationsView.tsx` | Verified UI Baseline |
| **STN-IPC-001** | Sandboxed Station Preload IPC Bridge | NFR-SEC-01, DEC-036 | Process Boundary Bridge | `window.opsreport.stations` exposing typed, validated methods over Electron IPC | `src/preload/index.ts` | Verified UI Baseline |
| **STN-CLI-001** | Station Client Service (`IStationClient`) | NFR-REL-01, NFR-MNT-01 | Client Persistence Facade | Dual Electron IPC client & InMemory fallback provider for unit tests and web previews | `src/renderer/services/station-client.ts` | Verified UI Baseline |
| **STN-ORD-001** | Accessible Operational Sequence Reordering | REQ-008, REQ-012, CTR-STN-001 | Ordering Engine | Atomic Move Up/Down controls swapping sequence numbers within an isolated SQLite transaction | `src/renderer/views/StationsView.tsx` | Verified UI Baseline |
| **STN-VAL-001** | Station Name Uniqueness & Validation | CTR-STN-001, NFR-REL-01 | Data Integrity Rule | 1..150 chars, trimmed, case-insensitive uniqueness enforced in UI and database | `src/storage/database/repositories/station-repository.ts` | Verified UI Baseline |
| **STN-DEL-001** | Safe Deletion & Contiguous Re-indexing | CTR-STN-001, REQ-012 | Lifecycle Preservation | Deletion modal warning; atomic transaction re-indexes remaining stations to contiguous 1..N | `src/storage/database/repositories/station-repository.ts` | Verified UI Baseline |
| **STN-EMP-001** | Truthful Initial Configuration State | NFR-USE-01, DEC-036 | Ergonomic Onboarding | Clean empty state without fabricated stations; explicit prompt to establish sequence | `src/renderer/views/StationsView.tsx` | Verified UI Baseline |

---

## 17. Report Category Registry & Template Metadata Traceability (Step 15 Baseline)

| Item ID | Item Name | Associated Requirements | Architectural Role / Boundary | Key Specifications & Constraints | Primary Traceability Artifact | Decision Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **CAT-REG-001** | Report Category Registry View (`TemplatesView`) | REQ-001, REQ-004, NFR-USE-01 | UI Category Management | Responsive dual-tab interface managing categories and template descriptors with search, filters, modals | `src/renderer/views/TemplatesView.tsx` | Verified Baseline |
| **CAT-MIG-002** | Schema Migration 002 (Lifecycle & Metadata) | NFR-REL-01, DEC-037 | Persistence Migration | Adds `is_active` & `updated_at` to `report_categories`; creates `template_metadata` with FK `ON DELETE RESTRICT` | `src/storage/database/migrations/002_category_lifecycle_and_template_metadata.ts` | Verified Baseline |
| **CAT-LIF-001** | Report Category Lifecycle & Deletion Guard | REQ-001, NFR-REL-01, DEC-037 | Domain Rule Enforcement | Built-in 7 categories cannot be deleted; categories referenced by templates cannot be deleted; activation toggle supported | `src/storage/database/repositories/category-repository.ts` | Verified Baseline |
| **TPL-MET-001** | Template Metadata Entity & Repository | REQ-004, REQ-006, DEC-037 | Relational Data Model | Associates template descriptors with categories, format (`EXCEL_XLSX`/`WORD_DOCX`), status (`DRAFT`/`ACTIVE`/`ARCHIVED`), file ref | `src/storage/database/repositories/template-metadata-repository.ts` | Verified Baseline |
| **CAT-IPC-001** | Category & Template Preload IPC Bridge | NFR-SEC-01, DEC-037 | Process Boundary Bridge | `window.opsreport.categories` and `window.opsreport.templates` exposing typed, validated methods over Electron IPC | `src/preload/index.ts` | Verified Baseline |
| **CAT-CLI-001** | Category & Template Client Services | NFR-REL-01, NFR-MNT-01 | Client Persistence Facade | Dual Electron IPC client & InMemory fallback provider for unit tests and web previews | `src/renderer/services/category-client.ts`, `template-client.ts` | Verified Baseline |
| **TPL-NOT-001** | Truthful Template Vault Scope Callout | NFR-USE-01, DEC-037 | Ergonomic Scope Boundary | Explicit advisory note clarifying physical template file vault import belongs to Step 17 | `src/renderer/views/TemplatesView.tsx` | Verified Baseline |

---

## 18. Report Session Data Model & Draft Persistence Traceability (Step 16 Baseline)

| Item ID | Item Name | Associated Requirements | Architectural Role / Boundary | Key Specifications & Constraints | Primary Traceability Artifact | Decision Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **SES-ENT-001** | Report Session Entity & Branded Identifier | REQ-001, REQ-009, DEC-038 | Domain Entity Model | Branded `ReportSessionId`, `session_title`, `status`, `payload_version`, `form_data` JSON, ISO timestamps | `src/shared/types/sessions.ts` | Verified Baseline |
| **SES-MIG-003** | Schema Migration 003 (Sessions & Drafts) | NFR-REL-01, DEC-038 | Persistence Migration | Advances schema to v3; creates `report_sessions` and `report_session_stations` with FK constraints and indexes | `src/storage/database/migrations/003_report_session_and_draft_persistence.ts` | Verified Baseline |
| **SES-REL-001** | Category & Template Referential Integrity | REQ-001, REQ-004, NFR-REL-01 | Referential Integrity Rule | Category FK `ON DELETE RESTRICT`; Template FK `ON DELETE SET NULL`; prevents deleting referenced categories | `src/storage/database/repositories/session-repository.ts` | Verified Baseline |
| **SES-STN-001** | Frozen Station Sequence Snapshot | REQ-008, DEC-025, DEC-038 | Historical Immutability | Captures station ID, sequence order, and names snapshot; global reordering does not mutate historical draft sequences | `src/storage/database/repositories/session-repository.ts` | Verified Baseline |
| **SES-REC-001** | Resumable Draft Recovery Query | REQ-009, REQ-010, DEC-038 | Failure Recovery Engine | Identifies drafts in `DRAFT` or `IN_PROGRESS` status ordered by `updated_at DESC`; excludes completed/cancelled | `src/storage/database/repositories/session-repository.ts` | Verified Baseline |
| **SES-IPC-001** | Sandboxed Session Preload IPC Bridge | NFR-SEC-01, DEC-038 | Process Boundary Bridge | `window.opsreport.sessions` exposing typed, validated persistence methods over Electron IPC | `src/preload/index.ts` | Verified Baseline |
| **SES-CLI-001** | Session Client Service (`ISessionClient`) | NFR-REL-01, NFR-MNT-01 | Client Persistence Facade | Dual Electron IPC client & InMemory fallback provider for unit tests and web previews | `src/renderer/services/session-client.ts` | Verified Baseline |

---

## 19. Master Template Vault & File Storage Traceability (Step 17 Baseline)

| Item ID | Item Name | Associated Requirements | Architectural Role / Boundary | Key Specifications & Constraints | Primary Traceability Artifact | Decision Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **VLT-MGR-001** | Centralized Vault Storage Manager (`VaultManager`) | REQ-004, REQ-005, DEC-039 | Storage Subsystem Core | Singleton managing application-owned storage root (`%LOCALAPPDATA%\OpsReportStudio`), canonical directory paths, and initialization | `src/storage/vault/vault-manager.ts` | Verified Baseline |
| **VLT-SEC-001** | Path Traversal & Security Boundary Guards | NFR-SEC-01, DEC-039 | Security Enforcement Layer | Rejection of null bytes, directory traversal (`..`), invalid identifier patterns; case-insensitive boundary confinement checks | `src/storage/vault/path-security.ts` | Verified Baseline |
| **VLT-DIR-001** | Deterministic Storage Layout & Physical Separation | REQ-004, NFR-REL-01, DEC-039 | Filesystem Architecture | Strict separation of Templates, Scratch, Reports, Database, Logs, and Backups directories; zero storage in source or install dirs | `src/storage/vault/vault-config.ts` | Verified Baseline |
| **VLT-SCR-001** | Ephemeral Scratch Sandbox & Stale File Purge | NFR-REL-01, DEC-039 | Lifecycle Management | Temporary staging sandbox for future imports; automated startup sweep purges orphaned `.tmp` files older than 15 minutes | `src/storage/vault/vault-manager.ts` | Verified Baseline |
| **VLT-IMM-001** | Vault Overwrite Protection Guard (INV-DAT-006) | REQ-002, REQ-003, DEC-039 | Data Protection Invariant | Output report resolution verifies destination never points inside the Master Template Vault; prevents corrupting reusable masters | `src/storage/vault/path-security.ts` | Verified Baseline |
| **VLT-IPC-001** | Sandboxed Vault Preload IPC Bridge | NFR-SEC-01, DEC-039 | Process Boundary Bridge | `window.opsreport.vault` exposing `getStatus`, `initialize`, and `checkTemplateExists` across Electron context isolation | `src/preload/index.ts` | Verified Baseline |
| **VLT-CLI-001** | Vault Client Service (`IVaultClient`) | NFR-REL-01, NFR-MNT-01 | Client Storage Facade | Dual Electron IPC client & InMemory fallback provider for unit tests, storybooks, and browser preview environments | `src/renderer/services/vault-client.ts` | Verified Baseline |
| **VLT-STA-001** | Truthful Master Vault Storage Status Card | NFR-USE-01, DEC-039 | Ergonomic Status Presentation | UI status card in `TemplatesView.tsx` showing canonical storage path, readiness badge, and scratch sandbox health | `src/renderer/views/TemplatesView.tsx` | Verified Baseline |

---

## 20. Excel and Word Template Import & File Validation Traceability (Step 18 Baseline)

| Item ID | Item Name | Associated Requirements | Architectural Role / Boundary | Key Specifications & Constraints | Primary Traceability Artifact | Decision Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **IMP-PIE-001** | Authoritative Template Import Pipeline | REQ-002, REQ-003, DEC-040 | Storage Import Engine | 8-stage pipeline: source inspection, scratch staging, container validation, vault promotion, metadata registration, cleanup | `src/storage/vault/template-importer.ts` | Verified Baseline |
| **IMP-VAL-001** | Bounded Open XML Container Validator | NFR-SEC-01, NFR-REL-01, DEC-040 | Document Security Guard | Magic byte check (`PK\x03\x04`), 25MB file ceiling, 100MB expansion limit, 15:1 ratio ceiling, 1,000 entry limit, required part checks | `src/storage/vault/document-validator.ts` | Verified Baseline |
| **IMP-PRV-001** | Source File Preservation Invariant | REQ-002, REQ-003, DEC-040 | Data Safety Invariant | Original source document is strictly read-only; never modified, moved, renamed, or unlinked under any outcome | `src/storage/vault/template-importer.ts` | Verified Baseline |
| **IMP-STG-001** | Controlled Ephemeral Staging & Cleanup | NFR-REL-01, DEC-040 | Lifecycle Management | Unique staging in `%LOCALAPPDATA%\OpsReportStudio\Scratch\`; guaranteed cleanup in `finally` block on success or error | `src/storage/vault/template-importer.ts` | Verified Baseline |
| **IMP-MAC-001** | Macro Quarantine Policy Enforcement | DEC-005, ADR-OPSREPORT-002, DEC-040 | Threat Mitigation Guard | Quarantines and rejects `.xlsm`/`.docm` or any archive containing `vbaProject.bin`; eliminates VBA execution risks | `src/storage/vault/document-validator.ts` | Verified Baseline |
| **IMP-IPC-001** | Native File Dialog & Sandboxed Preload IPC | NFR-SEC-01, DEC-040 | Process Boundary Bridge | `dialog.showOpenDialog` file picker and `window.opsreport.templates` (`selectFile`, `importTemplate`) across context isolation | `src/preload/index.ts`, `src/main/index.ts` | Verified Baseline |
| **IMP-ROL-001** | Consistency Rollback on Persistence Error | NFR-REL-01, DEC-040 | Failure Recovery Protocol | Promoted file in `Templates/` is immediately unlinked if database metadata insert/update fails; prevents orphan files | `src/storage/vault/template-importer.ts` | Verified Baseline |
| **IMP-MOD-001** | Accessible Import Template Dialog Modal | NFR-USE-01, DEC-040 | UI Interaction Flow | Modal dialog in `TemplatesView.tsx` with file picker, format detection badge, category alignment, and error alerts | `src/renderer/views/TemplatesView.tsx` | Verified Baseline |

---

## 21. Traceability Governance & Lifecycle Sign-Off

* **Requirements Coverage:** 100% of explicit user requirements (`REQ-001` through `REQ-012`, `NFR-REL-01` through `NFR-COMP-02`) are mapped to testable functional, non-functional, and architectural specifications.
* **Step 2 Schema Completeness:** All 7 approved operational report categories are tracked with explicit reporting units, formats, and preliminary schema dictionaries.
* **Step 3 Station Ordering Completeness:** All station ordering invariants, entity contracts, 14 validation failure scenarios, and 17 dedicated test cases are mapped to REQ-008, REQ-012, and reliability requirements.
* **Step 4 Template Compatibility Completeness:** High-fidelity preservation requirements, Open XML split-run lexing criteria, format compatibility matrices, copy-first immutability pipelines, and 18 proof-of-concept test scenarios are mapped to REQ-002, REQ-003, REQ-005, and REQ-006.
* **Step 5 Architecture Selection Completeness:** Electron + React + TypeScript + Node.js Open XML engines (`exceljs` + `docxtemplater`) + `better-sqlite3` formally selected and approved with complete licensing, security, and performance verification plans.
* **Step 6 Architecture & Security Model Completeness:** Comprehensive modular monolithic architecture, 13 module boundary contracts, STRIDE threat model across 18 threats, 9-stage generation lifecycle, 14 cross-resource failure handling protocols, single-job concurrency lock, and architectural testability plan formally specified and approved.
* **Step 7 PoC Verification Completeness:** All 18 benchmark tests (`POC-XLS-01` through `POC-XLS-08`, `POC-DOC-01` through `POC-DOC-06`, and `POC-SEC-01` through `POC-SEC-04`) were executed in an isolated test harness and passed with 100% compliance. Both `exceljs` (v4.4.0) and `docxtemplater` (v3.71.1) + `pizzip` (v3.3.0) are formally verified and approved (`ADR-OPSREPORT-002`).
* **Step 8 Data Model & Storage Design Completeness:** Conceptual data model (10 entities), local filesystem storage layout, SQLite WAL persistence design, target project structure blueprint, data lifecycle and failure recovery specifications, and data integrity test plan formally specified and approved.
* **Step 9 Foundation & Build Configuration Completeness:** Production repository initialized with Git; package manifests and lockfiles locked; dual Vite/Electron build configured; hardened sandboxed window entry created; 7 automated smoke tests passing; all code formatting and static type checks passing.
* **Step 10 Type Foundation & Error Model Completeness:** Dual TypeScript compiler configuration strictness ratified; ESLint 10 integrated; semantic branded identifiers established; discriminated Result pattern implemented; centralized `AppError` and 24 error codes created; safe unknown error normalization and sensitive data redaction verified across 24 automated unit and smoke tests.
* **Step 11 Design System & Theming Completeness:** Semantic CSS tokens implemented for Dark (`#0b1120`) and Light (`#ffffff`) appearances; typography and spacing scales codified; WCAG 2.2 Level AA contrast verified via automated mathematical tests; theme preference persistence and accessible `ThemeToggle` component implemented across 35 passing tests.
* **Step 12 Application Shell & Navigation Completeness:** Reusable desktop `AppShell`, centralized `PRIMARY_NAV_ITEMS` registry, `DashboardView` with truthful static scope reference, functional `SettingsView`, honest `PlaceholderView` for planned features, and shared UI primitives (`Button`, `Card`, `Badge`, `EmptyState`, `PageHeader`) implemented and verified across 52 passing tests (9 test suites) and a 100% successful production build.
* **Step 13 Database Schema & Persistence Completeness:** Foundational SQLite persistence layer implemented using `better-sqlite3` v13; WAL mode, foreign keys, and 5000ms busy timeout active; deterministic migration runner (`PRAGMA user_version` + `schema_migrations`) with checksum and downgrade protection; V1 schema implementing `report_categories` (seeded with 7 verified reference categories), `stations` (ordered, contiguous, empty awaiting Step 14), and `app_settings`; typed repositories (`StationRepository`, `CategoryRepository`, `SettingsRepository`) with parameterized SQL, atomic transaction reordering, and `AppError` mapping; verified across 80 passing automated unit tests (14 test suites).
* **Step 14 Station Management Completeness:** Authoritative station management and ordering interface (`StationsView`) implemented and integrated into the desktop application shell; sandboxed context-isolated Electron IPC bridge (`window.opsreport.stations`) wired to `StationRepository`; accessible operational sequence reordering (Move Up/Down) with atomic transactional re-indexing; case-insensitive name uniqueness validation; contiguous 1..N ordinal sequence maintenance on addition, reordering, and deletion; verified across 97 passing automated tests (16 test suites) with clean production builds.
* **Step 15 Category Registry & Template Metadata Completeness:** Authoritative report category registry and template metadata management implemented and integrated into navigation (`TemplatesView`); migration 002 bumping schema version to 2 and adding lifecycle columns to `report_categories`; new relational `template_metadata` table linking template records to categories via foreign keys (`ON DELETE RESTRICT`); deletion restrictions preventing deletion of built-in categories or categories referenced by templates; seeded 7 default template descriptors (`INSERT OR IGNORE`) for the 7 initial categories; typed IPC bridges and client services (`CategoryClient`, `TemplateClient`); 129 passing automated unit tests (20 test suites) with zero lint errors and clean production builds.
* **Step 16 Report Session Persistence Completeness:** Authoritative report session data model, draft persistence layer, and recovery foundation implemented; Migration 003 bumping schema version to 3 and creating `report_sessions` and `report_session_stations`; frozen station snapshots (`DEC-025`) guaranteeing historical isolation from global station reordering; referential integrity preventing accidental deletion of referenced categories or stations; atomic transactional draft updates with `updated_at` tracking; resumable session querying (`DRAFT`, `IN_PROGRESS`); typed IPC bridge and client services (`SessionRepository`, `SessionClient`); verified across 147 passing automated unit tests (22 test suites) with zero lint warnings, full Prettier compliance, and clean production builds.
* **Step 17 Master Template Vault & Storage Completeness:** Authoritative master template vault and organized application-managed file storage foundation implemented; centralized `VaultManager` singleton created; Windows standard `%LOCALAPPDATA%\OpsReportStudio` resolved with deterministic physical separation among `Templates/`, `Scratch/`, `Reports/`, `Database/`, `Logs/`, and `Backups/`; stable internal `TemplateId` naming (`{templateId}.{xlsx|docx}`) preventing path corruption from editable display names; rigorous path traversal (`..`), null byte, and boundary escape guards (`assertPathInsideRoot`); master template overwrite protection guard (`assertTargetNotInsideVault`, `INV-DAT-006`); ephemeral scratch sandbox management with automatic 15-minute stale file purge sweep; zero database schema migration required (metadata and physical files decoupled); sandboxed Electron IPC bridge (`window.opsreport.vault`) and typed client services (`ElectronVaultClient`, `InMemoryVaultClient`); Master Template Vault Storage status card integrated into `TemplatesView.tsx`; verified across 164 passing automated tests (24 test suites) with zero lint warnings, full Prettier compliance, and clean production builds.
* **Step 18 Excel and Word Template Import Completeness:** Authoritative template import pipeline (`TemplateImporter`), container security validator (`DocumentValidator`), and user-facing import interface implemented; 8-stage pipeline protecting original user source files (100% byte-for-byte read-only preservation); Open XML container validation via `PizZip` inspecting magic bytes (`PK\x03\x04`), 25MB file ceiling, 100MB uncompressed ceiling, 15:1 decompression ratio ceiling, 1,000 entry ceiling, and required core Open XML components; macro quarantine (DEC-005) blocking `.xlsm`/`.docm` and `vbaProject.bin`; promotion to managed vault (`Templates/{templateId}.{xlsx|docx}`) with automatic unlink rollback if database registration fails; guaranteed scratch staging cleanup; native desktop file picker (`dialog.showOpenDialog`) with format allowlist; accessible `ImportTemplateModal` integrated into `TemplatesView.tsx`; verified across 186 passing automated tests (26 test suites) with zero lint warnings, full Prettier compliance, and clean production builds.
* **Forward Verification:** Step 19 (Master-Template Immutability, Versioning & Cloned Work Copies) will establish OS-level read-only attributes on promoted master files, immutable revision tracking, and copy-first work file cloning for downstream generation engines without mutating master templates.







