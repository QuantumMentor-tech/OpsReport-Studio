# OpsReport Studio — Document Format & Compatibility Matrix

**Document Identifier:** MTX-FMT-001  
**Project ID:** stationops-reporter  
**Approved Product Name:** OpsReport Studio  
**Lifecycle Step:** Step 4 of 45 (Real Template Inspection & Document Compatibility Assessment)  
**Status:** Authoritative Compatibility Matrix  
**Last Updated:** 2026-10-19

---

## 1. Matrix Overview & Governance

This document establishes the format-level compatibility matrix for OpsReport Studio. It systematically evaluates Microsoft Excel and Word document formats against user mandates, security constraints, library support, and processing risks.

### Status Classification:

- **CONFIRMED CORE:** Mandated by user requirements; primary production target for V1.
- **CANDIDATE:** Feasible extension; subject to technical validation in Step 7.
- **UNSUPPORTED:** Explicitly excluded from V1 due to severe security hazards, obsolescence, or disproportionate complexity.
- **UNRESOLVED:** Awaiting customer confirmation regarding whether operational templates use this format.

---

## 2. Document Format Compatibility Matrix

| Format Extension | Format Family                 | Media Type / MIME                                                         | File in Workspace? | User Mandate Status    | Macro Risk                                | Library Ecosystem Support                                                            | Feature Loss Risk                               | Recommended V1 Status                               |
| :--------------- | :---------------------------- | :------------------------------------------------------------------------ | :----------------- | :--------------------- | :---------------------------------------- | :----------------------------------------------------------------------------------- | :---------------------------------------------- | :-------------------------------------------------- |
| **`.xlsx`**      | Excel Open XML Workbook       | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`       | No                 | **CONFIRMED (Req #1)** | **None** (Macro-free)                     | **Excellent** (Rust: `calamine`/`umya`, Node: `exceljs`, Python: `openpyxl`)         | Low (with mature Open XML parsers)              | **CONFIRMED CORE**                                  |
| **`.xlsm`**      | Excel Open XML Macro-Enabled  | `application/vnd.ms-excel.sheet.macroEnabled.12`                          | No                 | Candidate / Unresolved | **CRITICAL** (VBA execution hazard)       | **Moderate** (Can preserve `vbaProject.bin`, but cannot execute VBA headlessly)      | High (VBA stream corruption during re-save)     | **UNSUPPORTED IN V1** (Quarantine; disallow macros) |
| **`.xls`**       | Legacy Excel 97–2003 Binary   | `application/vnd.ms-excel`                                                | No                 | Not Requested          | **High** (Binary exploits, legacy macros) | **Poor** (Obsolete binary BIFF8 format; requires legacy parsers)                     | Very High (Formatting, 65k row limit, formulas) | **UNSUPPORTED** (Recommend conversion to `.xlsx`)   |
| **`.xltx`**      | Excel Open XML Template       | `application/vnd.openxmlformats-officedocument.spreadsheetml.template`    | No                 | Candidate              | **None**                                  | **High** (Identical to `.xlsx` except template content type flag)                    | Low                                             | **CANDIDATE** (Support as importable template)      |
| **`.xltm`**      | Excel Open XML Macro Template | `application/vnd.ms-excel.template.macroEnabled.12`                       | No                 | Not Requested          | **CRITICAL**                              | **Moderate**                                                                         | High                                            | **UNSUPPORTED**                                     |
| **`.docx`**      | Word Open XML Document        | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | No                 | **CONFIRMED (Req #1)** | **None** (Macro-free)                     | **Excellent** (Rust: `docx-rs`, Node: `docxtemplater`/`docx`, Python: `python-docx`) | Low (with proper split-run token handling)      | **CONFIRMED CORE**                                  |
| **`.docm`**      | Word Open XML Macro-Enabled   | `application/vnd.ms-word.document.macroEnabled.12`                        | No                 | Candidate / Unresolved | **CRITICAL** (VBA execution hazard)       | **Moderate**                                                                         | High (VBA stream corruption)                    | **UNSUPPORTED IN V1** (Quarantine; disallow macros) |
| **`.doc`**       | Legacy Word 97–2003 Binary    | `application/msword`                                                      | No                 | Not Requested          | **High** (Binary macro exploits)          | **Very Poor** (Proprietary OLE binary structure)                                     | Very High (Styles, table geometry collapse)     | **UNSUPPORTED** (Recommend conversion to `.docx`)   |
| **`.dotx`**      | Word Open XML Template        | `application/vnd.openxmlformats-officedocument.wordprocessingml.template` | No                 | Candidate              | **None**                                  | **High** (Identical to `.docx` XML structure)                                        | Low                                             | **CANDIDATE** (Support as importable template)      |
| **`.dotm`**      | Word Open XML Macro Template  | `application/vnd.ms-word.template.macroEnabled.12`                        | No                 | Not Requested          | **CRITICAL**                              | **Moderate**                                                                         | High                                            | **UNSUPPORTED**                                     |

---

## 3. Headless Library Ecosystem Comparison (No MS Office Dependency)

To satisfy `NFR-COMP-02` (100% standalone execution without Microsoft Office or COM automation installed), the processing engine must operate headlessly across candidate technological stacks:

| Technical Stack                | Candidate Excel Library         | Candidate Word Library              | Strengths                                                                                                                        | Known Limitations                                                                        | Architectural Recommendation        |
| :----------------------------- | :------------------------------ | :---------------------------------- | :------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------- | :---------------------------------- |
| **Tauri / Rust Backend**       | `umya-spreadsheet` / `calamine` | `docx-rs` / Custom Open XML Zip DOM | Extremely fast, zero runtime memory bloat (< 40 MB RAM), compiled native binary safety.                                          | Rust Word DOM manipulation requires custom split-run handling or XML tree manipulation.  | **Leading Architecture Candidate**  |
| **Electron / Node.js Backend** | `exceljs`                       | `docxtemplater` + `pizzip`          | Mature ecosystem; `docxtemplater` natively solves the Open XML split-run issue; `exceljs` has excellent formula/style retention. | Higher memory footprint (> 150 MB RAM); larger installer bundle (~100 MB).               | **Viable Architecture Candidate**   |
| **Python Sidecar Backend**     | `openpyxl`                      | `python-docx`                       | Robust standards compliance; wide enterprise usage.                                                                              | Requires bundling Python runtime or PyInstaller sidecar executable; slower cold startup. | **Fallback Architecture Candidate** |

---

## 4. Key Architectural Recommendations for Step 5

1. **Strict Core Standardization:** Standardize V1 exclusively on **`.xlsx` (Excel)** and **`.docx` (Word)**.
2. **Explicit Legacy Ban:** Formally exclude binary `.xls` and `.doc` formats. If operators have historical templates in legacy binary formats, provide clear instructions to resave them once as modern `.xlsx` / `.docx` files in Microsoft Office.
3. **Macro Quarantine Policy:** Exclude `.xlsm` and `.docm` from V1 to eliminate macro virus vectors and avoid brittle VBA stream preservation hurdles.
