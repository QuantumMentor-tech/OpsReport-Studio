# OpsReport Studio — Architecture Decision Record (ADR)

**ADR Identifier:** ADR-OPSREPORT-001  
**Project ID:** stationops-reporter  
**Approved Product Name:** OpsReport Studio  
**Lifecycle Step:** Step 5 of 45 (Final Technology Stack Evaluation & Architecture Selection)  
**Status:** **APPROVED ARCHITECTURAL BASELINE** (Subject to Step 7 Document Proof-of-Concept Gates)  
**Decision Date:** 2026-10-19  

---

## 1. Title & Context

**ADR-001: Adoption of Electron, React, TypeScript, and Native Node.js Open XML Processing Engines**

### Problem Statement:
Control room representatives repeatedly create complex security incident and facility inspection reports in Microsoft Excel and Word. Reconstructing formatting, columns, categories, and station sequences manually consumes time and causes operational errors. 

OpsReport Studio must automate report generation from reusable Excel (`.xlsx`) and Word (`.docx`) master templates. The software must guarantee:
1. **100% Master Template Immutability (`REQ-006`):** The original template file must never be overwritten or altered.
2. **High-Fidelity Document Preservation (`REQ-002`, `REQ-003`):** Pre-existing formulas, cell styles, merged ranges, print areas, and Word layout letterheads must survive generation intact.
3. **Headless Execution (`NFR-COMP-02`):** The application must process documents without requiring Microsoft Office or COM automation installed on the host machine.
4. **Authoritative Station Ordering (`REQ-008`):** Strict preservation of sequential station rows.
5. **Form-Based Data Entry (`REQ-007`):** Direct entry via structured forms, completely avoiding embedded spreadsheet/word processor interfaces.

---

## 2. Decision Drivers

* **Document Engine Maturity:** Availability of production-grade, headless Open XML engines that reliably preserve formulas and solve the Open XML split-run placeholder challenge.
* **Architectural Cohesion:** Single unified language and runtime across frontend, IPC, database, and document generation, eliminating fragile inter-process sidecars.
* **Offline Security:** Robust sandboxing model, context isolation, zero cloud leakage, and strict local filesystem containment (`NFR-SEC-01`).
* **Ergonomics & Theming:** Modern dark/light theme switching, responsive form layouts, and accessible keyboard navigation (`REQ-011`, `NFR-USE-01`).
* **Licensing Clarity:** 100% permissive open-source licensing (MIT/Apache 2.0) with zero commercial module licensing encumbrances.

---

## 3. Considered Alternatives

1. **Option A: Tauri v2 with React, TypeScript, and Rust**
   * *Rejected Rationale:* The Rust ecosystem currently lacks a mature Word template engine capable of lexing split-run placeholders (`{{tokens}}`) across fragmented XML text nodes. The alternative—bundling a Node.js binary sidecar—negates Tauri's binary size advantage, requires maintaining dual toolchains (Cargo + npm), and introduces high IPC serialization overhead for multi-megabyte workbooks.
2. **Option B: Electron with React, TypeScript, and Node.js**
   * *Selected Rationale:* Detailed below.
3. **Option C: Windows-Native .NET 8 (WPF / WinUI 3 with C#)**
   * *Rejected Rationale:* Microsoft Open XML SDK operates at an excessively low abstraction level, requiring extensive custom parsing for Word run consolidation and Excel formula management; XAML theming is complex compared to modern CSS variable tokens; locks the application into Windows-only with zero portability.
4. **Option D: Python Desktop (PySide6 with OpenPyXL / python-docx)**
   * *Rejected Rationale:* Distributing packaged Python desktop apps via PyInstaller frequently triggers false-positive antivirus warnings on enterprise corporate networks, has slow cold-start times, and requires complex QSS styling for dark/light themes.

---

## 4. Decision: Adopt Option B (Electron + React + TypeScript + Node.js)

OpsReport Studio will be constructed on the **Electron + React + TypeScript** desktop architecture, utilizing native Node.js Open XML document-processing libraries:

* **Desktop Application Framework:** **Electron (v32+ LTS Line)**
* **User Interface Presentation:** **React 18.3+** with **TypeScript 5.5+**
* **Frontend Build Tooling:** **Vite 5.x**
* **Styling Architecture:** **Vanilla CSS & CSS Modules** with semantic CSS design tokens (Dark/Light mode)
* **Excel Processing Engine:** **`exceljs` (v4.4+)** running in a Node.js background worker thread
* **Word Processing Engine:** **`docxtemplater` (v3.47+) + `pizzip`** running in a Node.js background worker thread
* **Local Structured Database:** **`better-sqlite3` (v11+)** in Write-Ahead Logging (WAL) mode
* **Packaging & Distribution:** **Electron-Builder / Electron Forge** generating standard Windows installers (NSIS / MSI)

---

## 5. Architectural Rationale & Trade-Off Analysis

### 5.1 Why This Stack is Superior for OpsReport Studio:
1. **Unrivaled Document Reliability:** `exceljs` and `docxtemplater` are the most mature, battle-tested Open XML libraries in modern software development. `docxtemplater` natively solves the split-run hazard that causes naive string replacement to fail in Microsoft Word. `exceljs` provides complete preservation of cell styling, merged ranges, print areas, and formula definitions.
2. **Elimination of Multi-Runtime Fragility:** By adopting Electron, Node.js is the native runtime. Document generation, SQLite operations, and filesystem access execute in the Node main/utility process without the fragility, complexity, and latency of external sidecar processes.
3. **Performance in Context:** Control room workstations possess modern multi-core processors and 16–32 GB RAM. Electron's idle memory footprint (~120–150 MB) represents < 1% of system resources. Heavy document processing will execute asynchronously in a Node worker thread, ensuring the UI thread maintains 60 FPS responsiveness (`NFR-PERF-01`).

### 5.2 Accepted Trade-Offs:
* **Installer Size:** The bundled Chromium/Node runtime results in a Windows installer of ~90–110 MB (vs. ~15 MB for Tauri). *Accepted because control room workstations operate on high-speed internal networks or direct local installation, where a 100 MB installer is completely standard.*
* **Memory Footprint:** Idle memory is higher than a pure Rust app (~130 MB vs ~40 MB). *Accepted in exchange for bulletproof document preservation fidelity and the elimination of custom XML parser maintenance.*

---

## 6. Security & Sandboxing Model

To eliminate traditional Electron vulnerabilities, the application strictly adheres to current OWASP and Electron security guidelines:
1. **Context Isolation Enabled:** `contextIsolation: true` is strictly enforced on all browser windows.
2. **Process Sandboxing Enabled:** `sandbox: true` is enabled; renderer processes have zero access to Node.js primitives (`fs`, `child_process`, `net`).
3. **Strict Preload Bridge:** Communication between UI and backend occurs exclusively through a strongly-typed, validated `contextBridge` API.
4. **Restrictive Content Security Policy (CSP):** Prohibits inline scripts, `eval()`, and all external network connections (`default-src 'self'`).
5. **Copy-First Sandboxing:** All document generation operates on isolated scratch copies in `%LOCALAPPDATA%\OpsReportStudio\Scratch\`. Master templates are opened with strict read-only sharing flags.

---

## 7. Licensing Compliance Verification

All core runtime dependencies operate under the permissive **MIT License**:
* Electron: MIT
* React & TypeScript: MIT
* ExcelJS: MIT
* Docxtemplater (Core): MIT
* PizZip: MIT
* Better-sqlite3: MIT

No GPL, AGPL, or proprietary commercial licensing fees apply to the core application. Paid modules from docxtemplater.com (e.g., Image Module) are **not required** for core text and tabular operational reporting.

---

## 8. Reversal Conditions & Decision Gates

This architecture decision is subject to verification in **Step 7: Document Processing Engine Proof of Concept & Benchmark**:
* **Reversal Condition 1:** If Step 7 benchmarks reveal that `exceljs` strips critical formulas or damages workbook drawings in actual control room templates, ClosedXML (.NET sidecar) or OpenPyXL will be evaluated as targeted engine fallbacks.
* **Reversal Condition 2:** If the MIT core of `docxtemplater` cannot satisfy complex nested table requirements without commercial paid modules, alternative Open XML template injectors will be benchmarked.
