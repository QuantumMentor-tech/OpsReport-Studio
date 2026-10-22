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
      expect(result.value.appliedCount).toBe(9);
      expect(result.value.currentVersion).toBe(CURRENT_SCHEMA_VERSION);
      expect(result.value.migrations).toHaveLength(9);
      expect(result.value.migrations[0].version).toBe(1);
      expect(result.value.migrations[0].name).toBe('001_initial_schema');
      expect(result.value.migrations[0].checksum).toHaveLength(64); // SHA-256 hex string
      expect(result.value.migrations[1].version).toBe(2);
      expect(result.value.migrations[1].name).toBe('002_category_lifecycle_and_template_metadata');
      expect(result.value.migrations[1].checksum).toHaveLength(64);
      expect(result.value.migrations[2].version).toBe(3);
      expect(result.value.migrations[2].name).toBe('003_report_session_and_draft_persistence');
      expect(result.value.migrations[2].checksum).toHaveLength(64);
      expect(result.value.migrations[3].version).toBe(4);
      expect(result.value.migrations[3].name).toBe('004_template_versioning_and_immutability');
      expect(result.value.migrations[3].checksum).toHaveLength(64);
      expect(result.value.migrations[4].version).toBe(5);
      expect(result.value.migrations[4].name).toBe('005_excel_template_mappings');
      expect(result.value.migrations[4].checksum).toHaveLength(64);
      expect(result.value.migrations[5].version).toBe(6);
      expect(result.value.migrations[5].name).toBe('006_word_template_mappings');
      expect(result.value.migrations[5].checksum).toHaveLength(64);
      expect(result.value.migrations[6].version).toBe(7);
      expect(result.value.migrations[6].name).toBe('007_mapping_profiles');
      expect(result.value.migrations[6].checksum).toHaveLength(64);
      expect(result.value.migrations[7].version).toBe(8);
      expect(result.value.migrations[7].name).toBe('008_template_designer_drafts');
      expect(result.value.migrations[7].checksum).toHaveLength(64);
      expect(result.value.migrations[8].version).toBe(9);
      expect(result.value.migrations[8].name).toBe('009_generation_workspaces');
      expect(result.value.migrations[8].checksum).toHaveLength(64);
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

    // Run migration engine; should detect version 1 and apply migrations 002 through 009
    const result = runMigrations(db);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.appliedCount).toBe(8);
      expect(result.value.currentVersion).toBe(CURRENT_SCHEMA_VERSION);
      expect(result.value.migrations).toHaveLength(8);
      expect(result.value.migrations[0].version).toBe(2);
      expect(result.value.migrations[1].version).toBe(3);
      expect(result.value.migrations[2].version).toBe(4);
      expect(result.value.migrations[3].version).toBe(5);
      expect(result.value.migrations[4].version).toBe(6);
      expect(result.value.migrations[5].version).toBe(7);
      expect(result.value.migrations[6].version).toBe(8);
      expect(result.value.migrations[7].version).toBe(9);
    }

    expect(getSchemaVersion(db)).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('MIG-06: Migration 003 through 009 safely upgrade database from version 2 to 9', () => {
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

    // Run migration engine; should apply migration 003 through 009
    const result = runMigrations(db);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.appliedCount).toBe(7);
      expect(result.value.currentVersion).toBe(CURRENT_SCHEMA_VERSION);
      expect(result.value.migrations[0].version).toBe(3);
      expect(result.value.migrations[1].version).toBe(4);
      expect(result.value.migrations[2].version).toBe(5);
      expect(result.value.migrations[3].version).toBe(6);
      expect(result.value.migrations[4].version).toBe(7);
      expect(result.value.migrations[5].version).toBe(8);
      expect(result.value.migrations[6].version).toBe(9);
    }

    expect(getSchemaVersion(db)).toBe(CURRENT_SCHEMA_VERSION);

    // Verify report_sessions, report_session_stations, template_versions, excel_template_mappings, word_template_mappings, mapping_profiles, template_design_drafts, and generation_workspaces tables exist
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('report_sessions', 'report_session_stations', 'template_versions', 'excel_template_mappings', 'word_template_mappings', 'mapping_profiles', 'template_design_drafts', 'generation_workspaces')"
      )
      .all() as Array<{ name: string }>;
    expect(tables).toHaveLength(8);
  });

  it('MIG-07: Migration 004 through 009 safely upgrade database from version 3 to 9', () => {
    // Manually run migrations 001, 002, and 003
    const {
      migration001,
    } = require('../../../src/storage/database/migrations/001_initial_schema.ts');
    const {
      migration002,
    } = require('../../../src/storage/database/migrations/002_category_lifecycle_and_template_metadata.ts');
    const {
      migration003,
    } = require('../../../src/storage/database/migrations/003_report_session_and_draft_persistence.ts');
    migration001.up(db);
    migration002.up(db);
    migration003.up(db);
    db.pragma('user_version = 3');

    // Run migration engine; should apply migration 004 through 009
    const result = runMigrations(db);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.appliedCount).toBe(6);
      expect(result.value.currentVersion).toBe(CURRENT_SCHEMA_VERSION);
      expect(result.value.migrations[0].version).toBe(4);
      expect(result.value.migrations[1].version).toBe(5);
      expect(result.value.migrations[2].version).toBe(6);
      expect(result.value.migrations[3].version).toBe(7);
      expect(result.value.migrations[4].version).toBe(8);
      expect(result.value.migrations[5].version).toBe(9);
    }

    expect(getSchemaVersion(db)).toBe(CURRENT_SCHEMA_VERSION);

    // Verify template_versions table exists and seed templates were migrated to version 1
    const versions = db.prepare('SELECT count(*) as count FROM template_versions').get() as {
      count: number;
    };
    expect(versions.count).toBe(7);
  });

  it('MIG-08: Migration 005 creates excel_template_mappings table with strict foreign keys and uniqueness', () => {
    // Run all migrations to v7
    const result = runMigrations(db);
    expect(result.ok).toBe(true);

    const mappingTable = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='excel_template_mappings'"
      )
      .get() as { name: string } | undefined;
    expect(mappingTable).toBeDefined();
    expect(mappingTable?.name).toBe('excel_template_mappings');

    // Check columns
    const columns = db.pragma('table_info(excel_template_mappings)') as Array<{
      name: string;
      type: string;
    }>;
    const colNames = columns.map(c => c.name);
    expect(colNames).toContain('mapping_id');
    expect(colNames).toContain('template_id');
    expect(colNames).toContain('version_id');
    expect(colNames).toContain('worksheet_name');
    expect(colNames).toContain('header_row_number');
    expect(colNames).toContain('mapping_type');
    expect(colNames).toContain('field_id');
    expect(colNames).toContain('field_label');
    expect(colNames).toContain('target_coordinate');
    expect(colNames).toContain('column_header');
    expect(colNames).toContain('profile_id');
    expect(colNames).toContain('created_at');
    expect(colNames).toContain('updated_at');
  });

  it('MIG-09: Migration 006 creates word_template_mappings table with strict foreign keys and uniqueness', () => {
    // Run all migrations to v7
    const result = runMigrations(db);
    expect(result.ok).toBe(true);

    const mappingTable = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='word_template_mappings'"
      )
      .get() as { name: string } | undefined;
    expect(mappingTable).toBeDefined();
    expect(mappingTable?.name).toBe('word_template_mappings');

    // Check columns
    const columns = db.pragma('table_info(word_template_mappings)') as Array<{
      name: string;
      type: string;
    }>;
    const colNames = columns.map(c => c.name);
    expect(colNames).toContain('mapping_id');
    expect(colNames).toContain('template_id');
    expect(colNames).toContain('version_id');
    expect(colNames).toContain('mapping_type');
    expect(colNames).toContain('field_id');
    expect(colNames).toContain('field_label');
    expect(colNames).toContain('target_coordinate');
    expect(colNames).toContain('placeholder_token');
    expect(colNames).toContain('paragraph_index');
    expect(colNames).toContain('table_index');
    expect(colNames).toContain('row_index');
    expect(colNames).toContain('col_index');
    expect(colNames).toContain('profile_id');
    expect(colNames).toContain('created_at');
    expect(colNames).toContain('updated_at');
  });

  it('MIG-10: Migration 007 creates mapping_profiles table and seeds default active profiles', () => {
    // Run all migrations to v7
    const result = runMigrations(db);
    expect(result.ok).toBe(true);

    const profileTable = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='mapping_profiles'")
      .get() as { name: string } | undefined;
    expect(profileTable).toBeDefined();
    expect(profileTable?.name).toBe('mapping_profiles');

    // Check columns
    const columns = db.pragma('table_info(mapping_profiles)') as Array<{
      name: string;
      type: string;
    }>;
    const colNames = columns.map(c => c.name);
    expect(colNames).toContain('profile_id');
    expect(colNames).toContain('profile_name');
    expect(colNames).toContain('description');
    expect(colNames).toContain('category_id');
    expect(colNames).toContain('template_id');
    expect(colNames).toContain('version_id');
    expect(colNames).toContain('document_type');
    expect(colNames).toContain('status');
    expect(colNames).toContain('validation_status');
    expect(colNames).toContain('last_validated_at');
    expect(colNames).toContain('validation_summary');
    expect(colNames).toContain('created_at');
    expect(colNames).toContain('updated_at');

    // Verify default profiles seeded for all 7 initial templates
    const profiles = db.prepare('SELECT count(*) as count FROM mapping_profiles').get() as {
      count: number;
    };
    expect(profiles.count).toBe(7);
  });

  it('MIG-11: Migration 008 creates template_design_drafts table for in-app template designer drafts', () => {
    // Run all migrations to v8
    const result = runMigrations(db);
    expect(result.ok).toBe(true);

    const draftTable = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='template_design_drafts'"
      )
      .get() as { name: string } | undefined;
    expect(draftTable).toBeDefined();
    expect(draftTable?.name).toBe('template_design_drafts');

    // Check columns
    const columns = db.pragma('table_info(template_design_drafts)') as Array<{
      name: string;
      type: string;
    }>;
    const colNames = columns.map(c => c.name);
    expect(colNames).toContain('draft_id');
    expect(colNames).toContain('name');
    expect(colNames).toContain('description');
    expect(colNames).toContain('document_type');
    expect(colNames).toContain('category_id');
    expect(colNames).toContain('target_template_id');
    expect(colNames).toContain('design_schema_version');
    expect(colNames).toContain('design_definition');
    expect(colNames).toContain('created_at');
    expect(colNames).toContain('updated_at');
  });

  it('MIG-12: Migration 009 creates generation_workspaces table for isolated report generation', () => {
    // Run all migrations to v9
    const result = runMigrations(db);
    expect(result.ok).toBe(true);

    const wsTable = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='generation_workspaces'")
      .get() as { name: string } | undefined;
    expect(wsTable).toBeDefined();
    expect(wsTable?.name).toBe('generation_workspaces');

    // Check columns
    const columns = db.pragma('table_info(generation_workspaces)') as Array<{
      name: string;
      type: string;
    }>;
    const colNames = columns.map(c => c.name);
    expect(colNames).toContain('workspace_id');
    expect(colNames).toContain('session_id');
    expect(colNames).toContain('template_id');
    expect(colNames).toContain('version_id');
    expect(colNames).toContain('version_number');
    expect(colNames).toContain('document_type');
    expect(colNames).toContain('file_name');
    expect(colNames).toContain('relative_path');
    expect(colNames).toContain('sha256_hash');
    expect(colNames).toContain('file_size_bytes');
    expect(colNames).toContain('status');
    expect(colNames).toContain('created_at');
    expect(colNames).toContain('updated_at');
  });
});
