# OpsReport Studio — Template Evidence & Discovery Register

**Document Identifier:** REG-OPSREPORT-001  
**Project ID:** stationops-reporter  
**Approved Product Name:** OpsReport Studio  
**Lifecycle Step:** Step 2 of 45 (Report Categories, Fields & Data Requirements Analysis)  
**Status:** Active Discovery Register  
**Last Updated:** 2026-10-19  

---

## 1. Register Purpose & Scope

This document tracks all physical report template files (`.xlsx` workbooks and `.docx` documents) submitted for OpsReport Studio. It formally records which templates have been supplied, which have undergone read-only structural inspection, observed cell coordinates and bookmarks, and the outstanding template artifacts required to complete subsequent discovery and architectural phases.

---

## 2. Template Artifact Inventory Status

| Report Category ID | Category Display Name | Target Document Format | Physical File Supplied? | Inspected File Path | Current Status | Blocker Level for Next Steps |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **RPT-INCIDENT** | Security Incident Report | Microsoft Word (`.docx`) | **NO (Missing)** | None | Awaiting User Template | Low for Step 3; High for Step 4 |
| **RPT-STATION-LIGHT** | Station Light Report | Microsoft Excel (`.xlsx`) | **NO (Missing)** | None | Awaiting User Template | Low for Step 3; High for Step 4 |
| **RPT-FAN** | Fan / Ventilation Report | Microsoft Excel (`.xlsx`) | **NO (Missing)** | None | Awaiting User Template | Low for Step 3; High for Step 4 |
| **RPT-POLE-LIGHT** | Pole Light Report | Microsoft Excel (`.xlsx`) | **NO (Missing)** | None | Awaiting User Template | Low for Step 3; High for Step 4 |
| **RPT-FIRE-EXTINGUISHER**| Fire Extinguisher Report | Microsoft Excel (`.xlsx`) | **NO (Missing)** | None | Awaiting User Template | Low for Step 3; High for Step 4 |
| **RPT-PILLAR** | Pillar Report | Microsoft Excel (`.xlsx`) | **NO (Missing)** | None | Awaiting User Template | Low for Step 3; High for Step 4 |
| **RPT-FENCE** | Fence Report | Microsoft Excel (`.xlsx`) / Word (`.docx`) | **NO (Missing)** | None | Awaiting User Template | Low for Step 3; High for Step 4 |

---

## 3. Physical Inspection Audit Findings

* **Workspace Search Scope:** Recursive audit of `e:\Projects\All working projects\App projects working\OpsReport Studio (working)`.
* **Inspection Result:** Zero `.xlsx`, `.xls`, `.docx`, or `.doc` template files were located in the workspace.
* **Integrity Guarantee:** In compliance with Section 3.4 of the Step 2 instructions, no fictional template structures, phantom cell coordinates (e.g., `Sheet1!C12`), or fabricated Word bookmarks were claimed as observed facts. All field schemas defined in the Report Catalogue and Field Dictionary remain provisional business requirements until real template files are provided.

---

## 4. Known Template Constraints (Architectural Baseline)

Even in the absence of customer template files, the following technical constraints are established as baseline requirements:
1. **Open XML Fidelity (REQ-002, REQ-003):** 
   * Excel templates will be processed using standard Open XML (`.xlsx`) formats. The processing engine must preserve pre-existing cell formatting, fonts, column widths, print areas, and active formulas (`SUM`, `AVERAGE`, `COUNTIF`).
   * Word templates will be processed using standard Open XML (`.docx`) formats. Paragraph styles, headers, footers, tables, and branding imagery must remain undisturbed.
2. **Strict Master Immutability (REQ-006):** Master templates will reside in an isolated application storage directory. The application must never write directly into a master template file.
3. **Macro Quarantine (DEC-005):** Macro-enabled formats (`.xlsm`, `.docm`) will be restricted from standard processing unless the customer explicitly provides templates that depend on macros for operational calculations.

---

## 5. Information & Evidence Checklist for Subsequent Steps

The following inventory details the exact evidence items required from operations to advance from preliminary requirements to physical implementation:

| Item # | Required Evidence Item | Why It Matters | Dependent Step | Can Step 3 Proceed Without It? |
| :--- | :--- | :--- | :--- | :--- |
| **EVD-01** | **Authoritative Station List & Sequence** | Enforces REQ-008. Station ordering cannot be hardcoded or fabricated. | Step 3 (Station Specification) | **YES** (Step 3 specifies the ordering architecture, contracts, and validation rules; actual names are imported when supplied) |
| **EVD-02** | **Sample Excel Master Templates (6 Categories)** | Identifies exact sheet names, column headers, cell coordinates, and pre-existing formulas. | Step 4 (Template Spike) & Step 11 | **YES** (Step 3 does not require physical templates) |
| **EVD-03** | **Sample Word Incident Master Template** | Identifies content control tags, letterhead layout, and paragraph bookmark structure. | Step 4 (Template Spike) & Step 12 | **YES** (Step 3 does not require physical templates) |
| **EVD-04** | **Allowed Status Enumeration Taxonomies** | Confirms whether lighting status, fan status, and fence integrity use custom terminology. | Step 16 (Validation Engine) | **YES** |
| **EVD-05** | **Output File Naming Standards** | Formalizes default export filenames for station reports. | Step 10 (Export Engine) | **YES** |

---

## 6. Conclusion & Handoff

The preliminary report data requirements are fully structured and documented. While physical templates are pending delivery from the customer, their absence does **not block Step 3** (Station Sequence, Ordering & Configuration Specification), which establishes the data contract and ordering engine invariants independently of document layout.
