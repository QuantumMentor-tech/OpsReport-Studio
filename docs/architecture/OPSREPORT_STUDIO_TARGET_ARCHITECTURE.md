# OpsReport Studio — Target Architecture Specification

**Document Identifier:** ARCH-SPEC-001  
**Project ID:** stationops-reporter  
**Approved Product Name:** OpsReport Studio  
**Lifecycle Step:** Step 5 of 45 (Final Technology Stack Evaluation & Architecture Selection)  
**Status:** Authoritative Architectural Specification  
**Last Updated:** 2026-10-19  

---

## 1. System Overview & Context

OpsReport Studio is an offline-capable, desktop-oriented operational report-generation application. It bridges the gap between field inspections conducted by control room representatives and the formal document compliance requirements of enterprise operations.

The system enforces strict separation of concerns across presentation, domain orchestration, document processing, and local storage, ensuring that:
1. Master templates remain 100% read-only and immutable.
2. Station rows are sequenced strictly according to the authoritative operational order (`REQ-008`).
3. Heavy document compilation executes asynchronously off the main UI thread, preserving 60 FPS UI responsiveness.

---

## 2. Mermaid System Architecture Diagram

```mermaid
flowchart TD
    subgraph Layer_A [Layer A: Presentation Layer (Sandboxed Renderer)]
        UI[React 18.3+ / TypeScript UI]
        ThemeEngine[Theme Switcher (Dark/Light CSS Tokens)]
        FormEngine[Structured Form System (REQ-007)]
        StationSelector[Ordered Station Selector (REQ-008)]
        CatalogView[Report Category Catalog (REQ-001)]
        ToastFeedback[Diagnostic & Feedback Modals (REQ-012)]
    end

    subgraph Security_Boundary [Layer F: Security Boundary (Preload Bridge)]
        Bridge[ContextBridge API: window.opsreport]
        IPCSanitizer[Strict IPC Parameter Validation & Schema Guards]
    end

    subgraph Layer_B [Layer B: Application Core & Domain Services (Node.js Main Process)]
        Orchestrator[Report Generation Orchestrator]
        SessionManager[Session & Draft State Manager]
        ValidationPipeline[Cross-Field & Station Validator]
        StationDomain[Station Sequence Domain Engine]
    end

    subgraph Layer_C [Layer C: Document Processing Engine (Node.js Background Worker)]
        DocWorker[Document Processing Worker Thread]
        ExcelEngine[ExcelJS Open XML Engine (REQ-002)]
        WordEngine[Docxtemplater + PizZip Engine (REQ-003)]
        FormatPreserver[Formula & Style Preservation Manager]
    end

    subgraph Layer_D [Layer D: Local Storage Services (SQLite)]
        SQLiteDB[(better-sqlite3: opsreport.db)]
        StationStore[Station Sequence Table]
        TemplateStore[Template Registry & Mapping Schemas]
        DraftStore[Unfinished Report Session Drafts]
        HistoryStore[Report Generation Audit Log]
    end

    subgraph Layer_E [Layer E: File Management & Vault Services]
        VaultManager[Master Template Vault (%LOCALAPPDATA%/Templates)]
        ScratchSandbox[Ephemeral Scratch Directory (%LOCALAPPDATA%/Scratch)]
        AtomicExporter[Atomic Destination Writer & Collision Handler]
    end

    subgraph Target_Filesystem [Host Filesystem Destination]
        MasterTemplateFile[(Master Template .xlsx / .docx - READ ONLY)]
        OutputFile[(Generated Report Copy: User Target Directory)]
    end

    %% Flow Connections
    UI -->|User Interactions| Bridge
    Bridge -->|Secure IPC| IPCSanitizer
    IPCSanitizer --> Orchestrator
    
    Orchestrator --> ValidationPipeline
    Orchestrator --> SessionManager
    Orchestrator --> StationDomain
    
    StationDomain <--> StationStore
    SessionManager <--> DraftStore
    Orchestrator <--> TemplateStore
    Orchestrator --> HistoryStore
    
    Orchestrator -->|Dispatch Generation Job| DocWorker
    DocWorker --> ExcelEngine
    DocWorker --> WordEngine
    
    VaultManager -->|Clone Working Copy (Read-Only Open)| MasterTemplateFile
    VaultManager -->|Stage Copy| ScratchSandbox
    DocWorker -->|Populate Form Data| ScratchSandbox
    
    ScratchSandbox -->|Verify & Move| AtomicExporter
    AtomicExporter -->|Save Clean Output Copy| OutputFile
    AtomicExporter -.->|NEVER Writes to Master| MasterTemplateFile
```

---

## 3. Layered Architectural Decomposition

### 3.1 Layer A: Presentation Layer (Sandboxed Renderer)
* **Runtime:** Chromium (Electron Renderer Process)
* **Technologies:** React 18.3+, TypeScript 5.5+, Vite 5.x, Vanilla CSS Modules
* **Responsibilities:**
  * Render the operational report catalog organized by category (`RPT-INCIDENT`, `RPT-STATION-LIGHT`, etc.).
  * Provide responsive, accessible data-entry forms avoiding raw spreadsheet interfaces (`REQ-007`).
  * Enforce the configured station order in dropdowns and audit rows (`REQ-008`).
  * Seamlessly toggle between dark and light appearance modes (`REQ-011`).
  * Display human-readable validation diagnostics and generation progress (`REQ-012`).
* **Security Constraints:** Sandboxed with zero Node.js integration; prohibited from accessing the filesystem or executing shell commands directly.

### 3.2 Layer F: Security Boundary (Preload Bridge)
* **Runtime:** Electron Preload Script (`preload.ts`)
* **Responsibilities:**
  * Expose an immutable, strongly-typed `window.opsreport` API via `contextBridge.exposeInMainWorld()`.
  * Validate all IPC arguments against strict JSON schema guards before forwarding to the main process.
  * Intercept and sanitize error objects to prevent leaking internal stack traces or sensitive file paths to the renderer.

### 3.3 Layer B: Application Core & Domain Services
* **Runtime:** Electron Main Process (Node.js)
* **Responsibilities:**
  * **Report Orchestration:** Coordinates the lifecycle of report creation from template selection to final export.
  * **Station Domain Engine:** Enforces contiguous ordinal station sequencing `1..N` and handles station sequence pinning during active sessions (`POL-SESS-01`).
  * **Validation Pipeline:** Executes field-level and cross-field rules (`VR-FLD-xxx`, `VR-XFL-xxx`) prior to document compilation.
  * **Session & Draft Manager:** Persists partially completed reports in SQLite, allowing operators to safely resume audits after emergency shift interruptions.

### 3.4 Layer C: Document Processing Engine
* **Runtime:** Dedicated Node.js Background Worker (`worker_threads` or Electron UtilityProcess)
* **Responsibilities:**
  * **Excel Processing Engine (`exceljs`):** Opens working copies of master workbooks, populates cell coordinates and sequential station rows, preserves pre-existing formulas (`=SUM()`), and sets calculation flags (`fullCalcOnLoad="1"`).
  * **Word Processing Engine (`docxtemplater` + `pizzip`):** Lexes Open XML text runs, consolidates split runs across `<w:r>` tags, injects multi-paragraph narrative blocks, and loops repeating table rows without distorting letterhead graphics.
  * **Asynchronous Execution:** Heavy compression and Open XML ZIP serialization execute entirely off the main thread to ensure zero UI freezing (`NFR-PERF-01`).

### 3.5 Layer D: Local Storage Services
* **Runtime:** Node.js Main Process (`better-sqlite3`)
* **Storage Location:** `%LOCALAPPDATA%\OpsReportStudio\Data\opsreport.db`
* **Responsibilities:**
  * Maintain authoritative station sequences, template registries, mapping schemas, and draft sessions.
  * Maintain an immutable audit log of generated reports (Date, Operator, Report Type, File Path, SHA-256 Checksum).
  * Operate in Write-Ahead Logging (`WAL`) mode to prevent database locks and ensure zero-loss transaction recovery.

### 3.6 Layer E: File Management & Vault Services
* **Responsibilities:**
  * **Internal Template Vault:** Stores imported master templates in `%LOCALAPPDATA%\OpsReportStudio\Templates\` with OS read-only permissions.
  * **Ephemeral Scratch Sandbox:** Stages working copies in `%LOCALAPPDATA%\OpsReportStudio\Scratch\`.
  * **Atomic Exporter:** Moves completed documents to destination folders and handles filename collisions (prompting for auto-rename or overwrite). Master templates are strictly protected against accidental overwrite (`REQ-006`).

---

## 4. Inter-Process Communication (IPC) Data Flow

```
[Renderer Process: React Form]
        │
        │ 1. invoke('reports:generate', reportDataPayload)
        ▼
[Preload: contextBridge] ──> Validates schema & data types
        │
        │ 2. ipcRenderer.invoke('reports:generate', sanitizedPayload)
        ▼
[Main Process: Orchestrator] ──> Validates station sequence & field rules
        │
        │ 3. worker.postMessage({ type: 'COMPILE', templatePath, payload })
        ▼
[Worker Thread: ExcelJS / Docxtemplater]
        │
        │ 4. Clones master to .tmp scratch file
        │ 5. Injects data & recalculation flags
        │ 6. Writes verified output copy
        ▼
[Main Process: Exporter] ──> Moves .tmp file to destination path
        │
        │ 7. Return success result with output file path
        ▼
[Renderer Process: Toast] ──> Displays: "Report Generated Successfully [Open File]"
```

---

## 5. Architectural Constraints & Non-Functional Compliance

* **Memory Footprint:** Application targeted to idle under 160 MB RAM and peak under 300 MB RAM during 100-station multi-row Excel compilation (`NFR-PERF-03`).
* **Generation Latency:** Standard station inspection report generation targeted to complete in under 2.5 seconds on standard workstations (`NFR-PERF-02`).
* **Offline Security:** 100% offline-capable; zero telemetry, zero analytics tracking, and zero outbound network traffic (`NFR-SEC-01`).
