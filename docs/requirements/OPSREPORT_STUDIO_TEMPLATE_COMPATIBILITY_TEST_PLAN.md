# OpsReport Studio — Template Compatibility Test Plan

**Document Identifier:** PLN-TPL-001  
**Project ID:** stationops-reporter  
**Approved Product Name:** OpsReport Studio  
**Lifecycle Step:** Step 4 of 45 (Real Template Inspection & Document Compatibility Assessment)  
**Status:** Authoritative Test Plan (Targeting Step 7 Library Proof of Concept)  
**Last Updated:** 2026-10-19  

---

## 1. Test Plan Charter & Execution Disclosure

This document establishes the official test plan to evaluate candidate document-processing libraries during **Step 7: Document Processing Engine Proof of Concept & Benchmark**.

> [!IMPORTANT]
> **Execution Status Disclosure:** In strict accordance with professional engineering integrity and Section 15 / Section 17 of the Step 4 instructions, all test scenarios in this document are specified for future library benchmark execution. In accordance with the current Step 4 planning phase, **Execution Status is marked as NOT RUN**. No false claims of test execution on non-existent libraries or un-scaffolded engines are made.

---

## 2. Test Fixture Requirements

To execute this test plan in Step 7, a set of controlled synthetic and sample master fixtures must be prepared under `tests/fixtures/templates/`:
1. `fixture_excel_standard.xlsx`: Standard multi-station template with pre-styled headers, merged titles, and `=SUM()` formulas.
2. `fixture_excel_complex.xlsx`: Template with embedded PNG logos, conditional formatting rules, custom column widths, and print areas.
3. `fixture_word_standard.docx`: Word document with contiguous and intentionally fragmented text runs (`{{incident_narrative}}`).
4. `fixture_word_table.docx`: Word document with a multi-row table grid and letterhead header imagery.
5. `fixture_malformed_archive.xlsx`: Corrupted ZIP structure to test parser exception handling.
6. `fixture_macro_quarantine.xlsm`: Macro-enabled file to verify automatic quarantine.

---

## 3. Excel Processing Compatibility Test Scenarios (`POC-XLS`)

| Test ID | Scenario Description | Preconditions & Fixture | Test Action | Expected Result | Requirement Reference | Execution Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **POC-XLS-01** | **Open Copy & Inject Scalar Metadata** | `fixture_excel_standard.xlsx` loaded in memory. | Clone working copy; write Date, Inspector, and Shift into header cells. Save output. | Output file opens cleanly in Excel; header cells reflect injected values; master fixture SHA-256 remains byte-identical. | REQ-002, REQ-005, REQ-006 | **NOT RUN** |
| **POC-XLS-02** | **Multi-Row Sequential Station Injection** | Standard audit table with 20 blank station rows. | Inject 20 ordered station rows following sequence `1..20`. | Rows 1..20 render in exact sequence order. Station names match authoritative sequence. No row shifting or misaligned columns. | REQ-002, REQ-008 | **NOT RUN** |
| **POC-XLS-03** | **Formula Preservation & Recalculation** | Fixture contains summary formula `=SUM(E10:E30)`. | Inject integer defect counts into `E10:E30`. Save output. | Formula node is preserved in `sheet.xml`. Opening output in Excel recalculates sum accurately. No `#VALUE!` or `#REF!` errors. | REQ-002, NFR-REL-01 | **NOT RUN** |
| **POC-XLS-04** | **Cell Styling & Formatting Preservation** | Fixture cells have bold Arial 11pt, thin borders, and light blue fill. | Populate cells with alphanumeric text. | Injected cells retain exact font, size, borders, and background color. Zero styling reversion to plain default. | REQ-002, NFR-REL-01 | **NOT RUN** |
| **POC-XLS-05** | **Merged Range Geometry Preservation** | Fixture contains merged title range `A1:F2`. | Inspect and save output document. | Output XML retains `<mergeCell ref="A1:F2"/>`. Title remains visually centered and properly merged. | REQ-002 | **NOT RUN** |
| **POC-XLS-06** | **Drawing & Image Preservation (Logo)** | `fixture_excel_complex.xlsx` contains embedded PNG logo. | Populate data and export. | Exported `.xlsx` retains `xl/drawings/drawing1.xml` and `xl/media/image1.png`. Logo renders with zero distortion. | REQ-002 | **NOT RUN** |
| **POC-XLS-07** | **Page Setup & Print Area Preservation** | Fixture configured for Landscape, Fit to 1 Page Wide, A4 paper. | Export populated file. | Page orientation, print area bounds, and margin settings survive intact. Document prints cleanly. | REQ-002 | **NOT RUN** |
| **POC-XLS-08** | **Malformed Archive Exception Handling** | `fixture_malformed_archive.xlsx` (truncated zip). | Attempt to load template. | Library throws structured parse error; application traps exception and displays actionable user diagnostic. No crash. | REQ-012, NFR-REL-02 | **NOT RUN** |

---

## 4. Word Processing Compatibility Test Scenarios (`POC-DOC`)

| Test ID | Scenario Description | Preconditions & Fixture | Test Action | Expected Result | Requirement Reference | Execution Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **POC-DOC-01** | **Scalar Placeholder Replacement** | `fixture_word_standard.docx` with `{{report_date}}` in single run. | Replace placeholder with `"2026-10-19"`. | Output document displays `"2026-10-19"`; token text is completely replaced with zero leftover braces. | REQ-003, REQ-005 | **NOT RUN** |
| **POC-DOC-02** | **Fragmented Split-Run Token Replacement** | Fixture with `{{incident_narrative}}` split across 3 `<w:r>` runs. | Execute paragraph-level token replacement. | Library consolidates runs, replaces token, and preserves surrounding paragraph styling. Zero unreplaced tokens. | REQ-003, ANL-DOC-001 | **NOT RUN** |
| **POC-DOC-03** | **Multi-Paragraph Narrative Body Injection** | Fixture contains `{{incident_narrative}}`. Input contains 3 paragraphs separated by newlines. | Inject narrative text block. | Text formats into 3 distinct Open XML paragraphs (`<w:p>`) or clean line breaks. No raw escaped `\n` characters. | REQ-003, REQ-007 | **NOT RUN** |
| **POC-DOC-04** | **Table Cell Population & Grid Preservation** | Fixture contains 4-row metadata table. | Populate table cells with officer name, station, and classification. | Table borders, column widths, and cell margins remain 100% intact. No table collapse or font size jumps. | REQ-003 | **NOT RUN** |
| **POC-DOC-05** | **Header Logo & Footer Page Number Integrity** | Fixture contains letterhead PNG in header and `PAGE` field in footer. | Export populated incident report. | Header image is preserved; footer page numbers remain dynamic and functional. Master template hash unchanged. | REQ-003, REQ-006 | **NOT RUN** |
| **POC-DOC-06** | **Unmapped Placeholder Handling** | Fixture contains an unmapped token `{{unknown_tag}}`. | Run generation with valid form inputs. | Engine safely handles missing tag without crashing; options configured to retain tag or clear gracefully with warning. | REQ-012 | **NOT RUN** |

---

## 5. Security & Master Immutability Test Scenarios (`POC-SEC`)

| Test ID | Scenario Description | Preconditions | Test Action | Expected Result | Requirement Reference | Execution Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **POC-SEC-01** | **Master Template Immutability Assertion** | Master `.xlsx` and `.docx` templates loaded from disk. | Execute 50 consecutive successful and aborted generation cycles. | SHA-256 hash of master template files is computed before and after all runs. Hash delta is exactly 0. Zero byte modification. | REQ-006, NFR-REL-01 | **NOT RUN** |
| **POC-SEC-02** | **Destination Path Collision Guard** | Output path set identical to master template path. | Attempt document generation. | System catches path equivalence check, aborts write stream, and flags security violation: *"Target cannot overwrite master template."* | REQ-005, REQ-006 | **NOT RUN** |
| **POC-SEC-03** | **Macro Quarantine Enforcement** | User attempts to import `fixture_macro_quarantine.xlsm`. | Run template import validation. | System blocks import with explicit advisory: *"Macro-enabled templates (.xlsm) are not supported. Please import a clean .xlsx file."* | DEC-005, SEC-TPL-001 | **NOT RUN** |
| **POC-SEC-04** | **Zip Bomb Extraction Ceiling** | Synthetic archive with 100:1 compression ratio. | Attempt template import. | Archive unpacker halts extraction when ratio exceeds 15:1 or memory exceeds 100 MB. Workstation memory remains stable. | SEC-TPL-001 | **NOT RUN** |
