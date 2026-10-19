# OpsReport Studio — Station Ordering Test Specification

**Document Identifier:** TST-STN-001  
**Project ID:** stationops-reporter  
**Approved Product Name:** OpsReport Studio  
**Lifecycle Step:** Step 3 of 45 (Station Sequence, Ordering & Configuration Specification)  
**Status:** Authoritative Test Specification  
**Last Updated:** 2026-10-19  

---

## 1. Test Methodology & Scope Notice

This document establishes the official test cases for verifying station ordering, sequence preservation, configuration validation, and failure recovery in OpsReport Studio.

> [!IMPORTANT]
> **Execution Status Disclosure:** In accordance with professional engineering integrity and Section 17 / Section 18 of the Step 3 instructions, all test cases in this specification are documented for future implementation verification. In accordance with the current planning lifecycle stage, **Execution Status is marked as NOT RUN**. No false claims of test execution on non-existent code are made.

---

## 2. Test Case Register

### 2.1 Basic Sequence & Presentation Tests

| Test ID | Test Scenario | Preconditions | Test Action | Expected Result | Req ID | Execution Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **TC-STN-001** | **Preserve Configured Sequence in Form Selector** | Authoritative sequence configured with stations in non-alphabetical order (e.g., Station Delta [1], Station Alpha [2], Station Charlie [3]). | Open inspection form (`RPT-STATION-LIGHT`). | Station rows/selectors render strictly in the order: Delta (1), Alpha (2), Charlie (3). No alphabetical reordering occurs. | REQ-008, SPEC-STN-001 | **NOT RUN** |
| **TC-STN-002** | **Preserve Configured Sequence in Generated Output Document** | Multi-station audit data entered for ordered stations. | Execute document generation against Excel template. | Generated `.xlsx` output rows contain stations in exact sequence order `1..N`. | REQ-005, REQ-008 | **NOT RUN** |
| **TC-STN-003** | **Prohibit Inferred Alphabetical Sorting** | Active station sequence contains arbitrary names. | Trigger full form reload and view switching. | Inspect DOM elements and data arrays; assert array ordering strictly matches `sequence_order` index, not lexicographical sort. | REQ-008, SPEC-STN-001 | **NOT RUN** |
| **TC-STN-004** | **Search Filter Does Not Mutate Stored Sequence** | Active station list contains 20 stations. | In station selector, type "Central" to filter results; then clear filter text. | Filter displays matching subset; upon clearing filter, complete list restores in original sequence order `1..N` with zero index drift. | REQ-008, SPEC-STN-001 | **NOT RUN** |

---

### 2.2 Configuration Validation Tests

| Test ID | Test Scenario | Preconditions | Test Action | Expected Result | Req ID | Execution Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **TC-STN-005** | **Empty Configuration Generation Blocking** | Station configuration store contains 0 stations. | Operator selects `RPT-STATION-LIGHT` and attempts report creation. | System blocks form loading or generation with error: *"No station sequence configured. Please import approved station catalog."* | REQ-008, REQ-012 | **NOT RUN** |
| **TC-STN-006** | **Blank Station Name Rejection** | User imports or enters station list containing a blank string or whitespace-only name. | Attempt to validate and save station configuration. | Save is rejected with blocking error: *"Station name cannot be blank."* Configuration remains in un-activated draft state. | REQ-008, REQ-012 | **NOT RUN** |
| **TC-STN-007** | **Duplicate Station Name Detection** | Input list contains two entries with the name "Central Station" (or "central station"). | Attempt to validate and save configuration. | System detects duplicate, highlights conflicting rows, and blocks activation: *"Duplicate station name detected: 'Central Station'."* | REQ-008, REQ-012 | **NOT RUN** |
| **TC-STN-008** | **Non-Contiguous Sequence Ordering Detection** | Configuration input specifies sequence orders: `[1, 2, 4]` (missing index 3). | Run sequence integrity validator. | System flags ordering gap violation: *"Sequence order must be contiguous integers with no gaps."* Blocks activation. | REQ-008, VAL-STN-001 | **NOT RUN** |
| **TC-STN-009** | **Corrupted Configuration File Recovery** | Configuration JSON file on disk has broken syntax or invalid checksum. | Launch application and initialize station cache. | Application traps parsing exception, logs alert, blocks generation, and attempts to restore `station_config.bak` without crashing. | NFR-REL-01, REQ-012 | **NOT RUN** |
| **TC-STN-010** | **Atomic Update Rollback on Write Failure** | Simulated disk write error during station configuration update. | Trigger configuration update. | System aborts transaction, removes partial `.tmp` file, and keeps original active configuration 100% intact. | NFR-REL-02, VAL-STN-001 | **NOT RUN** |

---

### 2.3 Configuration Change & Consistency Tests

| Test ID | Test Scenario | Preconditions | Test Action | Expected Result | Req ID | Execution Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **TC-STN-011** | **Station Addition Preserves Existing Sequence Indices** | Active sequence has 10 stations (`1..10`). | Add new station at position 11 or insert at position 5. | If inserted at position 5, subsequent stations automatically shift to `6..11` contiguously. Zero duplicate sequence numbers. | REQ-008, CTR-STN-001 | **NOT RUN** |
| **TC-STN-012** | **Station Rename Does Not Break Historical Output Files** | Station "Old Name" used in previously generated report file `Report_001.xlsx`. | Administrator renames station to "New Name". | Pre-existing `Report_001.xlsx` file on disk remains completely byte-identical. Master template remains byte-identical. | REQ-006, SPEC-STN-001 | **NOT RUN** |
| **TC-STN-013** | **Draft Session Snapshot Isolation** | Operator starts inspection session under Sequence Version 1. | While session is open, administrator activates Sequence Version 2 with re-ordered stations. Operator clicks "Generate Report". | Report compiles successfully using Sequence Version 1 snapshot captured at session start. System displays notice of new configuration availability. | REQ-008, SPEC-STN-001 | **NOT RUN** |
| **TC-STN-014** | **Deactivated Station Handling in Drafts** | Saved draft references Station X. Prior to draft resumption, Station X is marked `is_active = false`. | Operator re-opens saved draft. | System opens draft and displays warning: *"Station X has been deactivated in the catalog. Review data before finalizing."* | REQ-008, REQ-012 | **NOT RUN** |

---

### 2.4 Integration & Output Tests

| Test ID | Test Scenario | Preconditions | Test Action | Expected Result | Req ID | Execution Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **TC-STN-015** | **Excel Multi-Station Table Row Order Alignment** | Excel master template contains 10 blank audit rows. Active sequence contains 10 stations. | Enter audit findings and generate report. | Inspect exported `.xlsx` cell values in column A (Station Name); assert values match sequence indices `1..10` exactly. | REQ-002, REQ-005, REQ-008 | **NOT RUN** |
| **TC-STN-016** | **Single Station Incident Document Population** | Operator selects "Station 04" in Security Incident Report (`RPT-INCIDENT`). | Generate Word document. | Exported `.docx` document binds "Station 04" to the specific location header/bookmark; no multi-station table injected. | REQ-003, REQ-007, REQ-008 | **NOT RUN** |
| **TC-STN-017** | **Template Pre-Printed Order Mismatch Detection** | Master Excel template contains hardcoded station names in order: `[Alpha, Beta, Gamma]`. Active configuration is: `[Alpha, Gamma, Beta]`. | Run template compatibility pre-check. | System detects sequence conflict at Row 2 and flags: *"Template station order mismatches active sequence."* | REQ-008, REQ-012 | **NOT RUN** |
