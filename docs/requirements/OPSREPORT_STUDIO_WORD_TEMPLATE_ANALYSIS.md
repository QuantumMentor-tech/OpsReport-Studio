# OpsReport Studio — Word Template Compatibility Analysis

**Document Identifier:** ANL-DOC-001  
**Project ID:** stationops-reporter  
**Approved Product Name:** OpsReport Studio  
**Lifecycle Step:** Step 4 of 45 (Real Template Inspection & Document Compatibility Assessment)  
**Status:** Pre-Acquisition Technical Analysis & Compatibility Specification  
**Last Updated:** 2026-10-19  

---

## 1. Analysis Status & Authoritative Disclosure

> [!IMPORTANT]
> **Document Inspection Disclosure:**  
> Because customer master `.docx` template files have not yet been deposited into the workspace, **actual physical inspection of customer Word document parts (XML runs, content controls, bookmarks, and paragraph styles) has NOT been performed**.
> 
> In compliance with Section 7 and Section 17 of the Step 4 instructions, this document defines the **authoritative document architecture, placeholder parsing mechanics, formatting preservation criteria, and risk mitigations** required to evaluate candidate Word-processing engines in the Step 7 proof of concept.

---

## 2. Expected Word Document Architecture (`RPT-INCIDENT`)

The Security Incident Report (`RPT-INCIDENT`) serves as the flagship Word-based report in OpsReport Studio. In control-room and facility security environments, incident reports require formal executive presentation:

```
┌────────────────────────────────────────────────────────────────────────┐
│ [HEADER: Official Agency Letterhead & Badge Logo]                      │
│ Document ID: {{incident_id}}               Date Filed: {{report_date}} │
├────────────────────────────────────────────────────────────────────────┤
│ [INCIDENT METADATA TABLE]                                              │
│ Incident Date/Time: {{incident_datetime}}                              │
│ Affected Station:   {{station_name}} (Single selection - REQ-008)      │
│ Specific Location:  {{specific_location}}                              │
│ Classification:     {{incident_category}}   Severity: {{incident_sev}} │
│ Reporting Officer:  {{inspector_name}}      Badge:    {{inspector_id}} │
├────────────────────────────────────────────────────────────────────────┤
│ [SECTION 1: NARRATIVE DESCRIPTION OF EVENT]                            │
│ {{incident_narrative}} (Multi-paragraph formatted text body)          │
├────────────────────────────────────────────────────────────────────────┤
│ [SECTION 2: IMMEDIATE CONTAINMENT & ACTION TAKEN]                      │
│ {{actions_taken}}                                                      │
├────────────────────────────────────────────────────────────────────────┤
│ [SECTION 3: EMERGENCY ESCALATION & LAW ENFORCEMENT]                    │
│ Police Contacted: {{police_contacted}}    CAD / Ref #: {{police_ref}}  │
│ Witness Statements / Involved Persons: {{witness_details}}             │
├────────────────────────────────────────────────────────────────────────┤
│ [SIGN-OFF / AUTHORIZATION BLOCK]                                       │
│ Officer Signature: __________________   Supervisor Sign-off: _________ │
│ [FOOTER: Confidential Security Record - Page 1 of 1]                   │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. The Open XML "Split-Run" Technical Challenge

The single most critical failure mode when automating Microsoft Word documents via raw string substitution is the **Open XML Text Run Segmentation Hazard**.

### 3.1 The Problem:
In Microsoft Word's underlying Open XML structure (`word/document.xml`), text is divided into runs (`<w:r>`) inside paragraphs (`<w:p>`). Whenever a document author edits text, types slowly, or when Word runs grammar/spell check, Word fragments text across separate run nodes:

```xml
<!-- How a developer expects a placeholder to look: -->
<w:p>
  <w:r>
    <w:t>{{incident_narrative}}</w:t>
  </w:r>
</w:p>

<!-- How Microsoft Word ACTUALLY stores it in document.xml: -->
<w:p>
  <w:r>
    <w:t>{{inc</w:t>
  </w:r>
  <w:proofErr w:type="gramStart"/>
  <w:r>
    <w:t>ident_nar</w:t>
  </w:r>
  <w:proofErr w:type="gramEnd"/>
  <w:r>
    <w:t>rative}}</w:t>
  </w:r>
</w:p>
```

### 3.2 Consequence:
A simple string replacement (e.g., `text.replace("{{incident_narrative}}", data)`) **completely fails** because the contiguous token does not exist in any individual `<w:t>` XML node.

### 3.3 Candidate Architecture Evaluation & Required Mitigation:
To reliably populate Word documents, the candidate processing engine evaluated in Step 5 and Step 7 must support one of the following proven solutions:
1. **Paragraph-Level Run Consolidation:** The engine scans paragraphs, combines adjacent text runs, performs token replacement, and rebuilds the run hierarchy while preserving paragraph styling.
2. **Standard Word Content Controls (`<w:sdt>`):** Placeholders are implemented as native Word Content Controls (Plain Text controls with explicit tag titles). The engine targets `<w:tag w:val="incident_narrative"/>` and updates its internal text without string regex hunting.
3. **Dedicated Word Template Engines:** Libraries designed specifically to handle Open XML split runs (e.g., `docxtemplater` with proper run-lexing in Node.js, or structured DOM manipulation in Rust).

---

## 4. Word Formatting & Layout Preservation Criteria

To fulfill `REQ-003`, `REQ-006`, and `NFR-REL-01`, the Word document generation engine must strictly preserve:
1. **Letterhead Graphics & Shapes:** Facility crests and logos stored in `word/media/` and anchored in headers must remain intact with zero displacement or scaling distortion.
2. **Table Grid & Cell Border Geometry:** Fixed column widths, padding, shading, and cell alignment within tables must not collapse when long multi-line text is injected into cells.
3. **Multi-Paragraph Narrative Injection:** The incident narrative (`FLD-INC-NARRATIVE`) may span multiple paragraphs. Injecting newlines (`\n\n`) must produce proper Open XML paragraph nodes (`<w:p>`) or line breaks (`<w:br/>`), rather than producing raw escaped literal characters.
4. **Header and Footer Integrity:** Running headers, page numbers (`PAGE` of `NUMPAGES` fields), and confidentiality watermarks in `word/header1.xml` and `word/footer1.xml` must remain functional.

---

## 5. Word-Processing Risk Register

| Risk ID | Failure Description | Likelihood | Impact | Proposed Architectural Mitigation |
| :--- | :--- | :--- | :--- | :--- |
| **RSK-DOC-01** | **Split Run Token Miss:** Placeholders fail to replace due to Word XML run segmentation. | Very High (Raw regex) | Critical | Benchmark engines in Step 7 specifically against fragmented multi-run tokens. |
| **RSK-DOC-02** | **Table Cell Border Collapse:** Injecting dynamic text alters table column widths or removes borders. | Medium | High | Target cell inner paragraphs (`<w:p>`) rather than replacing cell structures. |
| **RSK-DOC-03** | **Header Logo Dropping:** Processing library purges `word/media/` or corrupts `[Content_Types].xml`. | Medium | High | Require Open XML ZIP-package level preservation libraries. |
| **RSK-DOC-04** | **Style Bleed:** Bold/Italic formatting on a placeholder bleeds into entire narrative block. | Medium | Moderate | Ensure replacement run inherits explicit run formatting attributes (`<w:rPr>`). |
| **RSK-DOC-05** | **Field Code Invalidation:** Word displays `Error! Bookmark not defined` on dynamic fields. | Low | High | Do not delete or orphan Word bookmark anchor nodes (`<w:bookmarkStart>`). |

---

## 6. Required Proof-of-Concept Test Scenarios for Step 7

The document-processing spike in Step 7 must validate candidate Word libraries against:
* **POC-DOC-01:** Replace single scalar placeholders (Date, Officer, Station) across fragmented XML runs; assert 100% replacement accuracy.
* **POC-DOC-02:** Inject a 500-word multi-paragraph narrative into `{{incident_narrative}}`; verify proper paragraph formatting and zero text truncation.
* **POC-DOC-03:** Populate a multi-row tabular section; verify table grid lines, column widths, and cell padding remain intact.
* **POC-DOC-04:** Verify that embedded header logos, page numbers (`PAGE`), and footer confidentiality notices are preserved.
* **POC-DOC-05:** Verify that the master `.docx` template remains byte-identical (SHA-256 hash match) before and after output generation.
