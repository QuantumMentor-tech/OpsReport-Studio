# OpsReport Studio — Data Lifecycle & Recovery Specification

**Document Identifier:** DATA-LIFE-REC-001  
**Project ID:** stationops-reporter  
**Approved Product Name:** OpsReport Studio  
**Lifecycle Step:** Step 8 of 45 (Local Data Model, File Storage Strategy & Project Structure Design)  
**Status:** Authoritative Data Lifecycle & Recovery Specification  
**Last Updated:** 2026-10-19  

---

## 1. Scope & System Lifecycle Architecture

This specification defines the comprehensive state transitions, data retention rules, deletion policies, and failure recovery protocols across all operational information classes in OpsReport Studio.

It governs the lifecycle of:
1. **Master Templates:** Ingestion, Vault enrollment, active utilization, and retirement.
2. **Template Mapping Profiles:** Schema binding, versioning, drift detection, and retirement.
3. **Station Sequences:** Baseline initialization, session snapshotting, and audited reconfiguration.
4. **Report Draft Sessions:** Debounced autosaving, form editing, resumption, and closure.
5. **Document Generation Operations:** Two-phase execution, scratch file isolation, and finalization.
6. **Generated Output Artifacts:** Export verification, collision handling, and archival.

---

## 2. Master Template & Mapping Lifecycles

### 2.1 Master Template State Machine

```
[Candidate File] 
       │
       ▼ (Ingestion & Quarantine Inspection: Zip bomb, Zip slip, Macro check)
[Quarantine Evaluation] ──(Fail: Macro/Exploit)──> [Quarantined / Rejected]
       │
       ▼ (Pass: SHA-256 Calculated, Read-Only Flag Set)
[Vault Enrolled]
       │
       ▼ (Designated as Category Default)
[Active Operational Template] ──(Cloned for Generation)──> [Read-Only Cloned Stream]
       │
       ▼ (New Template Version Imported)
[Deprecated Template] ──(Audited Deletion)──> [Retired / Unlinked]
```

* **Candidate File:** External `.xlsx` or `.docx` selected by operator via native file dialog.
* **Quarantine Evaluation:** In-memory inspection by `MOD-06`. If `vbaProject.bin` is found or decompression ratio exceeds 15:1, the file is rejected with an actionable advisory (`DEC-005`).
* **Vault Enrolled:** Moved to `%LOCALAPPDATA%\OpsReportStudio\Templates\{uuid}.{xlsx|docx}` with OS `FILE_ATTRIBUTE_READONLY` set. SHA-256 hash is recorded in `templates` table.
* **Active Operational Template:** Master files are opened strictly in read-only sharing mode (`FileShare.Read`) to clone ephemeral scratch copies. In-place modification is blocked at the OS and application boundary.
* **Deprecation & Retirement:** When a new template is imported for the same category, the existing template is marked `DEPRECATED`. Historical generation records maintain foreign key references. A template file is physically deleted from the Vault only if no active drafts reference it.

### 2.2 Template Mapping Lifecycle & Drift Detection
1. **Drafting:** A `TemplateMappingProfile` is configured in `template_mappings` table.
2. **Binding:** The mapping is validated against the template parts and bound to `bound_template_hash`.
3. **Drift Detection:** Prior to report generation, `MOD-02` re-computes the master template's SHA-256 hash. If `current_hash !== bound_template_hash`, generation halts with `ERR-MAP-DRIFT-DETECTED`, prompting an administrative mapping review (`DEC-025`).

---

## 3. Station Configuration & Draft Session Lifecycles

### 3.1 Authoritative Station Sequence Lifecycle
* **Baseline Initialization:** Station records seeded into `stations` table with sequential `sequence_index` ($1, 2, \dots, N$).
* **Draft Snapshotting (`DEC-025`):** When an operator starts a multi-station inspection report, the orchestrator serializes a frozen snapshot of the active station list into `report_drafts.station_snapshot_json`.
* **Schema Drift Protection:** If an administrator reconfigures the master station sequence during an active shift, the draft retains its frozen snapshot, guaranteeing that row indices and station names remain 100% stable during report preparation.

### 3.2 Report Draft Session Lifecycle
```
[User Clicks "New Report"]
       │
       ▼
[Session Initialized] (UUID generated, station snapshot frozen)
       │
       ▼
[Active Editing] <──(Debounced Autosave: 1,500 ms)──> [SQLite Committed (WAL)]
       │
       ├─────────────────────────────────────────┐
       ▼ (Operator Clicks "Export")              ▼ (Operator Clicks "Discard")
[Generating Document]                      [Draft Purged from DB]
       │
       ▼ (Generation Succeeded)
[Draft Closed & Purged] ──> [Summary Logged to History]
```

* **Autosave Frequency:** Form inputs are debounced and persisted to `report_drafts` in SQLite 1,500 ms after the last user keystroke.
* **Crash Recovery Protocol:** Upon application launch, `MOD-02` queries `report_drafts`. Any existing drafts display a prominent dashboard banner: *"Resume unfinished report from [Timestamp]?"*

---

## 4. Deletion vs. Retirement Rules

OpsReport Studio enforces non-destructive data governance:

| Information Class | Action | Database Consequence | Filesystem Consequence |
| :--- | :--- | :--- | :--- |
| **Report Category** | Retirement | `is_active = 0` (Hidden from UI creation catalog). | No files affected. Existing historical records preserved. |
| **Station Node** | Retirement | `is_active = 0` (Omitted from new audit routes). | Historical audits retain station references; zero data loss. |
| **Master Template** | Retirement | Status updated to `'DEPRECATED'`. | File remains in Vault for historical reference; write-protected. |
| **Master Template** | Hard Delete | Allowed ONLY if zero active drafts or history rows reference it. | File securely unlinked from `%LOCALAPPDATA%\Templates\`. |
| **Template Mapping**| Deletion | Record removed; template marked unmapped. | Master template file remains untouched. |
| **Report Draft** | Discard | Row deleted from `report_drafts`. | No external document files affected. |
| **Generated Report**| Deletion | DB history retains reference; flags `file_missing = 1` if deleted on disk. | User or OS deletes output file in user target directory. |
| **Temporary Scratch**| Purge | `generation_history.scratch_path` set to NULL. | Ephemeral `.tmp` file securely unlinked from `%LOCALAPPDATA%\Scratch\`. |

---

## 5. Failure Recovery Matrix across 10 Operational Scenarios

| Scenario ID | Failure Scenario | State Affected | State Preserved | Detection Mechanism | Recovery Owner | Actionable User Guidance |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **REC-01** | **Master Template Missing from Vault** | DB template record valid. | User draft session intact in SQLite. | File existence check fails before scratch copy. | `MOD-05` (Template Registry) | *"Master template file missing from Vault. Please re-import template."* |
| **REC-02** | **Document Processing Engine Crash** | Scratch file partially modified. | Master template safe; user draft intact. | Worker thread throws uncaught error / OOM. | `MOD-02` (Orchestrator) | *"Document generation failed. Scratch copy cleared. You may retry."* |
| **REC-03** | **Target Output Folder Write-Protected** | Generation succeeded in scratch. | Scratch file retained in temp; master safe. | `fs.copyFile` / atomic move throws `EACCES`. | `MOD-10` (File Manager) | *"Cannot write to target folder. Please choose a writable export directory."* |
| **REC-04** | **Power Loss Mid-Generation** | Scratch file abandoned; DB `PENDING`. | Master template safe; draft intact in DB. | Startup sweep detects `status = 'PENDING'` and orphaned `.tmp`. | `MOD-09` (Persistence) | Automatic cleanup; dashboard prompts: *"Resume unfinished report?"* |
| **REC-05** | **Disk Space Exhaustion During Generation** | Incomplete scratch write. | Master template safe; draft intact in DB. | Worker throws `ENOSPC`. | `MOD-10` (File Manager) | *"Insufficient disk space to generate report. Please free up disk space."* |
| **REC-06** | **Destination Filename Collision** | File exists with same name. | Scratch file intact. | `fs.existsSync(targetPath) === true`. | `MOD-10` (File Manager) | Auto-renames to `[Name]_v2.xlsx` under `RENAME_SAFE` policy (`DEC-021`). |
| **REC-07** | **Operator Cancels Generation Mid-Flight** | Worker thread running. | Master template safe; draft intact. | User clicks Cancel modal. | `MOD-02` (Orchestrator) | Worker thread terminated; scratch unlinked; return to form editor. |
| **REC-08** | **Corrupted Draft Data in SQLite** | Draft JSON cannot parse. | Master template safe. | JSON parse exception on draft load. | `MOD-02` (Orchestrator) | *"Draft corrupted. Initializing fresh form session."* |
| **REC-09** | **Station List Reconfigured Mid-Draft** | Stations table updated. | Draft preserves frozen snapshot. | Snapshot comparison during draft load. | `MOD-04` (Station Domain) | Non-blocking advisory: *"Station list modified since draft creation."* |
| **REC-10** | **Database File Corrupted on Startup** | `opsreport.db` corrupt. | Master templates safe in Vault. | `PRAGMA quick_check` fails on startup. | `MOD-09` (Persistence) | Database backed up to `.corrupt`; fresh database initialized. |
