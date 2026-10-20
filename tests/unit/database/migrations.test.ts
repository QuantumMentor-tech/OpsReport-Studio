import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  runMigrations,
  getSchemaVersion,
  getAppliedMigrations,
  CURRENT_SCHEMA_VERSION,
} from '../../../src/storage/database/migrations/migrator.ts';
import { ErrorCode } from '../../../src/shared/errors/error-codes.ts';

describe('OpsReport Studio — Database Migrations Engine', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
  });

  afterEach(() => {
    if (db && db.open) {
      db.close();
    }
  });

  it('MIG-01: Applies schema migrations and updates PRAGMA user_version to CURRENT_SCHEMA_VERSION', () => {
    expect(getSchemaVersion(db)).toBe(0);

    const result = runMigrations(db);
    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.value.appliedCount).toBe(3);
      expect(result.value.currentVersion).toBe(CURRENT_SCHEMA_VERSION);
      expect(result.value.migrations).toHaveLength(3);
      expect(result.value.migrations[0].version).toBe(1);
      expect(result.value.migrations[0].name).toBe('001_initial_schema');
      expect(result.value.migrations[0].checksum).toHaveLength(64); // SHA-256 hex string
      expect(result.value.migrations[1].version).toBe(2);
      expect(result.value.migrations[1].name).toBe('002_category_lifecycle_and_template_metadata');
      expect(result.value.migrations[1].checksum).toHaveLength(64);
      expect(result.value.migrations[2].version).toBe(3);
      expect(result.value.migrations[2].name).toBe('003_report_session_and_draft_persistence');
      expect(result.value.migrations[2].checksum).toHaveLength(64);
    }

    expect(getSchemaVersion(db)).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('MIG-02: Repeated migration invocation on up-to-date database is a safe no-op', () => {
    const firstRun = runMigrations(db);
    expect(firstRun.ok).toBe(true);

    const secondRun = runMigrations(db);
    expect(secondRun.ok).toBe(true);
    if (secondRun.ok) {
      expect(secondRun.value.appliedCount).toBe(0);
      expect(secondRun.value.currentVersion).toBe(CURRENT_SCHEMA_VERSION);
    }
  });

  it('MIG-03: Rejects database with future unsupported schema version without data loss', () => {
    // Simulate database created by future version (e.g. version 99)
    db.pragma('user_version = 99');

    const result = runMigrations(db);
    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error.code).toBe(ErrorCode.PERSISTENCE_MIGRATION_ERROR);
      expect(result.error.userMessage).toContain('newer version');
    }

    // Verify user_version was preserved and not altered
    expect(getSchemaVersion(db)).toBe(99);
  });

  it('MIG-04: getAppliedMigrations returns empty array when table does not exist', () => {
    const records = getAppliedMigrations(db);
    expect(records).toEqual([]);
  });

  it('MIG-05: Safely upgrades database that already has migration 001 applied to latest schema', () => {
    // Manually run migration001
    const {
      migration001,
    } = require('../../../src/storage/database/migrations/001_initial_schema.ts');
    migration001.up(db);
    db.pragma('user_version = 1');

    // Run migration engine; should detect version 1 and apply migrations 002 and 003
    const result = runMigrations(db);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.appliedCount).toBe(2);
      expect(result.value.currentVersion).toBe(3);
      expect(result.value.migrations).toHaveLength(2);
      expect(result.value.migrations[0].version).toBe(2);
      expect(result.value.migrations[1].version).toBe(3);
    }

    expect(getSchemaVersion(db)).toBe(3);
  });

  it('MIG-06: Migration 003 safely upgrades database from version 2 to 3', () => {
    // Manually run migration001 and migration002
    const {
      migration001,
    } = require('../../../src/storage/database/migrations/001_initial_schema.ts');
    const {
      migration002,
    } = require('../../../src/storage/database/migrations/002_category_lifecycle_and_template_metadata.ts');
    migration001.up(db);
    migration002.up(db);
    db.pragma('user_version = 2');

    // Run migration engine; should apply migration 003
    const result = runMigrations(db);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.appliedCount).toBe(1);
      expect(result.value.currentVersion).toBe(3);
      expect(result.value.migrations[0].version).toBe(3);
    }

    expect(getSchemaVersion(db)).toBe(3);

    // Verify report_sessions and report_session_stations tables exist
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('report_sessions', 'report_session_stations')"
      )
      .all() as Array<{ name: string }>;
    expect(tables).toHaveLength(2);
  });
});
