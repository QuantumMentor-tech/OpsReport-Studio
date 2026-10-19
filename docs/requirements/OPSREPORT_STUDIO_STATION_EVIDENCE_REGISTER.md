# OpsReport Studio — Station Configuration Evidence Register

**Document Identifier:** REG-STN-001  
**Project ID:** stationops-reporter  
**Approved Product Name:** OpsReport Studio  
**Lifecycle Step:** Step 3 of 45 (Station Sequence, Ordering & Configuration Specification)  
**Status:** Active Discovery Register  
**Last Updated:** 2026-10-19  

---

## 1. Register Scope & Purpose

This register documents all physical evidence, artifacts, and user inputs concerning the station list, station ordering, station codes, and operational routes for OpsReport Studio. It formally distinguishes confirmed operational facts from pending user data, identifying which engineering decisions block subsequent implementation steps and which may be safely deferred.

---

## 2. Evidence Audit Findings

| Evidence Category | Target Information | Physical Evidence Located in Workspace? | Status | Governance Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Station List** | Names of operational stations | **NO (Absent)** | Pending User Delivery | In accordance with core principles, **no station names have been invented**. |
| **Station Ordering** | Canonical ordinal sequence of stations | **NO (Absent)** | Pending User Delivery | Awaiting official ordered list from user/operations. |
| **Station Codes** | Official shortcodes / telegraphic IDs | **NO (Absent)** | Optional / Unconfirmed | Property supported as optional in data contract; not required for V1 if customer does not use codes. |
| **Route / Zone Structure**| Multi-route partitioning | **NO (Absent)** | Single Sequence Baseline | Core scope is single sequence (Option A); contract includes optional route tags. |
| **Report Station Templates**| Pre-printed station rows in Excel/Word | **NO (Absent)** | Pending Template Inspection | Awaiting master templates in Step 4. |

---

## 3. Documents & Artifacts Inspected During Audit

1. **Step 1 Baseline (`OPSREPORT_STUDIO_REQUIREMENTS_BASELINE.md`):**
   * Confirmed explicit user mandate: *"Station names must be selectable or supplied automatically in the correct order. The authoritative station list will be provided later."* (Section 3.1, Item 7; `REQ-008`).
2. **Step 1 Decision Register (`OPSREPORT_STUDIO_DECISION_REGISTER.md`):**
   * Confirmed `DEC-009` (Authoritative Station Catalog Source): Status is `OPEN / PENDING USER INPUT`.
   * Confirmed `DEC-010` (Multi-Zone / Route Variations): Status is `OPEN / PENDING INPUT`.
3. **Step 2 Report Catalogue (`OPSREPORT_STUDIO_REPORT_CATALOG.md`):**
   * Established that 6 inspection report categories (`RPT-STATION-LIGHT`, `RPT-FAN`, `RPT-POLE-LIGHT`, `RPT-FIRE-EXTINGUISHER`, `RPT-PILLAR`, `RPT-FENCE`) require sequential multi-station row data.
   * Established that `RPT-INCIDENT` requires a single station location selection.
4. **Step 2 Data Requirements Matrix (`OPSREPORT_STUDIO_DATA_REQUIREMENTS_MATRIX.md`):**
   * Cross-verified that `FLD-COM-STATION` is universal across all 7 categories.

---

## 4. Multi-Sequence Justification Analysis

* **Question:** Is there operational evidence justifying multiple independent station sequences in V1?
* **Finding:** No operational evidence or user requirement currently mandates multiple independent routes. The control room brief specifically states *"a station list in a specific order"*.
* **Risk Evaluation:** Introducing multiple routes adds unnecessary UI overhead (route selection modals, route configuration screens) and complicates validation.
* **Architectural Determination:** Single authoritative sequence adopted as baseline (`SPEC-STN-001`). Schema preserves future extensibility via optional `route_tag` property.

---

## 5. Decision & Dependency Classification

### 5.1 Decisions Blocking Later Steps

| Blocker ID | Unresolved Decision | Dependent Lifecycle Step | Resolution Path |
| :--- | :--- | :--- | :--- |
| **BLK-STN-01** | **Authoritative Station List Delivery:** Ingestion of the actual station names and their exact sequence order. | Step 14 (Station Domain Implementation) & Step 30 (E2E Integration) | User/operations supplies station list (CSV, TXT, Excel, or JSON). |
| **BLK-STN-02** | **Template Pre-Printed Station Structure:** Verifying whether customer templates contain hardcoded station names or dynamic blank rows. | Step 4 (Real Template Inspection) & Step 11 (Excel Engine) | User provides sample master templates. |

### 5.2 Decisions Safely Deferred (Non-Blocking)

| Deferral ID | Topic | Why It Can Be Safely Deferred |
| :--- | :--- | :--- |
| **DEF-STN-01** | **Operational Station Codes (`station_code`):** Whether stations have official telegraphic shortcodes. | Data contract supports optional codes; system operates seamlessly with display names alone. |
| **DEF-STN-02** | **Multi-Route Scheduling:** Support for distinct Northbound vs. Southbound inspection schedules. | Core baseline operates on a single master loop/line; multi-route extensions can be layered post-V1. |
| **DEF-STN-03** | **GIS / Geographic Coordinates:** Latitude/Longitude of stations. | Unnecessary for tabular Excel and Word report compilation. |
