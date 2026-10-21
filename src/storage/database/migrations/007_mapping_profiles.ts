/**
 * OpsReport Studio — Migration 007: Reusable Mapping Profiles & Validation Architecture
 *
 * Implements Step 24 of the 45-step roadmap:
 * - Establishes mapping_profiles table to organize and group field mappings into
 *   reusable, auditable configurations.
 * - Associates profiles with specific template versions, report categories, and document formats.
 * - Stores diagnostic validation status ('VALID', 'INVALID', 'INCOMPLETE', 'REQUIRES_REVIEW', 'UNCHECKED', 'UNABLE_TO_VALIDATE').
 * - Links existing Excel and Word template mappings to their parent profile via optional profile_id column.
 * - Seeds default active profiles for all registered template versions so existing mappings are immediately organized.
 *
 * @module storage/database/migrations/007_mapping_profiles
 */

import type Database from 'better-sqlite3';
import type { Migration } from './types.ts';

export const migration007: Migration = {
  version: 7,
  name: '007_mapping_profiles',
  description:
    'Establishes mapping_profiles table and links version-aware mappings into reusable configurations.',
  up: (db: Database.Database) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS mapping_profiles (
        profile_id TEXT PRIMARY KEY,
        profile_name TEXT NOT NULL CHECK(length(trim(profile_name)) > 0),
        description TEXT,
        category_id TEXT NOT NULL REFERENCES report_categories(category_id) ON UPDATE CASCADE ON DELETE RESTRICT,
        template_id TEXT NOT NULL REFERENCES template_metadata(template_id) ON UPDATE CASCADE ON DELETE CASCADE,
        version_id TEXT NOT NULL REFERENCES template_versions(version_id) ON UPDATE CASCADE ON DELETE CASCADE,
        document_type TEXT NOT NULL CHECK(document_type IN ('EXCEL_XLSX', 'WORD_DOCX')),
        status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'DRAFT', 'ARCHIVED')),
        validation_status TEXT NOT NULL DEFAULT 'UNCHECKED' CHECK(validation_status IN ('VALID', 'INVALID', 'INCOMPLETE', 'REQUIRES_REVIEW', 'UNCHECKED', 'UNABLE_TO_VALIDATE')),
        last_validated_at TEXT,
        validation_summary TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (template_id, version_id, profile_name)
      );

      CREATE INDEX IF NOT EXISTS idx_mapping_profiles_cat ON mapping_profiles(category_id);
      CREATE INDEX IF NOT EXISTS idx_mapping_profiles_tpl_ver ON mapping_profiles(template_id, version_id);
      CREATE INDEX IF NOT EXISTS idx_mapping_profiles_status ON mapping_profiles(status);
      CREATE INDEX IF NOT EXISTS idx_mapping_profiles_val_status ON mapping_profiles(validation_status);
    `);

    // Add profile_id column and re-scope unique constraints per profile
    try {
      db.exec(`ALTER TABLE excel_template_mappings ADD COLUMN profile_id TEXT;`);
    } catch {
      // Column may already exist
    }

    try {
      db.exec(`ALTER TABLE word_template_mappings ADD COLUMN profile_id TEXT;`);
    } catch {
      // Column may already exist
    }

    // Rebuild tables to scope unique constraints to (template_id, version_id, profile_id)
    db.exec(`
      CREATE TABLE IF NOT EXISTS excel_template_mappings_v7 (
        mapping_id TEXT PRIMARY KEY,
        template_id TEXT NOT NULL REFERENCES template_metadata(template_id) ON UPDATE CASCADE ON DELETE CASCADE,
        version_id TEXT NOT NULL REFERENCES template_versions(version_id) ON UPDATE CASCADE ON DELETE CASCADE,
        worksheet_name TEXT NOT NULL CHECK(length(trim(worksheet_name)) > 0),
        header_row_number INTEGER CHECK(header_row_number IS NULL OR header_row_number >= 1),
        mapping_type TEXT NOT NULL CHECK(mapping_type IN ('FIXED_CELL', 'TABLE_COLUMN')),
        field_id TEXT NOT NULL CHECK(length(trim(field_id)) > 0),
        field_label TEXT NOT NULL CHECK(length(trim(field_label)) > 0),
        target_coordinate TEXT NOT NULL CHECK(length(trim(target_coordinate)) > 0),
        column_header TEXT,
        profile_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (template_id, version_id, profile_id, worksheet_name, field_id),
        UNIQUE (template_id, version_id, profile_id, worksheet_name, mapping_type, target_coordinate)
      );

      INSERT OR IGNORE INTO excel_template_mappings_v7
      SELECT * FROM excel_template_mappings;

      DROP TABLE excel_template_mappings;
      ALTER TABLE excel_template_mappings_v7 RENAME TO excel_template_mappings;

      CREATE INDEX IF NOT EXISTS idx_excel_mappings_tpl_ver ON excel_template_mappings(template_id, version_id);
      CREATE INDEX IF NOT EXISTS idx_excel_mappings_profile ON excel_template_mappings(profile_id);
      CREATE INDEX IF NOT EXISTS idx_excel_mappings_sheet ON excel_template_mappings(template_id, version_id, worksheet_name);
      CREATE INDEX IF NOT EXISTS idx_excel_mappings_field ON excel_template_mappings(field_id);

      CREATE TABLE IF NOT EXISTS word_template_mappings_v7 (
        mapping_id TEXT PRIMARY KEY,
        template_id TEXT NOT NULL REFERENCES template_metadata(template_id) ON UPDATE CASCADE ON DELETE CASCADE,
        version_id TEXT NOT NULL REFERENCES template_versions(version_id) ON UPDATE CASCADE ON DELETE CASCADE,
        mapping_type TEXT NOT NULL CHECK(mapping_type IN ('PLACEHOLDER', 'PARAGRAPH', 'TABLE_CELL', 'REPEATING_ROW')),
        field_id TEXT NOT NULL CHECK(length(trim(field_id)) > 0),
        field_label TEXT NOT NULL CHECK(length(trim(field_label)) > 0),
        target_coordinate TEXT NOT NULL CHECK(length(trim(target_coordinate)) > 0),
        placeholder_token TEXT,
        paragraph_index INTEGER CHECK(paragraph_index IS NULL OR paragraph_index >= 1),
        table_index INTEGER CHECK(table_index IS NULL OR table_index >= 1),
        row_index INTEGER CHECK(row_index IS NULL OR row_index >= 1),
        col_index INTEGER CHECK(col_index IS NULL OR col_index >= 1),
        profile_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (template_id, version_id, profile_id, field_id),
        UNIQUE (template_id, version_id, profile_id, mapping_type, target_coordinate)
      );

      INSERT OR IGNORE INTO word_template_mappings_v7
      SELECT * FROM word_template_mappings;

      DROP TABLE word_template_mappings;
      ALTER TABLE word_template_mappings_v7 RENAME TO word_template_mappings;

      CREATE INDEX IF NOT EXISTS idx_word_mappings_tpl_ver ON word_template_mappings(template_id, version_id);
      CREATE INDEX IF NOT EXISTS idx_word_mappings_profile ON word_template_mappings(profile_id);
      CREATE INDEX IF NOT EXISTS idx_word_mappings_field ON word_template_mappings(field_id);
      CREATE INDEX IF NOT EXISTS idx_word_mappings_type ON word_template_mappings(mapping_type);
    `);

    // Seed default profiles for all existing template versions
    const versions = db
      .prepare(
        `
      SELECT v.version_id, v.template_id, t.template_name, t.category_id, t.document_type, v.created_at
      FROM template_versions v
      JOIN template_metadata t ON v.template_id = t.template_id
    `
      )
      .all() as Array<{
      version_id: string;
      template_id: string;
      template_name: string;
      category_id: string;
      document_type: string;
      created_at: string;
    }>;

    const insertProfile = db.prepare(`
      INSERT OR IGNORE INTO mapping_profiles (
        profile_id, profile_name, description, category_id, template_id, version_id,
        document_type, status, validation_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 'UNCHECKED', ?, ?)
    `);

    const linkExcelMappings = db.prepare(`
      UPDATE excel_template_mappings
      SET profile_id = ?
      WHERE template_id = ? AND version_id = ? AND (profile_id IS NULL OR profile_id = '')
    `);

    const linkWordMappings = db.prepare(`
      UPDATE word_template_mappings
      SET profile_id = ?
      WHERE template_id = ? AND version_id = ? AND (profile_id IS NULL OR profile_id = '')
    `);

    for (const ver of versions) {
      const profileId = `PRF-${ver.template_id}-${ver.version_id}`;
      const profileName = `${ver.template_name} Default Profile`;
      const desc = `Default mapping profile for ${ver.template_name} (${ver.version_id})`;
      const now = ver.created_at || new Date().toISOString();

      insertProfile.run(
        profileId,
        profileName,
        desc,
        ver.category_id,
        ver.template_id,
        ver.version_id,
        ver.document_type,
        now,
        now
      );

      linkExcelMappings.run(profileId, ver.template_id, ver.version_id);
      linkWordMappings.run(profileId, ver.template_id, ver.version_id);
    }
  },
};
