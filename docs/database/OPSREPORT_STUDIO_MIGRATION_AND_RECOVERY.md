# OpsReport Studio — Database Migration & Recovery Guide

**Document Identifier:** REC-GUIDE-DB-001  
**Project ID:** stationops-reporter  
**Approved Product Name:** OpsReport Studio  
**Lifecycle Step:** Step 13 of 45 (SQLite Database Schema & Local Persistence Layer)  
**Status:** Authoritative Migration & Recovery Guide  
**Last Updated:** 2026-10-20  

---

## 1. Migration Architecture & Principles

OpsReport Studio manages schema evolution through a deterministic, forward-only migration pipeline (`src/storage/database/migrations/`).

### Invariants:
1. **Single Migration Authority:** SQLite's internal `PRAGMA user_version` register is synchronized with the `schema_migrations` audit table.
2. **Atomic Execution:** Every migration runs inside an isolated `BEGIN TRANSACTION` ... `COMMIT` block. If any statement fails, the entire transaction rolls back, leaving the database at the prior version.
3. **No Blind Data Destruction:** Production migrations must never execute `DROP TABLE` on user-populated operational tables without an explicit backup and data preservation strategy.
4. **Strict Downgrade Prevention:** If `PRAGMA user_version > CURRENT_CODE_VERSION`, the application refuses to open the database and halts with `ERR-DB-FUTURE-VERSION`, preventing schema corruption.

---

## 2. Migration Registry & File Naming Conventions

Migrations are located in `src/storage/database/migrations/` and registered in `ALL_MIGRATIONS` inside `migrator.ts`.

### Naming Pattern:
```
{version:3digits}_{semantic_name}.ts
```
Example: `001_initial_schema.ts`, `002_templates_schema.ts`.

### Migration Structure:
```typescript
import type { Migration } from './types.ts';

export const migration002: Migration = {
  version: 2,
  name: '002_templates_schema',
  description: 'Creates templates and template_mappings tables for Step 14 & 15.',
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS templates (
        template_id TEXT PRIMARY KEY,
        category_id TEXT NOT NULL REFERENCES report_categories(category_id),
        ...
      );
    `);
  },
};
```

---

## 3. Startup Migration Execution Flow

```
Application Startup
        │
        ▼
Resolve Database Path (%LOCALAPPDATA%\OpsReportStudio\Database\opsreport.db)
        │
        ▼
Open SQLite Connection with PRAGMAs (WAL, foreign_keys = ON)
        │
        ▼
Query PRAGMA user_version
        │
        ├── user_version === CURRENT_VERSION (1) ──> Schema Up-to-Date (0 ms, zero queries)
        │
        ├── user_version > CURRENT_VERSION (1)   ──> HALT STARTUP: Return Err(PERSISTENCE_MIGRATION_ERROR)
        │                                             (Future Version Downgrade Protection)
        │
        └── user_version < CURRENT_VERSION (1)   ──> For each pending migration:
                                                        │
                                                        ├── BEGIN TRANSACTION
                                                        ├── Execute migration.up(db)
                                                        ├── Compute SHA-256 Checksum
                                                        ├── INSERT INTO schema_migrations
                                                        ├── Set PRAGMA user_version = migration.version
                                                        │
                                                        ├── SUCCESS: COMMIT
                                                        └── FAILURE: ROLLBACK & Return Err(PERSISTENCE_MIGRATION_ERROR)
```

---

## 4. Disaster Recovery & Backup Precautions

### 4.1 Live Database Backup (SQLite Backup API)
Because OpsReport Studio operates in Write-Ahead Logging (`WAL`) mode, raw file copying of `opsreport.db` alone can produce inconsistent copies if uncheckpointed transactions reside in `opsreport.db-wal`.

* **Safe File Backup Protocol:**
  Before taking a manual snapshot of the database directory:
  1. Ensure the application is completely shut down.
  2. Copy `opsreport.db`, `opsreport.db-wal`, and `opsreport.db-shm` together.
  3. Or execute `PRAGMA wal_checkpoint(TRUNCATE);` before copying the `.db` file.

### 4.2 Handling Corrupted Databases
If an unrecoverable disk error or database corruption is detected:
1. **Never Silently Overwrite:** The application must never delete or overwrite an unreadable `.db` file with an empty database.
2. **Preserve Corrupt Artifact:** Move the corrupted file to `opsreport.db.corrupt_{timestamp}` for forensic inspection.
3. **Notify the Operator:** Present an explicit system error modal informing the operator that local persistence requires manual recovery or restoration from a valid operational backup.
