import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DatabaseManager } from '../../../src/storage/database/connection.ts';
import {
  getSchemaVersion,
  CURRENT_SCHEMA_VERSION,
} from '../../../src/storage/database/migrations/migrator.ts';

describe('OpsReport Studio — Database Initialization & Configuration', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opsreport-db-init-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Safe cleanup ignore if still locked on Windows
      }
    }
  });

  it('DBI-01: Initializes fresh file-backed database and creates schema version 3', () => {
    const dbPath = path.join(tempDir, 'test_fresh.db');
    const manager = new DatabaseManager({ databasePath: dbPath });

    const initResult = manager.initialize();
    expect(initResult.ok).toBe(true);
    expect(manager.isOpen()).toBe(true);

    const db = manager.getDatabase();
    expect(getSchemaVersion(db)).toBe(CURRENT_SCHEMA_VERSION);

    // Verify tables exist
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('schema_migrations', 'report_categories', 'stations', 'app_settings', 'template_metadata', 'report_sessions', 'report_session_stations')"
      )
      .all() as Array<{ name: string }>;

    expect(tables).toHaveLength(7);
    manager.close();
    expect(manager.isOpen()).toBe(false);
  });

  it('DBI-02: Enforces authoritative PRAGMAs (foreign keys, synchronous, busy_timeout)', () => {
    const dbPath = path.join(tempDir, 'test_pragmas.db');
    const manager = new DatabaseManager({ databasePath: dbPath });

    const initResult = manager.initialize();
    expect(initResult.ok).toBe(true);

    const db = manager.getDatabase();

    // foreign_keys must be ON (1)
    const fk = db.pragma('foreign_keys', { simple: true });
    expect(fk).toBe(1);

    // synchronous should be NORMAL (1)
    const sync = db.pragma('synchronous', { simple: true });
    expect(sync).toBe(1);

    // busy_timeout should be 5000 ms
    const timeout = db.pragma('busy_timeout', { simple: true });
    expect(timeout).toBe(5000);

    // temp_store should be MEMORY (2)
    const tempStore = db.pragma('temp_store', { simple: true });
    expect(tempStore).toBe(2);

    manager.close();
  });

  it('DBI-03: Disk-backed database enables Write-Ahead Logging (WAL) mode', () => {
    const dbPath = path.join(tempDir, 'test_wal.db');
    const manager = new DatabaseManager({ databasePath: dbPath });

    const initResult = manager.initialize();
    expect(initResult.ok).toBe(true);

    const db = manager.getDatabase();
    const journalMode = db.pragma('journal_mode', { simple: true });
    expect(journalMode).toBe('wal');

    manager.close();
  });

  it('DBI-04: Repeat initialization is idempotent and preserves existing data', () => {
    const dbPath = path.join(tempDir, 'test_idempotent.db');

    // Run 1: Initialize and insert a setting
    const manager1 = new DatabaseManager({ databasePath: dbPath });
    expect(manager1.initialize().ok).toBe(true);
    manager1
      .getDatabase()
      .prepare(
        "INSERT INTO app_settings (setting_key, setting_value, updated_at) VALUES ('test_key', 'test_val', '2026-10-20')"
      )
      .run();
    manager1.close();

    // Run 2: Reopen same database
    const manager2 = new DatabaseManager({ databasePath: dbPath });
    expect(manager2.initialize().ok).toBe(true);
    const row = manager2
      .getDatabase()
      .prepare("SELECT setting_value FROM app_settings WHERE setting_key = 'test_key'")
      .get() as { setting_value: string };

    expect(row).toBeDefined();
    expect(row.setting_value).toBe('test_val');
    manager2.close();
  });

  it('DBI-05: In-memory database initializes cleanly for isolated tests', () => {
    const manager = new DatabaseManager({ databasePath: ':memory:' });
    expect(manager.initialize().ok).toBe(true);
    expect(manager.getPath()).toBe(':memory:');

    const db = manager.getDatabase();
    expect(getSchemaVersion(db)).toBe(CURRENT_SCHEMA_VERSION);
    manager.close();
  });

  it('DBI-06: DatabaseManager exposes transaction helper that commits on success and rolls back on error', () => {
    const manager = new DatabaseManager({ databasePath: ':memory:' });
    expect(manager.initialize().ok).toBe(true);

    // Successful transaction
    manager.transaction(() => {
      manager
        .getDatabase()
        .prepare(
          "INSERT INTO app_settings (setting_key, setting_value, updated_at) VALUES ('tx_key', 'ok', '2026')"
        )
        .run();
    });

    const checkRow = manager
      .getDatabase()
      .prepare("SELECT setting_value FROM app_settings WHERE setting_key = 'tx_key'")
      .get() as { setting_value: string };
    expect(checkRow.setting_value).toBe('ok');

    // Failed transaction rolls back
    expect(() => {
      manager.transaction(() => {
        manager
          .getDatabase()
          .prepare(
            "INSERT INTO app_settings (setting_key, setting_value, updated_at) VALUES ('tx_key_2', 'rolled_back', '2026')"
          )
          .run();
        throw new Error('Simulated failure inside transaction');
      });
    }).toThrow('Simulated failure inside transaction');

    const checkRolledBack = manager
      .getDatabase()
      .prepare("SELECT setting_value FROM app_settings WHERE setting_key = 'tx_key_2'")
      .get();
    expect(checkRolledBack).toBeUndefined();

    manager.close();
  });
});
