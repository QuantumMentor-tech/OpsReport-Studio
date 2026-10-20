# OpsReport Studio — Persistence Developer Guide

**Document Identifier:** DEV-GUIDE-DB-001  
**Project ID:** stationops-reporter  
**Approved Product Name:** OpsReport Studio  
**Lifecycle Step:** Step 13 of 45 (SQLite Database Schema & Local Persistence Layer)  
**Status:** Authoritative Developer Guide  
**Last Updated:** 2026-10-20  

---

## 1. Architecture & Driver Selection

OpsReport Studio employs **`better-sqlite3` (v11+)** as its local relational persistence engine.

### Why `better-sqlite3`?
1. **Synchronous Execution Model:** Operates directly within the Node.js process without thread-pool serialization bottlenecks or promise queue latency.
2. **Deterministic Durability:** Supports robust Write-Ahead Logging (`WAL`), immediate transactions (`db.transaction()`), and strict foreign key validation.
3. **In-Process Containment:** Zero external database server, network listener, or background service is required.

---

## 2. Database Location & Directory Resolution

The authoritative location of the production database file is:

```
Windows: %LOCALAPPDATA%\OpsReportStudio\Database\opsreport.db
```

### Resolution Logic (`src/storage/database/config.ts`)
* In production desktop mode: Resolves via `process.env.LOCALAPPDATA` or `path.join(os.homedir(), 'AppData', 'Local')`.
* Environment override: If `process.env.OPSREPORT_DB_PATH` is defined, the system respects the explicit override.
* Test mode: Isolated automated tests use `:memory:` or unique temporary folders created via `fs.mkdtempSync()`.
* **Prohibition on Network Storage:** The active database must never be opened over a CIFS/SMB network share. Database files reside strictly on local physical storage.

---

## 3. Database Initialization & Connection Management

All application components access persistence through the centralized `DatabaseManager`:

```typescript
import { DatabaseManager } from './storage/database/connection.ts';

// Initialize connection (creates directory, applies PRAGMAs, runs migrations)
const manager = new DatabaseManager();
const initResult = manager.initialize();

if (!initResult.ok) {
  console.error('Database failed to initialize:', initResult.error.userMessage);
  // Handle startup error through shared error model
  return;
}

// Access the initialized better-sqlite3 database instance
const db = manager.getDatabase();
```

### Mandatory PRAGMA Directives
Every connection automatically executes the following PRAGMAs:
```sql
PRAGMA journal_mode = WAL;          -- Write-Ahead Logging (file-backed only)
PRAGMA foreign_keys = ON;            -- Foreign key constraint enforcement
PRAGMA synchronous = NORMAL;         -- Durability with low write latency
PRAGMA busy_timeout = 5000;          -- Wait up to 5s before throwing SQLITE_BUSY
PRAGMA temp_store = MEMORY;          -- Temporary structures stored in RAM
PRAGMA cache_size = -2000;           -- 2 MB memory page cache
```

---

## 4. Repository Patterns & Parameterized SQL

All queries must reside inside dedicated repository classes (`src/storage/database/repositories/`).

### Critical Safety Rules:
1. **100% Parameterized Statements:**
   Never concatenate strings into SQL statements. Always use `?` parameter placeholders:
   ```typescript
   // CORRECT:
   const stmt = db.prepare('SELECT * FROM stations WHERE station_id = ?');
   const row = stmt.get(stationId);

   // FORBIDDEN (SQL Injection Risk):
   const stmt = db.prepare(`SELECT * FROM stations WHERE station_id = '${stationId}'`);
   ```
2. **Contiguous Station Ordering:**
   Queries must retrieve stations using `ORDER BY display_order ASC, created_at ASC`. Never rely on alphabetical sorting or default rowid ordering.
3. **Transaction Safety:**
   Multi-statement updates (such as reordering station sequences) must execute within a managed transaction:
   ```typescript
   const reorderTx = db.transaction(() => {
     for (let i = 0; i < orderedIds.length; i++) {
       updateStmt.run(i + 1, now, orderedIds[i]);
     }
   });
   reorderTx();
   ```
4. **Shared Result Pattern:**
   Every repository method must return `Result<T, AppError>`. Database exceptions are caught, logged safely without sensitive data, and mapped to `AppError`:
   ```typescript
   try {
     // Database operations...
     return Ok(result);
   } catch (err) {
     return Err(
       new AppError({
         code: ErrorCode.PERSISTENCE_FAILED,
         userMessage: 'Failed to update station order sequence.',
         details: { developerMessage: err instanceof Error ? err.message : String(err) },
         cause: err,
       })
     );
   }
   ```

---

## 5. Testing Guidelines

1. **Test Isolation:**
   Tests must never access the production database `%LOCALAPPDATA%\OpsReportStudio\Database\opsreport.db`.
2. **In-Memory Fixtures:**
   Use `:memory:` for lightweight unit testing:
   ```typescript
   const db = new Database(':memory:');
   db.pragma('foreign_keys = ON');
   runMigrations(db);
   const repo = new StationRepository(db);
   ```
3. **File-Backed Fixtures:**
   When testing file locking, WAL sidecar files, or directory creation, use temporary directories created with `fs.mkdtempSync(path.join(os.tmpdir(), 'opsreport-test-'))` and cleaned up in `afterEach`.
