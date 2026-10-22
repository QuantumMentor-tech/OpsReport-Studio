# OpsReport Studio — Decision & Assumption Register

**Document Identifier:** DEC-OPSREPORT-001  
**Project ID:** stationops-reporter  
**Approved Product Name:** OpsReport Studio  
**Lifecycle Step:** Step 1 of 45 (Requirements Baseline & Project Scope Definition)  
**Status:** Active Working Register  
**Last Updated:** 2026-10-19

---

## 1. Register Overview & Governance

This document serves as the authoritative repository of architectural, technical, operational, and scope decisions for OpsReport Studio. Each entry details the core question, operational significance, viable alternatives, associated risks, evidentiary prerequisites, decision ownership, and current lifecycle status.

### Status Classification:

- **CONFIRMED:** Formally decided and approved based on explicit user requirements.
- **PROVISIONAL / RECOMMENDED:** Architectural or engineering recommendation formulated by the team, pending explicit user confirmation or technical validation in an upcoming roadmap step.
- **OPEN / PENDING INPUT:** Unresolved item awaiting external operational data (e.g., authoritative station list, template samples).
- **DEFERRED:** Deliberately postponed to a post-V1 release phase.
- **REJECTED:** Evaluated and eliminated from the project scope.

---

## 2. Decision Register Matrix

### DEC-001: Operational Execution Environment (Offline vs. Network)

- **Question:** Is the application officially required to run 100% offline without any internet connectivity?
- **Why It Matters:** Governs dependency management, runtime network calls, telemetry, update mechanisms, and asset packaging.
- **Available Options:**
  1. _Option A (Recommended):_ Fully air-gapped / 100% offline-capable execution. All runtime assets, styling, icons, and document engines bundled locally.
  2. _Option B:_ Hybrid model with optional local network drive synchronization.
- **Risks & Dependencies:** Control room workstations frequently reside on isolated operational networks (OT/air-gapped networks) with restricted public internet access.
- **Evidence Needed:** Control room network infrastructure and security policy confirmation.
- **Decision Owner:** User / Operations Management.
- **Current Status:** **PROVISIONAL / RECOMMENDED (Option A: 100% Offline Capability)**.

---

### DEC-002: Target Operating System Platforms

- **Question:** Is Windows 10/11 the exclusive target platform, or must macOS and Linux also be supported?
- **Why It Matters:** Determines desktop framework packaging, installer types (MSI, NSIS, EXE), path handling conventions, and platform-specific native APIs.
- **Available Options:**
  1. _Option A (Recommended):_ Windows 10 and 11 (64-bit) as the primary certified tier; architecture kept cross-platform neutral where zero penalty exists.
  2. _Option B:_ Strict multi-platform desktop release (Windows, macOS, Linux).
- **Risks & Dependencies:** Corporate control room environments are predominantly Windows-based. Supporting multi-platform expands QA matrix substantially.
- **Evidence Needed:** Operator workstation fleet specification.
- **Decision Owner:** User / Technical Architecture.
- **Current Status:** **PROVISIONAL / RECOMMENDED (Option A: Windows 10/11 Priority)**.

---

### DEC-003: Desktop Application Framework Selection

- **Question:** Which desktop runtime framework should be adopted (Tauri v2 vs. Electron vs. Alternative)?
- **Why It Matters:** Determines executable bundle size, RAM footprint, system webview dependencies, security sandbox model, and backend language (Rust vs. Node.js).
- **Available Options:**
  1. _Option A (Tauri v2 with Web Frontend):_ Ultra-lightweight binary (~15 MB), extremely low RAM usage (< 60 MB), high memory safety. Requires Rust document engines (which lack mature Word split-run templaters) or a 50 MB Node.js sidecar binary with complex IPC serialization.
  2. _Option B (Electron with React, TypeScript, and Node.js):_ Unified TypeScript ecosystem, native Node.js execution of mature Open XML engines (`exceljs` and `docxtemplater`), robust context isolation/sandboxing, seamless SQLite integration via `better-sqlite3`. Memory footprint (~130 MB RAM) is < 1% of control room workstation hardware (16–32 GB RAM).
- **Risks & Dependencies:** Electron installer size is ~95 MB; requires background worker threads to keep UI at 60 FPS.
- **Evidence Needed:** Step 5 Technology Evaluation (`EVAL-TECH-001`), ADR (`ADR-OPSREPORT-001`), and Step 7 PoC (`ADR-OPSREPORT-002`, `POC-RES-XLS-001`, `POC-RES-DOC-001`).
- **Decision Owner:** Principal Software Architect / Desktop Architect.
- **Current Status:** **CONFIRMED BASELINE (Option B: Electron + React + TypeScript + Native Node.js Open XML Engines — 100% Verified in Step 7 PoC)**.

---

### DEC-004: Supported Office Document File Formats

- **Question:** Which file extensions must be supported for import and generation?
- **Why It Matters:** Influences parser selection, format conversions, and compatibility guarantees.
- **Available Options:**
  1. _Option A (Recommended):_ Standard Open XML formats exclusively (`.xlsx` for Excel workbooks, `.docx` for Word documents).
  2. _Option B:_ Include legacy binary formats (`.xls`, `.doc`).
- **Risks & Dependencies:** Legacy binary formats (`.xls`/`.doc`) require completely different, obsolete, and fragile parsing engines and pose security vulnerabilities.
- **Evidence Needed:** Inspection of the operator's actual existing template collection.
- **Decision Owner:** User / Requirements Engineer.
- **Current Status:** **CONFIRMED BASELINE (Option A: `.xlsx` and `.docx` strictly)**.

---

### DEC-005: Macro-Enabled Document Support (`.xlsm`, `.docm`)

- **Question:** Must macro-enabled documents be supported, or should the initial release restrict processing to macro-free formats?
- **Why It Matters:** Macros introduce severe execution security hazards, complex VBA code retention issues during Open XML manipulation, and corporate antivirus flags.
- **Available Options:**
  1. _Option A (Recommended):_ Disallow macro-enabled files in V1; require clean `.xlsx` / `.docx` templates.
  2. _Option B:_ Support macro preservation without in-app macro execution.
- **Risks & Dependencies:** Open XML libraries can corrupt or strip VBA project streams during re-saving if not specifically configured.
- **Evidence Needed:** Sample templates from control room operators to inspect whether operational macros are present.
- **Decision Owner:** User / Senior QA Engineer.
- **Current Status:** **PROVISIONAL / RECOMMENDED (Option A: Restrict to `.xlsx`/`.docx` in V1; re-evaluate if user provides `.xlsm` templates)**.

---

### DEC-006: Preserved Workbook & Document Features

- **Question:** Which advanced document features must reliably survive report generation?
- **Why It Matters:** Document population engines can inadvertently strip formulas, conditional formatting rules, data validation dropdowns, embedded charts, headers/footers, or custom print areas.
- **Available Options:**
  1. _Option A (Full Fidelity Preservation):_ Utilize an Open XML manipulation strategy that injects values into cell nodes and runs without rebuilding or stripping unmapped XML parts.
  2. _Option B (Value-only Reconstruction):_ Re-generate clean worksheets containing only tabular data.
- **Risks & Dependencies:** Operators rely on existing template branding, column widths, summary formulas (`SUM`, `AVERAGE`), and formatted headers. Option B would degrade usability.
- **Evidence Needed:** Validation against actual customer templates during Step 4/5.
- **Decision Owner:** Desktop Application Architect.
- **Current Status:** **CONFIRMED BASELINE (Option A: Preserve existing formulas, formatting, column widths, and layout integrity)**.

---

### DEC-007: Scope of Built-In Reusable Template Creation

- **Question:** What functional depth is required for the in-app template creation feature (REQ-010)?
- **Why It Matters:** Building a full WYSIWYG spreadsheet/word processor inside an app is a multi-year project, whereas a structured schema/template builder is achievable and maintainable.
- **Available Options:**
  1. _Option A (Recommended):_ Structural Template & Schema Builder: Allows users to define report metadata, add station audit columns/fields, select standard styling/headers, assign output formats, and generate a standardized `.xlsx` / `.docx` master template.
  2. _Option B:_ Full interactive in-app visual spreadsheet canvas (formula bar, cell-by-cell visual styling engine).
- **Risks & Dependencies:** Option B violates the core principle of not turning the app into an office suite and conflicts with REQ-007.
- **Evidence Needed:** User workflow alignment.
- **Decision Owner:** User / Product Architect.
- **Current Status:** **PROVISIONAL / RECOMMENDED (Option A: Structured Schema & Layout Builder)**.

---

### DEC-008: Document Field Mapping Architecture

- **Question:** How will UI form fields map into target documents?
- **Why It Matters:** Determines whether operators need technical skills to import templates or whether the system automates mapping.
- **Available Options:**
  1. _Option A (Declarative Tag / Coordinate Mapping):_ In Excel, target cells are identified via explicit cell coordinates (`B4`), Named Ranges (`ReportDate`), or column headers (`Status`). In Word, via Content Controls or delimiters (`{{IncidentTime}}`).
  2. _Option B (Auto-Detection Heuristics with Visual Alignment UI):_ System scans template for placeholder tokens and provides a visual drag-and-drop / selector alignment interface.
- **Risks & Dependencies:** Rigid coordinates break if rows are inserted into the template; delimiter tokens (`{{tag}}`) provide resilient, format-preserving substitution.
- **Evidence Needed:** Analysis of sample templates in Step 2.
- **Decision Owner:** Desktop Application Architect.
- **Current Status:** **OPEN / PENDING SPIKE (Scheduled for template analysis spike)**.

---

### DEC-009: Authoritative Station Catalog & Ordering Source

- **Question:** What is the authoritative station list and sequence, and how will it be managed?
- **Why It Matters:** Station ordering is a strict operational requirement (REQ-008). Sequencing errors compromise regulatory reporting.
- **Available Options:**
  1. _Option A:_ Centrally managed, versioned Station Configuration file (JSON) with an in-app Station Manager interface for authorized supervisors.
  2. _Option B:_ Hardcoded station enum array.
- **Risks & Dependencies:** Hardcoding prevents adding, renaming, or reordering stations as rail/facility infrastructure evolves.
- **Evidence Needed:** Official station registry list provided by the user.
- **Decision Owner:** User.
- **Current Status:** **OPEN / PENDING USER INPUT (Awaiting user delivery of authoritative station list)**.

---

### DEC-010: Multi-Zone, Route, and Directional Variations

- **Question:** Does the operational environment require multiple station sequences (e.g., Northbound vs. Southbound, Zone A vs. Zone B, Sector 1 vs. Sector 2)?
- **Why It Matters:** Affects the data model for the station selection and inspection forms.
- **Available Options:**
  1. _Option A:_ Single linear sequence common to all station inspections.
  2. _Option B (Recommended Architecture):_ Route/Zone grouping model capable of filtering or sequencing by operational sector while defaulting to the primary sequence.
- **Risks & Dependencies:** Forcing a single sequence when shifts inspect different loops or zones causes operational friction.
- **Evidence Needed:** Operator shift guidelines and inspection protocols.
- **Decision Owner:** User.
- **Current Status:** **OPEN / PENDING INPUT**.

---

### DEC-011: Output File Naming & Destination Conventions

- **Question:** What file naming pattern and directory organization rules should generated reports follow?
- **Why It Matters:** Standardized filenames prevent overwriting, facilitate quick searching, and simplify archival.
- **Available Options:**
  1. _Option A (Recommended Pattern):_ `[ReportType]_[Station-or-Zone]_[YYYY-MM-DD]_[Shift]_[SequentialID].[ext]` (e.g., `StationLight_Station04_2026-10-19_Day_001.xlsx`).
  2. _Option B:_ Freeform manual file naming via standard OS Save dialog.
  3. _Option C:_ Configurable template string in application settings with automatic default.
- **Risks & Dependencies:** Freeform naming leads to chaotic disk organization and file-lock collisions.
- **Evidence Needed:** Existing control room document filing guidelines.
- **Decision Owner:** User / Business Analyst.
- **Current Status:** **APPROVED (Confirmed Business Rule: `[Category]_[Date]_[Station]_[Shift]_[Session].xlsx` pattern; components omitted when absent; optional custom prefix and safe manual override supported)**.

---

### DEC-012: Session Auto-Save & Draft State Recovery

- **Question:** Is automatic session state persistence required for in-progress report data?
- **Why It Matters:** Control room operators are subject to sudden operational emergencies (alarms, radio calls). Losing partially completed multi-station audits causes severe frustration.
- **Available Options:**
  1. _Option A (Recommended):_ Automatic local draft persistence (localStorage/IndexedDB or local JSON store) with an "Unfinished Reports / Restore Session" prompt.
  2. _Option B:_ Stateless form lifecycle (data lost if app is closed before generation).
- **Risks & Dependencies:** Storing drafts requires secure local storage and clear draft lifecycle/clearing rules.
- **Evidence Needed:** Control room workflow pacing assessment.
- **Decision Owner:** Technical Product Manager.
- **Current Status:** **PROVISIONAL / RECOMMENDED (Option A: Local draft persistence as P1 feature)**.

---

### DEC-013: Historical Audit Trail & Report Generation Log

- **Question:** Should OpsReport Studio maintain an internal local database of previously generated reports?
- **Why It Matters:** Provides accountability, quick re-opening of past reports, and prevents duplicate reporting.
- **Available Options:**
  1. _Option A (Recommended):_ Lightweight embedded SQLite/local database recording metadata of generated reports (Date, Operator, Report Type, Output File Path, Hash).
  2. _Option B:_ No database; filesystem only.
- **Risks & Dependencies:** SQLite adds a local persistence layer but guarantees high reliability and zero network dependencies.
- **Evidence Needed:** Audit and compliance reporting requirements.
- **Decision Owner:** Technical Product Manager.
- **Current Status:** **PROVISIONAL / RECOMMENDED (Option A: Lightweight local generation log)**.

---

### DEC-014: Direct PDF Export Requirement

- **Question:** Is direct PDF generation required in V1, or should it be deferred to a later release?
- **Why It Matters:** Headless cross-platform conversion of `.xlsx` and `.docx` to PDF without Microsoft Office installed typically requires hefty rendering dependencies (e.g., LibreOffice headless or specialized commercial libraries).
- **Available Options:**
  1. _Option A (Recommended):_ Defer direct PDF generation to Phase 2; focus V1 on high-fidelity `.xlsx` and `.docx` output.
  2. _Option B:_ Integrate PDF rendering via headless document printer or specialized library in V1.
- **Risks & Dependencies:** Attempting headless PDF rendering without Office can inflate app binary size by 200MB+ or introduce font rendering inconsistencies.
- **Evidence Needed:** Clarification on whether operators currently submit `.xlsx`/`.docx` directly or must submit PDFs.
- **Decision Owner:** User / Product Architect.
- **Current Status:** **CANDIDATE / DEFERRED TO PHASE 2 (Option A)**.

---

### DEC-015: Microsoft Office Runtime Dependency

- **Question:** Must the application operate completely standalone without requiring Microsoft Office (Excel/Word) installed on the client machine?
- **Why It Matters:** Dictates whether COM interop / Office automation can be considered or if a 100% headless Open XML library is mandatory.
- **Available Options:**
  1. _Option A (Recommended):_ 100% Standalone Open XML processing. No Microsoft Office, COM automation, or Office license required on the host system.
  2. _Option B:_ Rely on Microsoft Office COM automation.
- **Risks & Dependencies:** COM interop is notoriously brittle, crashes frequently in background processes, is Windows-only, and requires active Office installations. Standalone Open XML is fast, headless, and robust.
- **Evidence Needed:** Workstation software licensing policy.
- **Decision Owner:** Desktop Application Architect.
- **Current Status:** **CONFIRMED BASELINE (Option A: 100% Standalone Headless Processing)**.

---

### DEC-016: Network Share / UNC Path Integration

- **Question:** Must OpsReport Studio provide built-in synchronization with corporate SMB network shares / UNC paths (`\\server\opsreports\`)?
- **Why It Matters:** Control room operators frequently archive reports to shared departmental network drives.
- **Available Options:**
  1. _Option A (Recommended):_ Standard filesystem path routing: Users can configure their default export folder to any mapped drive or accessible UNC path.
  2. _Option B:_ Automated background synchronization queue with offline retry logic.
- **Risks & Dependencies:** Option B introduces complex network retry daemons and conflict resolution. Standard OS file routing (Option A) is robust and transparent.
- **Evidence Needed:** Operator filing workflow habits.
- **Decision Owner:** Technical Product Manager.
- **Current Status:** **PROVISIONAL / RECOMMENDED (Option A: Standard path routing to local or network targets)**.

---

### DEC-017: User Authentication & Role-Based Access Control

- **Question:** Is in-app login/authentication required, or does the application rely on workstation OS security?
- **Why It Matters:** Multi-user authentication requires credential stores, password management, session timeouts, and role definitions.
- **Available Options:**
  1. _Option A (Recommended for V1):_ Single-tier operational workstation model: Operator enters their Name / Badge ID in report metadata fields; relies on OS-level workstation security.
  2. _Option B:_ In-app role-based access control (Operator vs. Supervisor/Template Admin).
- **Risks & Dependencies:** Adding complex authentication to a dedicated control room tool adds unnecessary friction during urgent incident logging.
- **Evidence Needed:** Security policy requirements for the control room.
- **Decision Owner:** User / Operations Security.
- **Current Status:** **PROVISIONAL / RECOMMENDED (Option A for V1; evaluate PIN-based supervisor mode for template editing)**.

---

### DEC-018: Master Template Backup & Disaster Recovery

- **Question:** How will imported and authored master templates be protected against accidental deletion or filesystem corruption?
- **Why It Matters:** Core product objective is master template safety (REQ-006).
- **Available Options:**
  1. _Option A (Recommended):_ Managed Internal Template Vault: When a template is imported, it is copied into a protected application data vault directory and marked read-only at the OS filesystem level. A baseline default backup bundle is maintained.
  2. _Option B:_ Referencing external file paths directly on the user's desktop.
- **Risks & Dependencies:** Referencing external paths risks broken links if the operator moves or deletes the file from their desktop.
- **Evidence Needed:** Application data directory permissions audit.
- **Decision Owner:** Senior QA Engineer / Architect.
- **Current Status:** **CONFIRMED BASELINE (Option A: Managed Internal Template Vault)**.

---

### DEC-019: Confidentiality & Local Data Storage Security

- **Question:** What security safeguards must apply to cached incident descriptions, witness statements, and security logs?
- **Why It Matters:** Security incident reports may contain sensitive details, personal names, or proprietary facility security vulnerabilities.
- **Available Options:**
  1. _Option A (Recommended):_ Encrypted or restricted local app data directory (Windows DPAPI / restricted ACLs) with configurable cache-retention purging.
  2. _Option B:_ Plaintext unencrypted local storage.
- **Risks & Dependencies:** Plaintext storage on shared control room consoles could expose sensitive security records to unauthorized shifts.
- **Evidence Needed:** Corporate data classification guidelines.
- **Decision Owner:** Technical Product Manager / Security Lead.
- **Current Status:** **PROVISIONAL / RECOMMENDED (Option A: Restricted ACL local storage with privacy purge controls)**.

---

### DEC-020: Deterministic Processing vs. AI / LLM Integrations

- **Question:** Should OpsReport Studio include AI-assisted incident narrative generation or remain strictly deterministic in V1?
- **Why It Matters:** Research documents proposed local LLMs/SLMs for grammar correction and incident summarization. However, regulatory and incident reporting demands 100% deterministic accuracy without hallucinations.
- **Available Options:**
  1. _Option A (Recommended):_ 100% Deterministic rule-based processing for V1. What the operator types is exactly what is validated and exported.
  2. _Option B:_ Integrate local/cloud LLM for report drafting.
- **Risks & Dependencies:** LLMs introduce nondeterministic outputs, huge resource consumption (multi-gigabyte model weights), and regulatory verification hurdles.
- **Evidence Needed:** Explicit user requirement. (Currently absent from user requirements).
- **Decision Owner:** User / Requirements Engineer.
- **Current Status:** **CONFIRMED BASELINE (Option A: 100% Deterministic Processing for V1; LLMs excluded)**.

---

### DEC-021: Export Destination Collision Policy

- **Question:** What policy must apply when a generated report output filename collides with an existing file in the user's destination folder?
- **Why It Matters:** Prevents silent overwriting of prior operational reports while avoiding frustrating generation aborts.
- **Available Options:**
  1. _Option A (Recommended):_ Safe Auto-Incrementation (`RENAME_SAFE`). Automatically appends a sequential numeric suffix (e.g., `Report_01_v2.xlsx`) if the file exists, with an optional prompt preference in user settings.
  2. _Option B:_ Silent Overwrite. (REJECTED - High risk of data loss).
  3. _Option C:_ Hard Abort. Halts generation completely and requires manual file deletion.
- **Risks & Dependencies:** Operators need predictable filenames without accidental data destruction.
- **Evidence Needed:** Application Architecture Specification (`ARCH-SPEC-002`, `DATA-LIFE-001`).
- **Decision Owner:** Principal Software Architect / QA Architect.
- **Current Status:** **CONFIRMED BASELINE (Option A: Safe Auto-Incrementation `RENAME_SAFE` with non-destructive fallback)**.

---

### DEC-022: Concurrency & Generation Execution Model

- **Question:** Should OpsReport Studio allow concurrent generation of multiple documents simultaneously, or enforce a single-job execution lock?
- **Why It Matters:** Governs resource consumption, scratch directory contention, worker pool sizing, and UI race conditions.
- **Available Options:**
  1. _Option A (Recommended for V1):_ Single-Job Execution Lock. Only one generation operation runs at a time; subsequent clicks are blocked until completion.
  2. _Option B:_ Parallel Multi-Job Queue. Spawns multiple worker threads for concurrent batch generation.
- **Risks & Dependencies:** Parallel generation increases peak RAM/CPU usage and risks race conditions on user export folders. Control room operators generate reports sequentially per shift.
- **Evidence Needed:** Architecture Test Plan (`TEST-ARCH-001`, Section 5).
- **Decision Owner:** Principal Software Architect.
- **Current Status:** **CONFIRMED BASELINE (Option A: Single-Job Execution Lock for V1)**.

---

### DEC-023: Cross-Resource Transaction & Reconciliation Protocol

- **Question:** How should atomic consistency be maintained between the local SQLite database (`opsreport.db`) and host filesystem without a distributed 2PC coordinator?
- **Why It Matters:** System crashes midway through generation could leave orphaned files or inconsistent database records.
- **Available Options:**
  1. _Option A (Recommended):_ Two-Phase Reservation Pattern. Create a `PENDING` reservation in SQLite, execute scratch generation and atomic file move, then commit to `COMPLETED`. Startup sweep cleans up any stale `PENDING` entries and orphaned scratch files.
  2. _Option B:_ Optimistic generation without DB reservation.
- **Risks & Dependencies:** Distributed two-phase commit is impossible on local desktop OS filesystems; reconciliation must be handled by the application lifecycle.
- **Evidence Needed:** Data Lifecycle Specification (`DATA-LIFE-001`, Section 8).
- **Decision Owner:** Principal Software Architect / Data Architect.
- **Current Status:** **CONFIRMED BASELINE (Option A: Two-Phase Reservation Pattern with Startup Sweep)**.

---

### DEC-024: Automated Diagnostic Log Sanitization Policy

- **Question:** How must confidential incident narratives, witness statements, and inspector identifiers be protected from leaking into technical log files?
- **Why It Matters:** Technical logs stored in `%LOCALAPPDATA%\Logs` may be inspected for troubleshooting. Logging raw report payloads violates operational confidentiality (`NFR-SEC-01`, `DEC-019`).
- **Available Options:**
  1. _Option A (Recommended):_ Interceptor Redaction Filter. All logging calls pass through a centralized redaction filter in `MOD-12` that replaces sensitive field keys (`FLD-INC-NARRATIVE`, `FLD-INC-WITNESS`, badge numbers) with `[REDACTED_CONFIDENTIAL]`.
  2. _Option B:_ Developer discipline / manual filtering per log call.
- **Risks & Dependencies:** Manual filtering inevitably suffers developer oversight; automated structural filtering guarantees privacy.
- **Evidence Needed:** Security Threat Model (`SEC-THREAT-001`, Section 7).
- **Decision Owner:** Application Security Architect.
- **Current Status:** **CONFIRMED BASELINE (Option A: Mandatory Interceptor Redaction Filter in `MOD-12`)**.

---

### DEC-025: Draft Session Station Sequence Snapshotting

- **Question:** How should an in-progress multi-station draft behave if an administrator modifies the authoritative station list before the draft is exported?
- **Why It Matters:** Altering the active station list while an operator has partially entered observations could scramble row mappings or corrupt sequence ordinality (`REQ-008`).
- **Available Options:**
  1. _Option A (Recommended):_ Immutable Draft Sequence Snapshot. The draft stores a frozen JSON snapshot of the station sequence at the time the session was initialized. The draft continues with that sequence; upon reload, a non-blocking reconciliation banner notifies the operator.
  2. _Option B:_ Force-update draft stations on load (risks silent data loss or column mismatch).
- **Risks & Dependencies:** Station configuration changes are rare in production, but active drafts must be resilient against schema drift.
- **Evidence Needed:** Data Lifecycle Specification (`DATA-LIFE-001`, Section 4).
- **Decision Owner:** Data Architect / Senior QA Architect.
- **Current Status:** **CONFIRMED BASELINE (Option A: Immutable Draft Station Snapshotting)**.

---

### DEC-026: Master Template Vault Physical Storage Location

- **Question:** Exactly where on the host filesystem should imported and approved master templates be stored?
- **Why It Matters:** Governs access control, user permission isolation, and protection against accidental user deletion.
- **Available Options:**
  1. _Option A (Recommended):_ Dedicated Application Vault in `%LOCALAPPDATA%\OpsReportStudio\Templates\` with OS `FILE_ATTRIBUTE_READONLY` set upon enrollment.
  2. _Option B:_ Leaving templates in arbitrary user download/desktop folders and referencing paths. (REJECTED - High risk of broken paths or accidental deletion).
- **Risks & Dependencies:** Roaming profiles vs. local app data; local app data is standard for Windows desktop application assets.
- **Evidence Needed:** File Storage Specification (`FILE-STORAGE-SPEC-001`, Section 3.1).
- **Decision Owner:** Principal Software Architect / Application Security Engineer.
- **Current Status:** **CONFIRMED BASELINE (Option A: Protected Vault in `%LOCALAPPDATA%\OpsReportStudio\Templates\`)**.

---

### DEC-027: Relational Database Migration & Versioning Strategy

- **Question:** How should embedded SQLite database schema changes be managed across future application releases?
- **Why It Matters:** Prevents corrupted schemas, broken foreign keys, or loss of user report drafts during application updates.
- **Available Options:**
  1. _Option A (Recommended):_ Sequential versioned SQL scripts tracked via SQLite's internal `PRAGMA user_version`. Each migration runs inside an explicit atomic transaction; downgrade attempts by older builds are blocked.
  2. _Option B:_ Heavy ORM auto-synchronization (e.g., TypeORM/Prisma schema sync). (REJECTED - Prone to silent destructive alters).
- **Risks & Dependencies:** Must ensure zero data loss on user drafts and history tables.
- **Evidence Needed:** Persistence Design Specification (`PERSIST-SPEC-001`, Section 4).
- **Decision Owner:** Database Designer / Senior Data Architect.
- **Current Status:** **CONFIRMED BASELINE (Option A: Transactional Sequential Migrations via `PRAGMA user_version`)**.

---

### DEC-028: Target Project Directory Structure Architecture

- **Question:** How should the source code, build scripts, tests, and static assets be organized in Step 9?
- **Why It Matters:** Enforces architectural module boundaries (`MOD-01` to `MOD-13`), isolates untrusted renderer code from trusted main/worker code, and prevents PoC code bleed into production.
- **Available Options:**
  1. _Option A (Recommended):_ Clean Process & Layer Partitioning: `src/main/` (Electron main & IPC), `src/preload/` (ContextBridge guards), `src/renderer/` (Sandboxed React UI), `src/worker/` (Headless document engine), `src/domain/` (Pure logic), `src/storage/` (SQLite & Vault), and `src/shared/` (Types/DTOs).
  2. _Option B:_ Flat single-directory or feature-slice-only layout. (REJECTED - Conflates process execution boundaries).
- **Risks & Dependencies:** Multi-target TypeScript compilation (`tsconfig.node.json` vs `tsconfig.web.json`).
- **Evidence Needed:** Project Structure Blueprint (`STRUCT-BLUEPRINT-001`, Section 2).
- **Decision Owner:** Principal Software Architect.
- **Current Status:** **CONFIRMED BASELINE (Option A: Process & Layer Partitioned Directory Tree for Step 9)**.

---

### DEC-029: In-Progress Draft Session Retention & Pruning Horizon

- **Question:** How long should unfinished report drafts remain stored in the local SQLite database before being flagged for deletion?
- **Why It Matters:** Prevents unbounded accumulation of stale or abandoned report sessions on shared control room consoles.
- **Available Options:**
  1. _Option A (Recommended):_ 30-Day Inactivity Horizon. Drafts untouched for > 30 days prompt the operator with an optional cleanup advisory upon startup; auto-purge is disabled to avoid accidental data destruction.
  2. _Option B:_ Immediate purge on application exit. (REJECTED - Defeats crash recovery).
- **Risks & Dependencies:** Operator shifts may be delayed or extended across weeks.
- **Evidence Needed:** Data Model Specification (`DATA-MODEL-SPEC-001`, Section 6).
- **Decision Owner:** Product Manager / Senior QA Architect.
- **Current Status:** **PROVISIONAL / RECOMMENDED (Option A: 30-Day Inactivity Horizon with Non-Destructive Advisory)**.

---

### DEC-030: Physical Document vs. Database Metadata Separation Policy

- **Question:** Should Excel workbooks and Word documents ever be stored directly as binary BLOBs inside SQLite tables?
- **Why It Matters:** Storing large multi-megabyte binary documents in SQLite causes massive database file bloat, slow page cache lookups, and risks catastrophic database corruption if a binary write fails.
- **Available Options:**
  1. _Option A (Recommended):_ Strict Storage Segregation. Physical documents reside exclusively in the filesystem (Vault for masters, User Destination for outputs). The database stores only metadata, SHA-256 fingerprints, and relative file paths.
  2. _Option B:_ Storing template documents as SQLite BLOBs. (REJECTED - Architectural anti-pattern for desktop file automation).
- **Risks & Dependencies:** Requires explicit reconciliation between database records and filesystem paths.
- **Evidence Needed:** Data Model Specification (`DATA-MODEL-SPEC-001`, Section 1.1) and File Storage Specification (`FILE-STORAGE-SPEC-001`).
- **Decision Owner:** Senior Data Architect / Application Security Engineer.
- **Current Status:** **CONFIRMED BASELINE (Option A: Strict Storage Segregation — Database Stores Metadata Only)**.

---

### DEC-031: Step 9 Build Toolchain, Multi-Target TypeScript & Smoke Verification

- **Question:** How should the production build system, dual TypeScript compiler environments, and smoke verification be structured in Step 9?
- **Why It Matters:** Guarantees deterministic compilation without emitting stray `.d.ts` or `.js` files into source directories, separates Node.js backend types from Web browser DOM types, and provides an automated health gate.
- **Available Options:**
  1. _Option A (Recommended & Implemented):_ Dual-target configuration with `tsconfig.node.json` (ES2022, bundler resolution, Node types, `noEmit: true`) and `tsconfig.web.json` (ES2020, React JSX, DOM types, `noEmit: true`), coupled with Vite dual-compilation (`vite-plugin-electron`), dedicated `vitest.config.ts`, and automated Vitest smoke test suite (`foundation.test.ts`).
  2. _Option B:_ Single monolithic `tsconfig.json` combining DOM and Node types. (REJECTED - Causes type namespace pollution between Node built-ins and Web APIs).
- **Risks & Dependencies:** Dual tsconfig requires explicit references and separated include paths.
- **Evidence Needed:** Step 9 Foundation Change Report (`STEP_09_FOUNDATION_REPORT.md`).
- **Decision Owner:** Principal Software Architect / Senior Build & Release Engineer.
- **Current Status:** **CONFIRMED BASELINE (Option A: Dual-Target TS, Vite 5 Dual Bundling & Dedicated Vitest Runner)**.

---

### DEC-032: Shared Branded Identifiers, Discriminated Result & Centralized AppError Model

- **Question:** How should domain identifiers, operational outcomes, and exceptions be typed and normalized across modular boundaries?
- **Why It Matters:** Raw string IDs cause accidental transpositions (`StationId` vs `TemplateId`); untyped throws cause unhandled promise rejections; and raw JavaScript stack traces leak internal paths and sensitive operational data to users.
- **Available Options:**
  1. _Option A (Recommended & Implemented):_ Adopt nominal branded types (`Brand<string, Tag>`) for semantic IDs; use the discriminated `Result<T, E>` pattern for operational functions; implement `AppError` with 24 authoritative codes separating non-technical user messages from internal diagnostics; enforce `toSerializableError()` across IPC boundaries; and apply automated redaction on incident narratives, witnesses, and badge IDs.
  2. _Option B:_ Unrestricted primitive strings, raw native `Error` throwing, and ad-hoc error handling in UI components. (REJECTED - Prone to silent data corruption, runtime panics, and privacy leaks).
- **Risks & Dependencies:** Developers must use constructor helpers (`toStationId`) and normalize errors at system boundaries.
- **Evidence Needed:** Step 10 Type Foundation Report (`STEP_10_TYPE_FOUNDATION_REPORT.md`), `TYPESCRIPT_STANDARDS.md`, `ERROR_HANDLING_STANDARDS.md`.
- **Decision Owner:** Principal TypeScript Architect / Senior QA Automation Engineer.
- **Current Status:** **CONFIRMED BASELINE (Option A: Branded IDs, Discriminated Result & AppError Model)**.

---

### DEC-033: Design System Tokens, Dual-Theme Architecture & WCAG 2.2 AA Contrast Standards

- **Question:** How should visual styles, color tokens, and theme preferences be structured across the desktop user interface?
- **Why It Matters:** Hard-coded colors and arbitrary font sizes lead to inconsistent component ergonomics, poor readability during 24/7 control room shifts, and accessibility violations.
- **Available Options:**
  1. _Option A (Recommended & Implemented):_ Centralize all styling tokens into semantic CSS custom properties in `tokens.css`; establish distinct Dark (`#0b1120`) and Light (`#ffffff`) themes controlled by a document-level `[data-theme]` attribute; persist preferences in `localStorage` under `opsreport_theme_preference` with automatic 'system'/'dark' fallbacks; and verify WCAG 2.2 Level AA contrast (>= 4.5:1 text, >= 3:1 controls) via automated test suites.
  2. _Option B:_ Inline ad-hoc CSS styling per component without centralized tokens or dynamic dark/light switching. (REJECTED - Inconsistent, unmaintainable, inaccessible).
- **Risks & Dependencies:** Future UI components in Step 12+ must consume `var(--color-...)` tokens exclusively.
- **Evidence Needed:** Step 11 Design System Report (`STEP_11_DESIGN_SYSTEM_REPORT.md`), `OPSREPORT_STUDIO_DESIGN_SYSTEM.md`, `OPSREPORT_STUDIO_THEME_SPECIFICATION.md`.
- **Decision Owner:** Principal Product Designer / Frontend Architect.
- **Current Status:** **CONFIRMED BASELINE (Option A: Semantic CSS Tokens, Dual Theme Architecture & WCAG 2.2 AA Verification)**.

---

### DEC-034: Application Shell, Centralized Navigation Model & Truthful State Presentation

- **Question:** How should the desktop application layout, view switching, and placeholder states for planned features be architected in Step 12?
- **Why It Matters:** Hard-coded routing or scattered navigation links lead to layout duplication, fragile view switching, and confusing user experiences. Displaying fabricated records or simulated generation outcomes misleads users and undermines QA integrity.
- **Available Options:**
  1. _Option A (Recommended & Implemented):_ Establish a responsive two-column desktop shell (`AppShell`) binding `Sidebar`, `AppHeader`, and `<main id="main-content">` with accessible HTML5 landmarks and skip-links; govern view switching through a single authoritative registry (`PRIMARY_NAV_ITEMS`) and `NavigationContext`; preserve the foundation diagnostics card satisfying SMK-07; render an introductory static scope reference of the 7 planned report categories; and represent unbuilt destinations (`Reports`, `Templates`, `Stations`, `History`) using an honest `PlaceholderView` with clear roadmap attribution and return navigation.
  2. _Option B:_ Install complex browser-based client routers (e.g. React Router) with arbitrary route guards, fabricate recent reports feeds, and create mock template records. (REJECTED - Adds unnecessary dependencies, creates maintenance churn, and violates truthful reporting requirements).
- **Risks & Dependencies:** Future roadmap steps must register new active views in `navigation-config.ts` and `App.tsx`.
- **Evidence Needed:** Step 12 Completion Report (`STEP_12_APPLICATION_SHELL_REPORT.md`), `APPLICATION_SHELL_AND_NAVIGATION.md`.
- **Decision Owner:** Principal Product Designer / Desktop Application Architect.
- **Current Status:** **CONFIRMED BASELINE (Option A: Centralized Navigation Context, Semantic Shell & Truthful State Presentation)**.

---

### DEC-035: SQLite Database Driver, Schema Versioning & Low-Level Persistence Architecture

- **Question:** Which SQLite driver, schema migration approach, connection PRAGMAs, and repository architecture should be implemented in Step 13?
- **Why It Matters:** Database crashes, missing foreign key enforcement, or asynchronous thread pool bottlenecks can corrupt data and freeze desktop applications. Storing Office templates directly in SQLite BLOBs or hardcoding database file locations undermines portability and reliability.
- **Available Options:**
  1. _Option A (Recommended & Implemented):_ Adopt `better-sqlite3` (v11+) executing synchronously within the Node.js main/worker processes; store the database at `%LOCALAPPDATA%\OpsReportStudio\Database\opsreport.db`; enforce mandatory PRAGMAs (`journal_mode = WAL`, `foreign_keys = ON`, `synchronous = NORMAL`, `busy_timeout = 5000`); implement deterministic forward-only schema migrations tracking versions in `schema_migrations` and `PRAGMA user_version` with automatic downgrade protection; implement `StationRepository` with contiguous ordinal sequence ordering and transactional atomic reordering; seed the 7 confirmed report categories while keeping the stations table empty; and map all errors to `AppError`.
  2. _Option B:_ Adopt asynchronous `sqlite3` driver with ORMs (Prisma / TypeORM), store templates as database BLOBs, or use arbitrary unversioned SQL scripts. (REJECTED - High thread-pool contention, unnecessary abstraction weight, and violates storage segregation principles).
- **Risks & Dependencies:** Step 14 station management must consume `StationRepository` and preserve the `display_order ASC` query sequence.
- **Evidence Needed:** Step 13 Completion Report (`STEP_13_DATABASE_IMPLEMENTATION_REPORT.md`), `OPSREPORT_STUDIO_DATABASE_SCHEMA.md`, `OPSREPORT_STUDIO_PERSISTENCE_GUIDE.md`.
- **Decision Owner:** Principal Database Architect / Senior SQLite Engineer.
- **Current Status:** **CONFIRMED BASELINE (Option A: better-sqlite3 WAL, Versioned Migrations & Repository Architecture)**.

---

### DEC-036: Station Management UI, Accessible Ordering & IPC Architecture

- **Question:** How should the desktop user interface, IPC communication bridge, and contiguous operational sequence management be architected for Step 14?
- **Why It Matters:** Station order in OpsReport Studio directly governs table row sequences in generated Excel and Word reports. If stations are sorted alphabetically, or if ordering updates fail partially, report consistency is permanently damaged. Exposing raw SQL execution to the renderer violates application security.
- **Available Options:**
  1. _Option A (Recommended & Implemented):_ Connect the React renderer to the SQLite database via a sandboxed, context-isolated Electron IPC bridge (`window.opsreport.stations`); provide an in-memory fallback client for tests and standalone previews; display stations in strictly persisted operational order (`display_order ASC`); implement accessible operational sequence controls (Move Up/Down) that execute atomic swaps within an isolated database transaction; enforce case-insensitive name uniqueness and 1..150 character constraints; automatically re-index remaining stations upon deletion to guarantee a contiguous 1..N sequence without gaps; and provide an honest empty state awaiting user configuration without invented production station records.
  2. _Option B:_ Implement client-side drag-and-drop requiring third-party libraries, sort stations alphabetically by default, allow arbitrary gaps in display orders, and expose direct SQLite execution strings over IPC. (REJECTED - Inaccessible, violates contiguous ordering invariant, creates security vulnerabilities, and breaks document generator sequence requirements).
- **Risks & Dependencies:** Future Step 16 report draft workflows will read the authoritative station list directly from this persistence layer.
- **Evidence Needed:** Step 14 Implementation Report (`STEP_14_STATION_MANAGEMENT_REPORT.md`), `STATION_MANAGEMENT_PERSISTENCE_CONTRACT.md`.
- **Decision Owner:** Senior Full-Stack/Desktop Application Engineer / Senior UI/UX Engineer.
- **Current Status:** **CONFIRMED BASELINE (Option A: Context-Isolated IPC, Contiguous Reordering & Accessible Station Management)**.

---

### DEC-037: Report Category Registry & Template Metadata Architecture

- **Question:** How should the operational report category registry, category lifecycle rules, and template metadata foundation be architected and persisted in Step 15?
- **Why It Matters:** Mixing template files with metadata records creates confusion and bloat. Cascading deletions of report categories could silently destroy historical reports or template configurations. Hardcoding category lists in individual UI screens creates synchronization bugs across reporting workflows.
- **Available Options:**
  1. _Option A (Recommended & Implemented):_
     - Maintain an authoritative, versioned relational schema in SQLite via Migration 002 (`002_category_lifecycle_and_template_metadata.ts`) with schema version 2.
     - Extend `report_categories` with lifecycle columns (`is_active`, `updated_at`) and active index. Preserve the 7 confirmed initial categories: Security Incident (`WORD_DOCX`), Station Light (`EXCEL_XLSX`), Fan (`EXCEL_XLSX`), Pole Light (`EXCEL_XLSX`), Fire Extinguisher (`EXCEL_XLSX`), Pillar (`EXCEL_XLSX`), Fence (`EXCEL_XLSX`).
     - Enforce deletion restrictions: built-in system categories cannot be deleted; categories referenced by template metadata records cannot be deleted (`ON DELETE RESTRICT`). Deactivation is supported for retiring categories without breaking references.
     - Establish `template_metadata` table linking template descriptors to report categories via foreign key, tracking document format (`EXCEL_XLSX` / `WORD_DOCX`), lifecycle status (`DRAFT`, `ACTIVE`, `ARCHIVED`), and master template filename reference.
     - Seed 7 default template descriptors for the initial categories (`INSERT OR IGNORE`) so repeated initialization never duplicates records or overwrites customizations.
     - Expose typed IPC bridges (`window.opsreport.categories`, `window.opsreport.templates`) with corresponding Electron and InMemory client services for seamless testability.
     - Activate the `Templates & Categories` view in the shell navigation with two dedicated tabs, search, filtering, accessible modals, and honest notices clarifying that physical template file storage/import belongs to Step 17 Vault.
  2. _Option B:_ Store categories as client-side constants in React, simulate fake document import before the vault exists, allow cascade deletion of categories, or store templates directly as database BLOBs. (REJECTED - Violates data integrity, creates mock file synchronization problems, and violates scope boundaries).
- **Risks & Dependencies:** Future Step 16 (Report Session Persistence) and Step 17 (Template Vault) will build directly on these category IDs and template metadata IDs.
- **Evidence Needed:** Step 15 Completion Report (`STEP_15_CATEGORY_AND_TEMPLATE_REPORT.md`), `OPSREPORT_STUDIO_DATABASE_SCHEMA.md`.
- **Decision Owner:** Senior Desktop Application Engineer / Senior Database Architect.
- **Current Status:** **CONFIRMED BASELINE (Option A: Versioned Migration 002, Relational Restrict Integrity, Dual Registry & Honest Metadata Presentation)**.

---

### DEC-038: Report Session Data Model, Frozen Station Snapshots & Draft Recovery Architecture

- **Question:** How should report sessions, partial drafts, dynamic category payloads, and associated station lists be modeled and persisted for Step 16?
- **Why It Matters:** Control-room operators frequently draft reports across shifts or experience application interruptions. If station reordering or renaming in global settings mutates historical drafts, report consistency is corrupted. If incomplete form data is unpersisted or stored without transactional boundaries, operators lose vital inspection findings.
- **Available Options:**
  1. _Option A (Recommended & Implemented):_
     - Maintain an authoritative, versioned relational schema in SQLite via Migration 003 (`003_report_session_and_draft_persistence.ts`) advancing schema to version 3.
     - Establish `report_sessions` table with stable branded identifier (`ReportSessionId`), foreign key references to `report_categories(category_id)` (`ON DELETE RESTRICT`) and `template_metadata(template_id)` (`ON DELETE SET NULL`), explicit lifecycle status (`DRAFT`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`), schema versioning (`payload_version`), serialized JSON draft payload (`form_data`), and consistent ISO 8601 UTC timestamps.
     - Implement `report_session_stations` junction table capturing an immutable frozen station snapshot (`DEC-025`) preserving sequence order, station name, and station code at the time of drafting. Reordering canonical stations in global settings does not mutate session snapshots.
     - Enforce referential integrity: reject category or station deletions if referenced by report sessions; cascade session deletion cleanly to associated station snapshots.
     - Expose typed `SessionRepository` providing atomic transaction-backed `createSession`, `getSessionById`, `updateSessionDraft`, `getResumableSessions`, `getAllSessions`, and `deleteSession`.
     - Expose typed IPC bridge (`window.opsreport.sessions`) and dual-mode client (`ElectronSessionClient`, `InMemorySessionClient`).
     - Strictly exclude report-entry forms (Steps 34–36), autosave UI (Step 38), and document generation engines (Steps 26–33, 40) from Step 16 scope.
  2. _Option B:_ Store drafts in browser `localStorage`, create competing JSON files on disk, store dynamic station queries without frozen snapshots, or build premature UI editors. (REJECTED - Prone to silent data corruption, historical data mutations, and scope violation).
- **Risks & Dependencies:** Future Step 34–36 report entry forms and Step 38 draft recovery UI will consume `SessionRepository` and `SessionClient` without modifying the underlying persistence schema.
- **Evidence Needed:** Step 16 Completion Report (`STEP_16_REPORT_SESSION_PERSISTENCE_REPORT.md`), `OPSREPORT_STUDIO_DATABASE_SCHEMA.md`.
- **Decision Owner:** Senior Database Architect / Senior Application Engineer / Senior Data Integrity Engineer.
- **Current Status:** **CONFIRMED BASELINE (Option A: Versioned Migration 003, Relational Integrity, Frozen Station Snapshots & Transactional Draft Recovery)**.

---

### DEC-039: Master Template Vault, Storage Separation & Filesystem Security

- **Question:** How should OpsReport Studio organize, initialize, and safeguard application-managed master templates, ephemeral processing scratch files, and generated outputs while protecting original user files and preventing path traversal vulnerabilities?
- **Why It Matters:** Storing reusable templates in arbitrary user directories or the application installation folder creates security risks, permission failures, and race conditions. Allowing screens or generated reports to write directly into template storage risks overwriting original master documents (`INV-DAT-006`). Path traversal sequences (`..`) or null bytes in template/session identifiers could compromise the host filesystem.
- **Available Options:**
  1. _Option A (Recommended & Implemented):_
     - Establish a centralized `VaultManager` singleton owning all application-managed filesystem locations, idempotent directory initialization, and secure path resolution.
     - Strictly follow the Windows desktop standard `%LOCALAPPDATA%\OpsReportStudio` (with cross-platform fallbacks) and maintain complete logical and physical separation between:
       - Master Template Vault: `%LOCALAPPDATA%\OpsReportStudio\Templates\`
       - Ephemeral Scratch Sandbox: `%LOCALAPPDATA%\OpsReportStudio\Scratch\`
       - Generated Report Outputs: `%LOCALAPPDATA%\OpsReportStudio\Reports\`
       - Relational Database: `%LOCALAPPDATA%\OpsReportStudio\Database\`
       - Diagnostic Logs: `%LOCALAPPDATA%\OpsReportStudio\Logs\`
       - Recovery Backups: `%LOCALAPPDATA%\OpsReportStudio\Backups\`
     - Use stable internal identifiers (`TemplateId`) as the sole filesystem storage key (`{templateId}.{xlsx|docx}`), keeping editable display names, categories, and station names strictly in database metadata.
     - Enforce strict filesystem security boundaries: reject null bytes, reject path traversal (`..`), enforce alphanumeric identifier patterns (`^[A-Za-z0-9_-]{1,64}$`), canonicalize paths with case-insensitive boundary checks on Windows (`assertPathInsideRoot`), and assert that report outputs never target the master vault (`assertTargetNotInsideVault`).
     - Provide automatic startup sweeps of stale `.tmp` files in the scratch directory older than 15 minutes.
     - Require zero database schema migration (schema remains version 3; Step 15 `template_metadata` already stores `template_id` and `file_name`).
     - Expose typed IPC bridge (`window.opsreport.vault`) and dual-mode client (`ElectronVaultClient`, `InMemoryVaultClient`).
     - Integrate vault storage readiness status directly into the existing `TemplatesView.tsx` without creating duplicate screens.
     - Strictly exclude template file import (Step 18), file parsing, cloning/versioning (Step 19), or document generation engines.
  2. _Option B:_ Store templates inside the application source or install folder, construct arbitrary filesystem paths in React components, use user display names as filenames, or allow output reports to overwrite master templates. (REJECTED - Violates desktop security standards, creates path traversal risks, and violates `INV-DAT-006`).
- **Risks & Dependencies:** Future Step 18 (Template Import & Validation) and Step 19 (Template Immutability & Cloning) will directly consume `VaultManager` and `VaultClient` for physical file management.
- **Evidence Needed:** Step 17 Completion Report (`STEP_17_MASTER_TEMPLATE_VAULT_REPORT.md`), `OPSREPORT_STUDIO_FILE_STORAGE_SPECIFICATION.md`.
- **Decision Owner:** Senior Desktop Application Architect / Senior Filesystem & Storage Engineer / Senior Application Security Engineer.
- **Current Status:** **CONFIRMED BASELINE (Option A: Centralized VaultManager, Physical Storage Separation, Strict Path Confinement & Stable Identifier Resolution)**.

---

### DEC-040: Excel and Word Template Import, Structural Validation & Staged Promotion Pipeline

- **Question:** How should OpsReport Studio implement user-initiated template selection, file-type inspection, container validation, ephemeral staging, vault promotion, and metadata registration while protecting original user files and preventing corrupted or malicious files from entering the vault?
- **Why It Matters:** Relying on filename extensions alone risks importing corrupted, empty, or mislabeled documents. Copying unvalidated files directly into the master vault pollutes storage with unusable assets. Failing to isolate processing risks modifying original user documents. Macro-enabled formats (`.xlsm`/`.docm`) introduce severe security vulnerabilities (VBA execution) and brittle stream preservation hazards.
- **Available Options:**
  1. _Option A (Recommended & Implemented):_
     - Implement an 8-stage transactional import pipeline orchestrated by `TemplateImporter`:
       1. _Source Inspection:_ Assert source file exists, is a regular file, and is not inside the vault (`assertTargetNotInsideVault`). Original source file remains 100% untouched throughout the lifecycle.
       2. _Ephemeral Staging:_ Copy source bytes into a uniquely named temporary artifact in the `%LOCALAPPDATA%\OpsReportStudio\Scratch\` sandbox (`import_{timestamp}_{random}.tmp`).
       3. _Open XML Container Validation (`DocumentValidator`):_
          - Bounded file size: 25 MB max compressed file size; 100 MB max uncompressed expansion; 15:1 decompression ratio ceiling; 1,000 max entries.
          - Magic byte verification: Enforce standard ZIP signature (`PK\x03\x04`). Explicitly detect and reject legacy binary formats (`.xls`/`.doc`) and password-protected OLE containers (`\xD0\xCF\x11\xE0`) with clear resave guidance.
          - Container parsing via pure JavaScript `PizZip` engine. Reject truncated or malformed ZIP archives.
          - Archive security: Block entries with path traversal (`..`, leading slashes).
          - Macro quarantine (DEC-005, ADR-OPSREPORT-002): Strictly reject archives containing `vbaProject.bin`.
          - Core parts verification: Require `[Content_Types].xml` and `_rels/.rels`.
          - Format-specific parts: Require `xl/workbook.xml` for `.xlsx` and `word/document.xml` for `.docx`. Reject extension-to-content mismatches (e.g. Word documents renamed to `.xlsx`).
          - SHA-256 hash calculation for content tracking and duplicate identification.
       4. _Category & Format Verification:_ Validate category reference and confirm that detected document format matches category mandate.
       5. _Vault Destination Resolution:_ Resolve canonical storage path under `%LOCALAPPDATA%\OpsReportStudio\Templates\` using stable internal identifier (`{templateId}.xlsx` or `{templateId}.docx`).
       6. _Promotion & Consistency Rollback:_ Copy staged file to vault destination. Insert or update metadata in SQLite (`template_metadata`). If database operation fails, immediately unlink the promoted file to prevent orphaned physical files.
       7. _Guaranteed Cleanup:_ Unlink the temporary scratch staging file in a `finally` block.
     - Expose native desktop file picker via Electron IPC (`dialog.showOpenDialog`) with supported format filters.
     - Expose typed preload IPC bridge (`window.opsreport.templates.selectFile` and `importTemplate`) and dual-mode client (`ElectronTemplateClient`, `InMemoryTemplateClient`).
     - Integrate accessible `ImportTemplateModal` into `TemplatesView.tsx` with file selection card, auto-detected format badge, category matching, and clear progress/error feedback.
     - Strictly exclude master template cloning/versioning (Step 19), mapping wizards (Steps 22–23), or document generation engines.
  2. _Option B:_ Accept any file with `.xlsx`/`.docx` extension without inspecting container internals, copy files directly into the vault without scratch staging, allow macro execution, or modify original user documents in-place. (REJECTED - Violates desktop security standards, creates data loss risks, and violates `INV-DAT-006`).
- **Risks & Dependencies:** Future Step 19 (Template Immutability & Cloning) and Step 20 (Template Metadata Inspection) will directly consume imported master templates stored in the vault.
- **Evidence Needed:** Step 18 Completion Report (`STEP_18_TEMPLATE_IMPORT_REPORT.md`), `OPSREPORT_STUDIO_DOCUMENT_COMPATIBILITY_MATRIX.md`.
- **Decision Owner:** Senior Desktop Application Engineer / Senior Document-Processing Engineer / Senior Filesystem Security Engineer.

### DEC-041: Master Template Immutability, Safe Cloning & Template Versioning Architecture

- **Question:** How should OpsReport Studio enforce master template immutability, preserve historical template revisions upon modification, and create safe working copies for downstream processing without mutating or corrupting master assets?
- **Why It Matters:** In operational reporting, master templates are authoritative legal/regulatory baselines. Overwriting a master template during import, metadata updating, or report generation risks silent corruption, invalidating historical report reproduction, and violating core safety invariant `INV-DAT-006`.
- **Available Options:**
  1. _Option A (Recommended & Implemented):_
     - Model template identity at two distinct tiers:
       - _Logical Template (`template_metadata`):_ Holds enduring identity (`template_id`), human title, report category association (`category_id`), document format, status, active version reference (`active_version_id`), and version count (`total_versions`).
       - _Physical Immutable Version (`template_versions`):_ Relational table capturing version number (`version_number` >= 1), managed vault filename (`file_name`), cryptographic fingerprint (`sha256_hash`), file size, change notes, active status, and timestamp.
     - Enforce non-destructive versioning:
       - Template updates allocate the next sequential version number (`MAX(version_number) + 1`) and generate distinct vault filenames (`{templateId}_v{versionNumber}.{xlsx|docx}`). Historical files are never overwritten.
       - Migration 004 automatically provisions version 1 (`VER-{templateId}-V1`) for all pre-existing templates.
     - Enforce master template immutability via dual application and OS controls:
       - Application service-level write protections: Zero arbitrary write operations permitted against `Templates/`.
       - Filesystem-level defense-in-depth: Accepted master files are marked read-only (`0o444`).
       - Cryptographic integrity checking: `VaultManager.verifyVersionIntegrity()` compares physical file bytes against recorded SHA-256 hashes to detect external tampering.
     - Implement copy-first independent cloning service:
       - `VaultManager.cloneMasterTemplate()` creates an independent working copy in the `%LOCALAPPDATA%\OpsReportStudio\Scratch\` sandbox (`{purpose}_{templateId}_v{version}_{timestamp}_{random}.{ext}`).
       - Byte-preserving copy verifies destination hash matches source hash.
       - Master source file is verified to remain 100% untouched.
       - Destination is guarded by `assertTargetNotInsideVault` (`INV-DAT-006`).
     - Expose typed IPC endpoints across process boundaries (`templates:get-versions`, `templates:get-active-version`, `templates:set-active-version`, `templates:clone-master`, `templates:verify-integrity`).
     - Display version count badge (`v{total_versions}`) and active version in `TemplatesView.tsx`.
     - Strictly exclude full version-history management UI (Step 21), mapping wizards (Steps 22–23), or document generation engines (Steps 26–33).
  2. _Option B:_ Rely solely on OS file attributes, mutate master templates in-place, overwrite master files during report generation, or store copies without cryptographic verification. (REJECTED - Violates data integrity standards, creates silent corruption risks, and violates `INV-DAT-006`).
- **Risks & Dependencies:** Future Step 20 (Metadata Inspection & Previews) and Step 26+ (Report Generation Engines) will rely directly on `cloneMasterTemplate` for working copies and `getActiveVersion` for template resolution.
- **Evidence Needed:** Step 19 Completion Report (`STEP_19_TEMPLATE_VERSIONING_REPORT.md`), `OPSREPORT_STUDIO_FILE_STORAGE_SPECIFICATION.md`.
- **Decision Owner:** Senior Desktop Application Architect / Senior Filesystem & Storage Engineer / Senior Application Security Engineer.
- **Current Status:** **CONFIRMED BASELINE (Option A: Two-Tier Versioning Model, Copy-First Cloning, SHA-256 Integrity Verification & Non-Destructive Version Promotion)**.

---

### DEC-042: Read-Only Template Metadata Inspection & Lightweight Structure Preview Architecture

- **Question:** How should OpsReport Studio implement read-only template metadata inspection and document structure previewing for Excel (.xlsx) and Word (.docx) templates while strictly preventing master file mutations and preserving the boundary between heuristic previews and persistent mappings?
- **Why It Matters:** Prior to configuring complex field-to-cell or placeholder mappings (Steps 22-24), operators need to inspect the stored metadata, physical vault status, and internal document structure of an existing template version. Inspecting templates must never modify master template bytes (`INV-DAT-006`), must not persist candidate suggestions into database mappings prematurely, and must bound resource consumption (rows, columns, paragraphs, text length) to prevent memory exhaustion.
- **Available Options:**
  1. _Option A (Recommended & Implemented):_
     - Read-only inspection service (`TemplateInspector`):
       - Resolves authoritative logical template metadata and exact requested version (`version_id` or active version).
       - Confirms canonical physical vault file existence under `%LOCALAPPDATA%\OpsReportStudio\Templates\`.
       - Cryptographically verifies asset integrity via SHA-256 fingerprint before opening.
       - Guarantees master immutability by asserting pre-inspection hash equals post-inspection hash.
       - Leverages `PizZip` to open Open XML packages in memory with zero file modification or write-backs.
     - Excel Workbook Preview:
       - Extracts worksheet names, ordering, and sheet visibility from `xl/workbook.xml`.
       - Decodes `xl/sharedStrings.xml` for shared text lookup.
       - Parses active worksheet (`xl/worksheets/sheet*.xml`) with bounded row (15 max) and column (10 max) limits.
       - Displays formulas (`<f>` tag) with visual `fx` indicator and cached values.
       - Identifies merged cell ranges (`<mergeCell ref="...">`).
       - Implements conservative candidate header row heuristic: detects first row with >=2 non-empty text cells; strictly labeled as a candidate suggestion.
     - Word Document Preview:
       - Extracts body paragraphs in document order from `word/document.xml`, filtering out table-internal paragraphs.
       - Detects presence of headers (`word/header*.xml`), footers (`word/footer*.xml`), and drawings/images.
       - Bounded table inspection (5 tables max, 10 rows max, 6 columns max) with merged cell indicators.
       - Detects approved curly-brace candidate placeholder tokens (`\{([a-zA-Z0-9_]+)\}`) across paragraph and table text; strictly labeled as candidate suggestions.
     - Lightweight Mapping Readiness Preview:
       - Presents structured findings and diagnostic notes with explicit non-persistence disclaimers.
       - Zero database write operations; no field-to-cell or placeholder mappings are persisted.
     - Accessible UI Integration (`TemplateInspectModal`):
       - Accessible modal dialog accessible from the "Inspect" button in `TemplatesView.tsx`.
       - Version dropdown switcher allows inspecting historical versions as well as active versions.
       - Sub-tabs: "Document Preview", "Stored Metadata", and "Mapping Readiness".
       - Styled with design system tokens, supporting light/dark theme, responsive scrolling, and keyboard ESC dismiss.
     - Dual-mode IPC bridge: Exposed via `window.opsreport.templates.inspectTemplate` and mocked in `InMemoryTemplateClient`.
     - Strict scope preservation: Excludes Excel mapping wizards (Step 22), Word placeholder wizards (Step 23), mapping profiles (Step 24), and report generation engines (Steps 26-33).
  2. _Option B:_ Use a full-blown spreadsheet editor / Word processor component in the renderer, parse unbounded files directly on the UI thread, mutate master files during preview, or persist guessed mappings automatically into the database. (REJECTED - Violates security, performance, and data integrity standards).
- **Risks & Dependencies:** Steps 22 (Excel Cell Mapping) and 23 (Word Placeholder Mapping) will build upon the structural insights exposed by this inspection service.
- **Evidence Needed:** Step 20 Completion Report (`STEP_20_TEMPLATE_INSPECTION_REPORT.md`), `tests/unit/template-inspector.test.ts`.
- **Decision Owner:** Senior Desktop Application Engineer / Senior Spreadsheet & Word Processing Engineer / Senior UI/UX Engineer.
- **Current Status:** **CONFIRMED BASELINE (Option A: PizZip Read-Only Container Parsing, Bounded Previews, Candidate Heuristic Disclaimers & Master Immutability Assertion)**.

---

### DEC-043: Template Library Management, Replacement & Recovery Safeguards (Step 21)

- **Date:** 2026-10-21
- **Context:** Roadmap Step 21 requires a complete template library management experience enabling operators to browse registered templates, view version counts, inspect file health, edit permitted metadata, replace master templates non-destructively, manage lifecycle status (retire/archive), and safely recover from missing/inconsistent assets without destroying historical report audit trails.
- **Options Considered:**
  1. _Option A (Recommended & Implemented):_
     - Unified Library View (`TemplatesView.tsx`):
       - Multi-criteria filtering: report category, document format (`EXCEL_XLSX` vs `WORD_DOCX`), lifecycle status (`ACTIVE`, `DRAFT`, `ARCHIVED`), and health condition (`HEALTHY` vs `PROBLEM`).
       - Deterministic sorting: by name (A-Z / Z-A), category, format, or timestamps.
       - Real-time cryptographic health verification badges (`✓ Intact`, `⚠ File Missing`, `⚠ Integrity Mismatch`, `⚠ No Active Version`).
       - "Re-verify Health" operator button to audit vault assets on demand.
     - Safe Metadata Editing:
       - Permitted fields: `template_name`, `description`, and `status`.
       - Category reassignment permitted only when destination category format matches template format.
       - Master document format and vault filenames are immutable in edit mode (protected system metadata).
       - Zero disk byte modifications during metadata-only operations.
     - Controlled Template Replacement (`ReplaceTemplateModal.tsx` & `template-importer.ts`):
       - Explicit target logical template confirmation.
       - Reuses Step 18 document validator and Open XML staging pipeline.
       - Strictly enforces document format compatibility (rejects cross-format replacement).
       - Allocates next sequential version (version N+1) in `template_versions` table.
       - Atomic promotion of version N+1 to `active_version_id` only after successful disk write and hash verification.
       - 100% preservation of all historical version files (never overwrites or deletes existing masters).
     - Lifecycle Safeguards (Reversible Retirement vs Safe Permanent Deletion):
       - Reversible retirement: toggles status between `ACTIVE` and `ARCHIVED`, keeping metadata, version history, and vault files intact.
       - Deletion Dependency Enforcement: queries `report_sessions` references (`template_id`). If sessions reference the template, permanent deletion is strictly blocked with `ErrorCode.VALIDATION_FAILED` and operator is guided to Archive.
       - If 0 sessions reference the template, deletion safely cleans up metadata, version records, and unlocks read-only vault files (`0o666`) before unlinking.
     - User-Directed Recovery (`TemplateRecoveryModal.tsx` & `template-health-service.ts`):
       - Detects real conditions: `OK`, `MISSING_FILE`, `INTEGRITY_MISMATCH`, `NO_ACTIVE_VERSION`.
       - Option 1 (Rollback to Historical Version): Lists verified intact historical versions and promotes selected version to active.
       - Option 2 (Re-Import Clean Replacement File): Validates new source file and registers version N+1.
       - Option 3 (Re-Verify Vault Asset): Re-evaluates disk integrity after filesystem/storage adjustments.
       - Zero fake backups: Explicitly refuses false "Restore Backup" promises when no snapshot mechanism exists.
     - Strict Scope Boundaries: Excludes Excel worksheet/cell mapping wizard (Step 22), Word placeholder wizard (Step 23), mapping profiles (Step 24), and report generation engines (Steps 26-33).
  2. _Option B:_ Allow destructive in-place file overwrites during replacement, allow arbitrary category reassignments regardless of format, allow cascade-deletion of historical sessions, or invent an unverified backup snapshot system. (REJECTED - Violates master immutability and data integrity invariants).
- **Risks & Dependencies:** Future report generation and mapping wizards depend on templates remaining intact, with valid versions and truthful health status.
- **Evidence Needed:** Step 21 Completion Report (`STEP_21_TEMPLATE_LIBRARY_MANAGEMENT_REPORT.md`), `tests/unit/template-library-management.test.ts`.
- **Decision Owner:** Senior Desktop Application Engineer / Senior Database Engineer / Senior Filesystem & Data Integrity Engineer / Senior UI/UX Engineer.
- **Current Status:** **CONFIRMED BASELINE (Option A: Unified Library Management, Safe Metadata, Non-Destructive Replacement, Dependency-Checked Deletion, and Verified Health Recovery)**.

---

### DEC-044: Excel Worksheet, Header Row & Cell Mapping Persistence Architecture (Step 22)

- **Date:** 2026-10-21
- **Context:** Roadmap Step 22 requires a guided, multi-step configuration wizard allowing operators to select an approved Excel master template version, inspect its actual worksheets, select an active worksheet and header row, extract columns, and map approved report fields (from the authoritative `DIC-OPSREPORT-001` catalog) to fixed single-value cells or tabular columns. The configuration must be validated, persisted outside the template workbook in SQLite, and leave the master template file 100% byte-for-byte immutable.
- **Options Considered:**
  1. _Option A (Recommended & Implemented):_
     - Authoritative Field Catalog (`src/shared/constants/report-fields.ts`):
       - Implements `DIC-OPSREPORT-001` specification.
       - Common core fields: `FLD-COM-DATE`, `FLD-COM-INSPECTOR`, `FLD-COM-SHIFT`, `FLD-COM-STATION`, `FLD-COM-LOCATION`, `FLD-COM-REMARKS`, `FLD-COM-STATUS`.
       - Category-specific fields for all 6 Excel categories (`RPT-STATION-LIGHT`, `RPT-FAN`, `RPT-POLE-LIGHT`, `RPT-FIRE-EXTINGUISHER`, `RPT-PILLAR`, `RPT-FENCE`).
     - Five-Stage Guided Wizard Modal (`ExcelMappingWizardModal.tsx`):
       - Stage 1 (Version Selection & Integrity): Cryptographic SHA-256 verification of active or historical template version.
       - Stage 2 (Worksheet Selection): Enumerates actual Open XML worksheets from read-only inspector; renders 15x10 bounded cell preview with formula/merged cell flags.
       - Stage 3 (Header Row Designation): Operator selects header row; heuristic candidate suggested; tabular columns extracted with physical column letters (A, B, C...) resolving duplicate labels.
       - Stage 4 (Field-to-Destination Mapping): Split configuration between Fixed-Cell (e.g., `B2`) and Table-Column (e.g., `C`); inline type badges; target coordinate validation; conflict detection.
       - Stage 5 (Review, Validation & Persistence): Summary matrix; real-time validation error alerts; atomic persistence in SQLite via IPC.
     - External Persistence Schema (Migration 005 `excel_template_mappings`):
       - Fully relational: `mapping_id`, `template_id`, `version_id`, `worksheet_name`, `header_row_number`, `mapping_type`, `field_id`, `field_label`, `target_coordinate`, `column_header`, `is_required`, `created_at`, `updated_at`.
       - Integrity constraints: `UNIQUE (template_id, version_id, worksheet_name, field_id)` prevents assigning same field twice in same worksheet; `UNIQUE (template_id, version_id, worksheet_name, mapping_type, target_coordinate)` prevents destination collisions.
       - Atomic replacement within transaction: saving replaces all mappings for the specified `(template_id, version_id, worksheet_name)`.
     - Master Template Immutability:
       - Inspection, mapping configuration, and database writes never modify or rewrite the vault file. SHA-256 hash verified before and after workflow.
     - Strict Scope Boundaries: Excludes Word placeholder mapping (Step 23), reusable mapping profiles (Step 24), in-app template designer (Step 25), and report generation data injection (Steps 26-30).
  2. _Option B:_ Embed cell mapping instructions as hidden worksheets or custom XML parts inside the Excel file itself, use uncontrolled manual text entry without coordinate validation, or allow runtime generation without persistence. (REJECTED - Violates master template immutability and multi-version integrity).
- **Risks & Dependencies:** Step 26+ Excel report generation pipeline depends on valid mapping records in `excel_template_mappings`.
- **Evidence Needed:** Step 22 Completion Report (`STEP_22_EXCEL_MAPPING_WIZARD_REPORT.md`), `tests/unit/excel-mapping-wizard.test.ts`.
- **Decision Owner:** Senior Desktop Application Engineer / Senior Spreadsheet Processing Engineer / Senior Database Engineer / Senior UI/UX Engineer.
- **Current Status:** **CONFIRMED BASELINE (Option A: Authoritative Field Catalog, 5-Stage Wizard, SQLite Mapping Persistence & Absolute Master Immutability)**.

---

### DEC-045: Word Template Placeholder, Paragraph & Table Mapping Persistence Architecture (Step 23)

- **Date:** 2026-10-21
- **Context:** Roadmap Step 23 requires a guided, multi-step configuration wizard allowing operators to select an approved Word master template version, inspect its actual structure (paragraphs, tables, dimensions, cell text, candidate tokens), detect approved placeholder tokens (`{token}` syntax) or specify structural targets (paragraphs `P:n`, table cells `T1:Rn:Cn`, or repeating rows `T1:Rn:LOOP`), and map approved report fields (from the authoritative `DIC-OPSREPORT-001` catalog for `RPT-INCIDENT`) to recognized targets. The configuration must be validated, persisted outside the template document in SQLite, and leave the master template file 100% byte-for-byte immutable.
- **Options Considered:**
  1. _Option A (Recommended & Implemented):_
     - Authoritative Field Catalog Integration (`src/shared/constants/report-fields.ts`):
       - Uses `DIC-OPSREPORT-001` specification for Security Incident reports (`RPT-INCIDENT`).
       - Common core fields: `FLD-COM-DATE`, `FLD-COM-INSPECTOR`, `FLD-COM-SHIFT`, `FLD-COM-STATION`, `FLD-COM-LOCATION`, `FLD-COM-REMARKS`, `FLD-COM-STATUS`.
       - Security Incident category fields: `FLD-INC-REF-NO`, `FLD-INC-OCCUR-TIME`, `FLD-INC-DISCOVER-TIME`, `FLD-INC-TYPE`, `FLD-INC-SEVERITY`, `FLD-INC-SPEC-LOC`, `FLD-INC-NARRATIVE`, `FLD-INC-ACTIONS`, `FLD-INC-PERSONS`, `FLD-INC-POLICE-NOTIFIED`, `FLD-INC-POLICE-CAD`, `FLD-INC-DAMAGE-EST`, `FLD-INC-FOLLOWUP`, `FLD-INC-STATUS`.
     - Four-Stage Guided Wizard Modal (`WordMappingWizardModal.tsx`):
       - Stage 1 (Version Selection & Cryptographic Verification): SHA-256 verification of active or historical Word template version.
       - Stage 2 (Document Structure & Preview): Read-only inspection of Open XML document (`word/document.xml`), header/footer presence, table count, paragraph count, bounded paragraph previews, and candidate placeholder tokens extracted from paragraphs and table cells.
       - Stage 3 (Field-to-Target Mapping Configuration): Auto-match button for recognized placeholder tokens; support for all 4 supported target kinds: `PLACEHOLDER` (`{token}`), `PARAGRAPH` (`P:1`), `TABLE_CELL` (`T1:R2:C3`), `REPEATING_ROW` (`T1:R2:LOOP`); conflict and coordinate syntax validation.
       - Stage 4 (Review, Validation & Persistence): Summary matrix; unmapped field warnings; destination collision alerts; atomic SQLite persistence via IPC.
     - External Persistence Schema (Migration 006 `word_template_mappings`):
       - Fully relational: `mapping_id`, `template_id`, `version_id`, `mapping_type`, `field_id`, `field_label`, `target_coordinate`, `target_description`, `is_required`, `created_at`, `updated_at`.
       - Strict integrity constraints: `UNIQUE (template_id, version_id, field_id)` prevents assigning the same field twice; `UNIQUE (template_id, version_id, mapping_type, target_coordinate)` prevents destination collisions.
       - Atomic replacement within transaction: saving replaces all mappings for the specified `(template_id, version_id)`.
     - Master Template Immutability:
       - Inspection, mapping configuration, and database writes never modify or rewrite the vault file. SHA-256 hash verified before and after workflow.
     - Strict Scope Boundaries: Excludes reusable mapping profiles (Step 24), in-app template designer (Step 25), and Word report generation / data injection (Steps 31-33).
  2. _Option B:_ Embed mapping instructions as custom Word XML parts or inline comments inside the document file, guess unapproved placeholder syntax (e.g. angle brackets, double braces), or allow runtime generation without persistence. (REJECTED - Violates master template immutability and multi-version integrity).
- **Risks & Dependencies:** Step 31+ Word report generation pipeline depends on valid mapping records in `word_template_mappings`.
- **Evidence Needed:** Step 23 Completion Report (`STEP_23_WORD_MAPPING_WIZARD_REPORT.md`), `tests/unit/word-mapping-wizard.test.ts`.
- **Decision Owner:** Senior Desktop Application Engineer / Senior Word Document Processing Engineer / Senior Database Engineer / Senior UI/UX Engineer.
- **Current Status:** **CONFIRMED BASELINE (Option A: Authoritative Field Catalog, 4-Stage Wizard, SQLite Mapping Persistence & Absolute Master Immutability)**.

---

### DEC-046: Reusable Mapping Profiles, Centralized Field Validation & Template Compatibility Architecture

- **Question:** How should OpsReport Studio represent, organize, persist, and validate field mappings for reusable Excel and Word templates, ensuring configurations are verified against authoritative report-field contracts and physical document structures before generation workflows consume them?
- **Why It Matters:** Without a persistent mapping-profile abstraction, field mappings remain tightly coupled to raw template versions without user-facing revision control, cloning, or modular reusability. Without a centralized validation engine, stale target references, missing required fields, coordinate collisions, and corrupted template vault assets cause silent failures or corrupt outputs during document generation. Core safety invariant `INV-DAT-006` requires that validation must never mutate or rewrite master template files.
- **Available Options:**
  1. _Option A (Recommended & Implemented):_
     - Reusable Mapping Profile Domain & Persistence (Migration 007 `mapping_profiles`):
       - Establishes `mapping_profiles` relational table linking template versions, report categories, and document formats with stable identifiers (`MappingProfileId`).
       - Scopes child mapping uniqueness in `excel_template_mappings` and `word_template_mappings` by `profile_id`, allowing multiple independent profiles per template version while preserving backwards compatibility for legacy unassigned mappings (`profile_id IS NULL`).
       - Supports safe profile lifecycle: create, list, retrieve with child mappings, transactional deep-copy duplication (`duplicateProfile`), and cascading deletion (`deleteProfile`).
     - Centralized Validation Service (`MappingValidationService`):
       - Single authoritative diagnostic engine verifying mapping configurations against domain contracts and physical Open XML assets.
       - Verification Suites:
         1. _Template Asset Integrity:_ Verifies physical file existence in vault and verifies cryptographic SHA-256 checksum against database records (`VAL_ASSET_MISSING`, `VAL_ASSET_INTEGRITY_MISMATCH`). Returns `UNABLE_TO_VALIDATE` if corrupted.
         2. _Field Existence:_ Verifies every mapped field exists in authoritative `DIC-OPSREPORT-001` catalog (`VAL_FIELD_UNKNOWN`).
         3. _Category Applicability:_ Asserts field is approved for the template's designated report category (`VAL_FIELD_INAPPLICABLE`).
         4. _Required Field Completeness:_ Distinguishes unmapped mandatory fields (`VAL_FIELD_REQUIRED_UNMAPPED`, `ERROR`) leading to `INCOMPLETE` status, from unmapped optional fields (`VAL_FIELD_OPTIONAL_UNMAPPED`, `INFO`).
         5. _Type & Repetition Compatibility:_ Flags scalar mappings of repeating multi-station fields (`VAL_TYPE_INCOMPATIBLE`, `WARNING`).
         6. _Collision & Duplication Detection:_ Detects duplicate field mappings (`VAL_DUPLICATE_FIELD`) and destination coordinate collisions (`VAL_TARGET_COLLISION`).
         7. _Excel Structural Checks:_ Verifies worksheet existence (`VAL_WORKSHEET_NOT_FOUND`), header row presence, and cell coordinates against physical Open XML workbook.
         8. _Word Structural Checks:_ Verifies placeholder token existence (`VAL_PLACEHOLDER_NOT_FOUND`, `ERROR`) and bounded paragraph/table/row/cell coordinates (`VAL_STRUCTURAL_TARGET_OUT_OF_BOUNDS`).
     - Strict Read-Only Master File Immutability:
       - SHA-256 byte immutability verified before and after multiple validation runs (0-byte delta invariant).
     - Actionable Compatibility Reports:
       - Status states: `VALID`, `INVALID`, `INCOMPLETE`, `REQUIRES_REVIEW`, `UNCHECKED`, `UNABLE_TO_VALIDATE`.
       - Findings with stable codes, severity levels (`ERROR`, `WARNING`, `INFO`), affected targets, and corrective operator actions.
     - Accessible UI Integration (`MappingProfilesModal.tsx`):
       - Split-view profile manager with live validation runner, check suite summary cards, severity-filtered diagnostic findings, and direct links to Step 22/23 mapping wizards for corrective editing.
  2. _Option B:_ Inline ad-hoc validation within UI forms, auto-repair invalid mappings by silently guessing replacements, or validate by attempting actual report generation and catching runtime exceptions. (REJECTED - Violates predictability, risks corrupting mappings or master files, and provides zero diagnostic explainability).
- **Risks & Dependencies:** Future Step 25 (In-App Template Designer) and Steps 26–33 (Document Generation Engines) rely on `MappingValidationService` to certify profiles as `VALID` before generation proceeds.
- **Evidence Needed:** Step 24 Completion Report (`STEP_24_MAPPING_PROFILES_VALIDATION_REPORT.md`), `tests/unit/mapping-profiles-and-validation.test.ts`.
- **Decision Owner:** Senior Desktop Application Architect / Senior Data Modeling Engineer / Senior Application Security Engineer / Senior QA Automation Engineer.
- **Current Status:** **CONFIRMED BASELINE (Option A: Reusable Mapping Profiles, Centralized Validation Service, Multi-Suite Compatibility Engine & Master Template Immutability)**.

---

### DEC-047: In-App Excel & Word Template Creation & Reusable Template Designer Architecture

- **Question:** How should OpsReport Studio implement in-app creation and structured visual authoring of new Excel (`.xlsx`) and Word (`.docx`) report master templates, maintaining separation between editable design drafts and protected master assets, while integrating with authoritative field catalogs, validation engines, and template versioning?
- **Why It Matters:** Without an in-app designer, operators must author templates externally in Microsoft Office and import them. An unrestricted Office clone or mutable in-memory DOM would introduce massive dependencies, fragile conversions, and potential silent corruption of existing vault assets. Producing unvalidated files or modifying accepted masters directly violates core immutability invariant `INV-DAT-006`.
- **Available Options:**
  1. _Option A (Recommended & Implemented):_
     - Model template authoring using a structured, typed, recoverable design model (`ExcelWorkbookDesign` and `WordDocumentDesign`) separated strictly from binary Open XML packages, master vault assets, mapping configurations, and runtime report sessions.
     - Persist design drafts in SQLite via Migration 008 (`template_design_drafts` table, schema version 8) with stable draft UUIDs, category associations, target template links, and draft schema versioning (`CURRENT_DESIGN_SCHEMA_VERSION = 1`).
     - Implement deterministic Open XML document builders (`ExcelTemplateBuilder` and `WordTemplateBuilder`) using pure-JavaScript `PizZip` to generate valid `.xlsx` and `.docx` packages directly without Microsoft Office or third-party cloud services:
       - Excel: multiple ordered worksheets, dimension calculation, custom column widths/row heights, shared strings table (SST), standard cell styles (bold, header fills, borders, alignments), and cell coordinates.
       - Word: heading hierarchies (levels 1-3), styled paragraphs, tables with static header rows, borders, cell alignments, and approved placeholder tokens.
     - Enforce authoritative report-field integration:
       - Source approved field definitions strictly from `DIC-OPSREPORT-001`.
       - Coordinate validation via `CELL_ADDRESS_REGEX` for Excel cells and `COLUMN_REF_REGEX` for repeating table columns.
       - Placeholder validation via `WORD_PLACEHOLDER_REGEX` for Word tokens.
     - Multi-stage isolated compilation and registration pipeline (`TemplateDesignerService`):
       - Stage 1: Design schema validation (checks coordinates, duplicate tokens/cells, field existence, category applicability).
       - Stage 2: In-memory compilation to Open XML buffer.
       - Stage 3: Isolated staging in scratch sandbox (`designer_staged_{uuid}.{ext}`).
       - Stage 4: Authoritative container validation via `validateDocumentFile` (ZIP structure, core parts, macro quarantine).
       - Stage 5: Promotion into Master Template Vault via `TemplateImporter.importTemplate`, supporting either new logical template registration (v1) or controlled version evolution (version N+1) without overwriting historical files.
       - Stage 6: Automatic default mapping profile creation and child mapping persistence when field slots are defined.
       - Stage 7: Guaranteed staging file cleanup.
     - Master Template Immutability:
       - Zero-byte delta and cryptographic SHA-256 hash preservation verified across all designer operations (saving drafts, validating designs, compiling unrelated templates).
     - Accessible UI Integration (`TemplateDesignerModal.tsx`):
       - Dual-format switcher (Excel workbook vs Word document).
       - Interactive element lists, property inspectors, and live bounded previews.
       - Draft drawer for loading and managing saved drafts.
       - One-click validation and compile-to-master registration.
  2. _Option B:_ Embed a full Office clone, canvas editor, or HTML-to-Word converter; write directly to the master vault; mutate existing master files in-place; or invent custom placeholder syntax outside `DIC-OPSREPORT-001`. (REJECTED - Violates architecture standards, creates master corruption hazards, and compromises document fidelity).
- **Risks & Dependencies:** Subsequent document generation engines (Steps 26–33) will clone and populate templates designed through this pipeline using active mapping profiles.
- **Evidence Needed:** Step 25 Completion Report (`STEP_25_TEMPLATE_DESIGNER_REPORT.md`), `tests/unit/template-designer.test.ts`.
- **Decision Owner:** Senior Desktop Application Architect / Senior Document Engineering Specialist / Senior UI/UX Designer / Senior Application Security Engineer.
- **Current Status:** **CONFIRMED BASELINE (Option A: Structured Design Model, Pure Open XML Compilation, Scratch Staging Sandbox, Auto-Mapping Profile Generation & 100% Cryptographic Master Immutability)**.

---

### DEC-048: Excel Workbook Cloning, Isolated Generation Workspace & Master Immutability Architecture (Step 26)

- **Date:** 2026-10-22
- **Context:** Roadmap Step 26 establishes the foundational Excel generation service that selects an approved Excel master-template version and produces an independent, verified working workbook copy for report generation operations. Core invariant `INV-DAT-006` requires that a successful cloning operation creates a distinct working file from the exact verified Excel master version, and no ordinary execution path may write into, truncate, replace, or delete that source master.
- **Options Considered:**
  1. _Option A (Recommended & Implemented):_
     - Version-Aware Master Template Resolution (`ExcelWorkbookCloningService`):
       - Accepts stable `TemplateId`, optional `TemplateVersionId`, and optional `ReportSessionId`.
       - Retrieves authoritative template metadata through `TemplateMetadataRepository`.
       - Rejects Word document templates (`TEMPLATE_UNSUPPORTED_FORMAT`), non-existent templates (`TEMPLATE_NOT_FOUND`), retired/archived templates (`TEMPLATE_INACTIVE`), and foreign version references (`SECURITY_VIOLATION`).
       - If `sessionId` is provided, verifies session existence and asserts session-template consistency.
       - Resolves canonical master file path inside the protected Vault directory (`VaultManager.resolveTemplateFileVaultPath`).
       - Cryptographically verifies source master integrity against database baseline (`sha256_hash`), rejecting tampered files with `TEMPLATE_INTEGRITY_COMPROMISED`.
     - Isolated Generation Workspace Storage (`%LOCALAPPDATA%\OpsReportStudio\Workspace\`):
       - Establishes a dedicated `Workspace/` directory in the storage abstraction (`WORKSPACE_SUBDIR`), strictly separated from `Templates/` (Vault), `Scratch/` (staging), `Database/` (SQLite), and user-selected final output directories.
       - Enforces strict path security and destination containment: verifies destination is inside `Workspace/` and cannot resolve to master vault or follow directory traversals.
       - Allocates collision-safe filenames: `clone_{templateId}_{versionId}_{timestamp}_{uuid}.xlsx`.
     - Byte-Preserving Direct Cloning (`fs.copyFileSync`):
       - Copies exact bytes directly via operating system file copy API without passing through spreadsheet serialization libraries, preventing formatting degradation, internal XML reordering, or style corruption.
       - Confirms destination file existence, non-empty byte length, and exact cryptographic SHA-256 match with the master source.
       - Asserts master template file immutability: verifies source file exists with 0-byte variance and identical pre- and post-copy SHA-256 hash.
       - Validates cloned workbook as a valid Open XML ZIP package via `validateDocumentFile`.
     - Generation Workspace Persistence (Migration 009 `generation_workspaces`):
       - Tracks workspace lifecycle states: `PREPARED` (pristine clone ready for field injection), `IN_USE`, `COMPLETED`, `DISCARDED`.
       - Records `workspace_id`, `session_id`, `template_id`, `version_id`, `version_number`, `document_type`, `file_name`, `relative_path`, `sha256_hash`, `file_size_bytes`, `status`.
       - In case of database registration or validation failure, cleans up only the operation-owned working artifact, never touching the master.
     - Strict Scope Boundaries: Excludes field injection (Step 27), row expansion (Step 28), complex formatting (Step 29), final export (Step 30), Word generation (Steps 31-33), and export history (Step 41).
  2. _Option B:_ Open and reserialize the master workbook through an Excel spreadsheet library to create copies, store working copies beside master files in the vault, or rely on UI read-only flags without storage boundary enforcement. (REJECTED - Reserialization alters XML structure, risks corrupting macros/styles, and placing writable copies in the vault violates core immutability).
- **Risks & Dependencies:** Subsequent Step 27 (Field-to-Cell Data Injection) and Step 28 (Multi-Station Row Generation) consume the `PREPARED` working workbook reference returned by `ExcelWorkbookCloningService.prepareExcelWorkspace`.
- **Evidence Needed:** Step 26 Completion Report (`STEP_26_EXCEL_CLONING_REPORT.md`), `tests/unit/excel-workbook-cloning.test.ts`.
- **Decision Owner:** Senior Desktop Application Engineer / Senior Excel Processing Engineer / Senior Filesystem & Data Integrity Engineer / Senior Database Engineer / Senior Application Security Engineer.
- **Current Status:** **CONFIRMED BASELINE (Option A: Version-Aware Resolution, Isolated Generation Workspace, Byte-Preserving Copy, SHA-256 Verification & Absolute Master Immutability)**.

---

### DEC-049: Excel Worksheet Selection, Cell Mapping & Structured Data Injection Architecture (Step 27)

- **Date:** 2026-10-22
- **Context:** Roadmap Step 27 establishes the data injection service layer that reads a validated report session, resolves its approved Excel mapping configuration, and deterministically injects supported scalar report values into the isolated working workbook created in Step 26. In accordance with core invariant `INV-DAT-006`, the injection engine modifies only an operation-owned working artifact, guarantees 0-byte variance on master templates in the Vault, preserves cell formatting styles, and protects against formula injection vulnerabilities.
- **Options Considered:**
  1. _Option A (Recommended & Implemented):_
     - Authoritative Session, Mapping & Workspace Resolution (`ExcelDataInjectionService`):
       - Validates identifier syntax via `validateInternalIdentifier` and rejects null bytes via `assertNoNullBytes`.
       - Retrieves authoritative session record from `ReportSessionRepository`, asserts status is not `CANCELLED`, and verifies category and template consistency.
       - Resolves generation workspace record from `GenerationWorkspaceRepository`, asserts containment in `Workspace/` via `assertPathInsideRoot`, and verifies it does not target the Vault via `assertTargetNotInsideVault`.
       - Verifies source master template baseline integrity (`sha256_hash`), enforcing 0-byte variance on the master file throughout processing.
       - Retrieves mapping configuration via `MappingProfileRepository` (by `profileId`) or `ExcelMappingRepository` (by `templateId` + `versionId`), rejecting empty, incompatible, or stale configurations.
     - Deterministic Write Plan & Target Classification:
       - Validates target coordinates against strict syntax regex `^[A-Z]{1,3}[1-9][0-9]{0,6}$`.
       - Detects duplicate coordinate collisions within the same worksheet before any disk mutation, rejecting conflicting mappings.
       - Classifies targets: `FIXED_CELL` mappings are scheduled for immediate scalar injection; `TABLE_COLUMN` mappings (requiring repeating multi-station row expansion) are tracked as `DEFERRED` for Step 28.
       - Resolves field values by stable field IDs (`FLD-*`) or canonical property names from the session form payload.
       - Distinguishes absent/null from valid falsy values (0, false, empty string).
     - Formula Injection Immunity & Type Conversion:
       - Strings, Dates, Times, Integers, and Booleans are typed according to the approved field schema.
       - Text values beginning with formula prefixes (`=`, `+`, `-`, `@`) are stored strictly as shared strings (`t="s"`), preventing spreadsheet execution or formula injection exploits.
     - Low-Level Open XML Manipulation (`WorksheetXmlEditor`):
       - Uses `PizZip` to manipulate Open XML spreadsheet archives directly without adding heavyweight external dependencies.
       - Resolves worksheet part paths via `xl/workbook.xml` and `xl/_rels/workbook.xml.rels`.
       - Maintains the shared strings table (`xl/sharedStrings.xml`) without corrupting existing entries.
       - Replaces or inserts target `<c>` elements while preserving existing cell formatting style attributes (`s="..."`).
       - Enforces ECMA-376 sorting constraints: rows sorted ascending by `r`, cells within rows sorted ascending by column index.
     - Transaction-Safe Candidate Staging, Verification & Atomic Promotion:
       - Creates an isolated candidate file (`candidate_{timestamp}_{uuid}.xlsx`) in `Workspace/`.
       - Validates the saved candidate as a compliant Open XML archive via `validateDocumentFile`.
       - Re-reads written cells from the saved candidate to cryptographically verify expected values.
       - Re-verifies source master template hash to guarantee 0-byte variance.
       - Safely promotes the verified candidate over the active working file and cleans up candidate temporary files.
       - Updates generation workspace state to `IN_USE` with new SHA-256 hash and byte length in SQLite.
       - On any failure, cleans up candidate files and leaves the previous working file and master template untouched.
     - Strict Scope Boundaries: Excludes multi-station row insertion (Step 28), repeating-row table expansion (Step 28), complex formatting/merged-cell/image preservation (Step 29), final export (Step 30), Word generation (Steps 31-33), and export history (Step 41).
  2. _Option B:_ Modify working files in-place without candidate staging, evaluate formulas dynamically, coerce all values to raw strings, or implement premature multi-station row expansion in Step 27. (REJECTED - In-place modification risks corrupting working copies on partial failure, lack of candidate verification permits corrupted outputs, and premature row expansion violates roadmap scope boundaries).
- **Risks & Dependencies:** Step 28 (Multi-Station Row Insertion & Repeating Row Generation) builds directly on the working copy modified by Step 27, executing table expansion for deferred `TABLE_COLUMN` mappings.
- **Evidence Needed:** Step 27 Completion Report (`STEP_27_DATA_INJECTION_REPORT.md`), `tests/unit/excel-data-injection.test.ts`.
- **Decision Owner:** Senior Desktop Application Engineer / Senior Excel Processing Engineer / Senior Data Integrity Engineer / Senior Database Engineer / Senior Application Security Engineer.

---

## DEC-050: Multi-Station Rows, Status Fields, Remarks & Data Validation Architecture

- **Context:** Step 28 of the 45-step roadmap requires extending the Step 27 Excel generation engine to transform approved, persisted station-level report data into correct repeated Excel rows and mapped status and remarks cells. The implementation must respect the actual station configuration, report-session structure, report category, approved report-field definitions, validated mapping profile, and isolated working workbook created through previous steps.
- **Core Invariant (`INV-DAT-006`):** Every generated station row must correspond to real, validated report-session data and a valid configured station identity. Station ordering must be deterministic, status and remarks values must follow the approved field contract (`DIC-OPSREPORT-001`), and all writes must remain confined to an isolated working workbook in `Workspace/`. Master template files in the Vault must remain 100% byte-for-byte unchanged (0-byte variance).
- **Options Considered:**
  1. _Option A (Selected):_ Deterministic Multi-Station Pipeline with Authoritative Ordering, Strict Field Validation, and Conflict-Protected Repeating Row Expansion:
     - Station Sequence & Ordering Resolution:
       - Priority 1: Frozen station snapshots from `report_session_stations` (DEC-025), preserving historical order and immutable station identity snapshots even if global configuration changes later.
       - Priority 2: Session payload data (`sessionData.stations`), looking up canonical station metadata (`display_order`, `station_name`, `station_code`) in `StationRepository` to enforce deterministic sorting.
       - Zero-Station Handling: If a session contains no stations, table mappings are gracefully tracked as `DEFERRED` without throwing unhandled exceptions or writing corrupted rows.
       - Duplication Rejection: Duplicate station IDs within a session sequence are rejected before workbook mutation with `VALIDATION_FAILED`.
     - Repeating-Row Structure & Mapping Execution:
       - Uses `headerRowNumber` from the mapping contract as structural anchor: station data rows start at `headerRowNumber + 1` and expand contiguously for each ordered station `1..N`.
       - Physical Column Resolution: Columns are validated by regex `^[A-Z]{1,3}$`. Duplicate column assignments on the same sheet are rejected with `MAPPING_INCOMPATIBLE`.
       - Target Collision Detection: Prevents table column cells from colliding with fixed cell mappings on identical coordinates.
       - Row Capacity & Footer Conflict Detection: Before mutating the candidate workbook, `WorksheetXmlEditor.inspectRowCapacityConflict` checks whether candidate expansion rows collide with static summary/footer labels ("Total", "Summary", "Subtotal", "Signature", "Approved By") or formula cells (`<f>`), rejecting collisions before write with descriptive explanations.
     - Status Fields & Remarks Validation:
       - Constrained status fields (e.g. `FLD-POL-STATUS`, `FLD-SLT-STATUS`, `FLD-EXT-PRESSURE`, etc.) are validated against authoritative allowed-value enumerations defined in dictionary `DIC-OPSREPORT-001`. Unapproved status choices are rejected with `VALIDATION_FAILED`.
       - Free-form remarks (e.g. `FLD-COM-REMARKS`) accept Unicode text, punctuation, and multiline content without arbitrary clipping.
       - Formula-Injection Immunity: Any text value starting with formula prefixes (`=`, `+`, `-`, `@`) is stored strictly as text in the shared strings table (`t="s"`), preventing spreadsheet execution or formula injection exploits.
     - Style Inheritance & Open XML Manipulation:
       - Newly created station cells in repeated rows inherit cell formatting style attributes (`s="..."`) from earlier template rows in the same column, ensuring visual consistency.
       - Writes are staged in an isolated candidate file (`candidate_{timestamp}_{uuid}.xlsx`), validated as a valid Open XML archive, re-read from disk to verify station data integrity, and atomically promoted over the working copy.
       - 0-byte variance on master template files in Vault is strictly enforced and verified before and after injection.
  2. _Option B:_ Infer station row boundaries heuristically from visual worksheet appearance, invent default station lists or statuses, allow arbitrary text to be written as formulas, or mutate active working artifacts in-place without pre-write validation. (REJECTED - Risks corrupting templates, violates master template immutability, allows code/formula injection vulnerabilities, and breaks deterministic generation invariants).
- **Risks & Dependencies:** Step 29 (Formula, Formatting & Print Layout Preservation) will build on the repeated station rows and scalar cells written in Steps 27 and 28, handling complex formula recalculations, merged-cell range adjustments, and visual print layout preservation.
- **Evidence Needed:** Step 28 Completion Report (`STEP_28_MULTI_STATION_REPORT.md`), `tests/unit/multi-station-excel-injection.test.ts`.
- **Decision Owner:** Senior Desktop Application Engineer / Senior Excel Processing Engineer / Senior Data Modeling Engineer / Senior Database Engineer / Senior Data Integrity Engineer / Senior Application Security Engineer / Senior QA Automation and Manual Testing Engineer.
- **Current Status:** **CONFIRMED BASELINE (Option A: Deterministic Multi-Station Pipeline with Authoritative Ordering, Strict Field Validation, and Conflict-Protected Repeating Row Expansion)**.

---

## DEC-051: Formatting, Formulas, Merged Cells, Images & Print Layout Preservation Architecture

- **Context:** Step 29 of the 45-step roadmap requires extending the Excel report-generation engine so that processing station-level data, report-level fields, and repeated rows does not unnecessarily damage or discard the original Excel template's formatting, formulas, worksheet structure, embedded images, or print configuration. The generated working workbook must retain supported structures and visual properties of its source template, incorporate approved report data from Steps 27 and 28, and remain isolated from the immutable master template.
- **Core Invariant (`INV-DAT-006`):** The generated working workbook must retain supported structures and visual properties of its source template, incorporate approved report data from Steps 27 and 28, and enforce 0-byte variance on immutable master templates in Vault. Unsupported preservation requirements must be detected and reported instead of silently ignored.
- **Options Considered:**
  1. _Option A (Selected):_ Semantic Open XML Structure Preservation & Cryptographic Post-Save Verification Pipeline:
     - Pure Open XML Archive Editing Boundary:
       - Confine cell writes strictly to `<sheetData>` within `xl/worksheets/sheet*.xml`.
       - Because `PizZip` does not parse or alter other archive parts, all drawing definitions (`xl/drawings/*`), embedded binary images (`xl/media/*`), drawing relationships (`xl/worksheets/_rels/*`), page setup configurations (`<pageSetup>`, `<pageMargins>`, `<printOptions>`, `<headerFooter>`), and defined names (`xl/workbook.xml`) remain 100% intact with 0 byte variance.
     - Cell Style & Layout Preservation:
       - Maintain existing style indices (`s="..."`) for mapped and unmapped cells.
       - Preserve column widths, row heights, and worksheet views.
       - Inherit column cell styles for newly expanded station rows from earlier template rows in the same column.
     - Formula Preservation & Integrity:
       - In `WorksheetXmlEditor.applyCellWrites`, emit `<f>${escapeXml(cell.formula)}</f>` alongside `<v>${escapeXml(cell.val)}</v>` for unmapped formula cells in accordance with ECMA-376 child element ordering.
       - Distinguish intentional formula replacement on mapped cells (logged as `INFO` finding) from accidental formula loss on unmapped cells (flagged as `BLOCKING`).
       - Do not fabricate recalculated formula values; leave formula evaluation to spreadsheet software upon opening.
     - Merged-Cell Safety & Conflict Prevention:
       - Authoritative Anchor Rule: Mapped writes must strictly target the top-left anchor cell (e.g. `A1` in `A1:C1`). Attempts to write to covered cells (e.g. `B1` or `C1`) are rejected pre-mutation with `VALIDATION_FAILED`.
       - Duplicate Mapping Prevention: Conflicting writes targeting the same merged range are rejected pre-mutation.
       - Multi-Row Station Row Collision Prevention: Repeated station row expansion cutting across or intersecting multi-row merged ranges is rejected before workbook mutation to prevent corrupted grid geometry.
     - Embedded Image & Drawing Media 0-Loss Verification:
       - Track drawing parts count and hash all binary media assets in `xl/media/` via SHA-256.
       - Verify candidate candidate media assets exhibit 0 byte variance and matching SHA-256 digests.
     - Print Layout & Pagination Preservation:
       - Capture baseline page setup (`paperSize`, `orientation`, `scale`, `fitToWidth`, `fitToHeight`), page margins, print options (`gridLines`, `horizontalCentered`), headers/footers, and defined print areas/titles (`_xlnm.Print_Area`, `_xlnm.Print_Titles`).
       - Verify that post-save candidate retains identical print layout and defined names.
     - Structural Snapshot & Candidate Promotion Verifier (`WorkbookPreservationVerifier`):
       - Captures baseline snapshot before mutation and candidate snapshot after serialization.
       - Compares snapshots against the expected-change plan, classifying differences into `BLOCKING`, `WARNING`, and `INFO`.
       - If any blocking finding occurs, candidate promotion is aborted, candidate files are cleaned up, and the last valid working artifact is preserved.
       - Enforces strict 0-byte variance on Vault master template before and after candidate processing.
  2. _Option B:_ Deconstruct the entire workbook into an in-memory DOM or replace the spreadsheet processing engine with an external library that drops drawings/relationships or normalizes formatting. (REJECTED - Risks dropping embedded images, drawings, print layouts, and advanced conditional formatting rules, violating structural preservation invariants).
- **Risks & Dependencies:** Step 30 (Final Excel Export Pipeline & Standalone Export Validation) will consume the structurally preserved working workbook, applying final export metadata, freeze panes, read-only protection, and export artifact relocation.
- **Evidence Needed:** Step 29 Completion Report (`STEP_29_PRESERVATION_REPORT.md`), `tests/unit/excel-preservation.test.ts`.
- **Decision Owner:** Senior Desktop Application Engineer / Senior Excel Document-Processing Engineer / Senior Spreadsheet Compatibility Engineer / Senior Data Integrity Engineer / Senior Application Security Engineer / Senior QA Automation and Manual Testing Engineer.
- **Current Status:** **CONFIRMED BASELINE (Option A: Semantic Open XML Structure Preservation & Cryptographic Post-Save Verification Pipeline)**.

---

## DEC-052: Excel Export, Naming Rules & Generated Workbook Validation Architecture

- **Context:** Step 30 finalizes a generated Excel workbook as a named, validated report file.
- **Core Invariant:** A successful export is reported only when the final file exists at the confirmed destination, reopens as valid Open XML, is byte-identical to a candidate that passed Step 29 preservation checks, and the master template is unchanged (`INV-DAT-006`).
- **Options Considered:**
  1. _Option A (Selected):_ Stage in the destination folder, validate the staged copy, promote with an exclusive no-clobber copy (`COPYFILE_EXCL`), then re-validate the file at its final path.
     - Filename: DEC-011 components (category, date, optional station, shift, session suffix) or an explicit custom name; sanitized for Windows; always a single `.xlsx`.
     - Collision policy: `FAIL_IF_EXISTS` or `INCREMENT_SUFFIX`. **No overwrite policy** because none is approved (NFR-REL-03 lists "Overwrite" as a user prompt option, but no prompt UI or authorization flow exists yet; deferred to Step 39/40).
     - Freshness: reject a workbook whose workspace timestamp is older than the session `updated_at` (1-second granularity).
     - Partial outcomes: if the file is verified but a database status update fails, return success with `persistenceComplete: false` and `warnings`; never delete a verified file.
  2. _Option B:_ Write directly to the destination, or overwrite on collision. (REJECTED: exposes unverified files and risks data loss.)
- **Known Limitations:** Promotion is copy-then-delete, not an atomic rename. Freshness relies on timestamps, not a data revision counter. Visual rendering is not verified. (Note: Station identity and sequence order are now strictly verified row-by-row against session data).
- **Evidence Needed:** `docs/development/STEP_30_EXCEL_EXPORT_REPORT.md`, `tests/unit/excel-export.test.ts`.
- **Current Status:** **APPROVED (Confirmed Business Rule: DEC-011 pattern `[Category]_[Date]_[Station]_[Shift]_[Session].xlsx` officially approved)**.

---

## DEC-053: Word Document Cloning & Placeholder Replacement Architecture

- **Context:** Step 31 generates a Word report from an approved `.docx` master by replacing mapped placeholders in main-body paragraphs.
- **Core Invariant:** The master is never modified; a document is accepted only after an operation-owned candidate is saved, reopened and verified against an exact expected-change model (`INV-DAT-006`).
- **Decisions:**
  1. _Library:_ PizZip (already installed) with a structure-aware tokenizer over `word/document.xml`. Only changed `w:t` ranges are rewritten. No new dependency, no global regex over package XML.
  2. _Syntax:_ `{token}`, taken from the Step 23 `WORD_PLACEHOLDER_REGEX`. No new syntax.
  3. _Split-run style policy:_ the value is written into the run holding the opening brace; run properties are never changed. Provisional pending Step 32.
  4. _Value policy:_ missing/null is distinct from `''`, `0`, `false`. A required `''` is missing (Excel convention); optional `''` is valid empty text. Booleans render as `true`/`false`, dates/times are used as stored, no locale formatting (**provisional**, no approved Word text convention exists). Control and line-break characters are rejected.
  5. _Blocking policy:_ required tokens in tables, text boxes, headers/footers or unsafe paragraphs (tracked changes, fields, hyperlinks, content controls) block generation. Unmapped body tokens block unless `allowUnmappedTokens` is set. `PARAGRAPH`, `TABLE_CELL` and `REPEATING_ROW` mappings are unsupported until Step 32 (error if required, warning if optional).
  6. _Lifecycle:_ generation runs only on a pristine `PREPARED` workspace. Promotion uses an atomic rename; persistence failure restores the previous bytes.
- **Known Limitations:** Word rendering is not verified (reopening uses PizZip only). Encrypted `.docx` packages are rejected as malformed. Cloning and generation are not wired to any UI or IPC.
- **Evidence Needed:** `docs/development/STEP_31_WORD_CLONING_REPORT.md`, `tests/unit/word-generation.test.ts`.
- **Current Status:** **CONFIRMED BASELINE for the implemented behavior; value-to-text conventions remain provisional.**
