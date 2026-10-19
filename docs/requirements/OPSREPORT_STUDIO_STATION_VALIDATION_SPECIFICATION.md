# OpsReport Studio — Station Configuration Validation Specification

**Document Identifier:** VAL-STN-001  
**Project ID:** stationops-reporter  
**Approved Product Name:** OpsReport Studio  
**Lifecycle Step:** Step 3 of 45 (Station Sequence, Ordering & Configuration Specification)  
**Status:** Authoritative Validation Specification  
**Last Updated:** 2026-10-19  

---

## 1. Specification Scope & Safety Standards

This document establishes the comprehensive validation matrix, failure recovery behaviors, and referential integrity rules for station configuration in OpsReport Studio. 

### Core Safety Standards:
1. **Never Fabricate Fallback Ordering:** If station ordering is broken or ambiguous, the application must **block report generation** with an explicit diagnostic message. The application shall never silently fallback to alphabetical or random ordering.
2. **Atomic Configuration Updates:** Configuration updates must execute as an atomic transaction. A failed or corrupted configuration update must immediately rollback to the previous valid configuration state with zero partial data corruption.
3. **Draft Preservation Guarantee:** Validation failures that prevent document generation must not erase or discard an operator's in-progress form inputs.

---

## 2. Station Configuration Validation Matrix (14 Operational Scenarios)

| Scenario ID | Failure Description | Operational Impact | Detection Point | Recommended Message Category | Severity | Safe Recovery Behavior |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **STN-VAL-01** | **No station configuration exists.** | Reports cannot map station locations or render audit rows. | App Startup / Report Form Load | `Configuration Missing` | **BLOCK** | Display configuration prompt: *"No station sequence configured. Please import or configure the approved station catalog."* Prevent form submission. |
| **STN-VAL-02** | **Station list is empty (`count == 0`).** | Empty dropdowns, zero-row audit documents. | Configuration Load / Validation | `Configuration Incomplete` | **BLOCK** | Require at least 1 valid station before configuration activation. |
| **STN-VAL-03** | **Station name is missing, empty, or whitespace-only.** | Blank rows stamped into official audit documents. | Configuration Import / Save | `Invalid Station Name` | **BLOCK** | Highlight invalid line/field: *"Station name cannot be blank."* Require non-empty string. |
| **STN-VAL-04** | **Duplicate station names detected.** | Ambiguous audit entries; potential double-reporting. | Import / Configuration Save | `Duplicate Station Name` | **BLOCK** | Surface duplicates: *"Duplicate station name detected: '[Name]'. Station names must be unique."* Block activation. |
| **STN-VAL-05** | **Stored ordering is invalid (gaps, non-integers, duplicate orders).** | Non-deterministic row sequence in reports. | Configuration Verification | `Corrupted Sequence` | **BLOCK** | Auto-reindex proposal if sequence is deterministic, or prompt administrator to re-establish sequence order. |
| **STN-VAL-06** | **Source import file is malformed (invalid CSV/TXT/XLSX).** | Failed import, potential application crash. | Import File Parser | `File Format Error` | **BLOCK** | Safe parse abort: *"Unable to read station file. File is malformed or unreadable at line [X]."* Rollback to pre-import state. |
| **STN-VAL-07** | **Station configuration cannot be loaded (I/O error).** | Complete reporting freeze. | Application Boot / Cache Load | `Storage Access Error` | **BLOCK** | Surface OS permission / path diagnostic: *"Unable to read station configuration from disk. Please check file permissions."* |
| **STN-VAL-08** | **Saved configuration is damaged or corrupted (Checksum mismatch).** | Unpredictable station ordering. | Configuration Integrity Check | `Data Integrity Alert` | **BLOCK** | Reject damaged file. Restore automatic backup configuration if present, or flag administrative intervention required. |
| **STN-VAL-09** | **Report references a station no longer in the active configuration.** | Orphaned station data in old drafts or templates. | Draft Open / Form Validation | `Station Reference Obsolete` | **WARN / DRAFT-PERMIT** | Warn operator: *"Station '[Name]' is no longer in the active station list. Please re-assign location or verify draft."* |
| **STN-VAL-10** | **Report template contains pre-printed stations that mismatch approved list.** | Template-to-system sequence collision. | Template Import / Generation Pre-check | `Template-Sequence Mismatch` | **BLOCK / WARN** | Detail mismatch: *"Master template row order does not match approved station sequence at Row [X]."* Block compilation if ordering invariant violated. |
| **STN-VAL-11** | **Station configuration updated during active unfinished report session.** | Risk of inconsistent station sequence in output report. | Report Session Pre-Export Check | `Sequence Concurrency Notice` | **WARN (Session Pinned)** | Allow generation under the pinned session snapshot, but display notification of new configuration availability. |
| **STN-VAL-12** | **Configuration save or update operation is interrupted (Power failure/crash).** | Corrupted configuration file on disk. | Application Restart / File Recovery | `Configuration Recovery` | **RECOVER** | Atomic write pattern (write to `.tmp` file, then rename). If `.tmp` found, discard and maintain intact original. |
| **STN-VAL-13** | **Configuration change would unexpectedly alter output ordering.** | Operational disruption across historical tracking. | Admin Re-order Confirmation | `Administrative Confirmation` | **CONFIRMATION PROMPT** | Display before/after ordering diff: *"Changing station sequence will alter row order in all future reports. Confirm changes?"* |
| **STN-VAL-14** | **Station appears more than once in submitted inspection dataset.** | Double-audited station row collision. | Form Validation / Pre-Export | `Duplicate Submission` | **BLOCK** | Highlight repeated station in form: *"Station '[Name]' has been audited multiple times in this report."* |

---

## 3. Configuration Update Safety Architecture

To guarantee that the authoritative station sequence can never be partially written or corrupted:
1. **Staged Atomic Persistence:**
   ```
   [In-Memory Validated Sequence]
          │
          ▼
   [Write to temporary file: station_config.json.tmp]
          │
          ▼
   [Verify SHA-256 Checksum & Parse Validity]
          │
          ▼
   [Atomic Replace: station_config.json.tmp ──> station_config.json]
   ```
2. **Immutable Version Archive:**
   Prior to overwriting `station_config.json`, the existing file is automatically archived to `station_config.v[N].bak`.
3. **Zero In-Memory Partial State:**
   The active in-memory sequence reference is swapped only after the atomic filesystem replacement completes successfully.

---

## 4. Open Validation Decisions Pending Operational Input

1. **Station Name Case Sensitivity (`DEC-STN-01`):** Should station names allow distinct mixed-case entries (e.g., `"Station North"` vs. `"STATION NORTH"`), or is case-insensitive deduplication strictly mandated? `[PROVISIONAL RECOMMENDATION: Case-insensitive deduplication mandated]`.
2. **Retired Station Retention Period (`DEC-STN-02`):** How long should inactive/decommissioned stations remain visible in historical lookup tables before permanent archival? `[PROVISIONAL RECOMMENDATION: Retain indefinitely with is_active=false]`.
3. **Template Pre-Printed Station Override (`DEC-STN-03`):** If an existing legacy Excel template has hardcoded pre-printed station names that differ from the new authoritative list, does the system reject the template or attempt cell overwrite? `[Awaiting template inspection in Step 4]`.
