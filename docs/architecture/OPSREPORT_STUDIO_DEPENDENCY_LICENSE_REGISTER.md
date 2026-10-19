# OpsReport Studio — Dependency & Licensing Register

**Document Identifier:** REG-LIC-001  
**Project ID:** stationops-reporter  
**Approved Product Name:** OpsReport Studio  
**Lifecycle Step:** Step 5 of 45 (Final Technology Stack Evaluation & Architecture Selection)  
**Status:** Authoritative Licensing & Dependency Baseline  
**Last Updated:** 2026-10-19  

---

## 1. Register Scope & Legal Compliance Charter

This register catalogs all primary runtime, document-processing, storage, and build dependencies evaluated for OpsReport Studio. 

### Core Legal Compliance Rules:
1. **Permissive Open-Source Licensing:** All core software components must use permissive open-source licenses (MIT, Apache 2.0, BSD-3-Clause).
2. **Zero Commercial Licensing Encumbrances:** Core application capabilities must execute without requiring proprietary, paid, or subscription-based software licenses.
3. **No Reciprocal "Copyleft" Hazards:** Avoid GPL/AGPL dependencies that would impose source-disclosure obligations on enterprise software distributions.
4. **Notice & Attribution Compliance:** Maintain an automated `THIRD_PARTY_LICENSES.txt` bundle within the application distribution directory containing all required copyright notices.

---

## 2. Primary Runtime Dependencies Register

| Package Name | Evaluated Version | License Identifier | License Source | Intended Operational Role | Direct / Transitive | Commercial / Paid Modules Required? | Redistribution Obligations |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`electron`** | `^32.0.0` (LTS) | **MIT** | [GitHub Repo](https://github.com/electron/electron/blob/main/LICENSE) | Desktop runtime, window management, Node.js main process | Direct | **None** (100% Free) | Include copyright notice in distribution. |
| **`react`** | `^18.3.1` | **MIT** | [GitHub Repo](https://github.com/facebook/react/blob/main/LICENSE) | Component UI presentation framework | Direct | **None** (100% Free) | Include copyright notice. |
| **`react-dom`** | `^18.3.1` | **MIT** | [GitHub Repo](https://github.com/facebook/react/blob/main/LICENSE) | DOM renderer for React | Direct | **None** (100% Free) | Include copyright notice. |
| **`typescript`** | `^5.5.4` | **Apache-2.0** | [GitHub Repo](https://github.com/microsoft/TypeScript/blob/main/LICENSE.txt) | Static typing and language compilation | Dev (Build) | **None** (100% Free) | Apache 2.0 attribution in source. |
| **`vite`** | `^5.4.0` | **MIT** | [GitHub Repo](https://github.com/vitejs/vite/blob/main/LICENSE) | Frontend ESM bundler and HMR dev server | Dev (Build) | **None** (100% Free) | Include copyright notice. |
| **`exceljs`** | `^4.4.0` | **MIT** | [GitHub Repo](https://github.com/exceljs/exceljs/blob/master/LICENSE) | Excel Open XML reading, writing, formula & style preservation | Direct (Worker) | **None** (100% Free) | Include copyright notice. |
| **`docxtemplater`** | `^3.47.0` | **MIT** (Core) | [GitHub Repo](https://github.com/open-xml-templating/docxtemplater/blob/master/LICENSE) | Word Open XML split-run lexer, token replacement, table loops | Direct (Worker) | **NONE FOR CORE** (See Section 3) | Include copyright notice. |
| **`pizzip`** | `^3.1.7` | **MIT** | [GitHub Repo](https://github.com/open-xml-templating/pizzip/blob/master/LICENSE.txt) | In-memory ZIP archive reader/writer for Open XML packages | Direct (Worker) | **None** (100% Free) | Include copyright notice. |
| **`better-sqlite3`**| `^11.1.2` | **MIT** | [GitHub Repo](https://github.com/WiseLibs/better-sqlite3/blob/master/LICENSE) | High-performance synchronous SQLite driver for Node.js | Direct (Main) | **None** (100% Free) | Include copyright notice. |
| **`lucide-react`** | `^0.435.0` | **ISC** | [GitHub Repo](https://github.com/lucide-icons/lucide/blob/main/LICENSE) | Clean, accessible UI icons (Dark/Light themes, status badges) | Direct | **None** (100% Free) | Include copyright notice. |

---

## 3. Deep-Dive Licensing Audit: `docxtemplater`

In strict compliance with Section 8.1 of the Step 5 instructions, `docxtemplater` was subjected to an explicit license-boundary audit:

### 3.1 What is 100% Free & Open-Source (MIT License):
The standard npm package `docxtemplater` published on GitHub and npm is released under the **MIT License**. It natively includes:
* **Token Replacement:** Full support for `{scalar_placeholders}` across fragmented Open XML text runs.
* **Repeating Table Loops:** Full support for `{#rows}...{/rows}` to dynamically populate multi-row inspection tables.
* **Conditional Logic:** Full support for `{#has_incident}...{/has_incident}` blocks.
* **Whitespace & XML Escaping:** Automatic handling of line breaks, paragraphs, and special characters.

### 3.2 What Requires Paid Commercial Modules (docxtemplater.com):
Docxtemplater offers optional paid proprietary add-on modules:
* **Image Module (Commercial):** For embedding dynamic JPEG/PNG photos into Word documents.
* **HTML Converter Module (Commercial):** For converting raw HTML rich-text into Word Open XML runs.
* **Table of Contents Module (Commercial):** For dynamically generating multi-level TOCs.

### 3.3 Architectural Determination for OpsReport Studio:
* **V1 Core Reporting Scope:** Requires text substitution, metadata headers, narrative blocks, and sequential table population. **The free MIT-licensed core completely satisfies all V1 requirements without purchasing commercial licenses.**
* **Photo Evidence Handling:** If attaching photos to incident reports is requested in future phases, the team will utilize an open-source ZIP part injector (manipulating `word/media/` and `word/_rels/document.xml.rels` directly via PizZip) rather than taking on a commercial license dependency.

---

## 4. Build, Packaging & Quality Dependencies Register

| Package Name | Evaluated Version | License Identifier | Operational Role | Redistribution Impact |
| :--- | :--- | :--- | :--- | :--- |
| **`electron-builder`** | `^24.13.3` | **MIT** | Packages native Windows installer (NSIS / MSI) | Build tool only; no runtime footprint. |
| **`vitest`** | `^2.0.5` | **MIT** | Unit & integration test runner | Test environment only. |
| **`playwright`** | `^1.46.0` | **Apache-2.0** | End-to-end desktop UI automation | Test environment only. |
| **`eslint`** | `^9.9.0` | **MIT** | Code quality & linting | Dev tool only. |
| **`prettier`** | `^3.3.3` | **MIT** | Automated code formatting | Dev tool only. |

---

## 5. Security Maintenance & CVE Vulnerability Policy

1. **Automated Audit:** All dependencies will be monitored via `npm audit` and Dependabot alerts during CI/CD builds.
2. **Zero Known High/Critical Vulnerabilities:** Production releases must maintain zero unmitigated High or Critical Common Vulnerabilities and Exposures (CVEs).
3. **Electron Version Cadence:** Track the active Electron LTS release line, applying point-release security updates quarterly.
