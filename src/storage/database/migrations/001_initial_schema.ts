/**
 * OpsReport Studio — Migration 001: Initial Schema
 *
 * Creates the foundational schema tables:
 * - schema_migrations: Internal migration audit log
 * - report_categories: Confirmed 7 operational report categories reference data
 * - stations: Authoritative ordered station sequence persistence table
 * - app_settings: General application key-value configuration
 *
 * @module storage/database/migrations/001_initial_schema
 */

import type { Migration } from './types.ts';

export const migration001: Migration = {
  version: 1,
  name: '001_initial_schema',
  description:
    'Creates schema_migrations, report_categories with initial seeds, stations, and app_settings tables.',
  up: db => {
    // 1. Schema Migrations Audit Table
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL,
        checksum TEXT NOT NULL
      );
    `);

    // 2. Report Categories Reference Table (Step 2 & Step 8 Baseline)
    db.exec(`
      CREATE TABLE IF NOT EXISTS report_categories (
        category_id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        default_format TEXT NOT NULL CHECK(default_format IN ('EXCEL_XLSX', 'WORD_DOCX')),
        is_multi_station INTEGER NOT NULL DEFAULT 1 CHECK(is_multi_station IN (0, 1)),
        description TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);

    // 3. Authoritative Station Sequence Table (Step 3 & Step 8 Baseline)
    db.exec(`
      CREATE TABLE IF NOT EXISTS stations (
        station_id TEXT PRIMARY KEY,
        station_name TEXT NOT NULL,
        display_order INTEGER NOT NULL CHECK(display_order >= 1),
        station_code TEXT,
        is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_stations_order ON stations(display_order ASC);
      CREATE INDEX IF NOT EXISTS idx_stations_active ON stations(is_active);
    `);

    // 4. Application Settings Table (Step 8 Baseline)
    db.exec(`
      CREATE TABLE IF NOT EXISTS app_settings (
        setting_key TEXT PRIMARY KEY,
        setting_value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    // 5. Seed Authoritative 7 Report Categories Reference Data
    // Timestamp standard: ISO 8601 UTC
    const now = new Date().toISOString();

    const insertCategory = db.prepare(`
      INSERT OR IGNORE INTO report_categories (
        category_id,
        display_name,
        default_format,
        is_multi_station,
        description,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    const initialCategories = [
      {
        id: 'RPT-INCIDENT',
        name: 'Security Incident Reports',
        format: 'WORD_DOCX',
        multiStation: 0,
        desc: 'Control room officer security incident logs, patrol events, and physical observations.',
      },
      {
        id: 'RPT-STATION-LIGHT',
        name: 'Station Light Reports',
        format: 'EXCEL_XLSX',
        multiStation: 1,
        desc: 'Station platform, concourse, and passageway luminaire defect tracking and circuit auditing.',
      },
      {
        id: 'RPT-FAN',
        name: 'Fan Reports',
        format: 'EXCEL_XLSX',
        multiStation: 1,
        desc: 'Platform ventilation, jet fan mechanical state, and air movement operational verification.',
      },
      {
        id: 'RPT-POLE-LIGHT',
        name: 'Pole Light Reports',
        format: 'EXCEL_XLSX',
        multiStation: 1,
        desc: 'Perimeter, parking facility, and yard high-mast luminaire illumination inspections.',
      },
      {
        id: 'RPT-FIRE-EXTINGUISHER',
        name: 'Fire Extinguisher Reports',
        format: 'EXCEL_XLSX',
        multiStation: 1,
        desc: 'Pressure gauge status, safety seal integrity, certification tags, and placement checks.',
      },
      {
        id: 'RPT-PILLAR',
        name: 'Pillar Reports',
        format: 'EXCEL_XLSX',
        multiStation: 1,
        desc: 'Structural station pillar physical integrity, asset numbering tags, and clearance checks.',
      },
      {
        id: 'RPT-FENCE',
        name: 'Fence Reports',
        format: 'EXCEL_XLSX',
        multiStation: 1,
        desc: 'Perimeter barrier condition, intrusion risk points, and boundary security auditing.',
      },
    ];

    for (const cat of initialCategories) {
      insertCategory.run(cat.id, cat.name, cat.format, cat.multiStation, cat.desc, now);
    }
  },
};
