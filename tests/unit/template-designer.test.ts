/**
 * OpsReport Studio — In-App Template Designer Verification Suite (Step 25)
 *
 * Verifies the in-app template designer architecture, draft persistence,
 * Open XML document compilation (Excel .xlsx and Word .docx), schema validation,
 * template registration into the master vault, automatic mapping profile generation,
 * and 100% cryptographic master template immutability:
 * - DSN-01: Draft Persistence and Lifecycle (CRUD & category filtering)
 * - DSN-02: Design Schema Validation (syntax, coordinate, and catalog rules)
 * - DSN-03: Excel Open XML Workbook Compilation & Container Verification
 * - DSN-04: Word Open XML Document Compilation & Container Verification
 * - DSN-05: Complete Registration Pipeline for New Template (v1) with Mapping Profile
 * - DSN-06: Controlled Evolution creating Version N+1 without overwriting v1
 * - DSN-07: Cryptographic Master Template Immutability across Designer Operations
 *
 * @module tests/unit/template-designer.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/storage/database/migrations/migrator.ts';
import { VaultManager } from '../../src/storage/vault/vault-manager.ts';
import { TemplateMetadataRepository } from '../../src/storage/database/repositories/template-metadata-repository.ts';
import { CategoryRepository } from '../../src/storage/database/repositories/category-repository.ts';
import { MappingProfileRepository } from '../../src/storage/database/repositories/mapping-profile-repository.ts';
import { ExcelMappingRepository } from '../../src/storage/database/repositories/excel-mapping-repository.ts';
import { WordMappingRepository } from '../../src/storage/database/repositories/word-mapping-repository.ts';
import { TemplateDesignerRepository } from '../../src/storage/database/repositories/template-designer-repository.ts';
import { TemplateDesignerService } from '../../src/storage/vault/template-designer-service.ts';
import { TemplateImporter } from '../../src/storage/vault/template-importer.ts';
import { TemplateInspector } from '../../src/storage/vault/template-inspector.ts';
import { validateDocumentBuffer } from '../../src/storage/vault/document-validator.ts';
import {
  ExcelWorkbookDesign,
  WordDocumentDesign,
} from '../../src/shared/types/template-designer.ts';
import {
  toTemplateId,
  toTemplateVersionId,
  toMappingProfileId,
} from '../../src/shared/types/identifiers.ts';

describe('In-App Excel & Word Template Designer (Step 25)', () => {
  let db: Database.Database;
  let tempVaultDir: string;
  let vaultManager: VaultManager;
  let templateRepo: TemplateMetadataRepository;
  let categoryRepo: CategoryRepository;
  let mappingProfileRepo: MappingProfileRepository;
  let excelMappingRepo: ExcelMappingRepository;
  let wordMappingRepo: WordMappingRepository;
  let designerRepo: TemplateDesignerRepository;
  let templateImporter: TemplateImporter;
  let designerService: TemplateDesignerService;
  let inspector: TemplateInspector;

  beforeEach(() => {
    // 1. Initialize SQLite in-memory database with migrations 001-008
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    const migRes = runMigrations(db);
    expect(migRes.ok).toBe(true);

    // 2. Initialize isolated temporary vault storage
    tempVaultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opsreport-designer-test-'));
    const appDataRoot = path.join(tempVaultDir, 'AppData');
    fs.mkdirSync(appDataRoot, { recursive: true });

    vaultManager = new VaultManager(appDataRoot);
    vaultManager.initializeVault();
    VaultManager.setInstance(vaultManager);

    // 3. Initialize repositories and services
    templateRepo = new TemplateMetadataRepository(db);
    categoryRepo = new CategoryRepository(db);
    mappingProfileRepo = new MappingProfileRepository(db);
    excelMappingRepo = new ExcelMappingRepository(db);
    wordMappingRepo = new WordMappingRepository(db);
    designerRepo = new TemplateDesignerRepository(db);
    templateImporter = new TemplateImporter(db, vaultManager, templateRepo, categoryRepo);
    inspector = TemplateInspector.getInstance(db, vaultManager, templateRepo);
    designerService = new TemplateDesignerService(
      db,
      vaultManager,
      templateImporter,
      templateRepo,
      categoryRepo,
      mappingProfileRepo,
      excelMappingRepo,
      wordMappingRepo,
      designerRepo
    );
  });

  afterEach(() => {
    if (db && db.open) {
      db.close();
    }
    if (fs.existsSync(tempVaultDir)) {
      try {
        fs.rmSync(tempVaultDir, { recursive: true, force: true });
      } catch {
        // Safe cleanup ignore on Windows
      }
    }
  });

  // ---------------------------------------------------------------------------
  // Test DSN-01: Draft Persistence & Lifecycle
  // ---------------------------------------------------------------------------
  it('DSN-01: Creates, retrieves, lists, updates, and deletes template designer drafts', () => {
    const excelDef: ExcelWorkbookDesign = {
      format: 'EXCEL_WORKBOOK',
      schemaVersion: 1,
      worksheets: [
        {
          sheetId: 'sheet1',
          name: 'AuditSheet',
          cells: [{ coordinate: 'A1', text: 'Sample Audit' }],
        },
      ],
      defaultSheet: 'AuditSheet',
    };

    // 1. Create Draft
    const createRes = designerRepo.createDraft({
      name: 'Draft Station Lighting',
      description: 'Initial draft for lighting audits',
      documentType: 'EXCEL_WORKBOOK',
      categoryId: 'RPT-STATION-LIGHT',
      designDefinition: excelDef,
    });
    expect(createRes.ok).toBe(true);
    if (!createRes.ok) return;

    const draftId = createRes.value.draft_id;
    expect(draftId).toBeDefined();
    expect(createRes.value.name).toBe('Draft Station Lighting');
    expect(createRes.value.design_schema_version).toBe(1);

    // 2. Retrieve Draft
    const getRes = designerRepo.getDraft(draftId);
    expect(getRes.ok).toBe(true);
    if (!getRes.ok) return;
    expect(getRes.value?.draft_id).toBe(draftId);
    expect(getRes.value?.name).toBe('Draft Station Lighting');

    // 3. List Drafts
    const listRes = designerRepo.listDrafts('EXCEL_WORKBOOK', 'RPT-STATION-LIGHT');
    expect(listRes.ok).toBe(true);
    if (!listRes.ok) return;
    expect(listRes.value).toHaveLength(1);
    expect(listRes.value[0].draftId).toBe(draftId);
    expect(listRes.value[0].categoryName).toBe('Station Light Reports');

    // 4. Update Draft
    const updateRes = designerRepo.updateDraft(draftId, {
      name: 'Updated Draft Station Lighting',
      description: 'Revised description',
    });
    expect(updateRes.ok).toBe(true);
    if (!updateRes.ok) return;
    expect(updateRes.value.name).toBe('Updated Draft Station Lighting');
    expect(updateRes.value.description).toBe('Revised description');

    // 5. Delete Draft
    const delRes = designerRepo.deleteDraft(draftId);
    expect(delRes.ok).toBe(true);
    if (!delRes.ok) return;
    expect(delRes.value).toBe(true);

    const postDel = designerRepo.getDraft(draftId);
    expect(postDel.ok).toBe(true);
    if (!postDel.ok) return;
    expect(postDel.value).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Test DSN-02: Design Schema Validation
  // ---------------------------------------------------------------------------
  it('DSN-02: Accurately validates design syntax, coordinates, catalog fields, and collisions', () => {
    // 1. Invalid Excel: Coordinate collision & invalid coordinate format
    const badExcelDef: ExcelWorkbookDesign = {
      format: 'EXCEL_WORKBOOK',
      schemaVersion: 1,
      worksheets: [
        {
          sheetId: 'sheet1',
          name: 'InvalidSheet',
          cells: [
            { coordinate: 'A1', text: 'Header 1' },
            { coordinate: 'A1', text: 'Collision 1' }, // Collision on A1
            { coordinate: 'INVALID_COORD', text: 'Bad Syntax' }, // Invalid regex
            {
              coordinate: 'B2',
              fieldSlot: { fieldId: 'FLD-UNKNOWN-XYZ', fieldLabel: 'Fake' },
            }, // Unknown field
            {
              coordinate: 'B3',
              fieldSlot: {
                fieldId: 'FLD-FAN-ID',
                fieldLabel: 'Fan Equipment ID',
              }, // Category mismatch (Fan field on Lighting category)
            },
          ],
        },
      ],
      defaultSheet: 'InvalidSheet',
    };

    const valResult = designerService.validateDesign(badExcelDef, 'RPT-STATION-LIGHT');
    expect(valResult.isValid).toBe(false);
    expect(valResult.errorCount).toBeGreaterThanOrEqual(4);

    const codes = valResult.diagnostics.map(d => d.code);
    expect(codes).toContain('COORDINATE_COLLISION');
    expect(codes).toContain('INVALID_COORDINATE');
    expect(codes).toContain('UNKNOWN_FIELD');
    expect(codes).toContain('CATEGORY_MISMATCH');

    // 2. Invalid Word: Invalid placeholder token syntax
    const badWordDef: WordDocumentDesign = {
      format: 'WORD_DOCUMENT',
      schemaVersion: 1,
      elements: [
        {
          id: '1',
          type: 'PARAGRAPH',
          paragraph: {
            text: 'Date:',
            fieldSlot: {
              fieldId: 'FLD-COM-DATE',
              fieldLabel: 'Date',
              placeholderToken: 'invalid token with spaces', // Fails WORD_PLACEHOLDER_REGEX
            },
          },
        },
      ],
    };

    const wordValResult = designerService.validateDesign(badWordDef, 'RPT-INCIDENT');
    expect(wordValResult.isValid).toBe(false);
    expect(wordValResult.diagnostics[0].code).toBe('INVALID_TOKEN_SYNTAX');
  });

  // ---------------------------------------------------------------------------
  // Test DSN-03: Excel Open XML Workbook Compilation & Container Verification
  // ---------------------------------------------------------------------------
  it('DSN-03: Compiles Excel design to genuine Open XML workbook passing document validator', () => {
    const excelDef: ExcelWorkbookDesign = {
      format: 'EXCEL_WORKBOOK',
      schemaVersion: 1,
      worksheets: [
        {
          sheetId: 'sheet1',
          name: 'StationAudit',
          headerRowIndex: 3,
          columnWidths: { A: 15, B: 25, C: 15 },
          cells: [
            {
              coordinate: 'A1',
              text: 'Station Inspection Log',
              style: { bold: true, fontSize: 14 },
            },
            { coordinate: 'A3', text: 'Station ID', style: { bold: true } },
            { coordinate: 'B3', text: 'Luminaire Zone', style: { bold: true } },
            { coordinate: 'C3', text: 'Status', style: { bold: true } },
            { coordinate: 'A4', text: 'STN-001' },
            { coordinate: 'B4', text: 'Platform 1' },
            { coordinate: 'C4', text: 'PASS' },
          ],
        },
      ],
      defaultSheet: 'StationAudit',
    };

    const compileRes = designerService.compileToBuffer(excelDef);
    expect(compileRes.ok).toBe(true);
    if (!compileRes.ok) return;

    const buffer = compileRes.value;
    expect(buffer.length).toBeGreaterThan(100);

    // Verify Open XML package compliance using DocumentValidator
    const docValRes = validateDocumentBuffer(buffer, '.xlsx');
    expect(docValRes.ok).toBe(true);
    if (docValRes.ok) {
      expect(docValRes.value.isValid).toBe(true);
      expect(docValRes.value.detectedFormat).toBe('EXCEL_XLSX');
      expect(docValRes.value.hasMacros).toBe(false);
    }
  });

  // ---------------------------------------------------------------------------
  // Test DSN-04: Word Open XML Document Compilation & Container Verification
  // ---------------------------------------------------------------------------
  it('DSN-04: Compiles Word design to genuine Open XML document passing document validator', () => {
    const wordDef: WordDocumentDesign = {
      format: 'WORD_DOCUMENT',
      schemaVersion: 1,
      elements: [
        {
          id: 'el-1',
          type: 'HEADING',
          heading: { level: 1, text: 'Security Incident Report', alignment: 'center' },
        },
        {
          id: 'el-2',
          type: 'PARAGRAPH',
          paragraph: {
            text: 'Incident Date:',
            bold: true,
            fieldSlot: {
              fieldId: 'FLD-COM-DATE',
              fieldLabel: 'Report Date',
              placeholderToken: '{report_date}',
            },
          },
        },
        {
          id: 'el-3',
          type: 'TABLE',
          table: {
            rows: [
              {
                cells: [
                  { text: 'Incident ID', isHeader: true, bold: true },
                  { text: 'Severity', isHeader: true, bold: true },
                ],
              },
              {
                cells: [
                  {
                    text: '{incident_id}',
                    fieldSlot: {
                      fieldId: 'FLD-INC-ID',
                      fieldLabel: 'Incident ID',
                      placeholderToken: '{incident_id}',
                    },
                  },
                  { text: 'HIGH' },
                ],
              },
            ],
          },
        },
      ],
    };

    const compileRes = designerService.compileToBuffer(wordDef);
    expect(compileRes.ok).toBe(true);
    if (!compileRes.ok) return;

    const buffer = compileRes.value;
    expect(buffer.length).toBeGreaterThan(100);

    // Verify Open XML package compliance using DocumentValidator
    const docValRes = validateDocumentBuffer(buffer, '.docx');
    expect(docValRes.ok).toBe(true);
    if (docValRes.ok) {
      expect(docValRes.value.isValid).toBe(true);
      expect(docValRes.value.detectedFormat).toBe('WORD_DOCX');
      expect(docValRes.value.hasMacros).toBe(false);
    }
  });

  // ---------------------------------------------------------------------------
  // Test DSN-05: Complete Registration Flow for New Template (v1) with Mapping Profile
  // ---------------------------------------------------------------------------
  it('DSN-05: Validates, compiles, stages, promotes, and registers new Excel template with mapping profile', async () => {
    const excelDef: ExcelWorkbookDesign = {
      format: 'EXCEL_WORKBOOK',
      schemaVersion: 1,
      worksheets: [
        {
          sheetId: 'sheet1',
          name: 'AuditSheet',
          headerRowIndex: 3,
          cells: [
            { coordinate: 'A1', text: 'Facility Inspection Title', style: { bold: true } },
            {
              coordinate: 'B1',
              fieldSlot: { fieldId: 'FLD-COM-DATE', fieldLabel: 'Report Date' },
            },
            {
              coordinate: 'A3',
              text: 'Station',
              fieldSlot: {
                fieldId: 'FLD-COM-STATION',
                fieldLabel: 'Station Code',
                isRepeating: true,
              },
            },
            {
              coordinate: 'B3',
              text: 'Status',
              fieldSlot: {
                fieldId: 'FLD-SLT-STATUS',
                fieldLabel: 'Lighting Status',
                isRepeating: true,
              },
            },
          ],
        },
      ],
      defaultSheet: 'AuditSheet',
    };

    const regRes = await designerService.compileAndRegister({
      name: 'Custom Station Light Template',
      description: 'Authored in-app using template designer',
      documentType: 'EXCEL_WORKBOOK',
      categoryId: 'RPT-STATION-LIGHT',
      designDefinition: excelDef,
      createMappingProfile: true,
      profileName: 'Auto Mappings Profile',
    });

    expect(regRes.ok).toBe(true);
    if (!regRes.ok) return;

    const { templateId, versionId, versionNumber, profileId } = regRes.value;
    expect(templateId).toBeDefined();
    expect(versionId).toBeDefined();
    expect(versionNumber).toBe(1);
    expect(profileId).toBeDefined();

    // 1. Verify template exists in metadata repository
    const tplRes = templateRepo.getTemplateById(toTemplateId(templateId));
    expect(tplRes.ok).toBe(true);
    if (!tplRes.ok) return;
    expect(tplRes.value?.template_name).toBe('Custom Station Light Template');
    expect(tplRes.value?.category_id).toBe('RPT-STATION-LIGHT');
    expect(tplRes.value?.document_type).toBe('EXCEL_XLSX');

    // 2. Verify physical master file exists in vault
    const filePathRes = vaultManager.resolveTemplateFileVaultPath(tplRes.value!.file_name!);
    expect(filePathRes.ok).toBe(true);
    if (!filePathRes.ok) return;
    expect(fs.existsSync(filePathRes.value)).toBe(true);

    // 3. Verify mapping profile was created and has child mappings
    const profileRes = mappingProfileRepo.getProfile(toMappingProfileId(profileId!));
    expect(profileRes.ok).toBe(true);
    const mappingsRes = excelMappingRepo.getMappings(
      toTemplateId(templateId),
      toTemplateVersionId(versionId)
    );
    expect(mappingsRes.ok).toBe(true);
    if (!mappingsRes.ok) return;
    expect(mappingsRes.value).toHaveLength(3);

    // 4. Verify template inspection parses the generated master file
    const inspectRes = await inspector.inspectTemplate({
      templateId: toTemplateId(templateId),
      worksheetName: 'AuditSheet',
    });
    expect(inspectRes.ok).toBe(true);
    if (!inspectRes.ok) return;
    expect(inspectRes.value?.excelPreview?.sheets).toHaveLength(1);
    expect(inspectRes.value?.excelPreview?.sheets[0].name).toBe('AuditSheet');
  });

  // ---------------------------------------------------------------------------
  // Test DSN-06: Controlled Evolution creating Version N+1
  // ---------------------------------------------------------------------------
  it('DSN-06: Creates version N+1 of an existing template without modifying historical version files', async () => {
    // 1. Register base template v1
    const baseDef: WordDocumentDesign = {
      format: 'WORD_DOCUMENT',
      schemaVersion: 1,
      elements: [
        {
          id: '1',
          type: 'HEADING',
          heading: { level: 1, text: 'Incident Form V1' },
        },
      ],
    };

    const v1Res = await designerService.compileAndRegister({
      name: 'Incident Document Base',
      documentType: 'WORD_DOCUMENT',
      categoryId: 'RPT-INCIDENT',
      designDefinition: baseDef,
    });
    expect(v1Res.ok).toBe(true);
    if (!v1Res.ok) return;

    const { templateId } = v1Res.value;

    const getVersionFilePath = (templateIdStr: string, versionNum: number): string => {
      const versionsRes = templateRepo.getVersionsByTemplateId(toTemplateId(templateIdStr));
      if (!versionsRes.ok) throw versionsRes.error;
      const ver = versionsRes.value.find(v => v.version_number === versionNum);
      if (!ver) throw new Error(`Version ${versionNum} not found for template ${templateIdStr}`);
      const pathRes = vaultManager.resolveTemplateFileVaultPath(ver.file_name);
      if (!pathRes.ok) throw pathRes.error;
      return pathRes.value;
    };

    // Read v1 physical file and hash
    const v1Path = getVersionFilePath(templateId, 1);
    const v1OriginalBytes = fs.readFileSync(v1Path);
    const v1OriginalHash = crypto.createHash('sha256').update(v1OriginalBytes).digest('hex');

    // 2. Author revised design for version 2
    const v2Def: WordDocumentDesign = {
      format: 'WORD_DOCUMENT',
      schemaVersion: 1,
      elements: [
        {
          id: '1',
          type: 'HEADING',
          heading: { level: 1, text: 'Incident Form V2 (Revised Layout)' },
        },
        {
          id: '2',
          type: 'PARAGRAPH',
          paragraph: {
            text: 'Severity Rating:',
            bold: true,
            fieldSlot: {
              fieldId: 'FLD-INC-SEVERITY',
              fieldLabel: 'Severity',
              placeholderToken: '{incident_severity}',
            },
          },
        },
      ],
    };

    const v2Res = await designerService.compileAndRegister({
      name: 'Incident Document Base',
      description: 'Updated layout with severity rating',
      documentType: 'WORD_DOCUMENT',
      categoryId: 'RPT-INCIDENT',
      targetTemplateId: templateId, // Targets existing template
      designDefinition: v2Def,
    });

    expect(v2Res.ok).toBe(true);
    if (!v2Res.ok) return;

    expect(v2Res.value.templateId).toBe(templateId);
    expect(v2Res.value.versionNumber).toBe(2);

    // 3. Confirm v1 file on disk was 100% UNTOUCHED
    const v1PostBytes = fs.readFileSync(v1Path);
    const v1PostHash = crypto.createHash('sha256').update(v1PostBytes).digest('hex');
    expect(v1PostHash).toBe(v1OriginalHash);
    expect(v1PostBytes.equals(v1OriginalBytes)).toBe(true);

    // 4. Confirm v2 file exists and is distinct
    const v2Path = getVersionFilePath(templateId, 2);
    expect(fs.existsSync(v2Path)).toBe(true);
    const v2Bytes = fs.readFileSync(v2Path);
    const v2Hash = crypto.createHash('sha256').update(v2Bytes).digest('hex');
    expect(v2Hash).not.toBe(v1OriginalHash);
  });

  // ---------------------------------------------------------------------------
  // Test DSN-07: Cryptographic Master Template Immutability across Designer Operations
  // ---------------------------------------------------------------------------
  it('DSN-07: Proves existing vault master files remain 100% byte-for-byte immutable during draft saving, validation, and unrelated builds', async () => {
    // 1. Register reference master template in vault
    const refDef: ExcelWorkbookDesign = {
      format: 'EXCEL_WORKBOOK',
      schemaVersion: 1,
      worksheets: [
        {
          sheetId: 'sheet1',
          name: 'MasterSheet',
          cells: [{ coordinate: 'A1', text: 'Original Protected Master' }],
        },
      ],
      defaultSheet: 'MasterSheet',
    };

    const initRes = await designerService.compileAndRegister({
      name: 'Protected Reference Master',
      documentType: 'EXCEL_WORKBOOK',
      categoryId: 'RPT-STATION-LIGHT',
      designDefinition: refDef,
    });
    expect(initRes.ok).toBe(true);
    if (!initRes.ok) return;

    const versionsRes = templateRepo.getVersionsByTemplateId(
      toTemplateId(initRes.value.templateId)
    );
    expect(versionsRes.ok).toBe(true);
    if (!versionsRes.ok) return;
    const v1Record = versionsRes.value[0];
    const masterPathRes = vaultManager.resolveTemplateFileVaultPath(v1Record.file_name);
    expect(masterPathRes.ok).toBe(true);
    if (!masterPathRes.ok) return;
    const masterPath = masterPathRes.value;

    const initialBytes = fs.readFileSync(masterPath);
    const initialHash = crypto.createHash('sha256').update(initialBytes).digest('hex');

    // 2. Perform various designer operations: create drafts, validate designs, compile another template
    designerRepo.createDraft({
      name: 'Unrelated Draft',
      documentType: 'WORD_DOCUMENT',
      designDefinition: { format: 'WORD_DOCUMENT', schemaVersion: 1, elements: [] },
    });

    designerService.validateDesign(refDef, 'RPT-STATION-LIGHT');

    // Build another unrelated template
    await designerService.compileAndRegister({
      name: 'Second Unrelated Template',
      documentType: 'EXCEL_WORKBOOK',
      categoryId: 'RPT-FAN',
      designDefinition: refDef,
    });

    // 3. Re-read original master and assert absolute cryptographic invariance
    const postBytes = fs.readFileSync(masterPath);
    const postHash = crypto.createHash('sha256').update(postBytes).digest('hex');

    expect(postHash).toBe(initialHash);
    expect(postBytes.equals(initialBytes)).toBe(true);
  });
});
