# OpsReport Studio — Data & Operation Lifecycle Specification

**Document Identifier:** DATA-LIFE-001  
**Project ID:** stationops-reporter  
**Approved Product Name:** OpsReport Studio  
**Lifecycle Step:** Step 6 of 45 (Application Architecture, Module Boundaries & Security Model)  
**Status:** Authoritative Data Lifecycle Specification  
**Last Updated:** 2026-10-19  

---

## 1. Scope & Purpose

This specification defines the complete state transitions, persistence boundaries, integrity rules, failure recovery behaviors, and cross-resource reconciliation protocols for all core data entities in OpsReport Studio.

It governs the lifecycle of:
1. Master Template Files & Ingestion Artifacts.
2. Template Mapping Profiles & Version Bindings.
3. Authoritative Station Sequences & Session Snapshots.
4. Report Draft Sessions & Unfinished Form States.
5. Ephemeral Working Scratch Copies & Completed Output Reports.
6. The Embedded SQLite Database (`opsreport.db`).

---

## 2. Master Template Lifecycle

Master templates (`.xlsx` and `.docx`) represent the immutable structural foundation of OpsReport Studio (`REQ-004`, `REQ-006`).

```
┌──────────────┐     Select File     ┌──────────────┐   Security Check   ┌──────────────┐
│  Candidate   │ ──────────────────> │ Ingestion &  │ ─────────────────> │ Master Vault │
│  Local File  │                     │ Sanitization │                    │  (Immutable) │
└──────────────┘                     └──────────────┘                    └──────────────┘
                                            │ Fail                              │
                                            ▼                                   │ Read-Only
                                     ┌──────────────┐                           │ Clone
                                     │  Quarantine  │                           ▼
                                     │  / Rejection │                    ┌──────────────┐
                                     └──────────────┘                    │ Scratch Copy │
                                                                         └──────────────┘
```

### 2.1 State Transition Model
1. **Selection (`STATE_CANDIDATE`):** Operator selects a file via native Windows file dialog. The file resides in an arbitrary local folder.
2. **Ingestion & Quarantine Inspection (`STATE_INGESTING`):**
   * File is copied into a temporary quarantine buffer in memory.
   * `MOD-06` evaluates ZIP magic bytes, Zip bomb ceilings, Zip Slip paths, and macro presence (`vbaProject.bin`).
   * If any check fails $\rightarrow$ Transition to `STATE_REJECTED` (error reported, buffer destroyed).
3. **Vault Enrollment (`STATE_VAULTED`):**
   * File is moved into `%LOCALAPPDATA%\OpsReportStudio\Templates\{uuid}.{xlsx|docx}`.
   * Cryptographic SHA-256 fingerprint is calculated and stored in `templates` table in `opsreport.db`.
   * OS file attributes are set to Read-Only (`FILE_ATTRIBUTE_READONLY`).
4. **Active Operation (`STATE_ACTIVE`):**
   * Template is designated as the active default for its category.
   * Generation operations open the file strictly with `FileShare.Read` sharing flags to clone ephemeral scratch copies.
   * **In-place modification is architecturally impossible.**
5. **Deprecation & Deletion (`STATE_DEPRECATED` / `STATE_DELETED`):**
   * If a new template version is imported, the prior version transitions to `STATE_DEPRECATED`.
   * Existing historical generation records maintain foreign key references to the deprecated template record.
   * A template can only be physically unlinked from the Vault if no active drafts or locked operational policies depend on it.

---

## 3. Template Mapping Profile Lifecycle

Template mapping profiles associate abstract business field keys (e.g., `FLD-INC-DATE`) with physical document coordinates (Excel cell `B4` or Word token `{{incident_date}}`) (`REQ-009`).

### 3.1 State Transitions & Drift Detection
1. **Creation & Drafting (`MAP_DRAFT`):** Mapping profile created in `template_mappings` table.
2. **Validation & Cryptographic Binding (`MAP_VALIDATED`):**
   * Mapping profile is verified against the template's internal parts.
   * The template's SHA-256 content hash is recorded as `bound_template_hash`.
   * Transition to `MAP_ACTIVE`.
3. **Drift Detection on Generation:**
   * Before every generation job, `MOD-02` re-hashes the master template in the Vault.
   * If `current_hash !== bound_template_hash`:
     * The mapping is flagged `MAP_DRIFT_DETECTED`.
     * Generation halts with `ERR-MAP-TEMPLATE-DRIFT`.
     * The operator must review and confirm the updated mapping.

---

## 4. Authoritative Station Sequence Lifecycle

Enforces strict sequential consistency across multi-station operational inspection workflows (`REQ-008`).

```
┌─────────────────────────────────┐
│ Authoritative Station Baseline  │
│ (Seed Data / Confirmed Contract)│
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│ Active Station Store (SQLite)   │
│ Strict 1..N Ordinality Invariant│
└────────────────┬────────────────┘
                 │
                 ├───────────────────────────────┐
                 │ At Draft Creation             │ During Admin Update
                 ▼                               ▼
┌─────────────────────────────────┐    ┌─────────────────────────────────┐
│ Session Station Snapshot        │    │ Audited Sequence Revision       │
│ (Immutable for Draft Lifetime)  │    │ (Preserves Active Draft Links)  │
└─────────────────────────────────┘    └─────────────────────────────────┘
```

### 4.1 Lifecycle Stages
1. **Baseline Initialization:** Station records seeded from operational configuration into `stations` table with sequential `sequence_index` ($1, 2, \dots, N$).
2. **Active Runtime Query:** When an operator opens a multi-station inspection report, stations are loaded strictly ordered by `sequence_index ASC`.
3. **Session Snapshotting:**
   * To prevent an administrative station update from corrupting an active, unfinished inspection session, the orchestrator records a frozen JSON snapshot of the station list in `report_drafts.station_snapshot`.
   * If station configuration changes mid-session, the draft preserves its original sequence. Upon resumption, the operator is prompted with a non-destructive reconciliation banner.
4. **Update Governance:** Station updates require supervisor authorization (`DEC-017`). Gaps, duplicates, or arbitrary re-orderings are rejected by `MOD-04`.

---

## 5. Report Draft & Session Lifecycle

Governs the autosave and crash recovery mechanisms for unfinished report forms (`OPT-002`).

```
┌────────────────┐     Operator Input     ┌────────────────┐     Auto-Save      ┌────────────────┐
│  Form Created  │ ─────────────────────> │ Draft Active   │ ─────────────────> │ SQLite Stored  │
│ (Session Start)│                        │ (Dirty State)  │                    │ (WAL Committed)│
└────────────────┘                        └────────────────┘                    └────────────────┘
                                                  │                                     │
                                                  ├──────────────────────────┐          │
                                                  │ Operator Discards        │ Export   │ App Crash
                                                  ▼                          ▼ Success  ▼
                                          ┌────────────────┐         ┌────────────────┐ ┌────────────────┐
                                          │ Draft Deleted  │         │ Draft Closed   │ │ Crash Recovery │
                                          │ (Purged in DB) │         │ (History Log)  │ │ (Prompt Reload)│
                                          └────────────────┘         └────────────────┘ └────────────────┘
```

### 5.1 Autosave Timing & Storage Rules
* **Autosave Trigger:** Debounced write (1,500 ms after last keystroke) or when switching between form tab views.
* **Storage Target:** `report_drafts` table in `opsreport.db` containing:
  * `session_id` (UUIDv4)
  * `category_id` (e.g., `RPT-STATION-LIGHT`)
  * `form_payload_json` (Serialized form state)
  * `station_observations_json` (Multi-station grid state)
  * `last_modified_timestamp` (ISO-8601 UTC)
* **Lifecycle Termination:**
  * **On Successful Export:** The draft is deleted from `report_drafts` and a summary record is committed to `generation_history`.
  * **On Explicit Discard:** Draft row is immediately purged.
  * **On Crash:** Upon app restart, `MOD-02` queries `report_drafts`. Any existing drafts prompt the operator: *"Resume unfinished report from [Timestamp]?"*

---

## 6. Document Generation & Output File Lifecycle

The generation lifecycle executes across 9 distinct states, isolating untrusted inputs and enforcing master template immutability.

```
[INITIATED]
    │
    ▼
[VALIDATED] ───────────────> (Fail: Abort, Zero Artifacts)
    │
    ▼
[SCRATCH_CREATED] ─────────> (Fail: Delete Scratch, Preserve Form Data)
    │
    ▼
[WORKER_POPULATING] ───────> (Fail: Worker Crash -> Unlink Scratch, Log Error)
    │
    ▼
[SCRATCH_VALIDATED] ───────> (Fail: Structural Defect -> Unlink Scratch, Notify UI)
    │
    ▼
[COLLISION_CHECKED]
    │
    ▼
[ATOMIC_FINALIZED] ────────> (Fail: Target Unwritable -> Retain Scratch, Prompt Path)
    │
    ▼
[AUDIT_COMMITTED]
    │
    ▼
[COMPLETED]
```

### 6.1 State Definitions & Rollback Actions

| State | Action Performed | Rollback Behavior on Failure |
| :--- | :--- | :--- |
| `GEN_INITIATED` | Generation request received across IPC. | Return early error; zero filesystem activity. |
| `GEN_VALIDATED` | Category fields and station sequence validated. | Highlight form fields in UI; master untouched. |
| `GEN_SCRATCH_CREATED`| Master template cloned to `%LOCALAPPDATA%\Scratch\{jobId}.tmp`. | If clone fails (e.g. disk full), unlink partial scratch file; notify UI. |
| `GEN_WORKER_POPULATED`| Worker thread injects data and formulas into scratch file. | Worker crashes $\rightarrow$ Worker terminated, scratch unlinked, DB logged. |
| `GEN_SCRATCH_VALIDATED`| Scratch file inspected for ZIP integrity and non-zero size. | Corrupted ZIP $\rightarrow$ Unlink scratch; report `ERR-DOC-CORRUPTED`. |
| `GEN_COLLISION_RESOLVED`| Destination filename checked; collision policy applied. | File in use $\rightarrow$ Compute incremented filename (e.g. `_v2`). |
| `GEN_ATOMIC_FINALIZED`| Scratch file moved to user destination folder. | Target folder unwritable $\rightarrow$ Keep scratch in temp; prompt user for new path. |
| `GEN_AUDIT_COMMITTED`| Record written to `generation_history` in `opsreport.db`. | DB write fails $\rightarrow$ Report file remains safe on disk; warning logged. |
| `GEN_COMPLETED` | Return `GenerationResultDTO` to UI with success metrics. | Terminal successful state. |

---

## 7. Embedded Database Lifecycle (`opsreport.db`)

OpsReport Studio manages its structured storage using `better-sqlite3` in Write-Ahead Logging (`WAL`) mode.

### 7.1 Startup & Migration Lifecycle
```sql
-- Executed synchronously on application launch
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA synchronous = NORMAL;
PRAGMA busy_timeout = 5000;
```

1. **Schema Versioning (`PRAGMA user_version`):**
   * Migrations are ordered numerical scripts (`V1__baseline.sql`, `V2__drafts.sql`).
   * On startup, `MOD-09` checks `PRAGMA user_version`.
   * If `user_version < CURRENT_CODE_VERSION`, pending migrations execute within a single transaction.
   * If a migration fails, the transaction rolls back, preventing partial schema updates.
2. **Integrity Check:**
   * Periodically on startup, `PRAGMA quick_check` executes.
   * If corruption is detected, `opsreport.db` is backed up to `opsreport.db.corrupt.{timestamp}`, and a fresh database is initialized.

---

## 8. Cross-Resource Failure Recovery Matrix

Because SQLite database updates and host filesystem operations cannot share a distributed transaction coordinator, this matrix specifies the exact reconciliation protocol across 14 failure scenarios:

| Failure Scenario ID | Scenario Description | What State Changed | What Remained Unchanged | Can it be Retried? | Recovery Owner | User Communication |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **FAIL-01** | **Database Unavailable on Startup** | DB file locked or corrupted. | Master templates intact. | Yes (after unlock/reinit). | `MOD-09` | *"Database error encountered. Application safe-mode active."* |
| **FAIL-02** | **Master Template Disappears After Selection** | DB record exists; Vault file missing. | User draft intact. | No (requires re-import). | `MOD-05` | *"Selected template file is missing from Vault. Please re-import."* |
| **FAIL-03** | **Template Replaced After Mapping Approved** | Template hash changed. | Old mapping intact. | No (requires re-mapping).| `MOD-07` | *"Template structure has changed. Please update field mappings."* |
| **FAIL-04** | **Document Processing Engine Crashes** | Scratch copy partially modified. | Master template 100% safe. | Yes (Retry generation). | `MOD-02` | *"Document generation failed. Scratch copy cleared. You may retry."* |
| **FAIL-05** | **Output Target Directory Unwritable** | Scratch copy fully generated. | Master template safe. | Yes (Select new folder). | `MOD-10` | *"Cannot save to selected folder. Please choose a writable directory."* |
| **FAIL-06** | **Workstation Runs Out of Disk Space** | Partial scratch file written. | Master template safe. | Yes (after disk cleanup).| `MOD-10` | *"Insufficient disk space. Please free up space and retry."* |
| **FAIL-07** | **Operator Cancels Generation Mid-Flight** | Worker thread executing. | Master template safe. | Yes (Immediate retry). | `MOD-02` | *"Report generation cancelled. Working copy discarded."* |
| **FAIL-08** | **Application Terminated (Power Loss)** | Orphaned scratch file on disk. | Master template safe; draft in DB. | Yes (Resume draft). | `MOD-02` | Startup prompt: *"Unfinished report draft detected. Resume?"* |
| **FAIL-09** | **Report Draft Cannot Be Deserialized** | Corrupted draft JSON row. | Master template safe. | No (Discard corrupted row).| `MOD-02` | *"Draft could not be recovered. A new report has been initialized."* |
| **FAIL-10** | **Station Configuration Changed During Session**| Stations table updated in DB. | Draft has frozen snapshot. | Yes (Export with snapshot).| `MOD-04` | Non-blocking warning: *"Station list was modified since draft start."* |
| **FAIL-11** | **File Export Succeeds, DB Audit Write Fails** | Output file exists on disk. | DB missing history row. | No retry needed (file safe).| `MOD-02` | *"Report exported successfully. Local audit log update had a warning."* |
| **FAIL-12** | **Destination Collision on Export** | File with same name exists. | Scratch copy safe. | Yes (Auto-rename or prompt).| `MOD-10` | *"File already exists. Saved with incremented name: [Filename]_v2."* |
| **FAIL-13** | **Worker Returns Malformed Result** | Worker thread finished with error. | Master template safe. | Yes (Retry). | `MOD-02` | *"Document worker reported an unexpected formatting error."* |
| **FAIL-14** | **Application Restarts After Interrupted Run** | `PENDING` record in history table. | Incomplete output discarded.| Handled on startup. | `MOD-09` | Silent startup sweep cleans up scratch files older than 1 hour. |

---

## 9. Retention & Backup Decisions Requiring Approval

1. **Vault Automated Backup Destination (`DEC-018`):** An automated scheduled backup of `%LOCALAPPDATA%\OpsReportStudio\Templates\` to a secondary local or network drive is recommended but remains unconfirmed.
2. **Draft Purge Threshold:** Default policy purges autosaved drafts older than 30 days. Formal client data retention sign-off is pending.
