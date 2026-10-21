/**
 * OpsReport Studio — Migration 005: Excel Template Worksheet, Header Row & Cell Mappings
 *
 * Implements Step 22 of the 45-step roadmap:
 * - Establishes excel_template_mappings table to persist field-to-cell (fixed coordinate)
 *   and field-to-column (tabular header-anchored) configurations separately from the master workbook.
 * - Enforces version-specific association so that structural changes across template versions
 *   do not silently corrupt or misapply mappings.
 * - Prevents duplicate field assignments within the same worksheet mapping context.
 * - Enforces destination uniqueness (no conflicting multi-field collisions on the same target).
 *
 * @module storage/database/migrations/005_excel_template_mappings
 */

import type Database from 'better-sqlite3';
import type { Migration } from './types.ts';

export const migration005: Migration = {
  version: 5,
  name: '005_excel_template_mappings',
  description:
    'Establishes excel_template_mappings table for persisting version-aware Excel worksheet cell and column bindings.',
  up: (db: Database.Database) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS excel_template_mappings (
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
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (template_id, version_id, worksheet_name, field_id),
        UNIQUE (template_id, version_id, worksheet_name, mapping_type, target_coordinate)
      );

      CREATE INDEX IF NOT EXISTS idx_excel_mappings_tpl_ver ON excel_template_mappings(template_id, version_id);
      CREATE INDEX IF NOT EXISTS idx_excel_mappings_sheet ON excel_template_mappings(template_id, version_id, worksheet_name);
      CREATE INDEX IF NOT EXISTS idx_excel_mappings_field ON excel_template_mappings(field_id);
    `);
  },
};
