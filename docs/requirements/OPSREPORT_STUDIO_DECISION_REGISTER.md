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
* **CONFIRMED:** Formally decided and approved based on explicit user requirements.
* **PROVISIONAL / RECOMMENDED:** Architectural or engineering recommendation formulated by the team, pending explicit user confirmation or technical validation in an upcoming roadmap step.
* **OPEN / PENDING INPUT:** Unresolved item awaiting external operational data (e.g., authoritative station list, template samples).
* **DEFERRED:** Deliberately postponed to a post-V1 release phase.
* **REJECTED:** Evaluated and eliminated from the project scope.

---

## 2. Decision Register Matrix

### DEC-001: Operational Execution Environment (Offline vs. Network)
* **Question:** Is the application officially required to run 100% offline without any internet connectivity?
* **Why It Matters:** Governs dependency management, runtime network calls, telemetry, update mechanisms, and asset packaging.
* **Available Options:**
  1. *Option A (Recommended):* Fully air-gapped / 100% offline-capable execution. All runtime assets, styling, icons, and document engines bundled locally.
  2. *Option B:* Hybrid model with optional local network drive synchronization.
* **Risks & Dependencies:** Control room workstations frequently reside on isolated operational networks (OT/air-gapped networks) with restricted public internet access.
* **Evidence Needed:** Control room network infrastructure and security policy confirmation.
* **Decision Owner:** User / Operations Management.
* **Current Status:** **PROVISIONAL / RECOMMENDED (Option A: 100% Offline Capability)**.

---

### DEC-002: Target Operating System Platforms
* **Question:** Is Windows 10/11 the exclusive target platform, or must macOS and Linux also be supported?
* **Why It Matters:** Determines desktop framework packaging, installer types (MSI, NSIS, EXE), path handling conventions, and platform-specific native APIs.
* **Available Options:**
  1. *Option A (Recommended):* Windows 10 and 11 (64-bit) as the primary certified tier; architecture kept cross-platform neutral where zero penalty exists.
  2. *Option B:* Strict multi-platform desktop release (Windows, macOS, Linux).
* **Risks & Dependencies:** Corporate control room environments are predominantly Windows-based. Supporting multi-platform expands QA matrix substantially.
* **Evidence Needed:** Operator workstation fleet specification.
* **Decision Owner:** User / Technical Architecture.
* **Current Status:** **PROVISIONAL / RECOMMENDED (Option A: Windows 10/11 Priority)**.

---

### DEC-003: Desktop Application Framework Selection
* **Question:** Which desktop runtime framework should be adopted (Tauri v2 vs. Electron vs. Alternative)?
* **Why It Matters:** Determines executable bundle size, RAM footprint, system webview dependencies, security sandbox model, and backend language (Rust vs. Node.js).
* **Available Options:**
  1. *Option A (Tauri v2 with Web Frontend):* Ultra-lightweight binary (~15 MB), extremely low RAM usage (< 60 MB), high memory safety. Requires Rust document engines (which lack mature Word split-run templaters) or a 50 MB Node.js sidecar binary with complex IPC serialization.
  2. *Option B (Electron with React, TypeScript, and Node.js):* Unified TypeScript ecosystem, native Node.js execution of mature Open XML engines (`exceljs` and `docxtemplater`), robust context isolation/sandboxing, seamless SQLite integration via `better-sqlite3`. Memory footprint (~130 MB RAM) is < 1% of control room workstation hardware (16–32 GB RAM).
* **Risks & Dependencies:** Electron installer size is ~95 MB; requires background worker threads to keep UI at 60 FPS.
* **Evidence Needed:** Step 5 Technology Evaluation (`EVAL-TECH-001`), ADR (`ADR-OPSREPORT-001`), and Step 7 PoC (`ADR-OPSREPORT-002`, `POC-RES-XLS-001`, `POC-RES-DOC-001`).
* **Decision Owner:** Principal Software Architect / Desktop Architect.
* **Current Status:** **CONFIRMED BASELINE (Option B: Electron + React + TypeScript + Native Node.js Open XML Engines — 100% Verified in Step 7 PoC)**.


---

### DEC-004: Supported Office Document File Formats
* **Question:** Which file extensions must be supported for import and generation?
* **Why It Matters:** Influences parser selection, format conversions, and compatibility guarantees.
* **Available Options:**
  1. *Option A (Recommended):* Standard Open XML formats exclusively (`.xlsx` for Excel workbooks, `.docx` for Word documents).
  2. *Option B:* Include legacy binary formats (`.xls`, `.doc`).
* **Risks & Dependencies:** Legacy binary formats (`.xls`/`.doc`) require completely different, obsolete, and fragile parsing engines and pose security vulnerabilities.
* **Evidence Needed:** Inspection of the operator's actual existing template collection.
* **Decision Owner:** User / Requirements Engineer.
* **Current Status:** **CONFIRMED BASELINE (Option A: `.xlsx` and `.docx` strictly)**.

---

### DEC-005: Macro-Enabled Document Support (`.xlsm`, `.docm`)
* **Question:** Must macro-enabled documents be supported, or should the initial release restrict processing to macro-free formats?
* **Why It Matters:** Macros introduce severe execution security hazards, complex VBA code retention issues during Open XML manipulation, and corporate antivirus flags.
* **Available Options:**
  1. *Option A (Recommended):* Disallow macro-enabled files in V1; require clean `.xlsx` / `.docx` templates.
  2. *Option B:* Support macro preservation without in-app macro execution.
* **Risks & Dependencies:** Open XML libraries can corrupt or strip VBA project streams during re-saving if not specifically configured.
* **Evidence Needed:** Sample templates from control room operators to inspect whether operational macros are present.
* **Decision Owner:** User / Senior QA Engineer.
* **Current Status:** **PROVISIONAL / RECOMMENDED (Option A: Restrict to `.xlsx`/`.docx` in V1; re-evaluate if user provides `.xlsm` templates)**.

---

### DEC-006: Preserved Workbook & Document Features
* **Question:** Which advanced document features must reliably survive report generation?
* **Why It Matters:** Document population engines can inadvertently strip formulas, conditional formatting rules, data validation dropdowns, embedded charts, headers/footers, or custom print areas.
* **Available Options:**
  1. *Option A (Full Fidelity Preservation):* Utilize an Open XML manipulation strategy that injects values into cell nodes and runs without rebuilding or stripping unmapped XML parts.
  2. *Option B (Value-only Reconstruction):* Re-generate clean worksheets containing only tabular data.
* **Risks & Dependencies:** Operators rely on existing template branding, column widths, summary formulas (`SUM`, `AVERAGE`), and formatted headers. Option B would degrade usability.
* **Evidence Needed:** Validation against actual customer templates during Step 4/5.
* **Decision Owner:** Desktop Application Architect.
* **Current Status:** **CONFIRMED BASELINE (Option A: Preserve existing formulas, formatting, column widths, and layout integrity)**.

---

### DEC-007: Scope of Built-In Reusable Template Creation
* **Question:** What functional depth is required for the in-app template creation feature (REQ-010)?
* **Why It Matters:** Building a full WYSIWYG spreadsheet/word processor inside an app is a multi-year project, whereas a structured schema/template builder is achievable and maintainable.
* **Available Options:**
  1. *Option A (Recommended):* Structural Template & Schema Builder: Allows users to define report metadata, add station audit columns/fields, select standard styling/headers, assign output formats, and generate a standardized `.xlsx` / `.docx` master template.
  2. *Option B:* Full interactive in-app visual spreadsheet canvas (formula bar, cell-by-cell visual styling engine).
* **Risks & Dependencies:** Option B violates the core principle of not turning the app into an office suite and conflicts with REQ-007.
* **Evidence Needed:** User workflow alignment.
* **Decision Owner:** User / Product Architect.
* **Current Status:** **PROVISIONAL / RECOMMENDED (Option A: Structured Schema & Layout Builder)**.

---

### DEC-008: Document Field Mapping Architecture
* **Question:** How will UI form fields map into target documents?
* **Why It Matters:** Determines whether operators need technical skills to import templates or whether the system automates mapping.
* **Available Options:**
  1. *Option A (Declarative Tag / Coordinate Mapping):* In Excel, target cells are identified via explicit cell coordinates (`B4`), Named Ranges (`ReportDate`), or column headers (`Status`). In Word, via Content Controls or delimiters (`{{IncidentTime}}`).
  2. *Option B (Auto-Detection Heuristics with Visual Alignment UI):* System scans template for placeholder tokens and provides a visual drag-and-drop / selector alignment interface.
* **Risks & Dependencies:** Rigid coordinates break if rows are inserted into the template; delimiter tokens (`{{tag}}`) provide resilient, format-preserving substitution.
* **Evidence Needed:** Analysis of sample templates in Step 2.
* **Decision Owner:** Desktop Application Architect.
* **Current Status:** **OPEN / PENDING SPIKE (Scheduled for template analysis spike)**.

---

### DEC-009: Authoritative Station Catalog & Ordering Source
* **Question:** What is the authoritative station list and sequence, and how will it be managed?
* **Why It Matters:** Station ordering is a strict operational requirement (REQ-008). Sequencing errors compromise regulatory reporting.
* **Available Options:**
  1. *Option A:* Centrally managed, versioned Station Configuration file (JSON) with an in-app Station Manager interface for authorized supervisors.
  2. *Option B:* Hardcoded station enum array.
* **Risks & Dependencies:** Hardcoding prevents adding, renaming, or reordering stations as rail/facility infrastructure evolves.
* **Evidence Needed:** Official station registry list provided by the user.
* **Decision Owner:** User.
* **Current Status:** **OPEN / PENDING USER INPUT (Awaiting user delivery of authoritative station list)**.

---

### DEC-010: Multi-Zone, Route, and Directional Variations
* **Question:** Does the operational environment require multiple station sequences (e.g., Northbound vs. Southbound, Zone A vs. Zone B, Sector 1 vs. Sector 2)?
* **Why It Matters:** Affects the data model for the station selection and inspection forms.
* **Available Options:**
  1. *Option A:* Single linear sequence common to all station inspections.
  2. *Option B (Recommended Architecture):* Route/Zone grouping model capable of filtering or sequencing by operational sector while defaulting to the primary sequence.
* **Risks & Dependencies:** Forcing a single sequence when shifts inspect different loops or zones causes operational friction.
* **Evidence Needed:** Operator shift guidelines and inspection protocols.
* **Decision Owner:** User.
* **Current Status:** **OPEN / PENDING INPUT**.

---

### DEC-011: Output File Naming & Destination Conventions
* **Question:** What file naming pattern and directory organization rules should generated reports follow?
* **Why It Matters:** Standardized filenames prevent overwriting, facilitate quick searching, and simplify archival.
* **Available Options:**
  1. *Option A (Recommended Pattern):* `[ReportType]_[Station-or-Zone]_[YYYY-MM-DD]_[Shift]_[SequentialID].[ext]` (e.g., `StationLight_Station04_2026-10-19_Day_001.xlsx`).
  2. *Option B:* Freeform manual file naming via standard OS Save dialog.
  3. *Option C:* Configurable template string in application settings with automatic default.
* **Risks & Dependencies:** Freeform naming leads to chaotic disk organization and file-lock collisions.
* **Evidence Needed:** Existing control room document filing guidelines.
* **Decision Owner:** User / Business Analyst.
* **Current Status:** **PROVISIONAL / RECOMMENDED (Option C: Configurable default pattern with manual override option)**.

---

### DEC-012: Session Auto-Save & Draft State Recovery
* **Question:** Is automatic session state persistence required for in-progress report data?
* **Why It Matters:** Control room operators are subject to sudden operational emergencies (alarms, radio calls). Losing partially completed multi-station audits causes severe frustration.
* **Available Options:**
  1. *Option A (Recommended):* Automatic local draft persistence (localStorage/IndexedDB or local JSON store) with an "Unfinished Reports / Restore Session" prompt.
  2. *Option B:* Stateless form lifecycle (data lost if app is closed before generation).
* **Risks & Dependencies:** Storing drafts requires secure local storage and clear draft lifecycle/clearing rules.
* **Evidence Needed:** Control room workflow pacing assessment.
* **Decision Owner:** Technical Product Manager.
* **Current Status:** **PROVISIONAL / RECOMMENDED (Option A: Local draft persistence as P1 feature)**.

---

### DEC-013: Historical Audit Trail & Report Generation Log
* **Question:** Should OpsReport Studio maintain an internal local database of previously generated reports?
* **Why It Matters:** Provides accountability, quick re-opening of past reports, and prevents duplicate reporting.
* **Available Options:**
  1. *Option A (Recommended):* Lightweight embedded SQLite/local database recording metadata of generated reports (Date, Operator, Report Type, Output File Path, Hash).
  2. *Option B:* No database; filesystem only.
* **Risks & Dependencies:** SQLite adds a local persistence layer but guarantees high reliability and zero network dependencies.
* **Evidence Needed:** Audit and compliance reporting requirements.
* **Decision Owner:** Technical Product Manager.
* **Current Status:** **PROVISIONAL / RECOMMENDED (Option A: Lightweight local generation log)**.

---

### DEC-014: Direct PDF Export Requirement
* **Question:** Is direct PDF generation required in V1, or should it be deferred to a later release?
* **Why It Matters:** Headless cross-platform conversion of `.xlsx` and `.docx` to PDF without Microsoft Office installed typically requires hefty rendering dependencies (e.g., LibreOffice headless or specialized commercial libraries).
* **Available Options:**
  1. *Option A (Recommended):* Defer direct PDF generation to Phase 2; focus V1 on high-fidelity `.xlsx` and `.docx` output.
  2. *Option B:* Integrate PDF rendering via headless document printer or specialized library in V1.
* **Risks & Dependencies:** Attempting headless PDF rendering without Office can inflate app binary size by 200MB+ or introduce font rendering inconsistencies.
* **Evidence Needed:** Clarification on whether operators currently submit `.xlsx`/`.docx` directly or must submit PDFs.
* **Decision Owner:** User / Product Architect.
* **Current Status:** **CANDIDATE / DEFERRED TO PHASE 2 (Option A)**.

---

### DEC-015: Microsoft Office Runtime Dependency
* **Question:** Must the application operate completely standalone without requiring Microsoft Office (Excel/Word) installed on the client machine?
* **Why It Matters:** Dictates whether COM interop / Office automation can be considered or if a 100% headless Open XML library is mandatory.
* **Available Options:**
  1. *Option A (Recommended):* 100% Standalone Open XML processing. No Microsoft Office, COM automation, or Office license required on the host system.
  2. *Option B:* Rely on Microsoft Office COM automation.
* **Risks & Dependencies:** COM interop is notoriously brittle, crashes frequently in background processes, is Windows-only, and requires active Office installations. Standalone Open XML is fast, headless, and robust.
* **Evidence Needed:** Workstation software licensing policy.
* **Decision Owner:** Desktop Application Architect.
* **Current Status:** **CONFIRMED BASELINE (Option A: 100% Standalone Headless Processing)**.

---

### DEC-016: Network Share / UNC Path Integration
* **Question:** Must OpsReport Studio provide built-in synchronization with corporate SMB network shares / UNC paths (`\\server\opsreports\`)?
* **Why It Matters:** Control room operators frequently archive reports to shared departmental network drives.
* **Available Options:**
  1. *Option A (Recommended):* Standard filesystem path routing: Users can configure their default export folder to any mapped drive or accessible UNC path.
  2. *Option B:* Automated background synchronization queue with offline retry logic.
* **Risks & Dependencies:** Option B introduces complex network retry daemons and conflict resolution. Standard OS file routing (Option A) is robust and transparent.
* **Evidence Needed:** Operator filing workflow habits.
* **Decision Owner:** Technical Product Manager.
* **Current Status:** **PROVISIONAL / RECOMMENDED (Option A: Standard path routing to local or network targets)**.

---

### DEC-017: User Authentication & Role-Based Access Control
* **Question:** Is in-app login/authentication required, or does the application rely on workstation OS security?
* **Why It Matters:** Multi-user authentication requires credential stores, password management, session timeouts, and role definitions.
* **Available Options:**
  1. *Option A (Recommended for V1):* Single-tier operational workstation model: Operator enters their Name / Badge ID in report metadata fields; relies on OS-level workstation security.
  2. *Option B:* In-app role-based access control (Operator vs. Supervisor/Template Admin).
* **Risks & Dependencies:** Adding complex authentication to a dedicated control room tool adds unnecessary friction during urgent incident logging.
* **Evidence Needed:** Security policy requirements for the control room.
* **Decision Owner:** User / Operations Security.
* **Current Status:** **PROVISIONAL / RECOMMENDED (Option A for V1; evaluate PIN-based supervisor mode for template editing)**.

---

### DEC-018: Master Template Backup & Disaster Recovery
* **Question:** How will imported and authored master templates be protected against accidental deletion or filesystem corruption?
* **Why It Matters:** Core product objective is master template safety (REQ-006).
* **Available Options:**
  1. *Option A (Recommended):* Managed Internal Template Vault: When a template is imported, it is copied into a protected application data vault directory and marked read-only at the OS filesystem level. A baseline default backup bundle is maintained.
  2. *Option B:* Referencing external file paths directly on the user's desktop.
* **Risks & Dependencies:** Referencing external paths risks broken links if the operator moves or deletes the file from their desktop.
* **Evidence Needed:** Application data directory permissions audit.
* **Decision Owner:** Senior QA Engineer / Architect.
* **Current Status:** **CONFIRMED BASELINE (Option A: Managed Internal Template Vault)**.

---

### DEC-019: Confidentiality & Local Data Storage Security
* **Question:** What security safeguards must apply to cached incident descriptions, witness statements, and security logs?
* **Why It Matters:** Security incident reports may contain sensitive details, personal names, or proprietary facility security vulnerabilities.
* **Available Options:**
  1. *Option A (Recommended):* Encrypted or restricted local app data directory (Windows DPAPI / restricted ACLs) with configurable cache-retention purging.
  2. *Option B:* Plaintext unencrypted local storage.
* **Risks & Dependencies:** Plaintext storage on shared control room consoles could expose sensitive security records to unauthorized shifts.
* **Evidence Needed:** Corporate data classification guidelines.
* **Decision Owner:** Technical Product Manager / Security Lead.
* **Current Status:** **PROVISIONAL / RECOMMENDED (Option A: Restricted ACL local storage with privacy purge controls)**.

---

### DEC-020: Deterministic Processing vs. AI / LLM Integrations
* **Question:** Should OpsReport Studio include AI-assisted incident narrative generation or remain strictly deterministic in V1?
* **Why It Matters:** Research documents proposed local LLMs/SLMs for grammar correction and incident summarization. However, regulatory and incident reporting demands 100% deterministic accuracy without hallucinations.
* **Available Options:**
  1. *Option A (Recommended):* 100% Deterministic rule-based processing for V1. What the operator types is exactly what is validated and exported.
  2. *Option B:* Integrate local/cloud LLM for report drafting.
* **Risks & Dependencies:** LLMs introduce nondeterministic outputs, huge resource consumption (multi-gigabyte model weights), and regulatory verification hurdles.
* **Evidence Needed:** Explicit user requirement. (Currently absent from user requirements).
* **Decision Owner:** User / Requirements Engineer.
* **Current Status:** **CONFIRMED BASELINE (Option A: 100% Deterministic Processing for V1; LLMs excluded)**.

---

### DEC-021: Export Destination Collision Policy
* **Question:** What policy must apply when a generated report output filename collides with an existing file in the user's destination folder?
* **Why It Matters:** Prevents silent overwriting of prior operational reports while avoiding frustrating generation aborts.
* **Available Options:**
  1. *Option A (Recommended):* Safe Auto-Incrementation (`RENAME_SAFE`). Automatically appends a sequential numeric suffix (e.g., `Report_01_v2.xlsx`) if the file exists, with an optional prompt preference in user settings.
  2. *Option B:* Silent Overwrite. (REJECTED - High risk of data loss).
  3. *Option C:* Hard Abort. Halts generation completely and requires manual file deletion.
* **Risks & Dependencies:** Operators need predictable filenames without accidental data destruction.
* **Evidence Needed:** Application Architecture Specification (`ARCH-SPEC-002`, `DATA-LIFE-001`).
* **Decision Owner:** Principal Software Architect / QA Architect.
* **Current Status:** **CONFIRMED BASELINE (Option A: Safe Auto-Incrementation `RENAME_SAFE` with non-destructive fallback)**.

---

### DEC-022: Concurrency & Generation Execution Model
* **Question:** Should OpsReport Studio allow concurrent generation of multiple documents simultaneously, or enforce a single-job execution lock?
* **Why It Matters:** Governs resource consumption, scratch directory contention, worker pool sizing, and UI race conditions.
* **Available Options:**
  1. *Option A (Recommended for V1):* Single-Job Execution Lock. Only one generation operation runs at a time; subsequent clicks are blocked until completion.
  2. *Option B:* Parallel Multi-Job Queue. Spawns multiple worker threads for concurrent batch generation.
* **Risks & Dependencies:** Parallel generation increases peak RAM/CPU usage and risks race conditions on user export folders. Control room operators generate reports sequentially per shift.
* **Evidence Needed:** Architecture Test Plan (`TEST-ARCH-001`, Section 5).
* **Decision Owner:** Principal Software Architect.
* **Current Status:** **CONFIRMED BASELINE (Option A: Single-Job Execution Lock for V1)**.

---

### DEC-023: Cross-Resource Transaction & Reconciliation Protocol
* **Question:** How should atomic consistency be maintained between the local SQLite database (`opsreport.db`) and host filesystem without a distributed 2PC coordinator?
* **Why It Matters:** System crashes midway through generation could leave orphaned files or inconsistent database records.
* **Available Options:**
  1. *Option A (Recommended):* Two-Phase Reservation Pattern. Create a `PENDING` reservation in SQLite, execute scratch generation and atomic file move, then commit to `COMPLETED`. Startup sweep cleans up any stale `PENDING` entries and orphaned scratch files.
  2. *Option B:* Optimistic generation without DB reservation.
* **Risks & Dependencies:** Distributed two-phase commit is impossible on local desktop OS filesystems; reconciliation must be handled by the application lifecycle.
* **Evidence Needed:** Data Lifecycle Specification (`DATA-LIFE-001`, Section 8).
* **Decision Owner:** Principal Software Architect / Data Architect.
* **Current Status:** **CONFIRMED BASELINE (Option A: Two-Phase Reservation Pattern with Startup Sweep)**.

---

### DEC-024: Automated Diagnostic Log Sanitization Policy
* **Question:** How must confidential incident narratives, witness statements, and inspector identifiers be protected from leaking into technical log files?
* **Why It Matters:** Technical logs stored in `%LOCALAPPDATA%\Logs` may be inspected for troubleshooting. Logging raw report payloads violates operational confidentiality (`NFR-SEC-01`, `DEC-019`).
* **Available Options:**
  1. *Option A (Recommended):* Interceptor Redaction Filter. All logging calls pass through a centralized redaction filter in `MOD-12` that replaces sensitive field keys (`FLD-INC-NARRATIVE`, `FLD-INC-WITNESS`, badge numbers) with `[REDACTED_CONFIDENTIAL]`.
  2. *Option B:* Developer discipline / manual filtering per log call.
* **Risks & Dependencies:** Manual filtering inevitably suffers developer oversight; automated structural filtering guarantees privacy.
* **Evidence Needed:** Security Threat Model (`SEC-THREAT-001`, Section 7).
* **Decision Owner:** Application Security Architect.
* **Current Status:** **CONFIRMED BASELINE (Option A: Mandatory Interceptor Redaction Filter in `MOD-12`)**.

---

### DEC-025: Draft Session Station Sequence Snapshotting
* **Question:** How should an in-progress multi-station draft behave if an administrator modifies the authoritative station list before the draft is exported?
* **Why It Matters:** Altering the active station list while an operator has partially entered observations could scramble row mappings or corrupt sequence ordinality (`REQ-008`).
* **Available Options:**
  1. *Option A (Recommended):* Immutable Draft Sequence Snapshot. The draft stores a frozen JSON snapshot of the station sequence at the time the session was initialized. The draft continues with that sequence; upon reload, a non-blocking reconciliation banner notifies the operator.
  2. *Option B:* Force-update draft stations on load (risks silent data loss or column mismatch).
* **Risks & Dependencies:** Station configuration changes are rare in production, but active drafts must be resilient against schema drift.
* **Evidence Needed:** Data Lifecycle Specification (`DATA-LIFE-001`, Section 4).
* **Decision Owner:** Data Architect / Senior QA Architect.
* **Current Status:** **CONFIRMED BASELINE (Option A: Immutable Draft Station Snapshotting)**.

---

### DEC-026: Master Template Vault Physical Storage Location
* **Question:** Exactly where on the host filesystem should imported and approved master templates be stored?
* **Why It Matters:** Governs access control, user permission isolation, and protection against accidental user deletion.
* **Available Options:**
  1. *Option A (Recommended):* Dedicated Application Vault in `%LOCALAPPDATA%\OpsReportStudio\Templates\` with OS `FILE_ATTRIBUTE_READONLY` set upon enrollment.
  2. *Option B:* Leaving templates in arbitrary user download/desktop folders and referencing paths. (REJECTED - High risk of broken paths or accidental deletion).
* **Risks & Dependencies:** Roaming profiles vs. local app data; local app data is standard for Windows desktop application assets.
* **Evidence Needed:** File Storage Specification (`FILE-STORAGE-SPEC-001`, Section 3.1).
* **Decision Owner:** Principal Software Architect / Application Security Engineer.
* **Current Status:** **CONFIRMED BASELINE (Option A: Protected Vault in `%LOCALAPPDATA%\OpsReportStudio\Templates\`)**.

---

### DEC-027: Relational Database Migration & Versioning Strategy
* **Question:** How should embedded SQLite database schema changes be managed across future application releases?
* **Why It Matters:** Prevents corrupted schemas, broken foreign keys, or loss of user report drafts during application updates.
* **Available Options:**
  1. *Option A (Recommended):* Sequential versioned SQL scripts tracked via SQLite's internal `PRAGMA user_version`. Each migration runs inside an explicit atomic transaction; downgrade attempts by older builds are blocked.
  2. *Option B:* Heavy ORM auto-synchronization (e.g., TypeORM/Prisma schema sync). (REJECTED - Prone to silent destructive alters).
* **Risks & Dependencies:** Must ensure zero data loss on user drafts and history tables.
* **Evidence Needed:** Persistence Design Specification (`PERSIST-SPEC-001`, Section 4).
* **Decision Owner:** Database Designer / Senior Data Architect.
* **Current Status:** **CONFIRMED BASELINE (Option A: Transactional Sequential Migrations via `PRAGMA user_version`)**.

---

### DEC-028: Target Project Directory Structure Architecture
* **Question:** How should the source code, build scripts, tests, and static assets be organized in Step 9?
* **Why It Matters:** Enforces architectural module boundaries (`MOD-01` to `MOD-13`), isolates untrusted renderer code from trusted main/worker code, and prevents PoC code bleed into production.
* **Available Options:**
  1. *Option A (Recommended):* Clean Process & Layer Partitioning: `src/main/` (Electron main & IPC), `src/preload/` (ContextBridge guards), `src/renderer/` (Sandboxed React UI), `src/worker/` (Headless document engine), `src/domain/` (Pure logic), `src/storage/` (SQLite & Vault), and `src/shared/` (Types/DTOs).
  2. *Option B:* Flat single-directory or feature-slice-only layout. (REJECTED - Conflates process execution boundaries).
* **Risks & Dependencies:** Multi-target TypeScript compilation (`tsconfig.node.json` vs `tsconfig.web.json`).
* **Evidence Needed:** Project Structure Blueprint (`STRUCT-BLUEPRINT-001`, Section 2).
* **Decision Owner:** Principal Software Architect.
* **Current Status:** **CONFIRMED BASELINE (Option A: Process & Layer Partitioned Directory Tree for Step 9)**.

---

### DEC-029: In-Progress Draft Session Retention & Pruning Horizon
* **Question:** How long should unfinished report drafts remain stored in the local SQLite database before being flagged for deletion?
* **Why It Matters:** Prevents unbounded accumulation of stale or abandoned report sessions on shared control room consoles.
* **Available Options:**
  1. *Option A (Recommended):* 30-Day Inactivity Horizon. Drafts untouched for > 30 days prompt the operator with an optional cleanup advisory upon startup; auto-purge is disabled to avoid accidental data destruction.
  2. *Option B:* Immediate purge on application exit. (REJECTED - Defeats crash recovery).
* **Risks & Dependencies:** Operator shifts may be delayed or extended across weeks.
* **Evidence Needed:** Data Model Specification (`DATA-MODEL-SPEC-001`, Section 6).
* **Decision Owner:** Product Manager / Senior QA Architect.
* **Current Status:** **PROVISIONAL / RECOMMENDED (Option A: 30-Day Inactivity Horizon with Non-Destructive Advisory)**.

---

### DEC-030: Physical Document vs. Database Metadata Separation Policy
* **Question:** Should Excel workbooks and Word documents ever be stored directly as binary BLOBs inside SQLite tables?
* **Why It Matters:** Storing large multi-megabyte binary documents in SQLite causes massive database file bloat, slow page cache lookups, and risks catastrophic database corruption if a binary write fails.
* **Available Options:**
  1. *Option A (Recommended):* Strict Storage Segregation. Physical documents reside exclusively in the filesystem (Vault for masters, User Destination for outputs). The database stores only metadata, SHA-256 fingerprints, and relative file paths.
  2. *Option B:* Storing template documents as SQLite BLOBs. (REJECTED - Architectural anti-pattern for desktop file automation).
* **Risks & Dependencies:** Requires explicit reconciliation between database records and filesystem paths.
* **Evidence Needed:** Data Model Specification (`DATA-MODEL-SPEC-001`, Section 1.1) and File Storage Specification (`FILE-STORAGE-SPEC-001`).
* **Decision Owner:** Senior Data Architect / Application Security Engineer.
* **Current Status:** **CONFIRMED BASELINE (Option A: Strict Storage Segregation — Database Stores Metadata Only)**.

---

### DEC-031: Step 9 Build Toolchain, Multi-Target TypeScript & Smoke Verification
* **Question:** How should the production build system, dual TypeScript compiler environments, and smoke verification be structured in Step 9?
* **Why It Matters:** Guarantees deterministic compilation without emitting stray `.d.ts` or `.js` files into source directories, separates Node.js backend types from Web browser DOM types, and provides an automated health gate.
* **Available Options:**
  1. *Option A (Recommended & Implemented):* Dual-target configuration with `tsconfig.node.json` (ES2022, bundler resolution, Node types, `noEmit: true`) and `tsconfig.web.json` (ES2020, React JSX, DOM types, `noEmit: true`), coupled with Vite dual-compilation (`vite-plugin-electron`), dedicated `vitest.config.ts`, and automated Vitest smoke test suite (`foundation.test.ts`).
  2. *Option B:* Single monolithic `tsconfig.json` combining DOM and Node types. (REJECTED - Causes type namespace pollution between Node built-ins and Web APIs).
* **Risks & Dependencies:** Dual tsconfig requires explicit references and separated include paths.
* **Evidence Needed:** Step 9 Foundation Change Report (`STEP_09_FOUNDATION_REPORT.md`).
* **Decision Owner:** Principal Software Architect / Senior Build & Release Engineer.
* **Current Status:** **CONFIRMED BASELINE (Option A: Dual-Target TS, Vite 5 Dual Bundling & Dedicated Vitest Runner)**.

---

### DEC-032: Shared Branded Identifiers, Discriminated Result & Centralized AppError Model
* **Question:** How should domain identifiers, operational outcomes, and exceptions be typed and normalized across modular boundaries?
* **Why It Matters:** Raw string IDs cause accidental transpositions (`StationId` vs `TemplateId`); untyped throws cause unhandled promise rejections; and raw JavaScript stack traces leak internal paths and sensitive operational data to users.
* **Available Options:**
  1. *Option A (Recommended & Implemented):* Adopt nominal branded types (`Brand<string, Tag>`) for semantic IDs; use the discriminated `Result<T, E>` pattern for operational functions; implement `AppError` with 24 authoritative codes separating non-technical user messages from internal diagnostics; enforce `toSerializableError()` across IPC boundaries; and apply automated redaction on incident narratives, witnesses, and badge IDs.
  2. *Option B:* Unrestricted primitive strings, raw native `Error` throwing, and ad-hoc error handling in UI components. (REJECTED - Prone to silent data corruption, runtime panics, and privacy leaks).
* **Risks & Dependencies:** Developers must use constructor helpers (`toStationId`) and normalize errors at system boundaries.
* **Evidence Needed:** Step 10 Type Foundation Report (`STEP_10_TYPE_FOUNDATION_REPORT.md`), `TYPESCRIPT_STANDARDS.md`, `ERROR_HANDLING_STANDARDS.md`.
* **Decision Owner:** Principal TypeScript Architect / Senior QA Automation Engineer.
* **Current Status:** **CONFIRMED BASELINE (Option A: Branded IDs, Discriminated Result & AppError Model)**.

---

### DEC-033: Design System Tokens, Dual-Theme Architecture & WCAG 2.2 AA Contrast Standards
* **Question:** How should visual styles, color tokens, and theme preferences be structured across the desktop user interface?
* **Why It Matters:** Hard-coded colors and arbitrary font sizes lead to inconsistent component ergonomics, poor readability during 24/7 control room shifts, and accessibility violations.
* **Available Options:**
  1. *Option A (Recommended & Implemented):* Centralize all styling tokens into semantic CSS custom properties in `tokens.css`; establish distinct Dark (`#0b1120`) and Light (`#ffffff`) themes controlled by a document-level `[data-theme]` attribute; persist preferences in `localStorage` under `opsreport_theme_preference` with automatic 'system'/'dark' fallbacks; and verify WCAG 2.2 Level AA contrast (>= 4.5:1 text, >= 3:1 controls) via automated test suites.
  2. *Option B:* Inline ad-hoc CSS styling per component without centralized tokens or dynamic dark/light switching. (REJECTED - Inconsistent, unmaintainable, inaccessible).
* **Risks & Dependencies:** Future UI components in Step 12+ must consume `var(--color-...)` tokens exclusively.
* **Evidence Needed:** Step 11 Design System Report (`STEP_11_DESIGN_SYSTEM_REPORT.md`), `OPSREPORT_STUDIO_DESIGN_SYSTEM.md`, `OPSREPORT_STUDIO_THEME_SPECIFICATION.md`.
* **Decision Owner:** Principal Product Designer / Frontend Architect.
* **Current Status:** **CONFIRMED BASELINE (Option A: Semantic CSS Tokens, Dual Theme Architecture & WCAG 2.2 AA Verification)**.





