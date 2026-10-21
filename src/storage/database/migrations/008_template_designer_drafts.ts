/**
 * OpsReport Studio — Migration 008: Template Designer Drafts & In-App Authoring
 *
 * Implements Step 25 of the 45-step roadmap:
 * - Establishes template_design_drafts table for recoverable in-app Excel and Word
 *   template designs.
 * - Stores structured, versioned design definitions (JSON) completely isolated from
 *   the protected master-template vault.
 * - Tracks associations with report categories and optional target template IDs.
 *
 * @module storage/database/migrations/008_template_designer_drafts
 */

import type Database from 'better-sqlite3';
import type { Migration } from './types.ts';

export const migration008: Migration = {
  version: 8,
  name: '008_template_designer_drafts',
  description:
    'Establishes template_design_drafts table for in-app template designer drafts and recoverable definitions.',
  up: (db: Database.Database) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS template_design_drafts (
        draft_id TEXT PRIMARY KEY,
        name TEXT NOT NULL CHECK(length(trim(name)) > 0),
        description TEXT,
        document_type TEXT NOT NULL CHECK(document_type IN ('EXCEL_WORKBOOK', 'WORD_DOCUMENT')),
        category_id TEXT REFERENCES report_categories(category_id) ON UPDATE CASCADE ON DELETE SET NULL,
        target_template_id TEXT REFERENCES template_metadata(template_id) ON UPDATE CASCADE ON DELETE SET NULL,
        design_schema_version INTEGER NOT NULL DEFAULT 1,
        design_definition TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_design_drafts_updated_at ON template_design_drafts(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_design_drafts_category ON template_design_drafts(category_id);
      CREATE INDEX IF NOT EXISTS idx_design_drafts_type ON template_design_drafts(document_type);
    `);
  },
  down: (db: Database.Database) => {
    db.exec(`
      DROP TABLE IF EXISTS template_design_drafts;
    `);
  },
};
