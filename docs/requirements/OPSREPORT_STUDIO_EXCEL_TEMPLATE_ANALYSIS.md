# OpsReport Studio — Excel Template Compatibility Analysis

**Document Identifier:** ANL-XLS-001  
**Project ID:** stationops-reporter  
**Approved Product Name:** OpsReport Studio  
**Lifecycle Step:** Step 4 of 45 (Real Template Inspection & Document Compatibility Assessment)  
**Status:** Pre-Acquisition Technical Analysis & Compatibility Specification  
**Last Updated:** 2026-10-19

---

## 1. Analysis Status & Authoritative Disclosure

> [!IMPORTANT]
> **Workbook Inspection Disclosure:**  
> Because customer master `.xlsx` workbook files have not yet been deposited into the workspace, **actual physical inspection of customer workbook streams (worksheets, cell coordinates, existing formulas, and print layouts) has NOT been performed**.
>
> In compliance with Section 6 and Section 17 of the Step 4 instructions, this document provides the **authoritative structural expectations, formula preservation requirements, layout compatibility specifications, and risk profiles** that candidate document-processing libraries must fulfill during the Step 7 proof of concept.

---

## 2. Expected Workbook Architecture Across the 6 Excel Categories

The 6 Excel-based operational reports identified in Step 2 (`RPT-STATION-LIGHT`, `RPT-FAN`, `RPT-POLE-LIGHT`, `RPT-FIRE-EXTINGUISHER`, `RPT-PILLAR`, `RPT-FENCE`) exhibit common Open XML spreadsheet patterns typical of control room compliance ledgers:

```
┌────────────────────────────────────────────────────────────────────────┐
│ [LOGO / TITLE HEADER REGION]                                           │
│ Company Name, Facility Title, Inspection Date, Inspector, Shift        │
├────────────────────────────────────────────────────────────────────────┤
│ [SUMMARY / KPI METRICS REGION] (Formulas: SUM, COUNTIF, % Operational)  │
├────────────────────────────────────────────────────────────────────────┤
│ [AUDIT DATA TABLE REGION]                                              │
│ Col A: Seq # | Col B: Station Name (REQ-008) | Col C..N: Audit Findings│
│ Row 1: Station 1 Findings...                                           │
│ Row 2: Station 2 Findings...                                           │
│ Row N: Station N Findings...                                           │
├────────────────────────────────────────────────────────────────────────┤
│ [SIGN-OFF / REMARKS REGION]                                            │
│ General Notes, Supervisor Signature Box, Print Area Footer             │
└────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Structural Breakdown by Report Category

| Category ID                 | Expected Worksheets                   | Expected Table Layout                                                                                                                       | Critical Pre-Existing Features                                                                                    |
| :-------------------------- | :------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------ | :---------------------------------------------------------------------------------------------------------------- |
| **`RPT-STATION-LIGHT`**     | 1 (e.g., `LightingAudit` or `Sheet1`) | Fixed multi-row table ordered by station. Columns: Station Name, Lighting Zone, Total Fixtures, Operational, Defective Count, Work Order #. | Summary row with `=SUM(E10:E60)` defect totals and conditional formatting highlighting defect cells in light red. |
| **`RPT-FAN`**               | 1 (e.g., `VentilationStatus`)         | Asset rows grouped under station headers. Columns: Station, Equipment Tag, Mode (Auto/Man), Running Condition, Damper Status, Notes.        | Summary counter `=COUNTIF(D10:D50, "Normal Running")` calculating operational availability percentage.            |
| **`RPT-POLE-LIGHT`**        | 1 (e.g., `PoleLighting`)              | Exterior pole listing by station/yard sector. Columns: Station, Pole #, Luminaire Status, Physical Hazard Flag, Repair Priority.            | Conditional formatting on Hazard Flag (`=TRUE` triggers bold red fill).                                           |
| **`RPT-FIRE-EXTINGUISHER`** | 1 (e.g., `ExtinguisherAudit`)         | Statutory compliance table. Columns: Station, Cabinet #, Serial #, Extinguisher Type, Gauge Status, Pin Intact (Y/N), Test Due Date.        | Date comparison formula highlighting expired hydrostatic test dates in amber.                                     |
| **`RPT-PILLAR`**            | 1 (e.g., `PillarInspection`)          | Structural inspection ledger. Columns: Station, Pillar #, Location Zone, Surface Integrity, Impact Guard Status, Signage Legible.           | Station sequence ordering `1..N`. Defect count summary.                                                           |
| **`RPT-FENCE`**             | 1 (e.g., `PerimeterFence`)            | Boundary segment ledger. Columns: Station, Segment ID, Barrier Type, Physical Integrity, Gate Lock Status, Security Alert Flag.             | Security alert flag formulas triggering immediate visual escalation highlights.                                   |

---

## 3. High-Fidelity Workbook Preservation Requirements

The primary failure mode of basic spreadsheet libraries is **template destruction during save**: opening an existing `.xlsx`, populating cell values, and saving the file often strips formulas, destroys conditional formatting, drops drawing objects (logos), and resets column widths.

To ensure compliance with `REQ-002`, `REQ-006`, and `NFR-REL-01`, candidate libraries evaluated in Step 5 and Step 7 must strictly satisfy the following preservation criteria:

### 3.1 Formula & Calculation Preservation

- **Formula Node Immutability:** Pre-existing formulas (e.g., `=SUM(D10:D45)`, `=IF(...)`, `=COUNTIF(...)`) must remain untouched in the Open XML `sheet.xml` package.
- **Cached Value Handling:** Excel stores both the formula string and a cached calculated value (`<v>14</v>`). The processing engine must update the input cells without corrupting formula syntax. If the library does not compute formula results internally, it must mark the workbook's calculation chain dirty (`fullCalcOnLoad="1"`) so that Microsoft Excel automatically recalculates all formulas upon opening.

### 3.2 Cell Styling, Fonts & Alignment

- Cell background fills (`fillId`), font families, font weights, borders, text wrapping, and alignment (`xfId`) on template cells must be 100% preserved. Injecting text must not revert cells to raw unstyled defaults.

### 3.3 Merged Cells & Layout Geometry

- Header areas frequently utilize merged cell ranges (e.g., `A1:F2` for report titles). The engine must not break merged cell coordinates (`<mergeCell ref="A1:F2"/>`).
- Custom column widths and custom row heights must remain intact to prevent visual text clipping.

### 3.4 Embedded Drawings, Shapes & Logos

- Operational templates frequently embed corporate badges or facility logos (`drawing1.xml`). The engine must preserve all `xl/drawings/` relationships and binary media parts without dropping them during serialization.

### 3.5 Print Areas & Page Setup

- Control room operators routinely print hardcopies. Page setup parameters—`printArea`, page orientation (`landscape` / `portrait`), margins, paper size (`Letter` / `A4`), and repeated header rows (`$1:$5`)—must survive generation intact.

---

## 4. Workbook-Processing Risk Register

| Risk ID        | Failure Description                                                                                  | Likelihood           | Impact   | Proposed Architectural Mitigation                                                                   |
| :------------- | :--------------------------------------------------------------------------------------------------- | :------------------- | :------- | :-------------------------------------------------------------------------------------------------- |
| **RSK-XLS-01** | **Formula Stripping:** Library saves updated cell values but purges complex formulas.                | High (Basic parsers) | Critical | Benchmark candidate libraries in Step 7 specifically for formula node retention.                    |
| **RSK-XLS-02** | **Drawing / Logo Loss:** Library drops `xl/drawings/` and `xl/media/` during Open XML repackaging.   | Medium               | Moderate | Require ZIP-stream level preservation or Open XML DOM preservation libraries.                       |
| **RSK-XLS-03** | **Merged Cell Disruption:** Injecting data into merged ranges corrupts XML coordinate indices.       | Medium               | High     | Target exclusively the top-left coordinate of merged ranges (e.g., write to `A1` in `A1:F2`).       |
| **RSK-XLS-04** | **Print Area Corruption:** Output document prints across 8 fragmented pages due to lost margins.     | Medium               | High     | Explicit unit test asserting `<pageSetup>` and `<printOptions>` XML tags remain unchanged.          |
| **RSK-XLS-05** | **Calculation Chain Staleness:** Excel opens output file showing `#VALUE!` or outdated formula sums. | High                 | High     | Inject `<calcPr fullCalcOnLoad="1"/>` into `workbook.xml` to force automatic recalculation on open. |

---

## 5. Candidate Mapping Architectures for Excel

When physical templates are supplied, field-to-cell binding will follow one of three mapping strategies:

1. **Explicit Coordinate Mapping (`Sheet1!B4`):** Fixed target cell coordinates defined in declarative JSON mapping schemas. Ideal for fixed-layout forms.
2. **Named Range Mapping (`rngReportDate`):** Targets cells assigned explicit Excel Names (`<definedName>`). Highly resilient to row/column insertions by template designers.
3. **Table Column Header Binding (`[Station Name]`, `[Defect Count]`):** In multi-row audit tables, the engine locates the table header row and appends/populates rows matching the authoritative station sequence `1..N`.

---

## 6. Required Proof-of-Concept Test Scenarios for Step 7

The document-processing spike in Step 7 must validate candidate libraries against the following scenarios:

- **POC-XLS-01:** Open a test `.xlsx` workbook, inject scalar metadata into cells, and assert master file SHA-256 remains byte-identical.
- **POC-XLS-02:** Inject 50 sequential station rows into a pre-styled tabular range; verify station order matches `1..50` exactly.
- **POC-XLS-03:** Verify that `=SUM()` and `=COUNTIF()` formulas recalculate correctly when input values change.
- **POC-XLS-04:** Verify that embedded PNG logos, cell borders, fill colors, and custom column widths are preserved without visual degradation.
- **POC-XLS-05:** Verify that page orientation, margins, and print areas survive generation.
