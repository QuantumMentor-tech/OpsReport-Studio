/**
 * OpsReport Studio — Migration 002: Category Lifecycle & Template Metadata
 *
 * Enhances the schema with:
 * - report_categories: Adds is_active and updated_at lifecycle columns with index
 * - template_metadata: Relational table associating reusable template descriptors
 *   with report categories, foreign key constraints (ON DELETE RESTRICT),
 *   status check constraints, and initial seed descriptors for the 7 standard categories.
 *
 * @module storage/database/migrations/002_category_lifecycle_and_template_metadata
 */

import type { Migration } from './types.ts';

export const migration002: Migration = {
  version: 2,
  name: '002_category_lifecycle_and_template_metadata',
  description:
    'Extends report_categories with lifecycle columns (is_active, updated_at) and establishes template_metadata table with initial seed descriptors.',
  up: db => {
    // 1. Extend report_categories with lifecycle columns if they do not exist
    const columns = db.pragma('table_info(report_categories)') as Array<{ name: string }>;
    const colNames = new Set(columns.map(c => c.name));

    if (!colNames.has('is_active')) {
      db.exec('ALTER TABLE report_categories ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;');
    }
    if (!colNames.has('updated_at')) {
      db.exec('ALTER TABLE report_categories ADD COLUMN updated_at TEXT;');
      db.exec('UPDATE report_categories SET updated_at = created_at WHERE updated_at IS NULL;');
    }

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_categories_active ON report_categories(is_active);
    `);

    // 2. Create template_metadata table with foreign key to report_categories
    db.exec(`
      CREATE TABLE IF NOT EXISTS template_metadata (
        template_id TEXT PRIMARY KEY,
        template_name TEXT NOT NULL CHECK(length(trim(template_name)) > 0),
        category_id TEXT NOT NULL REFERENCES report_categories(category_id) ON UPDATE CASCADE ON DELETE RESTRICT,
        document_type TEXT NOT NULL CHECK(document_type IN ('EXCEL_XLSX', 'WORD_DOCX')),
        description TEXT,
        status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('DRAFT', 'ACTIVE', 'ARCHIVED')),
        file_name TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_template_category ON template_metadata(category_id);
      CREATE INDEX IF NOT EXISTS idx_template_status ON template_metadata(status);
    `);

    // 3. Seed default template metadata descriptors for the 7 initial categories
    const now = new Date().toISOString();

    const insertTemplate = db.prepare(`
      INSERT OR IGNORE INTO template_metadata (
        template_id,
        template_name,
        category_id,
        document_type,
        description,
        status,
        file_name,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const defaultTemplates = [
      {
        id: 'TPL-INCIDENT-STANDARD',
        name: 'Security Incident Report Master',
        categoryId: 'RPT-INCIDENT',
        docType: 'WORD_DOCX',
        desc: 'Standard Word template for security incident reporting, patrol event logging, and physical observations.',
        status: 'ACTIVE',
        fileName: 'security_incident_report_master.docx',
      },
      {
        id: 'TPL-STATION-LIGHT-STANDARD',
        name: 'Station Light Inspection Master',
        categoryId: 'RPT-STATION-LIGHT',
        docType: 'EXCEL_XLSX',
        desc: 'Multi-station platform and concourse luminaire defect tracking and circuit auditing spreadsheet.',
        status: 'ACTIVE',
        fileName: 'station_light_inspection_master.xlsx',
      },
      {
        id: 'TPL-FAN-STANDARD',
        name: 'Platform Fan Audit Master',
        categoryId: 'RPT-FAN',
        docType: 'EXCEL_XLSX',
        desc: 'Platform ventilation, jet fan mechanical state, and air movement operational verification spreadsheet.',
        status: 'ACTIVE',
        fileName: 'platform_fan_audit_master.xlsx',
      },
      {
        id: 'TPL-POLE-LIGHT-STANDARD',
        name: 'Pole Light Inspection Master',
        categoryId: 'RPT-POLE-LIGHT',
        docType: 'EXCEL_XLSX',
        desc: 'Perimeter, parking facility, and yard high-mast luminaire illumination inspection template.',
        status: 'ACTIVE',
        fileName: 'pole_light_inspection_master.xlsx',
      },
      {
        id: 'TPL-FIRE-EXTINGUISHER-STANDARD',
        name: 'Fire Extinguisher Inspection Master',
        categoryId: 'RPT-FIRE-EXTINGUISHER',
        docType: 'EXCEL_XLSX',
        desc: 'Pressure gauge status, safety seal integrity, certification tags, and placement audit spreadsheet.',
        status: 'ACTIVE',
        fileName: 'fire_extinguisher_inspection_master.xlsx',
      },
      {
        id: 'TPL-PILLAR-STANDARD',
        name: 'Pillar Structural Audit Master',
        categoryId: 'RPT-PILLAR',
        docType: 'EXCEL_XLSX',
        desc: 'Structural station pillar physical integrity, asset numbering tags, and clearance check spreadsheet.',
        status: 'ACTIVE',
        fileName: 'pillar_structural_audit_master.xlsx',
      },
      {
        id: 'TPL-FENCE-STANDARD',
        name: 'Perimeter Fence Inspection Master',
        categoryId: 'RPT-FENCE',
        docType: 'EXCEL_XLSX',
        desc: 'Perimeter barrier condition, intrusion risk points, and boundary security audit spreadsheet.',
        status: 'ACTIVE',
        fileName: 'perimeter_fence_inspection_master.xlsx',
      },
    ];

    for (const t of defaultTemplates) {
      insertTemplate.run(
        t.id,
        t.name,
        t.categoryId,
        t.docType,
        t.desc,
        t.status,
        t.fileName,
        now,
        now
      );
    }
  },
};
