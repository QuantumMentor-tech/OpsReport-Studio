# OpsReport Studio — Database & Persistence Design Specification

**Document Identifier:** PERSIST-SPEC-001  
**Project ID:** stationops-reporter  
**Approved Product Name:** OpsReport Studio  
**Lifecycle Step:** Step 8 of 45 (Local Data Model, File Storage Strategy & Project Structure Design)  
**Status:** Authoritative Persistence Design Specification  
**Last Updated:** 2026-10-19  

> [!IMPORTANT]
> **PERSISTENCE DESIGN SPECIFICATION ONLY — NOT A DATABASE IMPLEMENTATION**  
> This document specifies database selection, connection parameters, migration policies, transaction boundaries, and indexing strategies. It does NOT execute SQL scripts, create `.db` files, or define production migration tables.

---

## 1. Database Engine Selection & Empirical Justification

OpsReport Studio adopts **`better-sqlite3` (v11+)** as its embedded local relational database engine (`STK-DB-001`, `ADR-OPSREPORT-001`).

### 1.1 Why SQLite and `better-sqlite3`?
1. **Zero-Configuration Embedded Engine:** Operates completely in-process within the Node.js main thread without requiring a separate database server process, Windows service, or port binding.
2. **Synchronous C++ Native Performance:** Unlike asynchronous wrapper libraries (`sqlite3`) that suffer from thread-pool serialization bottlenecks, `better-sqlite3` executes queries synchronously via direct V8 C++ bindings, delivering sub-millisecond query execution.
3. **Write-Ahead Logging (WAL) Mode:** Supports concurrent read operations while a write transaction is executing, preventing UI lockups and eliminating `SQLITE_BUSY` contention during autosave operations.
4. **Air-Gapped Privacy & Portability:** The entire application database resides in a single, portable file: `%LOCALAPPDATA%\OpsReportStudio\Database\opsreport.db`.

---

## 2. Connection Parameters & Runtime Configuration

Upon application launch, `MOD-09` initializes the database connection using the following mandatory PRAGMA directives:

```sql
-- Mandatory initialization sequence executed on every startup
PRAGMA journal_mode = WAL;          -- Enable Write-Ahead Logging for high concurrency
PRAGMA foreign_keys = ON;            -- Enforce relational foreign key constraints
PRAGMA synchronous = NORMAL;         -- Optimize write durability without sacrificing performance
PRAGMA busy_timeout = 5000;          -- Wait up to 5,000 ms on transient locks before throwing
PRAGMA cache_size = -2000;           -- Allocate 2,000 KB (2 MB) page cache memory
PRAGMA temp_store = MEMORY;          -- Store temporary tables and indexes in RAM
```

---

## 3. Relational Table Mappings & Schema Blueprint

The conceptual data model translates into 8 normalized relational tables:

```
┌────────────────────────────────────────────────────────────────────────┐
│ RELATIONAL DATABASE SCHEMA BLUEPRINT (opsreport.db)                    │
├────────────────────────────────────────────────────────────────────────┤
│ 1. report_categories     : Supported reporting categories (7 rows)     │
│ 2. stations              : Authoritative ordered station sequence      │
│ 3. templates             : Registered master templates in Vault        │
│ 4. template_mappings     : Field-to-cell & field-to-token mappings     │
│ 5. report_drafts         : Work-in-progress autosaved form sessions    │
│ 6. generation_history    : Audit log of document generation attempts   │
│ 7. generated_artifacts   : Metadata for finalized output reports       │
│ 8. app_settings          : Local user preferences (Theme, Export Path) │
└────────────────────────────────────────────────────────────────────────┘
```

### 3.1 Conceptual Table Specifications

#### Table: `report_categories`
* `category_id` (TEXT PRIMARY KEY) — e.g., `'RPT-INCIDENT'`, `'RPT-STATION-LIGHT'`.
* `display_name` (TEXT NOT NULL).
* `default_format` (TEXT NOT NULL) — `'EXCEL_XLSX'` or `'WORD_DOCX'`.
* `is_multi_station` (INTEGER NOT NULL DEFAULT 1).
* `description` (TEXT).

#### Table: `stations`
* `station_id` (TEXT PRIMARY KEY) — Stable UUID or operational code (e.g., `'STN-001'`).
* `sequence_index` (INTEGER NOT NULL UNIQUE) — Authoritative 1..N ordinal sequence index (`REQ-008`).
* `station_name` (TEXT NOT NULL).
* `is_active` (INTEGER NOT NULL DEFAULT 1).
* *Index:* `idx_stations_sequence` (`sequence_index ASC`).

#### Table: `templates`
* `template_id` (TEXT PRIMARY KEY) — UUIDv4.
* `category_id` (TEXT NOT NULL REFERENCES `report_categories(category_id)`).
* `template_name` (TEXT NOT NULL).
* `format` (TEXT NOT NULL) — `'EXCEL_XLSX'` or `'WORD_DOCX'`.
* `vault_relative_path` (TEXT NOT NULL UNIQUE).
* `sha256_fingerprint` (TEXT NOT NULL).
* `version` (INTEGER NOT NULL DEFAULT 1).
* `is_active_default` (INTEGER NOT NULL DEFAULT 0).
* `created_at` (TEXT NOT NULL).
* `status` (TEXT NOT NULL DEFAULT 'ACTIVE').
* *Index:* `idx_templates_category` (`category_id`, `is_active_default`).

#### Table: `template_mappings`
* `mapping_id` (TEXT PRIMARY KEY) — UUIDv4.
* `template_id` (TEXT NOT NULL REFERENCES `templates(template_id)` ON DELETE CASCADE).
* `bound_template_hash` (TEXT NOT NULL).
* `mapping_version` (INTEGER NOT NULL DEFAULT 1).
* `mapping_payload_json` (TEXT NOT NULL).
* `is_validated` (INTEGER NOT NULL DEFAULT 0).
* `updated_at` (TEXT NOT NULL).

#### Table: `report_drafts`
* `session_id` (TEXT PRIMARY KEY) — UUIDv4.
* `category_id` (TEXT NOT NULL REFERENCES `report_categories(category_id)`).
* `template_id` (TEXT REFERENCES `templates(template_id)`).
* `station_snapshot_json` (TEXT NOT NULL) — Frozen station sequence at session start (`DEC-025`).
* `form_data_json` (TEXT NOT NULL) — Serialized form fields.
* `station_observations_json` (TEXT NOT NULL) — Serialized station inspection rows.
* `session_state` (TEXT NOT NULL DEFAULT 'EDITING').
* `last_modified` (TEXT NOT NULL).

#### Table: `generation_history`
* `job_id` (TEXT PRIMARY KEY) — UUIDv4.
* `session_id` (TEXT REFERENCES `report_drafts(session_id)`).
* `template_id` (TEXT NOT NULL REFERENCES `templates(template_id)`).
* `status` (TEXT NOT NULL) — `'PENDING'`, `'PROCESSING'`, `'COMPLETED'`, `'FAILED'`, `'INTERRUPTED'`.
* `scratch_path` (TEXT).
* `target_path` (TEXT).
* `start_time` (TEXT NOT NULL).
* `completed_time` (TEXT).
* `error_message` (TEXT).
* *Index:* `idx_generation_status` (`status`, `start_time`).

#### Table: `generated_artifacts`
* `artifact_id` (TEXT PRIMARY KEY) — UUIDv4.
* `job_id` (TEXT NOT NULL REFERENCES `generation_history(job_id)` ON DELETE CASCADE).
* `category_id` (TEXT NOT NULL).
* `final_file_path` (TEXT NOT NULL).
* `file_size_bytes` (INTEGER NOT NULL).
* `output_sha256` (TEXT NOT NULL).
* `generated_at` (TEXT NOT NULL).

#### Table: `app_settings`
* `setting_key` (TEXT PRIMARY KEY).
* `setting_value` (TEXT NOT NULL).
* `last_updated` (TEXT NOT NULL).

---

## 4. Schema Versioning & Migration Policy

Schema updates are managed deterministically using SQLite's internal version register (`PRAGMA user_version`):

```
Application Startup
        │
        ▼
Read PRAGMA user_version
        │
        ├── user_version === CURRENT_VERSION ──> Ready (Zero Migrations Needed)
        │
        └── user_version < CURRENT_VERSION   ──> Begin Transaction:
                                                   │
                                                   ├── Execute V{N+1}__migration.sql
                                                   ├── Set PRAGMA user_version = N+1
                                                   │
                                                   ├── SUCCESS: Commit Transaction
                                                   └── FAILURE: Rollback & Halt Startup
```

### 4.1 Migration Invariants
1. **Idempotency & Atomicity:** Every migration executes inside an explicit `BEGIN TRANSACTION` ... `COMMIT` block. If any migration statement fails, the entire transaction rolls back, preventing partially migrated schemas.
2. **Zero In-Place Destruction:** Production migrations must never execute `DROP TABLE` on tables containing user operational history or draft sessions without explicit data preservation.
3. **Downgrade Safety:** If `user_version > CURRENT_CODE_VERSION` (indicating an older application build opening a newer database), the application halts with an explicit compatibility error (`ERR-DB-FUTURE-VERSION`) rather than corrupting newer schema structures.

---

## 5. Cross-Resource Consistency (Two-Phase Reservation Pattern)

Because SQLite transactions and host filesystem operations cannot execute inside a single distributed transaction, the system enforces a **Two-Phase Reservation Pattern** (`DEC-023`):

```
Phase 1: Reserve in SQLite
   • INSERT INTO generation_history (job_id, status) VALUES (uuid, 'PENDING');
   • Commit SQLite transaction.

Phase 2: Perform Filesystem Operations
   • Clone master template into %LOCALAPPDATA%\Scratch\{jobId}.tmp.
   • Worker thread populates Open XML structures.
   • Verify output ZIP package integrity.
   • Atomically move scratch file to user target directory.

Phase 3: Confirm in SQLite
   • UPDATE generation_history SET status = 'COMPLETED', completed_time = now() WHERE job_id = uuid;
   • INSERT INTO generated_artifacts (artifact_id, job_id, ...) VALUES (...);
   • DELETE FROM report_drafts WHERE session_id = currentSessionId;
   • Commit SQLite transaction.

Startup Crash Reconciliation:
   • During app launch, query: SELECT * FROM generation_history WHERE status = 'PENDING';
   • Any pending records are updated to 'INTERRUPTED'.
   • Associated scratch files in %LOCALAPPDATA%\Scratch\ are safely unlinked.
```

---

## 6. Performance & Capacity Analysis

* **Database Size Ceiling:** Total relational metadata for 5 years of daily operational reporting (approx. 1,800 reports, 7 categories, 100 stations, and drafts) is estimated at **< 15 MB**.
* **Page Cache Allocation:** `PRAGMA cache_size = -2000` allocates 2 MB of RAM for SQLite page cache, ensuring that 100% of the active database working set resides in memory.
* **Query Latency:** With indexes on `sequence_index`, `category_id`, and `status`, all operational SELECT queries execute in **under 1.0 ms**.
