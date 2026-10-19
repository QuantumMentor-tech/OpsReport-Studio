# OpsReport Studio — Technology Evaluation & Decision Matrix

**Document Identifier:** EVAL-TECH-001  
**Project ID:** stationops-reporter  
**Approved Product Name:** OpsReport Studio  
**Lifecycle Step:** Step 5 of 45 (Final Technology Stack Evaluation & Architecture Selection)  
**Status:** Authoritative Technology Evaluation  
**Research & Evaluation Date:** 2026-10-19  

---

## 1. Executive Summary & Evaluation Charter

This document provides a rigorous, evidence-based architectural comparison of candidate technologies for **OpsReport Studio**. The application's core mission is to empower control room operators to generate flawless, standardized operational reports using reusable Microsoft Excel (`.xlsx`) and Word (`.docx`) master templates, backed by an authoritative station ordering invariant (`REQ-008`), form-based entry (`REQ-007`), master template immutability (`REQ-006`), and dark/light theming (`REQ-011`).

The evaluation assesses:
1. **Desktop Runtimes:** Electron vs. Tauri v2 vs. Windows-native .NET (WPF/WinUI) vs. Python (PySide6).
2. **Document Processing Engines:** Headless Open XML manipulation without Microsoft Office installed (`NFR-COMP-02`).
3. **Local Persistence:** Embedded SQLite vs. flat JSON configuration files.
4. **UI & Styling:** React + TypeScript + Vanilla CSS / CSS Modules with design tokens.
5. **Security & Licensing:** Defense-in-depth isolation, Open XML decompression safety, and open-source license obligations.

---

## 2. Evaluation Criteria & Weighting Methodology

Candidate technology stacks are evaluated across 14 weighted criteria reflecting the verified product priorities established in Steps 1 through 4:

| Criterion ID | Evaluation Domain | Weight (%) | Operational Rationale |
| :--- | :--- | :--- | :--- |
| **CRIT-01** | **Excel Template Fidelity & Preservation** | **15%** | Preserving complex formulas (`SUM`, `COUNTIF`), styles, merged cells, and print areas during `.xlsx` generation is non-negotiable (`REQ-002`, `NFR-REL-01`). |
| **CRIT-02** | **Word Split-Run Lexing & Templating** | **15%** | The engine must reliably replace tokens across fragmented XML text runs (`<w:r>`) without collapsing table geometry or letterheads (`REQ-003`). |
| **CRIT-03** | **Zero MS Office Runtime Dependency** | **10%** | Must operate 100% standalone and headless without Microsoft Office or COM automation installed on the host (`NFR-COMP-02`). |
| **CRIT-04** | **Master Template Immutability & Safety** | **10%** | Copy-first isolation pipeline, zero-risk write sandboxing, and atomic export rollback (`REQ-005`, `REQ-006`). |
| **CRIT-05** | **Offline Capability & Security Sandbox** | **10%** | 100% local execution, context isolation, zero external cloud dependencies, and archive decompression defenses (`NFR-SEC-01`). |
| **CRIT-06** | **UI/UX Ergonomics & Dark/Light Theme** | **10%** | Rapid keyboard entry, accessible contrast, smooth transitions, and reliable theme switching (`REQ-007`, `REQ-011`). |
| **CRIT-07** | **Single-Runtime Architectural Cohesion** | **10%** | Minimizing multi-language inter-process serialization, sidecar complexity, and dual-toolchain build maintenance. |
| **CRIT-08** | **Development Velocity & Maintenance** | **5%** | Mature developer tooling, ecosystem stability, type safety, and maintainable module boundaries. |
| **CRIT-09** | **Testing Infrastructure & Benchmarkability**| **5%** | Automated unit, integration, and E2E testing capabilities for the Step 7 proof of concept. |
| **CRIT-10** | **Memory & Resource Footprint** | **5%** | Predictable memory consumption on standard control room workstations (16–32 GB RAM). |
| **CRIT-11** | **Packaging, Distribution & Auto-Updates** | **5%** | Clean Windows installer generation (NSIS/MSI) and reproducible offline builds. |
| **TOTAL** | | **100%** | |

*Scoring Scale: 1 (Unacceptable / High Risk) to 5 (Exemplary / Optimal).*

---

## 3. Evaluation of Candidate Desktop Architectures

### 3.1 Option A: Tauri v2 with React, TypeScript, and Rust
* **Architecture Model:** WebView2 frontend rendering React/TypeScript; Rust core managing OS windows, filesystem, and native plugins.
* **Document Engine Analysis:**
  * *Pure Rust Path:* Relies on `umya-spreadsheet` / `calamine` for Excel and `docx-rs` for Word. However, `docx-rs` is a document *builder*, not a template engine capable of lexing split-run placeholders (`{{tokens}}`) across XML text nodes. Building a custom Word Open XML run-lexer in Rust represents extreme complexity and delivery risk.
  * *Node.js Sidecar Path:* Bundling a Node.js binary as a Tauri sidecar to execute mature libraries (`exceljs`, `docxtemplater`) introduces the "worst of both worlds": dual build toolchains (Cargo + npm), a 50 MB Node.js runtime payload, inter-process JSON serialization for multi-megabyte workbooks, and sidecar lifecycle management.
* **Strengths:** Tiny binary footprint (~15 MB without sidecar), low idle RAM (~40 MB), strong Rust memory safety.
* **Weaknesses:** Immature Rust Open XML document-templating ecosystem; sidecar architecture negates size/memory advantages while dramatically increasing IPC failure points.

### 3.2 Option B: Electron with React, TypeScript, and Node.js (Recommended Primary)
* **Architecture Model:** Chromium/Node.js desktop framework. Renderer process runs React UI with Context Isolation and Sandboxing enabled; Node.js main/utility process manages filesystem, SQLite, and document engines directly.
* **Document Engine Analysis:**
  * Native execution of **`exceljs`** (mature Open XML workbook engine with complete support for formula preservation, cell formatting, merged cells, drawings/logos, and print layouts).
  * Native execution of **`docxtemplater` + `pizzip`** (battle-tested for over a decade specifically solving the Open XML split-run problem, repeating table loops, and condition blocks).
* **Strengths:** 
  * **Unified Language & Ecosystem:** TypeScript across UI, IPC, database, and document generation.
  * **Document Processing Maturity:** Highest fidelity and lowest technical risk for complex Excel and Word master template preservation.
  * **Security Compliance:** Modern Electron (v30+) enforces Context Isolation, Process Sandboxing, and strict Content Security Policies (CSP) by default.
  * **Workstation Compatibility:** Seamless offline operation on Windows 10/11.
* **Weaknesses:** Larger installer size (~90–110 MB) and higher idle RAM consumption (~120–160 MB). However, on 16–32 GB control room workstations, this memory overhead represents less than 1% of system resources.

### 3.3 Option C: Windows-Native .NET (WPF / WinUI 3 with C#)
* **Architecture Model:** Compiled C# application using .NET 8/9 desktop runtimes and Microsoft Open XML SDK.
* **Strengths:** Native Windows controls, lightweight memory usage, official Microsoft Open XML SDK.
* **Weaknesses:** 
  * Open XML SDK operates at a raw, low-level DOM abstraction; populating templates requires substantial custom XML parsing and run-consolidation code.
  * Windows-exclusive (eliminates any future cross-platform flexibility).
  * Complex XAML/WPF styling system compared to modern CSS-based dark/light theme engines.

### 3.4 Option D: Python Desktop (PySide6 / PyQt with Python)
* **Architecture Model:** PySide6 (Qt) GUI with Python backend using `openpyxl` and `python-docx` / `docxtemplater`.
* **Strengths:** Strong scripting capabilities, mature `openpyxl` library.
* **Weaknesses:** 
  * Distribution via PyInstaller / Briefcase produces large, slow-starting binaries (~120 MB) that frequently trigger false-positive alerts on enterprise corporate antivirus (EDR) software.
  * Qt styling and theming require complex QSS stylesheets.

---

## 4. Weighted Technology Comparison Matrix

| Evaluation Domain (Weight) | Option A: Tauri v2 (Pure Rust / Sidecar) | Option B: Electron (TypeScript / Node.js) | Option C: .NET 8 (WPF / Open XML SDK) | Option D: Python (PySide6 / OpenPyXL) |
| :--- | :---: | :---: | :---: | :---: |
| **CRIT-01: Excel Preservation (15%)** | 3.0 / 5 (Umya has formula quirks) | **4.8 / 5** (`exceljs` mature fidelity) | 4.2 / 5 (Open XML SDK low-level) | 4.4 / 5 (`openpyxl` strong) |
| **CRIT-02: Word Split-Run Templating (15%)** | 2.0 / 5 (No mature Rust templater) | **4.9 / 5** (`docxtemplater` native lexer)| 3.5 / 5 (Requires custom lexer) | 4.2 / 5 (`docxtpl` via Jinja2) |
| **CRIT-03: Zero Office Dependency (10%)** | 5.0 / 5 (Headless) | **5.0 / 5** (Headless) | 5.0 / 5 (Headless) | 5.0 / 5 (Headless) |
| **CRIT-04: Master Immutability (10%)** | 4.5 / 5 (Safe Rust pipeline) | **4.8 / 5** (Copy-first stream sandboxing)| 4.5 / 5 (C# stream isolation) | 4.0 / 5 (Python file handles) |
| **CRIT-05: Security & Offline Sandbox (10%)**| 4.8 / 5 (Tight permissions) | **4.5 / 5** (Context isolation + CSP) | 4.2 / 5 (Windows ACLs) | 3.5 / 5 (Script execution risks) |
| **CRIT-06: UI/UX & Dark/Light Theme (10%)** | 4.8 / 5 (React + CSS tokens) | **4.8 / 5** (React + CSS tokens) | 3.2 / 5 (Complex XAML styling) | 3.5 / 5 (QSS styling limits) |
| **CRIT-07: Single-Runtime Cohesion (10%)** | 2.5 / 5 (Dual toolchain with sidecar) | **4.9 / 5** (Unified TypeScript) | 4.5 / 5 (Unified C# / .NET) | 4.0 / 5 (Unified Python) |
| **CRIT-08: Dev Velocity & Maintenance (5%)**| 3.0 / 5 (Complex Rust IPC debugging) | **4.8 / 5** (Fast iteration, npm ecosystem)| 3.5 / 5 (Slower UI turnaround) | 4.0 / 5 (Rapid scripting) |
| **CRIT-09: Testing & Benchmarking (5%)** | 3.5 / 5 (Mixed cargo/playwright) | **4.8 / 5** (Vitest + Playwright E2E) | 3.8 / 5 (MSTest / NUnit) | 3.5 / 5 (pytest / UI automation) |
| **CRIT-10: Resource Footprint (5%)** | **4.8 / 5** (~40 MB RAM, ~15 MB installer)| 3.2 / 5 (~140 MB RAM, ~95 MB installer) | 4.0 / 5 (~70 MB RAM, ~60 MB) | 3.0 / 5 (~150 MB RAM, slow boot) |
| **CRIT-11: Packaging & Distribution (5%)** | 4.2 / 5 (Tauri bundler MSI/NSIS) | **4.6 / 5** (Electron-Builder / Forge) | 4.5 / 5 (MSIX / Single-file exe) | 2.5 / 5 (PyInstaller AV flags) |
| **WEIGHTED COMPOSITE SCORE** | **3.56 / 5.00** | **4.67 / 5.00** | **3.94 / 5.00** | **3.93 / 5.00** |

---

## 5. Technology Selection Rationale

### 5.1 Why Option B (Electron + React + TypeScript + Node.js) Wins:
1. **Core Problem Alignment:** The primary technical risk of OpsReport Studio is **document corruption** (stripped formulas, ruined cell borders, unreplaced Word tokens, broken tables). Electron provides direct, unhindered access to the most mature, field-proven Open XML manipulation engines in existence (`exceljs` and `docxtemplater`).
2. **Elimination of Sidecar Complexity:** In Tauri, running mature Node document engines requires packaging a Node.js binary sidecar, establishing a separate IPC daemon, and serializing large files across process boundaries. Electron runs Node.js natively in background worker threads, eliminating architectural fragmentation.
3. **Hardware Context:** Control room workstations operate with modern enterprise hardware (Intel Core i5/i7/Xeon, 16–32 GB RAM, SSDs). Electron's ~120 MB idle memory footprint is completely negligible and well within corporate operating tolerances.

---

## 6. Document-Processing Engine Strategy

### 6.1 Excel Processing Engine: `exceljs`
* **Package Identity:** `exceljs` (v4.4.x)
* **License:** MIT License (Permissive, 100% free for commercial and enterprise distribution).
* **Fidelity Capabilities:**
  * **Formula Preservation:** Preserves formula nodes (`=SUM()`, `=COUNTIF()`) while allowing programmatic cell updates.
  * **Cell Styling:** Fully preserves fills, fonts, borders, alignments, and number formats.
  * **Structure:** Preserves merged cell ranges, hidden rows/columns, and custom column widths.
  * **Drawings:** Preserves embedded PNG images and logos in `xl/drawings/`.
  * **Print Setup:** Preserves print areas, paper size, and orientation.
* **Verification Gate for Step 7:** Validate formula recalculation flags (`fullCalcOnLoad="1"`) against sample workbooks.

### 6.2 Word Processing Engine: `docxtemplater` + `pizzip`
* **Package Identity:** `docxtemplater` (v3.47.x) + `pizzip` (v3.1.x)
* **License:** MIT License for core engine (Permissive, free for commercial distribution).
* **Fidelity Capabilities:**
  * **Split-Run Lexer:** Compiles and lexes Open XML text runs, flawlessly replacing `{placeholders}` even when split across multiple `<w:r>` tags by Microsoft Word's grammar checker.
  * **Repeating Tables:** Supports loop tags (`{#stations}...{/stations}`) to dynamically generate ordered station audit tables without disturbing border styling.
  * **Multi-Paragraph Narrative:** Correctly formats newlines into Open XML paragraph elements.
* **Licensing Scope Verification:** The MIT core handles all required text replacements, loops, tables, and conditionals. Paid modules (e.g., Image Module) are **NOT required** for core text/tabular reporting. If dynamic incident photo embedding is confirmed in future phases, a custom open-source image part injector will be evaluated.

---

## 7. Local Storage & Persistence Strategy

### 7.1 Architecture: Hybrid SQLite + Filesystem Vault
* **Engine:** `better-sqlite3` (v11.x) / `sqlite3`
* **License:** MIT License
* **Persistence Allocation:**
  * **Filesystem Template Vault (`%LOCALAPPDATA%\OpsReportStudio\Templates\`):** Master `.xlsx` and `.docx` templates stored as raw files with OS read-only attributes.
  * **Filesystem Export Directory (User-Configured):** Generated output reports saved directly to local or network targets.
  * **Embedded SQLite Database (`%LOCALAPPDATA%\OpsReportStudio\Data\opsreport.db`):** 
    * Authoritative Station Sequences (`station_id`, `name`, `order`, `status`).
    * Template Metadata & Schema Mapping Profiles.
    * Unfinished Report Session Drafts (JSON payloads).
    * Generation History & Cryptographic Audit Trail.
* **Write-Ahead Logging (WAL):** SQLite configured in WAL mode (`PRAGMA journal_mode = WAL;`) to guarantee high concurrency and crash resilience.

---

## 8. Frontend UI & Styling System

* **Framework:** React 18.3+ with TypeScript 5.5+
* **Build Tool:** Vite 5.x (instant HMR, optimized ESM bundling)
* **Styling Architecture:** Modern Vanilla CSS + CSS Modules with Design Tokens
  * Theme switching via CSS Variables (`--surface-bg`, `--brand-blue`, `--excel-green`, `--word-blue`, `--text-primary`).
  * Strict avoidance of heavy, uncurated CSS frameworks (TailwindCSS avoided per IDE guidelines unless requested).
  * Ergonomic form system supporting keyboard navigation (`Tab`, `Shift+Tab`, `Enter`).
* **Grid Component:** Lightweight custom table components with virtualized scrolling (or `@tanstack/react-table` for large multi-station tables).

---

## 9. Decision Gates & Step 7 Handoff

The architecture recommendation is formally adopted with the following explicit verification gates assigned to **Step 7 (Document Processing Library Proof of Concept)**:
1. **ExcelJS Recalculation Assertion (`GATE-01`):** Verify that injecting defect numbers into `exceljs` correctly triggers formula recalculation when the output file is opened in Excel.
2. **Docxtemplater Split-Run Lexing Assertion (`GATE-02`):** Verify that fragmented Word placeholders in complex incident templates are replaced with 100% fidelity.
3. **Master Template Immutability Assertion (`GATE-03`):** Verify that 50 consecutive generation runs in the Node.js background thread produce zero byte alterations to master template fixtures.
