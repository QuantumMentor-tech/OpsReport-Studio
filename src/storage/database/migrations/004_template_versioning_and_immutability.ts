/**
 * OpsReport Studio — Migration 004: Template Versioning and Master Immutability
 *
 * Implements Step 19 of the 45-step roadmap:
 * - Extends template_metadata with active_version_id, total_versions count.
 * - Establishes template_versions table to store immutable historical revisions
 *   of each template, backed by distinct files in the Master Template Vault.
 * - Migrates all existing template_metadata rows to an initial version (version_number = 1).
 * - Enforces foreign keys, uniqueness constraints, and deterministic version ordering.
 *
 * @module storage/database/migrations/004_template_versioning_and_immutability
 */

import type Database from 'better-sqlite3';
import type { Migration } from './types.ts';

export const migration004: Migration = {
  version: 4,
  name: '004_template_versioning_and_immutability',
  description:
    'Establishes template_versions table for immutable revisions and extends template_metadata with active_version_id and total_versions.',
  up: (db: Database.Database) => {
    // 1. Create template_versions table
    db.exec(`
      CREATE TABLE IF NOT EXISTS template_versions (
        version_id TEXT PRIMARY KEY,
        template_id TEXT NOT NULL REFERENCES template_metadata(template_id) ON UPDATE CASCADE ON DELETE CASCADE,
        version_number INTEGER NOT NULL CHECK(version_number >= 1),
        file_name TEXT NOT NULL CHECK(length(trim(file_name)) > 0),
        sha256_hash TEXT NOT NULL CHECK(length(sha256_hash) = 64),
        file_size_bytes INTEGER NOT NULL CHECK(file_size_bytes >= 0),
        change_summary TEXT,
        is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
        created_at TEXT NOT NULL,
        UNIQUE (template_id, version_number),
        UNIQUE (file_name)
      );

      CREATE INDEX IF NOT EXISTS idx_versions_template ON template_versions(template_id);
      CREATE INDEX IF NOT EXISTS idx_versions_ordering ON template_versions(template_id, version_number DESC);
      CREATE INDEX IF NOT EXISTS idx_versions_active ON template_versions(template_id, is_active);
    `);

    // 2. Extend template_metadata table with active_version_id and total_versions if missing
    const columns = db.pragma('table_info(template_metadata)') as Array<{ name: string }>;
    const colNames = new Set(columns.map(c => c.name));

    if (!colNames.has('active_version_id')) {
      db.exec(
        'ALTER TABLE template_metadata ADD COLUMN active_version_id TEXT REFERENCES template_versions(version_id) ON DELETE SET NULL;'
      );
    }
    if (!colNames.has('total_versions')) {
      db.exec(
        'ALTER TABLE template_metadata ADD COLUMN total_versions INTEGER NOT NULL DEFAULT 1;'
      );
    }

    // 3. Migrate existing template_metadata records to have an initial version (version 1)
    const existingTemplates = db
      .prepare('SELECT template_id, file_name, created_at, updated_at FROM template_metadata')
      .all() as Array<{
      template_id: string;
      file_name: string | null;
      created_at: string;
      updated_at: string;
    }>;

    const insertVersionStmt = db.prepare(`
      INSERT OR IGNORE INTO template_versions (
        version_id,
        template_id,
        version_number,
        file_name,
        sha256_hash,
        file_size_bytes,
        change_summary,
        is_active,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
    `);

    const updateMetadataStmt = db.prepare(`
      UPDATE template_metadata
      SET active_version_id = ?,
          total_versions = 1
      WHERE template_id = ?
    `);

    for (const tpl of existingTemplates) {
      const versionId = `VER-${tpl.template_id}-V1`;
      const fileName = tpl.file_name || `${tpl.template_id}.xlsx`;
      const createdAt = tpl.created_at || new Date().toISOString();
      // Placeholder hash for legacy pre-seeded templates if no physical file was hashed yet
      const placeholderHash = '0000000000000000000000000000000000000000000000000000000000000000';

      insertVersionStmt.run(
        versionId,
        tpl.template_id,
        1,
        fileName,
        placeholderHash,
        0,
        'Initial baseline version',
        createdAt
      );

      updateMetadataStmt.run(versionId, tpl.template_id);
    }
  },
};
