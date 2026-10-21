/**
 * OpsReport Studio — Excel Worksheet, Header Row & Cell Mapping Wizard Tests
 *
 * Comprehensive test suite verifying Step 22 requirements:
 * 1. Worksheet selection and bounded cell grid inspection
 * 2. Header row designation and candidate column extraction (with duplicate/blank handling)
 * 3. Authoritative report field dictionary integration and category scoping
 * 4. Destination coordinate syntax validation and conflict detection
 * 5. Version-aware mapping persistence and database isolation
 * 6. Cryptographic master template immutability (byte-for-byte SHA-256 preservation)
 *
 * @module tests/unit/excel-mapping-wizard.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import PizZip from 'pizzip';
import { DatabaseManager } from '../../src/storage/database/connection.ts';
import { VaultManager } from '../../src/storage/vault/vault-manager.ts';
import { TemplateMetadataRepository } from '../../src/storage/database/repositories/template-metadata-repository.ts';
import { ExcelMappingRepository } from '../../src/storage/database/repositories/excel-mapping-repository.ts';
import { TemplateInspector } from '../../src/storage/vault/template-inspector.ts';
import {
  getApprovedFieldsForCategory,
  isApprovedField,
  getFieldDefinition,
} from '../../src/shared/constants/report-fields.ts';
import {
  toTemplateId,
  toTemplateVersionId,
  toReportCategoryId,
} from '../../src/shared/types/identifiers.ts';
import { ErrorCode } from '../../src/shared/errors/error-codes.ts';

function createTestExcelWorkbook(): Buffer {
  const zip = new PizZip();

  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>'
  );

  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>'
  );

  zip.file(
    'xl/workbook.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="LightingAudit" sheetId="1" r:id="rId1"/>
    <sheet name="SummaryKpis" sheetId="2" r:id="rId2"/>
  </sheets>
</workbook>`
  );

  zip.file(
    'xl/_rels/workbook.xml.rels',
    `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
</Relationships>`
  );

  zip.file(
    'xl/sharedStrings.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="10" uniqueCount="10">
  <si><t>Station Name</t></si>
  <si><t>Zone</t></si>
  <si><t>Status</t></si>
  <si><t>Status</t></si>
  <si><t>Defects</t></si>
  <si><t>Central Station</t></si>
  <si><t>Concourse</t></si>
  <si><t>Operational</t></si>
  <si><t>North Terminal</t></si>
  <si><t>Platform</t></si>
</sst>`
  );

  // Sheet 1: Tabular audit ledger with duplicate "Status" header (Col C and Col D) and blank Col E
  zip.file(
    'xl/worksheets/sheet1.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:E3"/>
  <sheetData>
    <row r="1">
      <c r="A1" t="s"><v>0</v></c>
      <c r="B1" t="s"><v>1</v></c>
      <c r="C1" t="s"><v>2</v></c>
      <c r="D1" t="s"><v>3</v></c>
      <c r="E1" t="s"><v>4</v></c>
    </row>
    <row r="2">
      <c r="A2" t="s"><v>5</v></c>
      <c r="B2" t="s"><v>6</v></c>
      <c r="C2" t="s"><v>7</v></c>
      <c r="D2" t="s"><v>7</v></c>
      <c r="E2"><v>0</v></c>
    </row>
    <row r="3">
      <c r="A3" t="s"><v>8</v></c>
      <c r="B3" t="s"><v>9</v></c>
      <c r="C3" t="s"><v>7</v></c>
      <c r="D3" t="s"><v>7</v></c>
      <c r="E3"><v>2</v></c>
    </row>
  </sheetData>
</worksheet>`
  );

  // Sheet 2: Summary sheet (empty data rows)
  zip.file(
    'xl/worksheets/sheet2.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:B2"/>
  <sheetData>
    <row r="1">
      <c r="B2"><v>100</v></c>
    </row>
  </sheetData>
</worksheet>`
  );

  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

describe('OpsReport Studio — Step 22: Excel Worksheet, Header Row & Cell Mapping Wizard', () => {
  let tempRoot: string;
  let vaultManager: VaultManager;
  let dbManager: DatabaseManager;
  let templateRepo: TemplateMetadataRepository;
  let mappingRepo: ExcelMappingRepository;
  let inspector: TemplateInspector;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opsreport-step22-test-'));
    const appDataRoot = path.join(tempRoot, 'AppData');
    fs.mkdirSync(appDataRoot, { recursive: true });

    vaultManager = new VaultManager(appDataRoot);
    vaultManager.initializeVault();
    VaultManager.setInstance(vaultManager);

    const dbPath = path.join(vaultManager.databaseDir, 'test-opsreport.db');
    dbManager = new DatabaseManager({ databasePath: dbPath });
    const initRes = dbManager.initialize();
    expect(initRes.ok).toBe(true);

    const db = dbManager.getDatabase();
    templateRepo = new TemplateMetadataRepository(db);
    mappingRepo = new ExcelMappingRepository(db);

    TemplateInspector.resetInstance();
    inspector = TemplateInspector.getInstance(db, vaultManager, templateRepo);
  });

  afterEach(() => {
    VaultManager.setInstance(null);
    TemplateInspector.resetInstance();
    dbManager.close();
    try {
      if (fs.existsSync(tempRoot)) {
        fs.rmSync(tempRoot, { recursive: true, force: true });
      }
    } catch {
      // Ignore cleanup locks
    }
  });

  it('MAP-01: Authoritative Report Field Catalog returns approved common & category fields', () => {
    // Check Station Light category fields
    const sltFields = getApprovedFieldsForCategory('RPT-STATION-LIGHT');
    expect(sltFields.length).toBeGreaterThanOrEqual(10);

    const fieldIds = sltFields.map(f => f.fieldId);
    expect(fieldIds).toContain('FLD-COM-DATE');
    expect(fieldIds).toContain('FLD-COM-INSPECTOR');
    expect(fieldIds).toContain('FLD-COM-SHIFT');
    expect(fieldIds).toContain('FLD-COM-STATION');
    expect(fieldIds).toContain('FLD-SLT-ZONE');
    expect(fieldIds).toContain('FLD-SLT-STATUS');
    expect(fieldIds).toContain('FLD-SLT-DEFECT-QTY');

    // Should NOT contain fan or fire extinguisher fields
    expect(fieldIds).not.toContain('FLD-FAN-ID');
    expect(fieldIds).not.toContain('FLD-EXT-LOC-NO');

    // Check helper functions
    expect(isApprovedField('FLD-COM-DATE')).toBe(true);
    expect(isApprovedField('FLD-UNKNOWN-NONEXISTENT')).toBe(false);

    const dateDef = getFieldDefinition('FLD-COM-DATE');
    expect(dateDef).toBeDefined();
    expect(dateDef?.label).toBe('Report Date');
    expect(dateDef?.defaultTargetType).toBe('FIXED_CELL');
  });

  it('MAP-02: Template inspection enumerates real worksheets in workbook order', async () => {
    // Setup physical workbook in vault
    const workbookBuffer = createTestExcelWorkbook();
    const tplId = toTemplateId('TPL-SLT-TEST-02');
    const fileName = 'station_light_master_v1.xlsx';
    const filePath = path.join(vaultManager.templatesDir, fileName);
    fs.writeFileSync(filePath, workbookBuffer);
    const hash = crypto.createHash('sha256').update(workbookBuffer).digest('hex');

    const cRes = templateRepo.createTemplate({
      templateId: tplId,
      templateName: 'Test SLT Template 02',
      categoryId: toReportCategoryId('RPT-STATION-LIGHT'),
      documentType: 'EXCEL_XLSX',
      fileName,
      status: 'ACTIVE',
    });
    expect(cRes.ok).toBe(true);

    const vRes = templateRepo.registerNewVersion({
      templateId: tplId,
      fileName,
      fileSizeBytes: workbookBuffer.length,
      sha256Hash: hash,
      changeSummary: 'Initial v1 master asset',
      setActive: true,
    });
    expect(vRes.ok).toBe(true);
    if (!vRes.ok) return;
    const verId = vRes.value.version_id;

    // Inspect workbook
    const inspectRes = await inspector.inspectTemplate({
      templateId: tplId,
      versionId: verId,
    });

    expect(inspectRes.ok).toBe(true);
    if (!inspectRes.ok) return;

    const preview = inspectRes.value.excelPreview;
    expect(preview).toBeDefined();
    expect(preview?.sheets).toHaveLength(2);
    expect(preview?.sheets[0].name).toBe('LightingAudit');
    expect(preview?.sheets[1].name).toBe('SummaryKpis');

    // Check bounded cell preview on LightingAudit sheet
    const activeSheet = preview?.activeSheetPreview;
    expect(activeSheet).toBeDefined();
    expect(activeSheet?.previewRows).toHaveLength(3);
    expect(activeSheet?.previewRows[0].cells).toHaveLength(5);
    expect(activeSheet?.previewRows[0].cells[0].address).toBe('A1');
    expect(activeSheet?.previewRows[0].cells[0].value).toBe('Station Name');
  });

  it('MAP-03: Header row extraction distinguishes duplicate column labels by physical column letters', async () => {
    const workbookBuffer = createTestExcelWorkbook();
    const tplId = toTemplateId('TPL-SLT-TEST-03');
    const fileName = 'station_light_master_v1.xlsx';
    const filePath = path.join(vaultManager.templatesDir, fileName);
    fs.writeFileSync(filePath, workbookBuffer);
    const hash = crypto.createHash('sha256').update(workbookBuffer).digest('hex');

    const cRes = templateRepo.createTemplate({
      templateId: tplId,
      templateName: 'Test SLT Template 03',
      categoryId: toReportCategoryId('RPT-STATION-LIGHT'),
      documentType: 'EXCEL_XLSX',
      fileName,
      status: 'ACTIVE',
    });
    expect(cRes.ok).toBe(true);

    const vRes = templateRepo.registerNewVersion({
      templateId: tplId,
      fileName,
      fileSizeBytes: workbookBuffer.length,
      sha256Hash: hash,
      changeSummary: 'Initial v1 master asset',
      setActive: true,
    });
    expect(vRes.ok).toBe(true);
    if (!vRes.ok) return;
    const verId = vRes.value.version_id;

    const inspectRes = await inspector.inspectTemplate({
      templateId: tplId,
      versionId: verId,
      worksheetName: 'LightingAudit',
    });

    expect(inspectRes.ok).toBe(true);
    if (!inspectRes.ok) return;

    const activeSheet = inspectRes.value.excelPreview?.activeSheetPreview;
    expect(activeSheet).toBeDefined();

    // Row 1 contains: A1: Station Name, B1: Zone, C1: Status, D1: Status, E1: Defects
    const headerRow = activeSheet?.previewRows.find(r => r.rowNumber === 1);
    expect(headerRow).toBeDefined();
    expect(headerRow?.cells[2].value).toBe('Status');
    expect(headerRow?.cells[2].colRef).toBe('C');
    expect(headerRow?.cells[3].value).toBe('Status');
    expect(headerRow?.cells[3].colRef).toBe('D');

    // Although header text is duplicate ("Status"), the physical column letters (C vs D) distinguish them!
    expect(headerRow?.cells[2].colRef).not.toBe(headerRow?.cells[3].colRef);
  });

  it('MAP-04: Mapping validation enforces cell address syntax and column reference syntax', () => {
    // Valid inputs
    const validRes = mappingRepo.validateMappingItems([
      {
        mappingType: 'FIXED_CELL',
        fieldId: 'FLD-COM-DATE',
        fieldLabel: 'Report Date',
        targetCoordinate: 'B2',
      },
      {
        mappingType: 'TABLE_COLUMN',
        fieldId: 'FLD-SLT-STATUS',
        fieldLabel: 'Fixture Status',
        targetCoordinate: 'C',
        columnHeader: 'Status',
      },
    ]);
    expect(validRes.ok).toBe(true);

    // Invalid fixed-cell coordinate (e.g. "123", "$$%", "B0")
    const invalidCellRes = mappingRepo.validateMappingItems([
      {
        mappingType: 'FIXED_CELL',
        fieldId: 'FLD-COM-DATE',
        fieldLabel: 'Report Date',
        targetCoordinate: '123INVALID',
      },
    ]);
    expect(invalidCellRes.ok).toBe(false);
    if (!invalidCellRes.ok) {
      expect(invalidCellRes.error.code).toBe(ErrorCode.VALIDATION_FAILED);
    }

    // Invalid column reference (e.g. "123", "A1")
    const invalidColRes = mappingRepo.validateMappingItems([
      {
        mappingType: 'TABLE_COLUMN',
        fieldId: 'FLD-SLT-STATUS',
        fieldLabel: 'Fixture Status',
        targetCoordinate: 'A1',
      },
    ]);
    expect(invalidColRes.ok).toBe(false);
    if (!invalidColRes.ok) {
      expect(invalidColRes.error.code).toBe(ErrorCode.VALIDATION_FAILED);
    }
  });

  it('MAP-05: Conflict detection rejects duplicate field mappings and destination collisions', () => {
    // 1. Duplicate field mapping in same worksheet
    const duplicateFieldRes = mappingRepo.validateMappingItems([
      {
        mappingType: 'FIXED_CELL',
        fieldId: 'FLD-COM-DATE',
        fieldLabel: 'Report Date',
        targetCoordinate: 'B2',
      },
      {
        mappingType: 'FIXED_CELL',
        fieldId: 'FLD-COM-DATE',
        fieldLabel: 'Report Date Duplicate',
        targetCoordinate: 'B3',
      },
    ]);
    expect(duplicateFieldRes.ok).toBe(false);
    if (!duplicateFieldRes.ok) {
      expect(duplicateFieldRes.error.code).toBe(ErrorCode.MAPPING_INCOMPATIBLE);
      expect(duplicateFieldRes.error.userMessage).toContain('Duplicate field mapping');
    }

    // 2. Destination cell collision (two fields assigned to same cell B2)
    const cellCollisionRes = mappingRepo.validateMappingItems([
      {
        mappingType: 'FIXED_CELL',
        fieldId: 'FLD-COM-DATE',
        fieldLabel: 'Report Date',
        targetCoordinate: 'B2',
      },
      {
        mappingType: 'FIXED_CELL',
        fieldId: 'FLD-COM-INSPECTOR',
        fieldLabel: 'Inspector Name',
        targetCoordinate: 'B2',
      },
    ]);
    expect(cellCollisionRes.ok).toBe(false);
    if (!cellCollisionRes.ok) {
      expect(cellCollisionRes.error.code).toBe(ErrorCode.MAPPING_INCOMPATIBLE);
      expect(cellCollisionRes.error.userMessage).toContain('assigned to multiple fields');
    }

    // 3. Table column collision (two fields assigned to same column C)
    const colCollisionRes = mappingRepo.validateMappingItems([
      {
        mappingType: 'TABLE_COLUMN',
        fieldId: 'FLD-SLT-ZONE',
        fieldLabel: 'Lighting Zone',
        targetCoordinate: 'C',
      },
      {
        mappingType: 'TABLE_COLUMN',
        fieldId: 'FLD-SLT-STATUS',
        fieldLabel: 'Fixture Status',
        targetCoordinate: 'C',
      },
    ]);
    expect(colCollisionRes.ok).toBe(false);
    if (!colCollisionRes.ok) {
      expect(colCollisionRes.error.code).toBe(ErrorCode.MAPPING_INCOMPATIBLE);
      expect(colCollisionRes.error.userMessage).toContain('assigned to multiple fields');
    }
  });

  it('MAP-06: Saves, retrieves, updates, and deletes mapping configurations with version isolation', () => {
    const tplId = toTemplateId('TPL-STATION-LIGHT-STANDARD');
    const activeVerRes = templateRepo.getActiveVersion(tplId);
    expect(activeVerRes.ok).toBe(true);
    if (!activeVerRes.ok || !activeVerRes.value) return;
    const ver1Id = activeVerRes.value.version_id;

    // Create a second version for testing version isolation
    const db = dbManager.getDatabase();
    const ver2Id = toTemplateVersionId('VER-SLT-V2');
    db.prepare(
      `
      INSERT INTO template_versions (
        version_id, template_id, version_number, file_name, sha256_hash, file_size_bytes, created_at
      ) VALUES (?, ?, 2, 'station_light_master_v2.xlsx', '1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff', 1024, datetime('now'))
    `
    ).run(ver2Id, tplId);

    // 1. Save mapping configuration for Version 1
    const saveRes = mappingRepo.saveMappings({
      templateId: tplId,
      versionId: ver1Id,
      worksheetName: 'LightingAudit',
      headerRowNumber: 1,
      mappings: [
        {
          mappingType: 'FIXED_CELL',
          fieldId: 'FLD-COM-DATE',
          fieldLabel: 'Report Date',
          targetCoordinate: 'B2',
        },
        {
          mappingType: 'FIXED_CELL',
          fieldId: 'FLD-COM-INSPECTOR',
          fieldLabel: 'Inspector Name',
          targetCoordinate: 'B3',
        },
        {
          mappingType: 'TABLE_COLUMN',
          fieldId: 'FLD-COM-STATION',
          fieldLabel: 'Station Name',
          targetCoordinate: 'A',
          columnHeader: 'Station Name',
        },
        {
          mappingType: 'TABLE_COLUMN',
          fieldId: 'FLD-SLT-ZONE',
          fieldLabel: 'Lighting Zone',
          targetCoordinate: 'B',
          columnHeader: 'Zone',
        },
      ],
    });

    expect(saveRes.ok).toBe(true);
    if (!saveRes.ok) return;

    expect(saveRes.value.worksheetName).toBe('LightingAudit');
    expect(saveRes.value.headerRowNumber).toBe(1);
    expect(saveRes.value.mappings).toHaveLength(4);

    // 2. Retrieve mappings for Version 1
    const getRes = mappingRepo.getMappings(tplId, ver1Id, 'LightingAudit');
    expect(getRes.ok).toBe(true);
    if (getRes.ok) {
      expect(getRes.value).toHaveLength(4);
      expect(getRes.value[0].templateId).toBe(tplId);
      expect(getRes.value[0].versionId).toBe(ver1Id);
    }

    // 3. Version Isolation: Version 2 must NOT have mappings yet
    const getVer2Res = mappingRepo.getMappings(tplId, ver2Id, 'LightingAudit');
    expect(getVer2Res.ok).toBe(true);
    if (getVer2Res.ok) {
      expect(getVer2Res.value).toHaveLength(0);
    }

    // 4. Update mappings for Version 1 (atomic replacement within transaction)
    const updateRes = mappingRepo.saveMappings({
      templateId: tplId,
      versionId: ver1Id,
      worksheetName: 'LightingAudit',
      headerRowNumber: 2,
      mappings: [
        {
          mappingType: 'FIXED_CELL',
          fieldId: 'FLD-COM-DATE',
          fieldLabel: 'Report Date',
          targetCoordinate: 'C2',
        },
      ],
    });
    expect(updateRes.ok).toBe(true);
    if (updateRes.ok) {
      expect(updateRes.value.headerRowNumber).toBe(2);
      expect(updateRes.value.mappings).toHaveLength(1);
      expect(updateRes.value.mappings[0].targetCoordinate).toBe('C2');
    }

    // 5. Delete mappings for Version 1
    const delRes = mappingRepo.deleteMappings(tplId, ver1Id, 'LightingAudit');
    expect(delRes.ok).toBe(true);

    const afterDelRes = mappingRepo.getMappings(tplId, ver1Id, 'LightingAudit');
    expect(afterDelRes.ok).toBe(true);
    if (afterDelRes.ok) {
      expect(afterDelRes.value).toHaveLength(0);
    }
  });

  it('MAP-07: Master template immutability — mapping workflow leaves master file 100% byte-for-byte unchanged', async () => {
    // 1. Create physical master file in vault
    const initialBuffer = createTestExcelWorkbook();
    const tplId = toTemplateId('TPL-SLT-TEST-07');
    const fileName = 'station_light_master_v1.xlsx';
    const filePath = path.join(vaultManager.templatesDir, fileName);
    fs.writeFileSync(filePath, initialBuffer);

    // Compute cryptographic SHA-256 before workflow
    const originalHash = crypto.createHash('sha256').update(initialBuffer).digest('hex');

    const cRes = templateRepo.createTemplate({
      templateId: tplId,
      templateName: 'Test SLT Template 07',
      categoryId: toReportCategoryId('RPT-STATION-LIGHT'),
      documentType: 'EXCEL_XLSX',
      fileName,
      status: 'ACTIVE',
    });
    expect(cRes.ok).toBe(true);

    const vRes = templateRepo.registerNewVersion({
      templateId: tplId,
      fileName,
      fileSizeBytes: initialBuffer.length,
      sha256Hash: originalHash,
      changeSummary: 'Initial v1 master asset',
      setActive: true,
    });
    expect(vRes.ok).toBe(true);
    if (!vRes.ok) return;
    const verId = vRes.value.version_id;

    // 2. Perform inspection (Stage 2)
    const inspRes = await inspector.inspectTemplate({
      templateId: tplId,
      versionId: verId,
    });
    expect(inspRes.ok).toBe(true);

    // 3. Perform header extraction and target validation (Stage 3 & 4)
    const valRes = mappingRepo.validateMappingItems([
      {
        mappingType: 'FIXED_CELL',
        fieldId: 'FLD-COM-DATE',
        fieldLabel: 'Report Date',
        targetCoordinate: 'B2',
      },
      {
        mappingType: 'TABLE_COLUMN',
        fieldId: 'FLD-SLT-STATUS',
        fieldLabel: 'Fixture Status',
        targetCoordinate: 'C',
        columnHeader: 'Status',
      },
    ]);
    expect(valRes.ok).toBe(true);

    // 4. Save mapping configuration to SQLite (Stage 5)
    const saveRes = mappingRepo.saveMappings({
      templateId: tplId,
      versionId: verId,
      worksheetName: 'LightingAudit',
      headerRowNumber: 1,
      mappings: [
        {
          mappingType: 'FIXED_CELL',
          fieldId: 'FLD-COM-DATE',
          fieldLabel: 'Report Date',
          targetCoordinate: 'B2',
        },
        {
          mappingType: 'TABLE_COLUMN',
          fieldId: 'FLD-SLT-STATUS',
          fieldLabel: 'Fixture Status',
          targetCoordinate: 'C',
          columnHeader: 'Status',
        },
      ],
    });
    expect(saveRes.ok).toBe(true);

    // 5. Read file from disk after all operations
    const postWorkflowBuffer = fs.readFileSync(filePath);
    const postWorkflowHash = crypto.createHash('sha256').update(postWorkflowBuffer).digest('hex');

    // Strict byte-for-byte immutability assertion
    expect(postWorkflowHash).toBe(originalHash);
    expect(postWorkflowBuffer.equals(initialBuffer)).toBe(true);
  });
});
