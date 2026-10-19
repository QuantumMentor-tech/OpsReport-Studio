# OpsReport Studio — Template Inventory

**Document Identifier:** INV-TPL-001  
**Project ID:** stationops-reporter  
**Approved Product Name:** OpsReport Studio  
**Lifecycle Step:** Step 4 of 45 (Real Template Inspection & Document Compatibility Assessment)  
**Status:** Authoritative Inventory (Pre-Acquisition Baseline)  
**Last Updated:** 2026-10-19  

---

## 1. Inventory Scope & Audit Status

This document establishes the official template inventory for OpsReport Studio. In strict compliance with professional software engineering standards, the workspace was subjected to an exhaustive read-only filesystem audit to discover all operational template files (`.xlsx`, `.xlsm`, `.xls`, `.docx`, `.docm`, `.doc`).

### Authoritative Inspection Statement:
> [!IMPORTANT]
> **Actual Operational Report Templates Inspected: NONE.**  
> No customer master Excel workbooks or Word report templates were located in the workspace or accessible project repositories. All specifications, structural requirements, and compatibility analyses in Step 4 represent an authoritative **pre-acquisition baseline and technical evaluation framework** that will govern testing when physical files are supplied.

---

## 2. Master Template Acquisition Checklist

The following table catalogs the 7 operational report categories, their target document format, current acquisition status, and required template artifacts:

| Item ID | Category ID | Report Display Name | Required Format | File Status in Workspace | Priority | Required Artifact Description |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **TPL-REQ-01** | `RPT-INCIDENT` | Security Incident Report | Microsoft Word (`.docx`) | **Awaiting User Delivery** | P0 Core | Official incident report master document with agency letterhead, metadata headers, incident narrative body, and signature block. |
| **TPL-REQ-02** | `RPT-STATION-LIGHT` | Station Light Report | Microsoft Excel (`.xlsx`) | **Awaiting User Delivery** | P0 Core | Multi-station lighting inspection audit workbook with formatted header metadata, sequential station rows, defect counters, and summary formulas. |
| **TPL-REQ-03** | `RPT-FAN` | Fan / Ventilation Report | Microsoft Excel (`.xlsx`) | **Awaiting User Delivery** | P0 Core | Mechanical ventilation inspection workbook with equipment IDs, operating mode selectors, condition status, and station sequence grouping. |
| **TPL-REQ-04** | `RPT-POLE-LIGHT` | Pole Light Report | Microsoft Excel (`.xlsx`) | **Awaiting User Delivery** | P0 Core | Exterior / parking lighting audit workbook with pole tag numbers, physical hazard flags, luminaire operational status, and station zones. |
| **TPL-REQ-05** | `RPT-FIRE-EXTINGUISHER`| Fire Extinguisher Report | Microsoft Excel (`.xlsx`) | **Awaiting User Delivery** | P0 Core | Statutory life-safety audit workbook tracking cylinder serial numbers, pressure gauge status, safety pin verification, and test due dates. |
| **TPL-REQ-06** | `RPT-PILLAR` | Pillar Report | Microsoft Excel (`.xlsx`) | **Awaiting User Delivery** | P0 Core | Facility structural inspection workbook tracking station platform columns, surface integrity, impact guard condition, and defect notes. |
| **TPL-REQ-07** | `RPT-FENCE` | Fence Report | Microsoft Excel (`.xlsx`) / Word (`.docx`) | **Awaiting User Delivery** | P0 Core | Perimeter security patrol audit workbook (or incident Word document) tracking boundary fence segment integrity, gate lock security, and breach alerts. |

---

## 3. Discovered Project Assets (Non-Template Inventory)

The following non-template assets were located, inspected, and verified during the pre-inspection audit:

| Asset ID | File Name | File Path | File Size | Classification | Purpose & Preservation Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **AST-001** | `OpsReport Studio Tech Logo.png` | `.\OpsReport Studio Tech Logo.png` | 444,361 bytes | Brand Identity Asset | Verified project logo (Excel green, Word blue, report document, ascending arrow). Preserved byte-identical. |
| **DOC-001..014** | Requirements & Specification Documents (14 Files) | `.\docs\requirements\*.md` | ~160 KB total | Product Documentation | Authoritative Step 1, Step 2, and Step 3 requirements baselines, catalogs, dictionaries, and specifications. |

---

## 4. Distinction Between Product Documentation & Report Templates

In accordance with Section 4.3 of the Step 4 instructions:
1. **Product Documentation Artifacts:** Markdown files located in `docs/requirements/` define software requirements, data contracts, and validation rules. They do **NOT** serve as document-generation templates.
2. **Operational Report Templates:** Binary Open XML packages (`.xlsx` workbooks and `.docx` documents) created in Microsoft Office. These must be supplied by the user/operations to serve as master generation templates.

---

## 5. Template Acquisition Protocol

When official sample templates are supplied by the user:
1. **Quarantine Inspection:** Files will be deposited in an internal sandbox directory (e.g., `tests/fixtures/templates/`).
2. **SHA-256 Fingerprinting:** A cryptographic hash will be calculated and recorded in this register immediately upon ingest.
3. **Static Safety Audit:** Files will be analyzed for macro project streams (`vbaProject.bin`), external URI relationships, and suspicious zip structures prior to parsing.
4. **Physical Property Promotion:** Observed worksheet names, header cells, table ranges, and bookmark tags will be promoted from "Awaiting Delivery" to "Observed" in Deliverables B, C, and D.
