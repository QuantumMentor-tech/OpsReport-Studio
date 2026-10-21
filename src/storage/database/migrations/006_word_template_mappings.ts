/**
 * OpsReport Studio — Migration 006: Word Template Placeholder, Paragraph & Table Mappings
 *
 * Implements Step 23 of the 45-step roadmap:
 * - Establishes word_template_mappings table to persist field-to-target associations
 *   (placeholders, paragraphs, table cells, and repeating table rows) separately from the master Word document.
 * - Enforces version-specific association so that structural changes across template versions
 *   do not silently corrupt or misapply mappings.
 * - Prevents duplicate field assignments within the same template version context.
 * - Enforces destination uniqueness (no conflicting multi-field collisions on the same target coordinate).
 *
 * @module storage/database/migrations/006_word_template_mappings
 */

import type Database from 'better-sqlite3';
import type { Migration } from './types.ts';

export const migration006: Migration = {
  version: 6,
  name: '006_word_template_mappings',
  description:
    'Establishes word_template_mappings table for persisting version-aware Word document placeholder, paragraph, and table bindings.',
  up: (db: Database.Database) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS word_template_mappings (
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
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (template_id, version_id, field_id),
        UNIQUE (template_id, version_id, mapping_type, target_coordinate)
      );

      CREATE INDEX IF NOT EXISTS idx_word_mappings_tpl_ver ON word_template_mappings(template_id, version_id);
      CREATE INDEX IF NOT EXISTS idx_word_mappings_field ON word_template_mappings(field_id);
      CREATE INDEX IF NOT EXISTS idx_word_mappings_type ON word_template_mappings(mapping_type);
    `);
  },
};
