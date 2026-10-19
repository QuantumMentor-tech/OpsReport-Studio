# OpsReport Studio — Template Assessment Evidence & Open-Question Register

**Document Identifier:** REG-TPL-001  
**Project ID:** stationops-reporter  
**Approved Product Name:** OpsReport Studio  
**Lifecycle Step:** Step 4 of 45 (Real Template Inspection & Document Compatibility Assessment)  
**Status:** Active Discovery Register  
**Last Updated:** 2026-10-19  

---

## 1. Register Scope & Assessment Summary

This register formally catalogs the physical template evidence reviewed during Step 4, documents the absence of customer master templates, consolidates critical open questions for user confirmation, and establishes clear engineering dependencies for Step 5 (Technology Stack Evaluation) and Step 7 (Document Library Proof of Concept).

---

## 2. Template Inspection Evidence Log

| Report Category ID | Expected Document Format | Physical File Inspected? | Inspected File Path | Evidence Classification | Discovery Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`RPT-INCIDENT`** | Microsoft Word (`.docx`) | **NO** | N/A | `[UNRESOLVED]` (Awaiting File) | Flagship Word document. Layout, letterhead, and placeholder tags pending sample delivery. |
| **`RPT-STATION-LIGHT`** | Microsoft Excel (`.xlsx`) | **NO** | N/A | `[UNRESOLVED]` (Awaiting File) | Excel tabular audit. Worksheet names, header rows, and summary formulas pending sample delivery. |
| **`RPT-FAN`** | Microsoft Excel (`.xlsx`) | **NO** | N/A | `[UNRESOLVED]` (Awaiting File) | Ventilation status ledger. Asset row arrangement and operational formulas pending sample delivery. |
| **`RPT-POLE-LIGHT`** | Microsoft Excel (`.xlsx`) | **NO** | N/A | `[UNRESOLVED]` (Awaiting File) | Exterior lighting table. Conditional formatting and pole grouping pending sample delivery. |
| **`RPT-FIRE-EXTINGUISHER`**| Microsoft Excel (`.xlsx`) | **NO** | N/A | `[UNRESOLVED]` (Awaiting File) | Compliance ledger. Regulatory date formulas and cylinder table pending sample delivery. |
| **`RPT-PILLAR`** | Microsoft Excel (`.xlsx`) | **NO** | N/A | `[UNRESOLVED]` (Awaiting File) | Structural column checklist. Platform column numbers and defect flags pending sample delivery. |
| **`RPT-FENCE`** | Microsoft Excel (`.xlsx`) / Word (`.docx`) | **NO** | N/A | `[UNRESOLVED]` (Awaiting File) | Boundary security audit. Format selection (Excel vs. Word) pending sample delivery. |

---

## 3. Prioritized Questions for User / Stakeholder Confirmation

The following questions are prioritized to guide subsequent discovery without blocking architecture work:

| Question ID | Question Description | Why It Matters | Impact Level | Does It Block Step 5? |
| :--- | :--- | :--- | :--- | :--- |
| **QUE-TPL-01** | **Can sample master templates (`.xlsx` and `.docx`) be supplied for the 7 report types?** | Determines exact cell coordinates, sheet names, existing formulas, and Word placeholder tokens. | **High** (Essential for Step 7 PoC) | **NO** (Step 5 evaluates frameworks and libraries based on Open XML standards) |
| **QUE-TPL-02** | **Are any customer templates macro-enabled (`.xlsm` / `.docm`)?** | Macro execution is unsafe and difficult to preserve headlessly. Recommending clean `.xlsx` / `.docx`. | **High** | **NO** (Baseline already assumes macro-free `.xlsx`/`.docx`) |
| **QUE-TPL-03** | **Do Excel templates contain pre-printed station names or blank audit rows?** | If station names are pre-printed, the engine must verify matching order; if blank, it injects the authoritative sequence dynamically. | **Medium** | **NO** (Engine design accommodates both via Step 3 invariants) |
| **QUE-TPL-04** | **Does the Fence Report use an Excel checklist or a Word incident document?** | Affects whether `RPT-FENCE` binds to the Excel or Word generation pipeline. | **Low** | **NO** (Both pipelines will be supported in the core engine) |

---

## 4. Dependencies for Subsequent Roadmap Steps

1. **Step 5: Final Technology Stack Evaluation & Architecture Selection:**
   * Step 5 will compare desktop runtimes (Tauri v2 vs. Electron) and backend language ecosystems (Rust vs. Node.js).
   * The compatibility specifications in Deliverables B, C, and D provide the technical criteria (formula retention, split-run token lexing, memory footprint) needed to make this architectural choice.
2. **Step 7: Document Processing Engine Proof of Concept & Benchmark:**
   * Step 7 will physically benchmark candidate libraries against the test scenarios specified in `OPSREPORT_STUDIO_TEMPLATE_COMPATIBILITY_TEST_PLAN.md`.
   * If real customer templates are delivered prior to Step 7, they will be used as fixtures; otherwise, standardized synthetic fixtures matching the specifications will be used.
