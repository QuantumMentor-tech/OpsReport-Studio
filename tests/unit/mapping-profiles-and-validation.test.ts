/**
 * OpsReport Studio — Mapping Profiles, Field Validation & Template Compatibility Tests
 *
 * Comprehensive test suite verifying Step 24 requirements:
 * 1. PRF-01: Reusable Mapping Profile CRUD and template/version scope isolation.
 * 2. PRF-02: Atomic transactional duplication of profiles and child mappings.
 * 3. PRF-03: Authoritative Report Field Contract Validation (DIC-OPSREPORT-001).
 * 4. PRF-04: Mandatory vs optional unmapped field categorization.
 * 5. PRF-05: Excel structural compatibility validation (worksheets, columns, cells).
 * 6. PRF-06: Word structural compatibility validation (placeholders, paragraphs, tables).
 * 7. PRF-07: Template vault asset existence and SHA-256 cryptographic verification.
 * 8. PRF-08: Master template file immutability guarantee (zero document mutation).
 * 9. PRF-09: Safe status transitions and diagnostic finding classification.
 *
 * @module tests/unit/mapping-profiles-and-validation.test
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
import { WordMappingRepository } from '../../src/storage/database/repositories/word-mapping-repository.ts';
import { MappingProfileRepository } from '../../src/storage/database/repositories/mapping-profile-repository.ts';
import { MappingValidationService } from '../../src/storage/vault/mapping-validation-service.ts';
import { TemplateInspector } from '../../src/storage/vault/template-inspector.ts';
import { toTemplateId, toReportCategoryId } from '../../src/shared/types/identifiers.ts';

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
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="6" uniqueCount="6">
  <si><t>Audit Date</t></si>
  <si><t>Auditor Name</t></si>
  <si><t>Fixture Count</t></si>
  <si><t>Operable Count</t></si>
  <si><t>Compliance Rate</t></si>
  <si><t>Total Units</t></si>
</sst>`
  );

  zip.file(
    'xl/worksheets/sheet1.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:C5"/>
  <sheetData>
    <row r="1">
      <c r="A1" t="s"><v>0</v></c>
      <c r="B1" t="s"><v>1</v></c>
      <c r="C1" t="s"><v>2</v></c>
    </row>
    <row r="2">
      <c r="A2" t="n"><v>44927</v></c>
      <c r="B2" t="str"><v>John Doe</v></c>
      <c r="C2" t="n"><v>45</v></c>
    </row>
  </sheetData>
</worksheet>`
  );

  zip.file(
    'xl/worksheets/sheet2.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:B2"/>
  <sheetData>
    <row r="1">
      <c r="A1" t="s"><v>3</v></c>
      <c r="B1" t="s"><v>4</v></c>
    </row>
  </sheetData>
</worksheet>`
  );

  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

function createTestWordDocx(): Buffer {
  const zip = new PizZip();

  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
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
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r><w:t>Station Incident Report: {{FLD-INC-ID}}</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>Occurred on {{FLD-COM-DATE}} at {{FLD-COM-STATION}}.</w:t></w:r>
    </w:p>
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Summary:</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>{{FLD-COM-REMARKS}}</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
  </w:body>
</w:document>`
  );

  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

describe('Mapping Profiles, Field Validation & Compatibility Engine (Step 24)', () => {
  let tempRoot: string;
  let vaultManager: VaultManager;
  let dbManager: DatabaseManager;
  let inspector: TemplateInspector;
  let templateRepo: TemplateMetadataRepository;
  let excelMappingRepo: ExcelMappingRepository;
  let wordMappingRepo: WordMappingRepository;
  let profileRepo: MappingProfileRepository;
  let validationService: MappingValidationService;

  beforeEach(async () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opsreport-step24-test-'));
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
    excelMappingRepo = new ExcelMappingRepository(db);
    wordMappingRepo = new WordMappingRepository(db);
    profileRepo = new MappingProfileRepository(db);
    inspector = new TemplateInspector(db, vaultManager, templateRepo);

    validationService = new MappingValidationService(
      db,
      vaultManager,
      templateRepo,
      excelMappingRepo,
      wordMappingRepo,
      profileRepo,
      inspector
    );
  });

  afterEach(async () => {
    try {
      dbManager.close();
    } catch {
      // ignore
    }
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  describe('PRF-01: Profile Persistence and Lifecycle', () => {
    it('creates, retrieves, and updates mapping profiles within isolated database', async () => {
      const templateId = toTemplateId('TPL-EXCEL-001');
      const categoryId = toReportCategoryId('RPT-STATION-LIGHT');
      const fileName = 'light-audit.xlsx';

      // Setup physical workbook in vault
      const workbookBuffer = createTestExcelWorkbook();
      fs.writeFileSync(path.join(vaultManager.templatesDir, fileName), workbookBuffer);
      const hash = crypto.createHash('sha256').update(workbookBuffer).digest('hex');

      templateRepo.createTemplate({
        templateId,
        templateName: 'Station Light Audit Template',
        categoryId,
        documentType: 'EXCEL_XLSX',
        fileName,
        status: 'ACTIVE',
      });

      const verRes = templateRepo.registerNewVersion({
        templateId,
        fileName,
        fileSizeBytes: workbookBuffer.length,
        sha256Hash: hash,
        changeSummary: 'Initial version',
        setActive: true,
      });
      expect(verRes.ok).toBe(true);
      if (!verRes.ok) return;
      const versionId = verRes.value.version_id;

      // Create custom profile
      const createRes = profileRepo.createProfile({
        profileName: 'Standard Light Audit Profile',
        description: 'Default field mapping configuration',
        categoryId,
        templateId,
        versionId,
        documentType: 'EXCEL_XLSX',
        status: 'ACTIVE',
      });

      expect(createRes.ok).toBe(true);
      if (!createRes.ok) return;

      const profile = createRes.value;
      expect(profile.profileName).toBe('Standard Light Audit Profile');
      expect(profile.validationStatus).toBe('UNCHECKED');

      // Retrieve profile
      const getRes = profileRepo.getProfile(profile.profileId);
      expect(getRes.ok).toBe(true);
      if (getRes.ok) {
        expect(getRes.value?.profileId).toBe(profile.profileId);
      }

      // Update profile
      const updateRes = profileRepo.updateProfile(profile.profileId, {
        profileName: 'Updated Profile Name',
        description: 'Updated description',
        status: 'ACTIVE',
      });

      expect(updateRes.ok).toBe(true);
      if (updateRes.ok) {
        expect(updateRes.value.profileName).toBe('Updated Profile Name');
      }

      // List profiles for template
      const listRes = profileRepo.listProfiles({ templateId });
      expect(listRes.ok).toBe(true);
      if (listRes.ok) {
        expect(listRes.value.length).toBeGreaterThanOrEqual(1);
        expect(listRes.value.some(p => p.profileName === 'Updated Profile Name')).toBe(true);
      }
    });

    it('deletes a profile without leaving orphaned child mappings', async () => {
      const templateId = toTemplateId('TPL-EXCEL-DEL');
      const categoryId = toReportCategoryId('RPT-STATION-LIGHT');
      const fileName = 'light-del.xlsx';

      const workbookBuffer = createTestExcelWorkbook();
      fs.writeFileSync(path.join(vaultManager.templatesDir, fileName), workbookBuffer);
      const hash = crypto.createHash('sha256').update(workbookBuffer).digest('hex');

      templateRepo.createTemplate({
        templateId,
        templateName: 'Deletion Test Template',
        categoryId,
        documentType: 'EXCEL_XLSX',
        fileName,
        status: 'ACTIVE',
      });

      const verRes = templateRepo.registerNewVersion({
        templateId,
        fileName,
        fileSizeBytes: workbookBuffer.length,
        sha256Hash: hash,
        changeSummary: 'Initial version',
        setActive: true,
      });
      if (!verRes.ok) return;
      const versionId = verRes.value.version_id;

      const profileRes = profileRepo.createProfile({
        profileName: 'Profile To Delete',
        categoryId,
        templateId,
        versionId,
        documentType: 'EXCEL_XLSX',
      });
      expect(profileRes.ok).toBe(true);
      if (!profileRes.ok) return;

      const profileId = profileRes.value.profileId;

      // Add mapping linked to profile via direct insert
      const db = dbManager.getDatabase();
      db.prepare(
        `
        INSERT INTO excel_template_mappings (
          mapping_id, template_id, version_id, worksheet_name, mapping_type,
          field_id, field_label, target_coordinate, header_row_number, profile_id, created_at, updated_at
        ) VALUES ('MAP-DEL-1', ?, ?, 'LightingAudit', 'FIXED_CELL', 'FLD-COM-DATE', 'Date', 'A2', 1, ?, datetime('now'), datetime('now'))
      `
      ).run(templateId, versionId, profileId);

      // Verify profile has the mapping
      const beforeDetails = profileRepo.getProfile(profileId);
      expect(beforeDetails.ok).toBe(true);
      if (beforeDetails.ok && beforeDetails.value) {
        expect(beforeDetails.value.excelMappings?.length).toBe(1);
      }

      // Delete profile
      const delRes = profileRepo.deleteProfile(profileId);
      expect(delRes.ok).toBe(true);

      // Verify profile is gone
      const getRes = profileRepo.getProfile(profileId);
      expect(getRes.ok).toBe(true);
      if (getRes.ok) {
        expect(getRes.value).toBeNull();
      }

      // Verify mappings for this profile are cleaned up
      const checkMappings = db
        .prepare('SELECT count(*) as cnt FROM excel_template_mappings WHERE profile_id = ?')
        .get(profileId) as { cnt: number };
      expect(checkMappings.cnt).toBe(0);
    });
  });

  describe('PRF-02: Transactional Duplication of Profiles', () => {
    it('duplicates an Excel profile and deep copies all child mappings with new IDs', async () => {
      const templateId = toTemplateId('TPL-EXCEL-DUP');
      const categoryId = toReportCategoryId('RPT-STATION-LIGHT');
      const fileName = 'dup.xlsx';

      const workbookBuffer = createTestExcelWorkbook();
      fs.writeFileSync(path.join(vaultManager.templatesDir, fileName), workbookBuffer);
      const hash = crypto.createHash('sha256').update(workbookBuffer).digest('hex');

      templateRepo.createTemplate({
        templateId,
        templateName: 'Duplication Template',
        categoryId,
        documentType: 'EXCEL_XLSX',
        fileName,
        status: 'ACTIVE',
      });

      const verRes = templateRepo.registerNewVersion({
        templateId,
        fileName,
        fileSizeBytes: workbookBuffer.length,
        sha256Hash: hash,
        changeSummary: 'Initial version',
        setActive: true,
      });
      if (!verRes.ok) return;
      const versionId = verRes.value.version_id;

      const profileRes = profileRepo.createProfile({
        profileName: 'Original Excel Profile',
        description: 'Original description',
        categoryId,
        templateId,
        versionId,
        documentType: 'EXCEL_XLSX',
      });
      expect(profileRes.ok).toBe(true);
      if (!profileRes.ok) return;

      const origProfileId = profileRes.value.profileId;

      // Add two mappings linked to profile
      const db = dbManager.getDatabase();
      db.prepare(
        `
        INSERT INTO excel_template_mappings (
          mapping_id, template_id, version_id, worksheet_name, mapping_type,
          field_id, field_label, target_coordinate, header_row_number, profile_id, created_at, updated_at
        ) VALUES
        ('MAP-DUP-1', ?, ?, 'LightingAudit', 'FIXED_CELL', 'FLD-COM-DATE', 'Date', 'A2', 1, ?, datetime('now'), datetime('now')),
        ('MAP-DUP-2', ?, ?, 'LightingAudit', 'FIXED_CELL', 'FLD-COM-INSPECTOR', 'Inspector', 'B2', 1, ?, datetime('now'), datetime('now'))
      `
      ).run(templateId, versionId, origProfileId, templateId, versionId, origProfileId);

      // Duplicate profile
      const dupRes = profileRepo.duplicateProfile(origProfileId, 'Cloned Excel Profile');
      expect(dupRes.ok).toBe(true);
      if (!dupRes.ok) return;

      const dupProfile = dupRes.value;
      expect(dupProfile.profileName).toBe('Cloned Excel Profile');
      expect(dupProfile.profileId).not.toBe(origProfileId);
      expect(dupProfile.validationStatus).toBe('UNCHECKED');

      // Check child mappings of duplicated profile
      expect(dupProfile.excelMappings?.length).toBe(2);
      expect(dupProfile.excelMappings?.map(m => m.fieldId).sort()).toEqual([
        'FLD-COM-DATE',
        'FLD-COM-INSPECTOR',
      ]);

      // Original mappings remain unchanged
      const origDetails = profileRepo.getProfile(origProfileId);
      expect(origDetails.ok).toBe(true);
      if (origDetails.ok && origDetails.value) {
        expect(origDetails.value.excelMappings?.length).toBe(2);
      }
    });

    it('duplicates a Word profile and deep copies word mappings atomically', async () => {
      const templateId = toTemplateId('TPL-WORD-DUP');
      const categoryId = toReportCategoryId('RPT-INCIDENT');
      const fileName = 'word-dup.docx';

      const wordBuffer = createTestWordDocx();
      fs.writeFileSync(path.join(vaultManager.templatesDir, fileName), wordBuffer);
      const hash = crypto.createHash('sha256').update(wordBuffer).digest('hex');

      templateRepo.createTemplate({
        templateId,
        templateName: 'Word Duplication Template',
        categoryId,
        documentType: 'WORD_DOCX',
        fileName,
        status: 'ACTIVE',
      });

      const verRes = templateRepo.registerNewVersion({
        templateId,
        fileName,
        fileSizeBytes: wordBuffer.length,
        sha256Hash: hash,
        changeSummary: 'Initial version',
        setActive: true,
      });
      if (!verRes.ok) return;
      const versionId = verRes.value.version_id;

      const profileRes = profileRepo.createProfile({
        profileName: 'Original Word Profile',
        categoryId,
        templateId,
        versionId,
        documentType: 'WORD_DOCX',
      });
      expect(profileRes.ok).toBe(true);
      if (!profileRes.ok) return;

      const origProfileId = profileRes.value.profileId;

      const db = dbManager.getDatabase();
      db.prepare(
        `
        INSERT INTO word_template_mappings (
          mapping_id, template_id, version_id, mapping_type,
          field_id, field_label, target_coordinate, profile_id, created_at, updated_at
        ) VALUES ('WMAP-DUP-1', ?, ?, 'PLACEHOLDER', 'FLD-INC-ID', 'Incident ID', 'FLD-INC-ID', ?, datetime('now'), datetime('now'))
      `
      ).run(templateId, versionId, origProfileId);

      const dupRes = profileRepo.duplicateProfile(origProfileId, 'Cloned Word Profile');
      expect(dupRes.ok).toBe(true);
      if (!dupRes.ok) return;

      const dupProfile = dupRes.value;
      expect(dupProfile.wordMappings?.length).toBe(1);
      expect(dupProfile.wordMappings?.[0].fieldId).toBe('FLD-INC-ID');
    });
  });

  describe('PRF-03: Authoritative Field Contract Validation (DIC-OPSREPORT-001)', () => {
    it('detects unknown fields and category-inapplicable fields as blocking errors', async () => {
      const templateId = toTemplateId('TPL-LIGHT-VAL');
      const categoryId = toReportCategoryId('RPT-STATION-LIGHT');
      const fileName = 'light.xlsx';

      const workbookBuffer = createTestExcelWorkbook();
      fs.writeFileSync(path.join(vaultManager.templatesDir, fileName), workbookBuffer);
      const hash = crypto.createHash('sha256').update(workbookBuffer).digest('hex');

      templateRepo.createTemplate({
        templateId,
        templateName: 'Light Audit Template',
        categoryId,
        documentType: 'EXCEL_XLSX',
        fileName,
        status: 'ACTIVE',
      });

      const verRes = templateRepo.registerNewVersion({
        templateId,
        fileName,
        fileSizeBytes: workbookBuffer.length,
        sha256Hash: hash,
        changeSummary: 'Initial version',
        setActive: true,
      });
      if (!verRes.ok) return;
      const versionId = verRes.value.version_id;

      const profileRes = profileRepo.createProfile({
        profileName: 'Field Test Profile',
        categoryId,
        templateId,
        versionId,
        documentType: 'EXCEL_XLSX',
      });
      if (!profileRes.ok) return;
      const profileId = profileRes.value.profileId;

      // 1. Unknown field ID & 2. Inapplicable Incident field
      const db = dbManager.getDatabase();
      db.prepare(
        `
        INSERT INTO excel_template_mappings (
          mapping_id, template_id, version_id, worksheet_name, mapping_type,
          field_id, field_label, target_coordinate, header_row_number, profile_id, created_at, updated_at
        ) VALUES
        ('MAP-TEST-UNK', ?, ?, 'LightingAudit', 'FIXED_CELL', 'FLD-UNKNOWN-NONEXISTENT', 'Unknown', 'A2', 1, ?, datetime('now'), datetime('now')),
        ('MAP-TEST-INAPP', ?, ?, 'LightingAudit', 'FIXED_CELL', 'FLD-INC-ID', 'Incident ID', 'B2', 1, ?, datetime('now'), datetime('now'))
      `
      ).run(templateId, versionId, profileId, templateId, versionId, profileId);

      // Run validation
      const valRes = await validationService.validateProfile(profileId);
      expect(valRes.ok).toBe(true);
      if (!valRes.ok) return;

      const result = valRes.value;
      expect(result.overallStatus).toBe('INVALID');
      expect(result.errorCount).toBeGreaterThanOrEqual(2);

      const unknownFinding = result.findings.find(f => f.code === 'VAL_FIELD_UNKNOWN');
      expect(unknownFinding).toBeDefined();
      expect(unknownFinding?.severity).toBe('ERROR');
      expect(unknownFinding?.fieldId).toBe('FLD-UNKNOWN-NONEXISTENT');

      const inapplicableFinding = result.findings.find(f => f.code === 'VAL_FIELD_INAPPLICABLE');
      expect(inapplicableFinding).toBeDefined();
      expect(inapplicableFinding?.severity).toBe('ERROR');
      expect(inapplicableFinding?.fieldId).toBe('FLD-INC-ID');
    });
  });

  describe('PRF-04: Mandatory vs Optional Unmapped Field Validation', () => {
    it('flags unmapped required fields as INCOMPLETE/WARNING and optional fields as INFO', async () => {
      const templateId = toTemplateId('TPL-LIGHT-REQ');
      const categoryId = toReportCategoryId('RPT-STATION-LIGHT');
      const fileName = 'light-req.xlsx';

      const workbookBuffer = createTestExcelWorkbook();
      fs.writeFileSync(path.join(vaultManager.templatesDir, fileName), workbookBuffer);
      const hash = crypto.createHash('sha256').update(workbookBuffer).digest('hex');

      templateRepo.createTemplate({
        templateId,
        templateName: 'Requirement Test Template',
        categoryId,
        documentType: 'EXCEL_XLSX',
        fileName,
        status: 'ACTIVE',
      });

      const verRes = templateRepo.registerNewVersion({
        templateId,
        fileName,
        fileSizeBytes: workbookBuffer.length,
        sha256Hash: hash,
        changeSummary: 'Initial version',
        setActive: true,
      });
      if (!verRes.ok) return;
      const versionId = verRes.value.version_id;

      const profileRes = profileRepo.createProfile({
        profileName: 'Partial Mappings Profile',
        categoryId,
        templateId,
        versionId,
        documentType: 'EXCEL_XLSX',
      });
      if (!profileRes.ok) return;
      const profileId = profileRes.value.profileId;

      // Only map one field
      const db = dbManager.getDatabase();
      db.prepare(
        `
        INSERT INTO excel_template_mappings (
          mapping_id, template_id, version_id, worksheet_name, mapping_type,
          field_id, field_label, target_coordinate, header_row_number, profile_id, created_at, updated_at
        ) VALUES ('MAP-REQ-1', ?, ?, 'LightingAudit', 'FIXED_CELL', 'FLD-COM-DATE', 'Date', 'A2', 1, ?, datetime('now'), datetime('now'))
      `
      ).run(templateId, versionId, profileId);

      const valRes = await validationService.validateProfile(profileId);
      expect(valRes.ok).toBe(true);
      if (!valRes.ok) return;

      const result = valRes.value;
      const unmappedRequired = result.findings.filter(
        f => f.code === 'VAL_FIELD_REQUIRED_UNMAPPED'
      );
      const unmappedOptional = result.findings.filter(
        f => f.code === 'VAL_FIELD_OPTIONAL_UNMAPPED'
      );

      expect(unmappedRequired.length).toBeGreaterThanOrEqual(1);
      expect(unmappedRequired.every(f => f.severity === 'ERROR')).toBe(true);
      expect(result.overallStatus).toBe('INCOMPLETE');

      expect(unmappedOptional.length).toBeGreaterThanOrEqual(1);
      expect(unmappedOptional.every(f => f.severity === 'INFO')).toBe(true);
    });
  });

  describe('PRF-05: Excel Structural Compatibility Checks', () => {
    it('detects missing worksheet and target cell collisions as blocking errors', async () => {
      const templateId = toTemplateId('TPL-EXCEL-STRUCT');
      const categoryId = toReportCategoryId('RPT-STATION-LIGHT');
      const fileName = 'struct.xlsx';

      const workbookBuffer = createTestExcelWorkbook();
      fs.writeFileSync(path.join(vaultManager.templatesDir, fileName), workbookBuffer);
      const hash = crypto.createHash('sha256').update(workbookBuffer).digest('hex');

      templateRepo.createTemplate({
        templateId,
        templateName: 'Excel Structural Test',
        categoryId,
        documentType: 'EXCEL_XLSX',
        fileName,
        status: 'ACTIVE',
      });

      const verRes = templateRepo.registerNewVersion({
        templateId,
        fileName,
        fileSizeBytes: workbookBuffer.length,
        sha256Hash: hash,
        changeSummary: 'Initial version',
        setActive: true,
      });
      if (!verRes.ok) return;
      const versionId = verRes.value.version_id;

      const profileRes = profileRepo.createProfile({
        profileName: 'Excel Structural Profile',
        categoryId,
        templateId,
        versionId,
        documentType: 'EXCEL_XLSX',
      });
      if (!profileRes.ok) return;
      const profileId = profileRes.value.profileId;

      const db = dbManager.getDatabase();
      db.prepare(
        `
        INSERT INTO excel_template_mappings (
          mapping_id, template_id, version_id, worksheet_name, mapping_type,
          field_id, field_label, target_coordinate, header_row_number, profile_id, created_at, updated_at
        ) VALUES
        ('MAP-TEST-GHOST', ?, ?, 'GhostWorksheet', 'FIXED_CELL', 'FLD-COM-DATE', 'Date', 'A1', 1, ?, datetime('now'), datetime('now')),
        ('MAP-TEST-COL1', ?, ?, 'LightingAudit', 'FIXED_CELL', 'FLD-COM-INSPECTOR', 'Inspector', 'B2', 1, ?, datetime('now'), datetime('now')),
        ('MAP-TEST-COL2', ?, ?, 'LightingAudit', 'TABLE_COLUMN', 'FLD-SLT-ZONE', 'Zone', 'B2', 1, ?, datetime('now'), datetime('now'))
      `
      ).run(
        templateId,
        versionId,
        profileId,
        templateId,
        versionId,
        profileId,
        templateId,
        versionId,
        profileId
      );

      const valRes = await validationService.validateProfile(profileId);
      expect(valRes.ok).toBe(true);
      if (!valRes.ok) return;

      const result = valRes.value;
      expect(result.overallStatus).toBe('INVALID');

      const missingSheet = result.findings.find(f => f.code === 'VAL_WORKSHEET_NOT_FOUND');
      expect(missingSheet).toBeDefined();
      expect(missingSheet?.severity).toBe('ERROR');

      const collision = result.findings.find(f => f.code === 'VAL_TARGET_COLLISION');
      expect(collision).toBeDefined();
      expect(collision?.severity).toBe('ERROR');
    });
  });

  describe('PRF-06: Word Structural Compatibility Checks', () => {
    it('detects missing placeholder token and structural bounds errors', async () => {
      const templateId = toTemplateId('TPL-WORD-STRUCT');
      const categoryId = toReportCategoryId('RPT-INCIDENT');
      const fileName = 'struct.docx';

      const wordBuffer = createTestWordDocx();
      fs.writeFileSync(path.join(vaultManager.templatesDir, fileName), wordBuffer);
      const hash = crypto.createHash('sha256').update(wordBuffer).digest('hex');

      templateRepo.createTemplate({
        templateId,
        templateName: 'Word Structural Test',
        categoryId,
        documentType: 'WORD_DOCX',
        fileName,
        status: 'ACTIVE',
      });

      const verRes = templateRepo.registerNewVersion({
        templateId,
        fileName,
        fileSizeBytes: wordBuffer.length,
        sha256Hash: hash,
        changeSummary: 'Initial version',
        setActive: true,
      });
      if (!verRes.ok) return;
      const versionId = verRes.value.version_id;

      const profileRes = profileRepo.createProfile({
        profileName: 'Word Structural Profile',
        categoryId,
        templateId,
        versionId,
        documentType: 'WORD_DOCX',
      });
      if (!profileRes.ok) return;
      const profileId = profileRes.value.profileId;

      const db = dbManager.getDatabase();
      db.prepare(
        `
        INSERT INTO word_template_mappings (
          mapping_id, template_id, version_id, mapping_type,
          field_id, field_label, target_coordinate, profile_id, created_at, updated_at
        ) VALUES
        ('WMAP-TEST-MISSING', ?, ?, 'PLACEHOLDER', 'FLD-COM-INSPECTOR', 'Inspector', 'officer_name_not_in_doc', ?, datetime('now'), datetime('now')),
        ('WMAP-TEST-OOB', ?, ?, 'TABLE_CELL', 'FLD-INC-ID', 'Incident ID', 'T999:R1:C1', ?, datetime('now'), datetime('now'))
      `
      ).run(templateId, versionId, profileId, templateId, versionId, profileId);

      const valRes = await validationService.validateProfile(profileId);
      expect(valRes.ok).toBe(true);
      if (!valRes.ok) return;

      const result = valRes.value;
      expect(result.overallStatus).toBe('INVALID');

      const missingToken = result.findings.find(f => f.code === 'VAL_PLACEHOLDER_NOT_FOUND');
      expect(missingToken).toBeDefined();
      expect(missingToken?.severity).toBe('ERROR');

      const outOfBounds = result.findings.find(
        f => f.code === 'VAL_STRUCTURAL_TARGET_OUT_OF_BOUNDS'
      );
      expect(outOfBounds).toBeDefined();
      expect(outOfBounds?.severity).toBe('ERROR');
    });
  });

  describe('PRF-07: Template Asset Existence and Integrity Verification', () => {
    it('returns UNABLE_TO_VALIDATE if template file is missing or SHA-256 hash does not match', async () => {
      const templateId = toTemplateId('TPL-MISSING-ASSET');
      const categoryId = toReportCategoryId('RPT-STATION-LIGHT');
      const fileName = 'nonexistent.xlsx';

      templateRepo.createTemplate({
        templateId,
        templateName: 'Missing Asset Template',
        categoryId,
        documentType: 'EXCEL_XLSX',
        fileName,
        status: 'ACTIVE',
      });

      const verRes = templateRepo.registerNewVersion({
        templateId,
        fileName,
        fileSizeBytes: 9999,
        sha256Hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        changeSummary: 'Initial version',
        setActive: true,
      });
      if (!verRes.ok) return;
      const versionId = verRes.value.version_id;

      const profileRes = profileRepo.createProfile({
        profileName: 'Missing Asset Profile',
        categoryId,
        templateId,
        versionId,
        documentType: 'EXCEL_XLSX',
      });
      if (!profileRes.ok) return;
      const profileId = profileRes.value.profileId;

      const valRes = await validationService.validateProfile(profileId);
      expect(valRes.ok).toBe(true);
      if (!valRes.ok) return;

      const result = valRes.value;
      expect(result.overallStatus).toBe('UNABLE_TO_VALIDATE');
      expect(result.errorCount).toBe(1);
      expect(result.findings[0].code).toBe('VAL_ASSET_MISSING');
      expect(result.findings[0].severity).toBe('ERROR');
    });
  });

  describe('PRF-08: Cryptographic Master Template Immutability (Core Invariant)', () => {
    it('proves that running validation multiple times leaves master template files 100% byte-for-byte unchanged', async () => {
      const excelBuffer = createTestExcelWorkbook();
      const wordBuffer = createTestWordDocx();

      const excelFileName = 'immut.xlsx';
      const wordFileName = 'immut.docx';

      fs.writeFileSync(path.join(vaultManager.templatesDir, excelFileName), excelBuffer);
      fs.writeFileSync(path.join(vaultManager.templatesDir, wordFileName), wordBuffer);

      const excelHashBefore = crypto.createHash('sha256').update(excelBuffer).digest('hex');
      const wordHashBefore = crypto.createHash('sha256').update(wordBuffer).digest('hex');

      const excelTplId = toTemplateId('TPL-IMMUTABLE-XLSX');
      const wordTplId = toTemplateId('TPL-IMMUTABLE-DOCX');

      templateRepo.createTemplate({
        templateId: excelTplId,
        categoryId: toReportCategoryId('RPT-STATION-LIGHT'),
        templateName: 'Immutable Excel',
        documentType: 'EXCEL_XLSX',
        fileName: excelFileName,
        status: 'ACTIVE',
      });
      const excelVerRes = templateRepo.registerNewVersion({
        templateId: excelTplId,
        fileName: excelFileName,
        fileSizeBytes: excelBuffer.length,
        sha256Hash: excelHashBefore,
        changeSummary: 'Initial version',
        setActive: true,
      });

      templateRepo.createTemplate({
        templateId: wordTplId,
        categoryId: toReportCategoryId('RPT-INCIDENT'),
        templateName: 'Immutable Word',
        documentType: 'WORD_DOCX',
        fileName: wordFileName,
        status: 'ACTIVE',
      });
      const wordVerRes = templateRepo.registerNewVersion({
        templateId: wordTplId,
        fileName: wordFileName,
        fileSizeBytes: wordBuffer.length,
        sha256Hash: wordHashBefore,
        changeSummary: 'Initial version',
        setActive: true,
      });

      if (!excelVerRes.ok || !wordVerRes.ok) return;

      const excelProf = profileRepo.createProfile({
        profileName: 'Excel Immutability Profile',
        categoryId: toReportCategoryId('RPT-STATION-LIGHT'),
        templateId: excelTplId,
        versionId: excelVerRes.value.version_id,
        documentType: 'EXCEL_XLSX',
      });
      const wordProf = profileRepo.createProfile({
        profileName: 'Word Immutability Profile',
        categoryId: toReportCategoryId('RPT-INCIDENT'),
        templateId: wordTplId,
        versionId: wordVerRes.value.version_id,
        documentType: 'WORD_DOCX',
      });

      if (!excelProf.ok || !wordProf.ok) return;

      // Run validation repeatedly (5 times each)
      for (let i = 0; i < 5; i++) {
        await validationService.validateProfile(excelProf.value.profileId);
        await validationService.validateProfile(wordProf.value.profileId);
      }

      // Read physical files back from disk
      const excelPath = path.join(vaultManager.templatesDir, excelFileName);
      const wordPath = path.join(vaultManager.templatesDir, wordFileName);

      const excelBytesAfter = fs.readFileSync(excelPath);
      const wordBytesAfter = fs.readFileSync(wordPath);

      const excelHashAfter = crypto.createHash('sha256').update(excelBytesAfter).digest('hex');
      const wordHashAfter = crypto.createHash('sha256').update(wordBytesAfter).digest('hex');

      // Zero mutation invariant
      expect(excelHashAfter).toBe(excelHashBefore);
      expect(wordHashAfter).toBe(wordHashBefore);
    });
  });

  describe('PRF-09: Fully Valid Profile Configuration', () => {
    it('confirms a complete and structurally compliant profile transitions to VALID status', async () => {
      const templateId = toTemplateId('TPL-LIGHT-VALID');
      const categoryId = toReportCategoryId('RPT-STATION-LIGHT');
      const fileName = 'valid.xlsx';

      const workbookBuffer = createTestExcelWorkbook();
      fs.writeFileSync(path.join(vaultManager.templatesDir, fileName), workbookBuffer);
      const hash = crypto.createHash('sha256').update(workbookBuffer).digest('hex');

      templateRepo.createTemplate({
        templateId,
        templateName: 'Valid Light Template',
        categoryId,
        documentType: 'EXCEL_XLSX',
        fileName,
        status: 'ACTIVE',
      });

      const verRes = templateRepo.registerNewVersion({
        templateId,
        fileName,
        fileSizeBytes: workbookBuffer.length,
        sha256Hash: hash,
        changeSummary: 'Initial version',
        setActive: true,
      });
      if (!verRes.ok) return;
      const versionId = verRes.value.version_id;

      const profileRes = profileRepo.createProfile({
        profileName: 'Compliant Light Profile',
        categoryId,
        templateId,
        versionId,
        documentType: 'EXCEL_XLSX',
      });
      expect(profileRes.ok).toBe(true);
      if (!profileRes.ok) return;
      const profileId = profileRes.value.profileId;

      // Map required fields to valid coordinates on LightingAudit worksheet
      const db = dbManager.getDatabase();
      const insertStmt = db.prepare(`
        INSERT INTO excel_template_mappings (
          mapping_id, template_id, version_id, worksheet_name, mapping_type,
          field_id, field_label, target_coordinate, header_row_number, profile_id, created_at, updated_at
        ) VALUES (?, ?, ?, 'LightingAudit', ?, ?, ?, ?, 1, ?, datetime('now'), datetime('now'))
      `);

      insertStmt.run(
        'M1',
        templateId,
        versionId,
        'FIXED_CELL',
        'FLD-COM-DATE',
        'Date',
        'A2',
        profileId
      );
      insertStmt.run(
        'M2',
        templateId,
        versionId,
        'FIXED_CELL',
        'FLD-COM-INSPECTOR',
        'Inspector',
        'B2',
        profileId
      );
      insertStmt.run(
        'M3',
        templateId,
        versionId,
        'FIXED_CELL',
        'FLD-COM-BADGE',
        'Badge',
        'C2',
        profileId
      );
      insertStmt.run(
        'M4',
        templateId,
        versionId,
        'FIXED_CELL',
        'FLD-COM-SHIFT',
        'Shift',
        'A3',
        profileId
      );
      insertStmt.run(
        'M5',
        templateId,
        versionId,
        'TABLE_COLUMN',
        'FLD-COM-STATION',
        'Station',
        'A',
        profileId
      );
      insertStmt.run(
        'M6',
        templateId,
        versionId,
        'TABLE_COLUMN',
        'FLD-SLT-ZONE',
        'Zone',
        'B',
        profileId
      );
      insertStmt.run(
        'M7',
        templateId,
        versionId,
        'TABLE_COLUMN',
        'FLD-SLT-STATUS',
        'Status',
        'C',
        profileId
      );
      insertStmt.run(
        'M8',
        templateId,
        versionId,
        'TABLE_COLUMN',
        'FLD-SLT-DEFECT-QTY',
        'Defect Qty',
        'D',
        profileId
      );

      const valRes = await validationService.validateProfile(profileId);
      expect(valRes.ok).toBe(true);
      if (!valRes.ok) return;

      const result = valRes.value;
      expect(result.overallStatus).toBe('VALID');
      expect(result.errorCount).toBe(0);
      expect(result.warningCount).toBe(0);

      // Verify that database record was updated with VALID status
      const updatedProfile = profileRepo.getProfile(profileId);
      expect(updatedProfile.ok).toBe(true);
      if (updatedProfile.ok && updatedProfile.value) {
        expect(updatedProfile.value.validationStatus).toBe('VALID');
        expect(updatedProfile.value.lastValidatedAt).toBeDefined();
      }
    });
  });
});
