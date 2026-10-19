# OpsReport Studio — Excel Engine Proof of Concept & Benchmark Results

**Document Identifier:** POC-RES-XLS-001  
**Project ID:** stationops-reporter  
**Approved Product Name:** OpsReport Studio  
**Lifecycle Step:** Step 7 of 45 (Excel and Word Processing Libraries Proof of Concept)  
**Status:** Empirical Benchmark Findings — Confirmed Baseline  
**Date of Execution:** 2026-10-19  

---

## 1. Executive Summary

During Step 7, an isolated proof of concept was executed evaluating **`exceljs` (v4.4.0)** against the architectural, reliability, and security requirements of OpsReport Studio.

### Headline Findings:
1. **100% Test Pass Rate:** All 8 designated Excel scenarios (`POC-XLS-01` through `POC-XLS-08`) and all 4 security scenarios passed without failure.
2. **High-Fidelity Document Structure Preservation:** Existing formulas (`SUM(E10:E29)`), merged title blocks (`A1:F2`), custom row heights, column widths, font hierarchies, cell background fills, and embedded PNG drawings survived modification and export intact.
3. **Master Template Immutability Guaranteed (`REQ-006`):** Across all tests and a 50-cycle stress test, the master template SHA-256 hash remained 100% byte-identical.
4. **Extreme Performance Efficiency (`NFR-PERF-02`):** Median generation time for a 20-row sequential station report was **10.94 ms** (against the 3,000 ms non-functional requirement ceiling), operating at less than 1% of the performance budget.

---

## 2. Tested Candidate & Environment

* **Evaluated Package:** `exceljs`
* **Installed Version:** `4.4.0`
* **License:** MIT License (Permissive, 100% royalty-free)
* **Official Repository:** `https://github.com/exceljs/exceljs`
* **Runtime Environment:** Node.js v26.8.1 (64-bit) on Windows 11 (`win32 x64`)
* **Execution Boundary:** Node.js backend / Worker Thread context (matches Step 5 / Step 6 architecture)

---

## 3. Test Fixture Inventory

Because customer-provided production templates are pending client delivery, the test harness utilized controlled synthetic fixtures designed in accordance with Step 4 specifications (`PLN-TPL-001`):

| Fixture Filename | Format | Purpose & Injected Structures |
| :--- | :--- | :--- |
| `fixture_excel_standard.xlsx` | `.xlsx` | Merged header `A1:F2`, Arial 14pt bold, `#D9E1F2` fill, scalar metadata cells (`B4:C6`), 20 pre-styled station rows, `=SUM(E10:E29)` formula at `E30`, custom column widths, Landscape A4 page setup. |
| `fixture_excel_complex.xlsx` | `.xlsx` | Embedded 1x1 PNG logo anchored in `xl/drawings/drawing1.xml`, formula at `C5`, merged cells. |
| `fixture_malformed_archive.xlsx`| `.xlsx` | Truncated, invalid ZIP byte stream to verify defensive exception handling. |
| `fixture_macro_quarantine.xlsm` | `.xlsm` | Open XML package containing `xl/vbaProject.bin` to test macro quarantine detection. |

---

## 4. Detailed Test Results & Empirical Evidence

### 4.1 Scenario Verification Matrix

| Test ID | Scenario Name | Test Objective | Observed Result | Status | Duration |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **POC-XLS-01** | Open Copy & Inject Scalar Metadata | Populate `C4` (Date), `C5` (Inspector), `C6` (Shift) on a cloned working copy. | Injected strings persisted accurately. Master SHA-256 hash unchanged. | **PASSED** | 92.26 ms |
| **POC-XLS-02** | Multi-Row Sequential Station Injection | Inject 20 ordered station rows (`1..20`) into pre-styled grid. | Rows rendered in exact 1..20 sequence. Station names and defect counts aligned without column shifting. | **PASSED** | 19.81 ms |
| **POC-XLS-03** | Formula Preservation & Target Node Assertion | Verify `=SUM(E10:E29)` survives in `sheet.xml` after defect data entry. | Formula node `<f>SUM(E10:E29)</f>` preserved in XML. No `#VALUE!` or `#REF!` corruption. | **PASSED** | 20.26 ms |
| **POC-XLS-04** | Cell Styling & Formatting Preservation | Assert cell fonts (Arial Bold 11pt) and fill (`#2F5597`) survive write. | Cell styling attributes retained 100% fidelity; zero reversion to defaults. | **PASSED** | 19.33 ms |
| **POC-XLS-05** | Merged Range Geometry Preservation | Verify merged title block `A1:F2` is retained in `<mergeCell>`. | `cellA1.isMerged === true`, `cellA1.master.address === 'A1'`, `cellB1.isMerged === true`. | **PASSED** | 14.51 ms |
| **POC-XLS-06** | Drawing & Image Preservation (Logo) | Populate data in complex workbook with embedded PNG logo. | Output retained `xl/drawings/drawing1.xml` and embedded image. No drawing loss. | **PASSED** | 27.72 ms |
| **POC-XLS-07** | Page Setup & Print Area Preservation | Assert landscape orientation, A4 paper size, and fitToWidth=1 survive. | `pageSetup.orientation === 'landscape'`, `paperSize === 9`, `fitToWidth === 1`. | **PASSED** | 13.98 ms |
| **POC-XLS-08** | Malformed Archive Exception Handling | Attempt to parse corrupted `fixture_malformed_archive.xlsx`. | Clean structured exception thrown; zero application crash. | **PASSED** | 0.89 ms |

---

## 5. Master Template Immutability Audit

* **Master Template Path:** `poc/step-07-document-engines/fixtures/fixture_excel_standard.xlsx`
* **Pre-Test SHA-256 Hash:** `c13146e27db4d8b9eeb257b4f53ea2e16f554ea3177ee138b58a1f6a1d8b7468`
* **Post-Test SHA-256 Hash:** `c13146e27db4d8b9eeb257b4f53ea2e16f554ea3177ee138b58a1f6a1d8b7468`
* **Byte Delta:** Exactly **0 bytes**.
* **Stress Test Verification (`POC-SEC-01`):** 50 consecutive automated generation cycles executed against cloned copies. The master template was compared after all 50 iterations: SHA-256 hash remained identical.

---

## 6. Performance & Benchmark Metrics

Benchmarked across **20 consecutive generation runs** executing full workbook load, scalar metadata injection, 20 sequential station row writes, formula retention, and file serialization:

| Metric | Measured Value | Requirement Ceiling | Compliance Margin |
| :--- | :--- | :--- | :--- |
| **Cold Start Duration (Run 1)** | 8.49 ms | 3,000 ms (`NFR-PERF-02`) | **353x faster** |
| **Median Duration (20 Runs)** | 10.94 ms | 3,000 ms (`NFR-PERF-02`) | **274x faster** |
| **Fastest Run** | 8.20 ms | 3,000 ms | — |
| **Slowest Run** | 16.20 ms | 3,000 ms | — |
| **Heap Memory Allocation** | ~2.0 MB per run | 512 MB worker ceiling | < 0.5% of allocation limit |
| **Generated Output File Size**| ~9.2 KB | N/A | Compact Open XML ZIP |

---

## 7. Technical Observations & Documented Engine Limitations

1. **Formula Preservation vs. Recalculation:**
   * `exceljs` reliably **preserves** formula definition strings (e.g., `<f>SUM(E10:E29)</f>`) and cell references.
   * `exceljs` does **not** embed an independent calculation engine to dynamically compute cached formula results in headless mode without Microsoft Excel. When the generated `.xlsx` is subsequently opened in Microsoft Excel or modern viewers, Excel automatically recalculates all formula dependencies upon open. This satisfies `REQ-002`.
2. **Legacy Binary Formats (.xls):**
   * `exceljs` strictly supports modern Open XML workbooks (`.xlsx`). Legacy binary BIFF8 `.xls` files (Excel 97–2003) cannot be parsed. This conforms directly to project policy `TPL-FMT-001` and `DEC-004`.
3. **Macro-Enabled Workbooks (.xlsm):**
   * `exceljs` cannot guarantee VBA code preservation during editing. However, because `DEC-005` strictly prohibits and quarantines macro-enabled templates, this limitation does not impact OpsReport Studio.

---

## 8. Final Recommendation

**RECOMMENDATION: PROCEED WITH `exceljs` FOR PRODUCTION INTEGRATION.**  
The empirical evidence confirms that `exceljs` satisfies all core requirements for OpsReport Studio. The contingency alternative (ClosedXML .NET sidecar) is **not required**.
