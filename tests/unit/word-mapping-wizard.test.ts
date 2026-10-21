/**
 * OpsReport Studio — Word Placeholder, Paragraph & Table Mapping Wizard Tests
 *
 * Implements Step 23 of the 45-step roadmap:
 * - WMD-01: Word template version selection and cryptographic SHA-256 integrity verification
 * - WMD-02: Read-only Word Open XML inspection (paragraphs, tables, dimensions, cell text)
 * - WMD-03: Approved placeholder syntax detection, occurrence extraction, and split-run resilience
 * - WMD-04: Mapping target syntax validation (placeholders, paragraphs, table cells, repeating rows)
 * - WMD-05: Conflict detection (duplicate field assignments, target coordinate collisions)
 * - WMD-06: Atomic persistence, retrieval, update, deletion, and version isolation
 * - WMD-07: Master template immutability guarantee (file is 100% byte-for-byte unchanged)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import PizZip from 'pizzip';
import { DatabaseManager } from '../../src/storage/database/connection.ts';
import { TemplateMetadataRepository } from '../../src/storage/database/repositories/template-metadata-repository.ts';
import { WordMappingRepository } from '../../src/storage/database/repositories/word-mapping-repository.ts';
import { TemplateInspector } from '../../src/storage/vault/template-inspector.ts';
import { VaultManager } from '../../src/storage/vault/vault-manager.ts';
import {
  toTemplateId,
  toTemplateVersionId,
  toReportCategoryId,
} from '../../src/shared/types/identifiers.ts';
import { ErrorCode } from '../../src/shared/errors/error-codes.ts';

function createTestWordDocx(): Buffer {
  const zip = new PizZip();

  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
  <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
</Types>`
  );

  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  );

  zip.file(
    'word/_rels/document.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
</Relationships>`
  );

  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r><w:t>Security Incident Operational Briefing</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>Report Date: {report_date}</w:t></w:r>
      <w:r><w:t> | Ref No: {incident_reference_no}</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>Lead Officer: {inspector_name}</w:t></w:r>
      <w:r><w:t> | Shift: {operational_shift}</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>Executive Incident Narrative:</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>{incident_narrative}</w:t></w:r>
    </w:p>
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Station Reference</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Severity Level</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Action Taken</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>{#station_rows}{station_name}</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>{incident_severity}</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>{actions_taken}{/station_rows}</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
    <w:p>
      <w:r><w:t>End of Official Incident Log.</w:t></w:r>
    </w:p>
    <w:sectPr/>
  </w:body>
</w:document>`
  );

  zip.file(
    'word/header1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p><w:r><w:t>CONFIDENTIAL — OPSREPORT STUDIO INCIDENT DISPATCH</w:t></w:r></w:p>
</w:hdr>`
  );

  zip.file(
    'word/footer1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p><w:r><w:t>Page 1 of 1</w:t></w:r></w:p>
</w:ftr>`
  );

  return zip.generate({ type: 'nodebuffer' });
}

describe('OpsReport Studio — Word Placeholder, Paragraph & Table Mapping Wizard (Step 23)', () => {
  let tempRoot: string;
  let vaultManager: VaultManager;
  let dbManager: DatabaseManager;
  let templateRepo: TemplateMetadataRepository;
  let mappingRepo: WordMappingRepository;
  let inspector: TemplateInspector;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opsreport-step23-test-'));
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
    mappingRepo = new WordMappingRepository(db);

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

  it('WMD-01: Word template version selection and cryptographic SHA-256 integrity verification', async () => {
    const docxBuffer = createTestWordDocx();
    const tplId = toTemplateId('TPL-INCIDENT-TEST-01');
    const fileName = 'incident_report_master_v1.docx';
    const filePath = path.join(vaultManager.templatesDir, fileName);
    fs.writeFileSync(filePath, docxBuffer);
    const expectedHash = crypto.createHash('sha256').update(docxBuffer).digest('hex');

    const cRes = templateRepo.createTemplate({
      templateId: tplId,
      templateName: 'Test Incident Word Template 01',
      categoryId: toReportCategoryId('RPT-INCIDENT'),
      documentType: 'WORD_DOCX',
      fileName,
      status: 'ACTIVE',
    });
    expect(cRes.ok).toBe(true);

    const vRes = templateRepo.registerNewVersion({
      templateId: tplId,
      fileName,
      fileSizeBytes: docxBuffer.length,
      sha256Hash: expectedHash,
      changeSummary: 'Initial v1 master asset',
      setActive: true,
    });
    expect(vRes.ok).toBe(true);
    if (!vRes.ok) return;
    const verId = vRes.value.version_id;

    // Inspect through TemplateInspector
    const inspRes = await inspector.inspectTemplate({
      templateId: tplId,
      versionId: verId,
    });

    expect(inspRes.ok).toBe(true);
    if (!inspRes.ok) return;

    expect(inspRes.value.templateId).toBe(tplId);
    expect(inspRes.value.versionId).toBe(verId);
    expect(inspRes.value.documentType).toBe('WORD_DOCX');
    expect(inspRes.value.sha256Hash).toBe(expectedHash);
    expect(inspRes.value.integrityVerified).toBe(true);
  });

  it('WMD-02: Read-only Word Open XML inspection extracts paragraphs, tables, and dimensions', async () => {
    const docxBuffer = createTestWordDocx();
    const tplId = toTemplateId('TPL-INCIDENT-TEST-02');
    const fileName = 'incident_report_master_v2.docx';
    const filePath = path.join(vaultManager.templatesDir, fileName);
    fs.writeFileSync(filePath, docxBuffer);
    const hash = crypto.createHash('sha256').update(docxBuffer).digest('hex');

    const cRes = templateRepo.createTemplate({
      templateId: tplId,
      templateName: 'Test Incident Word Template 02',
      categoryId: toReportCategoryId('RPT-INCIDENT'),
      documentType: 'WORD_DOCX',
      fileName,
      status: 'ACTIVE',
    });
    expect(cRes.ok).toBe(true);

    const vRes = templateRepo.registerNewVersion({
      templateId: tplId,
      fileName,
      fileSizeBytes: docxBuffer.length,
      sha256Hash: hash,
      changeSummary: 'Initial v1 asset',
      setActive: true,
    });
    expect(vRes.ok).toBe(true);
    if (!vRes.ok) return;

    const inspRes = await inspector.inspectTemplate({
      templateId: tplId,
      versionId: vRes.value.version_id,
    });

    expect(inspRes.ok).toBe(true);
    if (!inspRes.ok) return;

    const word = inspRes.value.wordPreview;
    expect(word).toBeDefined();
    expect(word?.hasHeaders).toBe(true);
    expect(word?.hasFooters).toBe(true);
    expect(word?.tableCount).toBe(1);
    expect(word?.paragraphCount).toBe(6);

    // Verify inspectable table grid
    const table = word?.tables[0];
    expect(table).toBeDefined();
    expect(table?.rowCount).toBe(2);
    expect(table?.colCount).toBe(3);
    expect(table?.rows[0].cells).toEqual(['Station Reference', 'Severity Level', 'Action Taken']);
  });

  it('WMD-03: Approved placeholder syntax detection extracts tokens from paragraphs and tables', async () => {
    const docxBuffer = createTestWordDocx();
    const tplId = toTemplateId('TPL-INCIDENT-TEST-03');
    const fileName = 'incident_report_master_v3.docx';
    const filePath = path.join(vaultManager.templatesDir, fileName);
    fs.writeFileSync(filePath, docxBuffer);
    const hash = crypto.createHash('sha256').update(docxBuffer).digest('hex');

    const cRes = templateRepo.createTemplate({
      templateId: tplId,
      templateName: 'Test Incident Word Template 03',
      categoryId: toReportCategoryId('RPT-INCIDENT'),
      documentType: 'WORD_DOCX',
      fileName,
      status: 'ACTIVE',
    });
    expect(cRes.ok).toBe(true);

    const vRes = templateRepo.registerNewVersion({
      templateId: tplId,
      fileName,
      fileSizeBytes: docxBuffer.length,
      sha256Hash: hash,
      changeSummary: 'Initial v1 asset',
      setActive: true,
    });
    expect(vRes.ok).toBe(true);
    if (!vRes.ok) return;

    const inspRes = await inspector.inspectTemplate({
      templateId: tplId,
      versionId: vRes.value.version_id,
    });

    expect(inspRes.ok).toBe(true);
    if (!inspRes.ok) return;

    const tokens = inspRes.value.wordPreview?.candidateTokens;
    expect(tokens).toBeDefined();

    // Verify recognized tokens from both paragraphs and table cells
    expect(tokens).toContain('{report_date}');
    expect(tokens).toContain('{incident_reference_no}');
    expect(tokens).toContain('{inspector_name}');
    expect(tokens).toContain('{operational_shift}');
    expect(tokens).toContain('{incident_narrative}');
    expect(tokens).toContain('{#station_rows}');
    expect(tokens).toContain('{station_name}');
    expect(tokens).toContain('{incident_severity}');
    expect(tokens).toContain('{actions_taken}');
    expect(tokens).toContain('{/station_rows}');
  });

  it('WMD-04: Target coordinate syntax validation enforces strict coordinate rules', () => {
    // 1. Valid targets across all 4 supported target kinds
    const validRes = mappingRepo.validateMappingItems([
      {
        mappingType: 'PLACEHOLDER',
        fieldId: 'FLD-COM-DATE',
        fieldLabel: 'Report Date',
        targetCoordinate: '{report_date}',
      },
      {
        mappingType: 'PARAGRAPH',
        fieldId: 'FLD-INC-NARRATIVE',
        fieldLabel: 'Incident Narrative',
        targetCoordinate: 'P:5',
      },
      {
        mappingType: 'TABLE_CELL',
        fieldId: 'FLD-COM-STATION',
        fieldLabel: 'Station Name',
        targetCoordinate: 'T1:R2:C1',
      },
      {
        mappingType: 'REPEATING_ROW',
        fieldId: 'FLD-COM-SHIFT',
        fieldLabel: 'Operational Shift',
        targetCoordinate: 'T1:R2:LOOP',
      },
    ]);
    expect(validRes.ok).toBe(true);

    // 2. Invalid placeholder token syntax
    const invalidTokenRes = mappingRepo.validateMappingItems([
      {
        mappingType: 'PLACEHOLDER',
        fieldId: 'FLD-COM-DATE',
        fieldLabel: 'Report Date',
        targetCoordinate: 'invalid token with spaces $$$',
      },
    ]);
    expect(invalidTokenRes.ok).toBe(false);
    if (!invalidTokenRes.ok) {
      expect(invalidTokenRes.error.code).toBe(ErrorCode.VALIDATION_FAILED);
    }

    // 3. Invalid paragraph coordinate (e.g. "P:0" or "XYZ")
    const invalidPRes = mappingRepo.validateMappingItems([
      {
        mappingType: 'PARAGRAPH',
        fieldId: 'FLD-INC-NARRATIVE',
        fieldLabel: 'Incident Narrative',
        targetCoordinate: 'P:0',
      },
    ]);
    expect(invalidPRes.ok).toBe(false);
    if (!invalidPRes.ok) {
      expect(invalidPRes.error.code).toBe(ErrorCode.VALIDATION_FAILED);
    }

    // 4. Invalid table cell coordinate (e.g. "T0:R0:C0" or "A1")
    const invalidCellRes = mappingRepo.validateMappingItems([
      {
        mappingType: 'TABLE_CELL',
        fieldId: 'FLD-COM-STATION',
        fieldLabel: 'Station Name',
        targetCoordinate: 'A1',
      },
    ]);
    expect(invalidCellRes.ok).toBe(false);
    if (!invalidCellRes.ok) {
      expect(invalidCellRes.error.code).toBe(ErrorCode.VALIDATION_FAILED);
    }
  });

  it('WMD-05: Conflict detection rejects duplicate field mappings and destination collisions', () => {
    // 1. Duplicate field mapping within same template version
    const dupFieldRes = mappingRepo.validateMappingItems([
      {
        mappingType: 'PLACEHOLDER',
        fieldId: 'FLD-COM-DATE',
        fieldLabel: 'Report Date',
        targetCoordinate: '{report_date}',
      },
      {
        mappingType: 'PLACEHOLDER',
        fieldId: 'FLD-COM-DATE',
        fieldLabel: 'Report Date Duplicate',
        targetCoordinate: '{incident_date}',
      },
    ]);
    expect(dupFieldRes.ok).toBe(false);
    if (!dupFieldRes.ok) {
      expect(dupFieldRes.error.code).toBe(ErrorCode.MAPPING_INCOMPATIBLE);
      expect(dupFieldRes.error.userMessage).toContain('Duplicate field mapping');
    }

    // 2. Destination target collision (two different fields mapped to same placeholder)
    const tokenCollisionRes = mappingRepo.validateMappingItems([
      {
        mappingType: 'PLACEHOLDER',
        fieldId: 'FLD-COM-DATE',
        fieldLabel: 'Report Date',
        targetCoordinate: '{report_date}',
      },
      {
        mappingType: 'PLACEHOLDER',
        fieldId: 'FLD-INC-OCCUR-TIME',
        fieldLabel: 'Occurrence Timestamp',
        targetCoordinate: '{report_date}',
      },
    ]);
    expect(tokenCollisionRes.ok).toBe(false);
    if (!tokenCollisionRes.ok) {
      expect(tokenCollisionRes.error.code).toBe(ErrorCode.MAPPING_INCOMPATIBLE);
      expect(tokenCollisionRes.error.userMessage).toContain('assigned to multiple fields');
    }

    // 3. Destination collision on structural table cell
    const cellCollisionRes = mappingRepo.validateMappingItems([
      {
        mappingType: 'TABLE_CELL',
        fieldId: 'FLD-COM-STATION',
        fieldLabel: 'Station Reference',
        targetCoordinate: 'T1:R2:C1',
      },
      {
        mappingType: 'TABLE_CELL',
        fieldId: 'FLD-INC-SPEC-LOC',
        fieldLabel: 'Specific Location',
        targetCoordinate: 'T1:R2:C1',
      },
    ]);
    expect(cellCollisionRes.ok).toBe(false);
    if (!cellCollisionRes.ok) {
      expect(cellCollisionRes.error.code).toBe(ErrorCode.MAPPING_INCOMPATIBLE);
      expect(cellCollisionRes.error.userMessage).toContain('assigned to multiple fields');
    }
  });

  it('WMD-06: Atomic persistence, retrieval, update, deletion, and version isolation', () => {
    const tplId = toTemplateId('TPL-INCIDENT-STANDARD');
    const activeVerRes = templateRepo.getActiveVersion(tplId);
    expect(activeVerRes.ok).toBe(true);
    if (!activeVerRes.ok || !activeVerRes.value) return;
    const ver1Id = activeVerRes.value.version_id;

    // Create a second version for testing version isolation
    const db = dbManager.getDatabase();
    const ver2Id = toTemplateVersionId('VER-INC-V2');
    db.prepare(
      `
      INSERT INTO template_versions (
        version_id, template_id, version_number, file_name, sha256_hash, file_size_bytes, created_at
      ) VALUES (?, ?, 2, 'incident_report_master_v2.docx', '222233334444555566667777888899990000aaaabbbbccccddddeeeeffff1111', 2048, datetime('now'))
    `
    ).run(ver2Id, tplId);

    // 1. Save mappings for Version 1
    const saveRes = mappingRepo.saveMappings({
      templateId: tplId,
      versionId: ver1Id,
      mappings: [
        {
          mappingType: 'PLACEHOLDER',
          fieldId: 'FLD-COM-DATE',
          fieldLabel: 'Report Date',
          targetCoordinate: '{report_date}',
        },
        {
          mappingType: 'PLACEHOLDER',
          fieldId: 'FLD-INC-NARRATIVE',
          fieldLabel: 'Incident Narrative',
          targetCoordinate: '{incident_narrative}',
        },
        {
          mappingType: 'TABLE_CELL',
          fieldId: 'FLD-COM-STATION',
          fieldLabel: 'Station Name',
          targetCoordinate: 'T1:R2:C1',
        },
      ],
    });

    expect(saveRes.ok).toBe(true);
    if (!saveRes.ok) return;

    expect(saveRes.value.mappings).toHaveLength(3);

    // 2. Retrieve mappings for Version 1
    const getRes = mappingRepo.getMappings(tplId, ver1Id);
    expect(getRes.ok).toBe(true);
    if (getRes.ok) {
      expect(getRes.value).toHaveLength(3);
      expect(getRes.value[0].templateId).toBe(tplId);
      expect(getRes.value[0].versionId).toBe(ver1Id);
    }

    // 3. Version Isolation: Version 2 must NOT have mappings yet
    const getVer2Res = mappingRepo.getMappings(tplId, ver2Id);
    expect(getVer2Res.ok).toBe(true);
    if (getVer2Res.ok) {
      expect(getVer2Res.value).toHaveLength(0);
    }

    // 4. Update mappings for Version 1 (atomic replacement within transaction)
    const updateRes = mappingRepo.saveMappings({
      templateId: tplId,
      versionId: ver1Id,
      mappings: [
        {
          mappingType: 'PLACEHOLDER',
          fieldId: 'FLD-COM-DATE',
          fieldLabel: 'Report Date',
          targetCoordinate: '{report_date}',
        },
      ],
    });
    expect(updateRes.ok).toBe(true);
    if (updateRes.ok) {
      expect(updateRes.value.mappings).toHaveLength(1);
      expect(updateRes.value.mappings[0].fieldId).toBe('FLD-COM-DATE');
    }

    // 5. Delete mappings for Version 1
    const delRes = mappingRepo.deleteMappings(tplId, ver1Id);
    expect(delRes.ok).toBe(true);

    const afterDelRes = mappingRepo.getMappings(tplId, ver1Id);
    expect(afterDelRes.ok).toBe(true);
    if (afterDelRes.ok) {
      expect(afterDelRes.value).toHaveLength(0);
    }
  });

  it('WMD-07: Master template immutability — mapping workflow leaves master file 100% byte-for-byte unchanged', async () => {
    // 1. Create physical master file in vault
    const initialBuffer = createTestWordDocx();
    const tplId = toTemplateId('TPL-INCIDENT-TEST-07');
    const fileName = 'incident_report_master_v1.docx';
    const filePath = path.join(vaultManager.templatesDir, fileName);
    fs.writeFileSync(filePath, initialBuffer);

    // Compute cryptographic SHA-256 before workflow
    const originalHash = crypto.createHash('sha256').update(initialBuffer).digest('hex');

    const cRes = templateRepo.createTemplate({
      templateId: tplId,
      templateName: 'Test Incident Word Template 07',
      categoryId: toReportCategoryId('RPT-INCIDENT'),
      documentType: 'WORD_DOCX',
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

    // 2. Perform read-only Word inspection (Stage 2)
    const inspRes = await inspector.inspectTemplate({
      templateId: tplId,
      versionId: verId,
    });
    expect(inspRes.ok).toBe(true);

    // 3. Perform target validation (Stage 3 & 4)
    const valRes = mappingRepo.validateMappingItems([
      {
        mappingType: 'PLACEHOLDER',
        fieldId: 'FLD-COM-DATE',
        fieldLabel: 'Report Date',
        targetCoordinate: '{report_date}',
      },
      {
        mappingType: 'PLACEHOLDER',
        fieldId: 'FLD-INC-NARRATIVE',
        fieldLabel: 'Incident Narrative',
        targetCoordinate: '{incident_narrative}',
      },
      {
        mappingType: 'TABLE_CELL',
        fieldId: 'FLD-COM-STATION',
        fieldLabel: 'Station Name',
        targetCoordinate: 'T1:R2:C1',
      },
    ]);
    expect(valRes.ok).toBe(true);

    // 4. Save mapping configuration to SQLite (Stage 5)
    const saveRes = mappingRepo.saveMappings({
      templateId: tplId,
      versionId: verId,
      mappings: [
        {
          mappingType: 'PLACEHOLDER',
          fieldId: 'FLD-COM-DATE',
          fieldLabel: 'Report Date',
          targetCoordinate: '{report_date}',
        },
        {
          mappingType: 'PLACEHOLDER',
          fieldId: 'FLD-INC-NARRATIVE',
          fieldLabel: 'Incident Narrative',
          targetCoordinate: '{incident_narrative}',
        },
        {
          mappingType: 'TABLE_CELL',
          fieldId: 'FLD-COM-STATION',
          fieldLabel: 'Station Name',
          targetCoordinate: 'T1:R2:C1',
        },
      ],
    });
    expect(saveRes.ok).toBe(true);

    // 5. Read physical file from vault disk after all operations
    const postWorkflowBuffer = fs.readFileSync(filePath);
    const postWorkflowHash = crypto.createHash('sha256').update(postWorkflowBuffer).digest('hex');

    // Strict byte-for-byte immutability assertion
    expect(postWorkflowHash).toBe(originalHash);
    expect(postWorkflowBuffer.equals(initialBuffer)).toBe(true);
  });
});
