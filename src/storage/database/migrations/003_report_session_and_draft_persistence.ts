/**
 * OpsReport Studio — Migration 003: Report Session & Draft Persistence
 *
 * Implements Step 16:
 * - report_sessions: Persistent table for report sessions, lifecycle status,
 *   payload versioning, form_data JSON payload, category and template relationships.
 * - report_session_stations: Relational junction table capturing an ordered, frozen
 *   snapshot of station associations (DEC-025) per session.
 *
 * Foreign Key Strategy:
 * - report_sessions.category_id -> report_categories(category_id) ON DELETE RESTRICT
 * - report_sessions.template_id -> template_metadata(template_id) ON DELETE SET NULL
 * - report_session_stations.session_id -> report_sessions(session_id) ON DELETE CASCADE
 * - report_session_stations.station_id -> stations(station_id) ON DELETE RESTRICT
 *
 * @module storage/database/migrations/003_report_session_and_draft_persistence
 */

import type { Migration } from './types.ts';

export const migration003: Migration = {
  version: 3,
  name: '003_report_session_and_draft_persistence',
  description:
    'Establishes report_sessions and report_session_stations tables with foreign keys, lifecycle constraints, indexes, and payload versioning.',
  up: db => {
    // 1. Create report_sessions table
    db.exec(`
      CREATE TABLE IF NOT EXISTS report_sessions (
        session_id TEXT PRIMARY KEY,
        session_title TEXT NOT NULL CHECK(length(trim(session_title)) > 0),
        category_id TEXT NOT NULL REFERENCES report_categories(category_id) ON UPDATE CASCADE ON DELETE RESTRICT,
        template_id TEXT REFERENCES template_metadata(template_id) ON UPDATE CASCADE ON DELETE SET NULL,
        status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
        payload_version INTEGER NOT NULL DEFAULT 1,
        form_data TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_status ON report_sessions(status);
      CREATE INDEX IF NOT EXISTS idx_sessions_category ON report_sessions(category_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_updated ON report_sessions(updated_at DESC);
    `);

    // 2. Create report_session_stations linking table for frozen station sequences (DEC-025)
    db.exec(`
      CREATE TABLE IF NOT EXISTS report_session_stations (
        session_id TEXT NOT NULL REFERENCES report_sessions(session_id) ON UPDATE CASCADE ON DELETE CASCADE,
        station_id TEXT NOT NULL REFERENCES stations(station_id) ON UPDATE CASCADE ON DELETE RESTRICT,
        sequence_order INTEGER NOT NULL CHECK(sequence_order >= 1),
        station_name_snapshot TEXT NOT NULL,
        station_code_snapshot TEXT,
        PRIMARY KEY (session_id, station_id)
      );

      CREATE INDEX IF NOT EXISTS idx_session_stations_seq ON report_session_stations(session_id, sequence_order ASC);
    `);
  },
};
