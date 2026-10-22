/**
 * Migration 009 — Report Generation Workspaces & Isolated Output (Step 26 Baseline)
 *
 * Establishes the generation_workspaces table to track isolated working workbook
 * copies prepared for report generation operations, linking them to report sessions,
 * template versions, and lifecycle states.
 *
 * @module storage/database/migrations/009_generation_workspaces
 */

import type Database from 'better-sqlite3';
import type { Migration } from './types.ts';

export const migration009: Migration = {
  version: 9,
  name: '009_generation_workspaces',
  description:
    'Establishes generation_workspaces table for isolated report generation working copies and lifecycle tracking.',

  up: (db: Database.Database): void => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS generation_workspaces (
        workspace_id TEXT PRIMARY KEY,
        session_id TEXT REFERENCES report_sessions(session_id) ON DELETE SET NULL,
        template_id TEXT NOT NULL REFERENCES template_metadata(template_id) ON DELETE RESTRICT,
        version_id TEXT NOT NULL REFERENCES template_versions(version_id) ON DELETE RESTRICT,
        version_number INTEGER NOT NULL,
        document_type TEXT NOT NULL CHECK(document_type IN ('EXCEL', 'EXCEL_XLSX', 'WORD', 'WORD_DOCX')),
        file_name TEXT NOT NULL,
        relative_path TEXT NOT NULL,
        sha256_hash TEXT NOT NULL,
        file_size_bytes INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'PREPARED' CHECK(status IN ('PREPARED', 'IN_USE', 'COMPLETED', 'DISCARDED')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_gen_ws_session ON generation_workspaces(session_id);
      CREATE INDEX IF NOT EXISTS idx_gen_ws_template ON generation_workspaces(template_id, version_id);
      CREATE INDEX IF NOT EXISTS idx_gen_ws_status ON generation_workspaces(status);
    `);
  },
};
