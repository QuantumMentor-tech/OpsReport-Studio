# OpsReport Studio — Module Boundary & Interface Contract Specification

**Document Identifier:** MOD-CONTRACT-001  
**Project ID:** stationops-reporter  
**Approved Product Name:** OpsReport Studio  
**Lifecycle Step:** Step 6 of 45 (Application Architecture, Module Boundaries & Security Model)  
**Status:** Authoritative Interface Contract Specification  
**Last Updated:** 2026-10-19  

---

## 1. Scope & Architectural Role

This specification establishes the explicit interface contracts, input/output structures, allowed callers, dependency directions, security restrictions, and forbidden responsibilities for all logical modules in OpsReport Studio.

These contracts serve as the binding blueprint for future AI coding agents and human software engineers during implementation (Steps 8 through 27). No application implementation or production code is included in this document; all interface definitions are conceptual TypeScript contracts.

---

## 2. Module Registry & Boundary Index

| Module ID | Module Name | Architectural Layer | Execution Context |
| :--- | :--- | :--- | :--- |
| **MOD-01** | Presentation & UI Module | Presentation Layer | Renderer Process (Sandboxed Chromium) |
| **MOD-02** | Application Orchestration Module | Orchestration Layer | Main Process (Node.js) |
| **MOD-03** | Category & Field Definition Module | Domain Layer | Main Process (Node.js) |
| **MOD-04** | Station Sequence Domain Module | Domain Layer | Main Process (Node.js) |
| **MOD-05** | Template Registry & Metadata Module | Template Management Layer | Main Process (Node.js) |
| **MOD-06** | Template Ingestion & Sanitization Module | Template Security Layer | Main Process (Node.js) |
| **MOD-07** | Template Mapping Module | Domain Layer | Main Process (Node.js) |
| **MOD-08** | Document Processing Engine Module | Generation Engine Layer | Worker Thread Pool (Node.js Worker) |
| **MOD-09** | Persistence Module | Storage Layer | Main Process (Node.js / better-sqlite3) |
| **MOD-10** | File Management & Vault Module | Filesystem Boundary Layer | Main Process (Node.js) |
| **MOD-11** | Settings & Theming Module | Configuration Layer | Main Process (Node.js) |
| **MOD-12** | Logging & Diagnostics Module | Infrastructure Layer | Main Process (Node.js) |
| **MOD-13** | Platform & Native Adapter Module | Platform Layer | Main Process (Node.js / Electron API) |

---

## 3. Detailed Module Specifications & Interface Contracts

```typescript
// Shared Common Types across Module Boundaries
export type ReportCategoryId = 
  | 'RPT-INCIDENT' 
  | 'RPT-STATION-LIGHT' 
  | 'RPT-FAN' 
  | 'RPT-POLE-LIGHT' 
  | 'RPT-FIRE-EXTINGUISHER' 
  | 'RPT-PILLAR' 
  | 'RPT-FENCE';

export type TemplateFormat = 'EXCEL_XLSX' | 'WORD_DOCX';

export interface BaseResponse<T> {
  success: boolean;
  data?: T;
  error?: ErrorContract;
}

export interface ErrorContract {
  errorCode: string;
  userMessage: string;
  technicalDetails?: string;
  recoverable: boolean;
  originatingModule: string;
  suggestedAction?: string;
}
```

---

### 3.1 MOD-01: Presentation & UI Module

* **Purpose:** Provides the visual desktop interface for report catalog selection, structured form-based operational data entry, ordered station observation logging, visual theme toggling, and generation feedback (`REQ-001`, `REQ-007`, `REQ-008`, `REQ-011`, `REQ-012`).
* **Responsibilities:**
  1. Render the 7 operational report category cards and navigation views.
  2. Render dynamic, accessible form controls corresponding to approved field dictionaries.
  3. Render sequential station row pickers and observation forms adhering to authoritative ordering.
  4. Display real-time validation warnings and diagnostic feedback toasts/modals.
  5. Provide instant dark/light appearance switching via CSS custom property tokens.
  6. Dispatch user requests to backend services strictly via the Preload `window.opsreport` bridge.
* **Conceptual Interface Contract:**
```typescript
export interface IPresentationController {
  // Navigation & Category Selection
  onSelectCategory(categoryId: ReportCategoryId): void;
  
  // Form Interaction & Local State
  onFieldChange(fieldKey: string, value: unknown): void;
  onStationObservationChange(stationId: string, fieldKey: string, value: unknown): void;
  
  // Workflow Dispatch
  requestReportGeneration(sessionId: string): Promise<BaseResponse<GenerationResultDTO>>;
  requestSaveDraft(sessionId: string): Promise<BaseResponse<void>>;
  requestImportTemplate(): Promise<BaseResponse<TemplateSummaryDTO>>;
  
  // Theme & Settings
  onToggleTheme(theme: 'light' | 'dark'): void;
}
```
* **Inputs:** User UI events (mouse, keyboard, form inputs), IPC response messages from `PreloadBridge`.
* **Outputs:** Validated request payloads sent across IPC to `MOD-02`.
* **Dependencies:** Preload `window.opsreport` interface. Zero direct npm module dependencies on filesystem or database.
* **Allowed Callers:** Chromium browser runtime, React component hierarchy.
* **Forbidden Responsibilities:**
  * Must NOT import `fs`, `path`, `child_process`, or `better-sqlite3`.
  * Must NOT write directly to master template files or arbitrary local files.
  * Must NOT duplicate category validation rules independently of backend domain modules.
  * Must NOT bypass the Preload context bridge.
* **Security Restrictions:** Enforced by `contextIsolation: true` and `sandbox: true`. Strict Content Security Policy prohibits inline scripts and external connections.
* **Testing Requirements:** Vitest + React Testing Library for component rendering; axe-core for WCAG 2.1 AA contrast audits; Playwright for keyboard navigation automation.

---

### 3.2 MOD-02: Application Orchestration Module

* **Purpose:** Central coordinator of operational report workflows, coordinating validation, template resolution, scratch copy creation, worker generation dispatch, atomic export, and crash recovery.
* **Responsibilities:**
  1. Validate incoming generation request envelopes.
  2. Coordinate transaction lifecycles across database and filesystem.
  3. Resolve approved template records and matching field mappings.
  4. Ensure station sequences conform to operational contracts prior to generation.
  5. Dispatch heavy document generation tasks to the worker thread pool (`MOD-08`).
  6. Manage draft session autosaving and recovery after abnormal application terminations.
* **Conceptual Interface Contract:**
```typescript
export interface IReportOrchestrator {
  generateReport(request: GenerateReportRequestDTO): Promise<BaseResponse<GenerationResultDTO>>;
  saveDraft(draft: ReportDraftDTO): Promise<BaseResponse<DraftSaveResultDTO>>;
  loadDraft(sessionId: string): Promise<BaseResponse<ReportDraftDTO>>;
  discardDraft(sessionId: string): Promise<BaseResponse<void>>;
  recoverInterruptedSessions(): Promise<InterruptedSessionReportDTO>;
}

export interface GenerateReportRequestDTO {
  sessionId: string;
  categoryId: ReportCategoryId;
  templateId?: string; // Optional: resolves active default if omitted
  targetDirectory: string;
  targetFilename?: string;
  formData: Record<string, unknown>;
  stationObservations?: Array<{
    stationId: string;
    sequenceIndex: number;
    observations: Record<string, unknown>;
  }>;
}

export interface GenerationResultDTO {
  jobId: string;
  finalFilePath: string;
  fileSizeBytes: number;
  elapsedMs: number;
  templateId: string;
  warnings: string[];
}
```
* **Inputs:** `GenerateReportRequestDTO`, `ReportDraftDTO` from Preload IPC.
* **Outputs:** `GenerationResultDTO`, structured error contracts, progress notifications.
* **Dependencies:** `MOD-03`, `MOD-04`, `MOD-05`, `MOD-07`, `MOD-08`, `MOD-09`, `MOD-10`, `MOD-12`.
* **Allowed Callers:** Preload IPC Handler (via `ipcMain.handle`).
* **Forbidden Responsibilities:**
  * Must NOT manipulate Open XML buffers or parse Excel/Word internal XML nodes directly.
  * Must NOT render UI elements or manipulate DOM structures.
  * Must NOT silently bypass validation errors to force report generation.
* **Security Restrictions:** Validates all IPC input payloads using strict JSON schemas before delegating to domain services. Sanitizes error objects before returning to UI.
* **Testing Requirements:** Unit tests with mock domain services; integration tests verifying end-to-end generation lifecycle and failure rollback.

---

### 3.3 MOD-03: Report Category & Field Definition Module

* **Purpose:** Represents authoritative business definitions, metadata, schemas, and field validation rules for the 7 approved operational report categories (`RPT-INCIDENT`, `RPT-STATION-LIGHT`, `RPT-FAN`, `RPT-POLE-LIGHT`, `RPT-FIRE-EXTINGUISHER`, `RPT-PILLAR`, `RPT-FENCE`).
* **Responsibilities:**
  1. Maintain authoritative schemas for all common fields (8 fields) and category-specific fields (43 fields) defined in Step 2.
  2. Enforce field data types, string length boundaries, regex patterns, and mandatory/optional rules.
  3. Validate conditional field requirements (e.g., police report number required if police notified).
* **Conceptual Interface Contract:**
```typescript
export interface ICategoryFieldDomain {
  getCategoryDefinition(categoryId: ReportCategoryId): CategoryDefinitionDTO;
  listAllCategories(): CategorySummaryDTO[];
  validateReportPayload(
    categoryId: ReportCategoryId, 
    payload: Record<string, unknown>
  ): ValidationResultDTO;
}

export interface ValidationResultDTO {
  isValid: boolean;
  errors: Array<{
    fieldKey: string;
    errorCode: string;
    message: string;
  }>;
  warnings: Array<{
    fieldKey: string;
    message: string;
  }>;
}
```
* **Inputs:** Report category ID, field-value dictionaries.
* **Outputs:** Category definition models, `ValidationResultDTO`.
* **Dependencies:** None (Pure domain module).
* **Allowed Callers:** `MOD-02` (Orchestrator), `MOD-07` (Mapping Domain).
* **Forbidden Responsibilities:**
  * Must NOT know about Excel cell coordinates (e.g., `B14`) or Word tokens (`{{token}}`).
  * Must NOT access filesystem paths or database files.
* **Security Restrictions:** Rejects arbitrary unapproved field keys (schema whitelisting).
* **Testing Requirements:** 100% code coverage unit tests testing every field constraint, boundary condition, and cross-field conditional rule across all 7 categories.

---

### 3.4 MOD-04: Station Sequence Domain Module

* **Purpose:** Preserves and enforces the authoritative station sequence, 1..N ordinality, and integrity invariants across all multi-station inspection reports (`REQ-008`, `INV-STN-001` through `INV-STN-007`).
* **Responsibilities:**
  1. Provide the authoritative, ordered sequence of stations to report forms and generation pipelines.
  2. Enforce strict sequential ordering ($1, 2, \dots, N$) with zero gaps and zero re-indexing.
  3. Reject unauthorized alphabetical sorting, deduplication, or random truncation.
  4. Validate multi-station observation payloads against active station contracts.
* **Conceptual Interface Contract:**
```typescript
export interface IStationSequenceDomain {
  getAuthoritativeStationSequence(): StationEntityDTO[];
  validateStationPayload(
    observations: Array<{ stationId: string; sequenceIndex: number; data: unknown }>
  ): StationValidationResultDTO;
  createStationSnapshot(sessionId: string): StationSequenceSnapshotDTO;
}

export interface StationEntityDTO {
  stationId: string;
  sequenceIndex: number; // 1-based authoritative index
  stationName: string;
  isActive: boolean;
}

export interface StationValidationResultDTO {
  isValid: boolean;
  violations: Array<{
    scenarioId: string; // e.g., "SCN-STN-VAL-01"
    stationId?: string;
    expectedIndex?: number;
    actualIndex?: number;
    message: string;
  }>;
}
```
* **Inputs:** Station observation arrays, station sequence updates.
* **Outputs:** Ordered station entity lists, `StationValidationResultDTO`, sequence snapshots.
* **Dependencies:** `MOD-09` (Persistence) for loading station records.
* **Allowed Callers:** `MOD-02` (Orchestrator), `MOD-01` (via Orchestrator IPC).
* **Forbidden Responsibilities:**
  * Must NOT sort stations alphabetically unless an explicit administrative sequence update is approved.
  * Must NOT invent replacement station names or drop unknown station IDs silently.
* **Security Restrictions:** Station names and IDs are sanitized against control character injection.
* **Testing Requirements:** Vitest unit test suite implementing all 14 validation scenarios (`SCN-STN-VAL-01` to `SCN-STN-VAL-14`) and 17 test cases from Step 3.

---

### 3.5 MOD-05: Template Registry & Metadata Module

* **Purpose:** Manages template identities, format associations, active versioning, cryptographic checksums, and vault metadata references (`REQ-004`).
* **Responsibilities:**
  1. Register newly imported or authored master templates in `opsreport.db`.
  2. Associate templates with approved report categories and document formats.
  3. Track template revisions and verify physical file SHA-256 hashes against database records.
  4. Designate active default templates for each report category.
* **Conceptual Interface Contract:**
```typescript
export interface ITemplateRegistry {
  registerTemplate(template: RegisterTemplateDTO): Promise<TemplateRecordDTO>;
  getTemplateById(templateId: string): Promise<TemplateRecordDTO | null>;
  getActiveTemplateForCategory(categoryId: ReportCategoryId): Promise<TemplateRecordDTO | null>;
  listTemplatesByCategory(categoryId: ReportCategoryId): Promise<TemplateRecordDTO[]>;
  updateTemplateStatus(templateId: string, isActive: boolean): Promise<void>;
  deleteTemplate(templateId: string): Promise<void>;
}

export interface TemplateRecordDTO {
  templateId: string;
  templateName: string;
  categoryId: ReportCategoryId;
  format: TemplateFormat;
  vaultRelativePath: string;
  sha256Hash: string;
  createdAt: string;
  version: number;
  isActiveDefault: boolean;
}
```
* **Inputs:** Template registration records, query parameters.
* **Outputs:** `TemplateRecordDTO` objects, template lists.
* **Dependencies:** `MOD-09` (Persistence), `MOD-10` (File Management & Vault).
* **Allowed Callers:** `MOD-02` (Orchestrator).
* **Forbidden Responsibilities:**
  * Must NOT parse internal document XML or cell values.
  * Must NOT generate completed reports.
* **Security Restrictions:** Verifies SHA-256 content hashes before certifying active template records.
* **Testing Requirements:** Integration tests verifying registration, default flag toggling, and hash verification against mock SQLite instances.

---

### 3.6 MOD-06: Template Ingestion & Sanitization Module

* **Purpose:** Defensively inspects, validates, and sanitizes untrusted external Excel and Word documents during import before allowing them into the managed Template Vault (`REQ-004`, `NFR-SEC-02`, `DEC-005`).
* **Responsibilities:**
  1. Verify standard Open XML ZIP magic header bytes (`PK\x03\x04`).
  2. Enforce zip bomb safeguards: maximum compression ratio (15:1) and maximum decompressed ceiling (100 MB).
  3. Enforce Zip Slip protection: reject inner paths containing `..` or leading slashes.
  4. Inspect archive contents for `vbaProject.bin` or macro streams; quarantine macro-enabled files.
  5. Check for valid Open XML root content types (`[Content_Types].xml`).
* **Conceptual Interface Contract:**
```typescript
export interface ITemplateIngestionSanitizer {
  inspectAndSanitize(
    sourceFilePath: string, 
    expectedFormat: TemplateFormat
  ): Promise<IngestionInspectionResultDTO>;
}

export interface IngestionInspectionResultDTO {
  isSafe: boolean;
  sha256Hash: string;
  detectedFormat: TemplateFormat;
  fileSizeBytes: number;
  quarantineReason?: string;
  inspectedParts: {
    hasMacros: boolean;
    hasExternalEntities: boolean;
    totalUncompressedBytes: number;
    compressionRatio: number;
  };
}
```
* **Inputs:** Host filesystem path to candidate master template.
* **Outputs:** `IngestionInspectionResultDTO`.
* **Dependencies:** `MOD-10` (File Management) for controlled read streams.
* **Allowed Callers:** `MOD-05` (Template Registry via Orchestrator).
* **Forbidden Responsibilities:**
  * Must NOT execute embedded macros, VBScript, or binary code.
  * Must NOT resolve external XML entity references (XXE).
  * Must NOT write unvalidated files into the Template Vault.
* **Security Restrictions:** Operates strictly on temporary buffers; terminates archive decompression immediately if safe thresholds are exceeded.
* **Testing Requirements:** Automated negative tests injecting Zip bombs, path traversal archives, `.xlsm` macro workbooks, and corrupted ZIP headers.

---

### 3.7 MOD-07: Template Mapping Module

* **Purpose:** Encapsulates the schema relationships between abstract business fields and physical template locations (Excel cell coordinates or Word tokens) (`REQ-009`).
* **Responsibilities:**
  1. Maintain field-to-coordinate mapping profiles for Excel workbooks (e.g., `FLD-INC-DATE` $\rightarrow$ `Sheet1!C4`).
  2. Maintain field-to-token mapping profiles for Word documents (e.g., `FLD-INC-NARRATIVE` $\rightarrow$ `{{incident_narrative}}`).
  3. Maintain multi-row repeating table mappings for station inspection grids (`station_rows`).
  4. Validate mapping completeness: verify all mandatory category fields map to valid document targets.
* **Conceptual Interface Contract:**
```typescript
export interface ITemplateMappingDomain {
  getMappingProfile(mappingId: string): Promise<TemplateMappingProfileDTO>;
  getMappingForTemplate(templateId: string): Promise<TemplateMappingProfileDTO>;
  validateMappingIntegrity(
    mapping: TemplateMappingProfileDTO, 
    templateParts: string[]
  ): MappingValidationResultDTO;
  saveMappingProfile(mapping: TemplateMappingProfileDTO): Promise<void>;
}

export interface TemplateMappingProfileDTO {
  mappingId: string;
  templateId: string;
  version: number;
  cellMappings?: Array<{
    fieldKey: string;
    sheetName: string;
    cellCoordinate: string; // e.g., "B14"
    valueFormat?: 'TEXT' | 'DATE' | 'NUMBER';
  }>;
  stationTableMapping?: {
    sheetName: string;
    startRowIndex: number;
    stationColumnMapping: Record<string, string>; // fieldKey -> columnLetter e.g. "FLD-STN-LIGHT" -> "D"
  };
  wordTokenMappings?: Array<{
    fieldKey: string;
    tokenPlaceholder: string; // e.g., "incident_summary"
  }>;
}

export interface MappingValidationResultDTO {
  isCompatible: boolean;
  missingRequiredFields: string[];
  unresolvedTokens: string[];
  overlappingCells: string[];
}
```
* **Inputs:** Mapping profiles, template structural part inventories.
* **Outputs:** `TemplateMappingProfileDTO`, `MappingValidationResultDTO`.
* **Dependencies:** `MOD-03` (Category Fields), `MOD-09` (Persistence).
* **Allowed Callers:** `MOD-02` (Orchestrator).
* **Forbidden Responsibilities:**
  * Must NOT guess ambiguous target locations or drop unmapped fields silently.
  * Must NOT modify master template documents.
* **Security Restrictions:** Validates coordinate strings against strict cell regex (`^[A-Z]{1,3}[1-9][0-9]{0,6}$`) to prevent injection.
* **Testing Requirements:** Unit tests validating coordinate syntax, token regexes, and detecting missing mandatory field mappings.

---

### 3.8 MOD-08: Document Processing Engine Module

* **Purpose:** Performs headless, asynchronous manipulation of Open XML documents, injecting operational data into scratch copies of master templates while preserving formulas, cell formatting, and layouts (`REQ-002`, `REQ-003`, `NFR-REL-01`).
* **Responsibilities:**
  1. Open scratch `.xlsx` files using `exceljs` without modifying original master files.
  2. Inject field values and station rows while preserving cell styling, merged ranges, borders, and formulas.
  3. Open scratch `.docx` files using `docxtemplater` + `pizzip` and perform split-run token replacement.
  4. Execute within a Node.js Worker Thread off the main UI loop to maintain 60 FPS responsiveness (`NFR-PERF-01`).
* **Conceptual Interface Contract:**
```typescript
export interface IDocumentProcessingEngine {
  processDocument(task: DocumentProcessingTaskDTO): Promise<DocumentProcessingResultDTO>;
}

export interface DocumentProcessingTaskDTO {
  jobId: string;
  format: TemplateFormat;
  scratchFilePath: string; // File MUST reside in %LOCALAPPDATA%/Scratch
  mappingProfile: TemplateMappingProfileDTO;
  reportPayload: Record<string, unknown>;
  stationObservations?: Array<{
    stationId: string;
    sequenceIndex: number;
    observations: Record<string, unknown>;
  }>;
}

export interface DocumentProcessingResultDTO {
  jobId: string;
  success: boolean;
  outputFilePath: string;
  unresolvedTokens: string[];
  preservedFormulasCount: number;
  processingTimeMs: number;
}
```
* **Inputs:** `DocumentProcessingTaskDTO` sent via thread `MessageChannel`.
* **Outputs:** `DocumentProcessingResultDTO`, progress percentage events.
* **Dependencies:** `MOD-10` (File Management) for scratch path verification. Node worker thread primitives.
* **Allowed Callers:** `MOD-02` (Orchestrator).
* **Forbidden Responsibilities:**
  * Must NOT touch files in the Template Vault.
  * Must NOT perform UI operations or make network calls.
  * Must NOT claim formula recalculation where not supported by the engine.
* **Security Restrictions:** Restricted to scratch sandbox directory; capped memory limit (512 MB per worker).
* **Testing Requirements:** Step 7 Proof of Concept benchmarks (`POC-XLS-01` through `POC-DOC-05`) verifying formula and layout preservation.

---

### 3.9 MOD-09: Persistence Module

* **Purpose:** Provides transactional, embedded relational storage using `better-sqlite3` in Write-Ahead Logging (WAL) mode (`STK-DB-001`).
* **Responsibilities:**
  1. Initialize database connection with `PRAGMA journal_mode = WAL`, `PRAGMA foreign_keys = ON`, and `PRAGMA synchronous = NORMAL`.
  2. Execute versioned, idempotent schema migrations using `PRAGMA user_version`.
  3. Manage tables for templates, mappings, authoritative stations, report drafts, generation history, and settings.
  4. Perform crash recovery scans on startup to mark interrupted sessions.
* **Conceptual Interface Contract:**
```typescript
export interface IPersistenceService {
  initialize(): Promise<void>;
  close(): void;
  runTransaction<T>(work: () => T): T;
  
  // Domain Repositories
  readonly stations: IStationRepository;
  readonly templates: ITemplateRepository;
  readonly mappings: IMappingRepository;
  readonly drafts: IDraftRepository;
  readonly history: IHistoryRepository;
  readonly settings: ISettingsRepository;
}
```
* **Inputs:** Strongly typed entity DTOs, query filter parameters.
* **Outputs:** Relational rows mapped to typed TypeScript domain models.
* **Dependencies:** `better-sqlite3` native library. Zero UI or document engine dependencies.
* **Allowed Callers:** `MOD-02`, `MOD-04`, `MOD-05`, `MOD-07`, `MOD-11`.
* **Forbidden Responsibilities:**
  * Must NOT execute dynamic unparameterized raw SQL from the UI.
  * Must NOT store multi-megabyte binary template files in SQLite BLOBs (templates reside in Vault).
* **Security Restrictions:** Renderer process has zero direct access to SQL; all queries execute synchronously within the trusted Node.js main process.
* **Testing Requirements:** In-memory SQLite tests for migrations, transaction rollbacks, and concurrent WAL reads.

---

### 3.10 MOD-10: File Management & Vault Module

* **Purpose:** Enforces the filesystem trust boundary, manages the Template Vault, creates ephemeral scratch working copies, validates paths, and coordinates atomic report export (`REQ-005`, `REQ-006`, `NFR-REL-02`).
* **Responsibilities:**
  1. Manage `%LOCALAPPDATA%\OpsReportStudio\Templates\` with strict OS read-only sharing flags.
  2. Manage `%LOCALAPPDATA%\OpsReportStudio\Scratch\` for ephemeral worker copies.
  3. Clone master templates to scratch copies and verify target separation (`ScratchPath != MasterPath`).
  4. Provide collision-safe export naming and atomic movement to user-selected export folders.
  5. Clean up temporary scratch files on generation completion, failure, or application startup.
* **Conceptual Interface Contract:**
```typescript
export interface IFileManagementVault {
  importToVault(sourcePath: string, templateId: string): Promise<string>;
  prepareScratchCopy(templateId: string, jobId: string): Promise<string>;
  validateScratchIntegrity(scratchPath: string): Promise<boolean>;
  finalizeReportToDestination(
    scratchPath: string, 
    targetDirectory: string, 
    filenameBase: string,
    format: TemplateFormat,
    collisionPolicy: 'RENAME_SAFE' | 'OVERWRITE_CONFIRMED'
  ): Promise<string>;
  cleanupScratchFile(jobId: string): Promise<void>;
  sweepOrphanedScratchFiles(): Promise<number>;
}
```
* **Inputs:** Filesystem paths, stream handles, template/job IDs.
* **Outputs:** Verified filesystem paths, cleanup metrics.
* **Dependencies:** Node.js native `fs`, `path`, `crypto` modules.
* **Allowed Callers:** `MOD-02` (Orchestrator), `MOD-05` (Template Registry), `MOD-06` (Ingestion).
* **Forbidden Responsibilities:**
  * Must NOT open master template files with write flags (`w`, `r+`, `w+`).
  * Must NOT overwrite master templates under any condition.
  * Must NOT delete files outside of the managed `%LOCALAPPDATA%\Scratch` directory.
* **Security Restrictions:** Path canonicalization prevents directory traversal and writing to system roots (`C:\Windows`).
* **Testing Requirements:** Fault injection tests simulating disk full, read-only permissions, and path traversal attempts.

---

### 3.11 MOD-11: Settings & Theming Module

* **Purpose:** Manages user configuration preferences, appearance themes, window bounds, and default export directory paths (`REQ-011`).
* **Responsibilities:**
  1. Store and retrieve theme preference (`'light'` vs `'dark'`).
  2. Store last-used report export folder path.
  3. Store user interface accessibility preferences (e.g., high-contrast mode, compact table view).
  4. Provide safe fallback defaults for all settings.
* **Conceptual Interface Contract:**
```typescript
export interface ISettingsDomain {
  getSettings(): Promise<ApplicationSettingsDTO>;
  updateSetting<K extends keyof ApplicationSettingsDTO>(
    key: K, 
    value: ApplicationSettingsDTO[K]
  ): Promise<void>;
}

export interface ApplicationSettingsDTO {
  theme: 'light' | 'dark';
  defaultExportDirectory?: string;
  collisionPolicy: 'RENAME_SAFE' | 'PROMPT_USER';
  compactTableView: boolean;
}
```
* **Inputs:** Setting key-value updates.
* **Outputs:** `ApplicationSettingsDTO`.
* **Dependencies:** `MOD-09` (Persistence).
* **Allowed Callers:** `MOD-02` (Orchestrator).
* **Forbidden Responsibilities:**
  * Must NOT store sensitive operator credentials or report data.
  * Must NOT mix UI theme styling logic with document generation logic.
* **Security Restrictions:** Settings schema restricts allowed keys and values; prevents arbitrary JSON injection.
* **Testing Requirements:** Unit tests validating preference updates and default value resolution.

---

### 3.12 MOD-12: Logging & Diagnostics Module

* **Purpose:** Centralized operational logging, error tracking, and performance metric collection with strict privacy filtering (`NFR-SEC-01`, `DEC-019`).
* **Responsibilities:**
  1. Record operational lifecycle events (app startup, template import, generation duration, errors).
  2. Correlate operations using unique `jobId` and `sessionId` tokens.
  3. Automatically sanitize logs to strip confidential incident narratives, witness names, and badge numbers.
  4. Manage log rotation (10 MB per file, max 3 rotated files) in `%LOCALAPPDATA%\OpsReportStudio\Logs\`.
* **Conceptual Interface Contract:**
```typescript
export interface ILoggingDiagnostics {
  info(event: string, context?: Record<string, unknown>): void;
  warn(event: string, context?: Record<string, unknown>): void;
  error(event: string, error: ErrorContract | Error, context?: Record<string, unknown>): void;
  audit(action: string, metadata: Record<string, unknown>): void;
}
```
* **Inputs:** Event names, error objects, metadata dictionaries.
* **Outputs:** Formatted, sanitized log file entries.
* **Dependencies:** Native Node.js `fs`, `path`. Zero UI dependencies.
* **Allowed Callers:** All Main Process modules.
* **Forbidden Responsibilities:**
  * Must NOT log `FLD-INC-NARRATIVE`, `FLD-INC-WITNESS`, `FLD-COM-INSPECTOR`, or `FLD-COM-BADGE`.
  * Must NOT transmit log entries to remote cloud endpoints or external telemetry servers.
* **Security Restrictions:** Automatic regex-based and key-based redaction filters run on all logged context dictionaries.
* **Testing Requirements:** Automated test asserting that log entries containing mock incident narratives have those fields replaced with `[REDACTED]`.

---

### 3.13 MOD-13: Platform & Native Adapter Module

* **Purpose:** Encapsulates Electron and Windows OS native integrations, including native file dialogs, external file opening, and shell folder reveals (`NFR-COMP-01`).
* **Responsibilities:**
  1. Open native Windows Open File dialog for importing `.xlsx` and `.docx` templates.
  2. Open native Windows Directory Picker for selecting report export destinations.
  3. Reveal completed report files in Windows File Explorer via `shell.showItemInFolder`.
  4. Open completed reports in default OS document viewers via `shell.openPath`.
* **Conceptual Interface Contract:**
```typescript
export interface IPlatformNativeAdapter {
  showOpenTemplateDialog(): Promise<string | null>;
  showSelectFolderDialog(defaultPath?: string): Promise<string | null>;
  revealFileInExplorer(filePath: string): Promise<void>;
  openDocumentWithDefaultApp(filePath: string): Promise<void>;
}
```
* **Inputs:** Dialog configuration options, target file paths.
* **Outputs:** Selected file paths, OS action results.
* **Dependencies:** Electron `dialog`, `shell` native APIs.
* **Allowed Callers:** `MOD-02` (Orchestrator).
* **Forbidden Responsibilities:**
  * Must NOT execute arbitrary shell commands or batch scripts.
  * Must NOT open arbitrary URLs or web protocols.
* **Security Restrictions:** `shell.openPath` is strictly restricted to generated `.xlsx` and `.docx` files verified by `MOD-10`.
* **Testing Requirements:** Mock tests verifying dialog parameter configuration and path validation.

---

## 4. Contract Governance & Change Rules

1. **Semantic Versioning of Contracts:** Any alteration to interface contracts defined in this specification requires an architecture review and an update to the Requirements Traceability Matrix.
2. **Type Safety Enforcement:** All IPC handlers in `preload.ts` must implement these exact TypeScript signatures using static compile-time type checking.
3. **Zero Production Code Commitment:** These interfaces are specification models for Steps 8–27.
