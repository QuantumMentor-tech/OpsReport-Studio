/**
 * OpsReport Studio — Step 30: Excel Export, Naming Rules & Generated Workbook Validation Tests
 *
 * Verifies:
 * - Deterministic filename resolution and sanitization (DEC-011):
 *   - Windows illegal characters, control characters, null bytes, directory traversal
 *   - Windows reserved device names (CON, PRN, AUX, NUL, COM1-9, LPT1-9)
 *   - Trailing spaces and periods
 *   - Unicode preservation and length bounding
 *   - Single .xlsx extension guarantee
 * - Non-destructive collision handling (FAIL_IF_EXISTS, INCREMENT_SUFFIX, OVERWRITE)
 * - Destination directory safety and master-template vault write protection
 * - Session and generation workspace eligibility, freshness, and hash verification
 * - Staged candidate creation, validation, atomic promotion, and staging cleanup
 * - Final workbook reopening and Open XML integrity verification at destination path
 * - Step 29 structural preservation integration (formulas, merged cells, images, print layout)
 * - Authoritative report content verification (scalar mapped fields, station rows in sequence)
 * - Master template immutability invariant (INV-DAT-006: 0-byte variance)
 * - Non-destructive rollback: working copy in Workspace/ preserved upon export failure
 * - State lifecycle transitions: generation workspace marked COMPLETED in database
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import PizZip from 'pizzip';
import { DatabaseManager } from '../../src/storage/database/connection.ts';
import { VaultManager } from '../../src/storage/vault/vault-manager.ts';
import { TemplateMetadataRepository } from '../../src/storage/database/repositories/template-metadata-repository.ts';
import { SessionRepository } from '../../src/storage/database/repositories/session-repository.ts';
import { GenerationWorkspaceRepository } from '../../src/storage/database/repositories/generation-workspace-repository.ts';
import { ExcelMappingRepository } from '../../src/storage/database/repositories/excel-mapping-repository.ts';
import { CategoryRepository } from '../../src/storage/database/repositories/category-repository.ts';
import { MappingProfileRepository } from '../../src/storage/database/repositories/mapping-profile-repository.ts';
import { ExcelWorkbookCloningService } from '../../src/storage/generation/excel-workbook-cloning-service.ts';
import { ExcelDataInjectionService } from '../../src/storage/generation/excel-data-injection-service.ts';
import {
  ExcelExportService,
  ExcelFilenameResolver,
} from '../../src/storage/generation/excel-export-service.ts';
import {
  toTemplateId,
  toReportSessionId,
  toReportCategoryId,
  toGenerationWorkspaceId,
  toStationId,
} from '../../src/shared/types/identifiers.ts';
import { ErrorCode } from '../../src/shared/errors/error-codes.ts';
import { AppError } from '../../src/shared/errors/app-error.ts';
import { Err } from '../../src/shared/types/result.ts';
import { StationRepository } from '../../src/storage/database/repositories/station-repository.ts';
import { WorksheetXmlEditor } from '../../src/storage/generation/worksheet-xml-editor.ts';

function createValidExcelZip(): Buffer {
  const zip = new PizZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'
  );
  zip.file(
    'xl/workbook.xml',
    '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="StationAudit" sheetId="1" r:id="rId1"/></sheets></workbook>'
  );
  zip.file(
    'xl/_rels/workbook.xml.rels',
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>'
  );
  zip.file(
    'xl/styles.xml',
    '<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>'
  );
  zip.file(
    'xl/sharedStrings.xml',
    '<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="1" uniqueCount="1"><si><t>Audit Report Header</t></si></sst>'
  );
  zip.file(
    'xl/worksheets/sheet1.xml',
    '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:E20"/><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1"><v>100</v></c></row><row r="2"><c r="A2"><f>SUM(B1:B10)</f><v>100</v></c></row></sheetData></worksheet>'
  );
  return zip.generate({ type: 'nodebuffer' });
}

describe('OpsReport Studio — Step 30: Excel Export, Naming Rules & Generated Workbook Validation', () => {
  let tempRoot: string;
  let vaultManager: VaultManager;
  let dbManager: DatabaseManager;
  let templateRepo: TemplateMetadataRepository;
  let sessionRepo: SessionRepository;
  let workspaceRepo: GenerationWorkspaceRepository;
  let excelMappingRepo: ExcelMappingRepository;
  let categoryRepo: CategoryRepository;
  let profileRepo: MappingProfileRepository;
  let cloningService: ExcelWorkbookCloningService;
  let injectionService: ExcelDataInjectionService;
  let exportService: ExcelExportService;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opsreport-step30-test-'));
    const appDataRoot = path.join(tempRoot, 'AppData');
    fs.mkdirSync(appDataRoot, { recursive: true });

    vaultManager = new VaultManager(appDataRoot);
    vaultManager.initializeVault();
    VaultManager.setInstance(vaultManager);

    const dbPath = path.join(vaultManager.databaseDir, 'test_opsreport.db');
    dbManager = new DatabaseManager({ databasePath: dbPath });
    dbManager.initialize();
    const db = dbManager.getDatabase();

    templateRepo = new TemplateMetadataRepository(db);
    sessionRepo = new SessionRepository(db);
    workspaceRepo = new GenerationWorkspaceRepository(db, vaultManager);
    excelMappingRepo = new ExcelMappingRepository(db);
    categoryRepo = new CategoryRepository(db);
    profileRepo = new MappingProfileRepository(db);

    cloningService = new ExcelWorkbookCloningService(
      templateRepo,
      vaultManager,
      sessionRepo,
      workspaceRepo
    );

    injectionService = new ExcelDataInjectionService(
      sessionRepo,
      templateRepo,
      workspaceRepo,
      excelMappingRepo,
      profileRepo,
      vaultManager
    );

    exportService = new ExcelExportService(
      templateRepo,
      vaultManager,
      sessionRepo,
      workspaceRepo,
      excelMappingRepo,
      categoryRepo
    );
  });

  afterEach(() => {
    VaultManager.setInstance(null);
    if (dbManager?.isOpen()) {
      dbManager.close();
    }
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  function setupTestTemplate(templateIdStr = 'TPL-POLE-LIGHT-STANDARD') {
    const templateId = toTemplateId(templateIdStr);
    const activeVerRes = templateRepo.getActiveVersion(templateId);
    expect(activeVerRes.ok).toBe(true);
    if (!activeVerRes.ok || !activeVerRes.value) throw new Error('Active version missing');

    const vaultPathRes = vaultManager.resolveTemplateFileVaultPath(activeVerRes.value.file_name);
    expect(vaultPathRes.ok).toBe(true);
    if (!vaultPathRes.ok) throw new Error('Vault path resolution failed');

    const excelBytes = createValidExcelZip();
    fs.writeFileSync(vaultPathRes.value, excelBytes);
    const masterHash = crypto.createHash('sha256').update(excelBytes).digest('hex');

    const db = dbManager.getDatabase();
    db.prepare('UPDATE template_versions SET sha256_hash = ? WHERE version_id = ?').run(
      masterHash,
      activeVerRes.value.version_id
    );

    return {
      templateId,
      versionId: activeVerRes.value.version_id,
      vaultPath: vaultPathRes.value,
      masterHash,
    };
  }

  // ===========================================================================
  // 1. Filename Resolution & Sanitization Tests (Objective B)
  // ===========================================================================
  describe('Filename Resolution & Sanitization (Objective B)', () => {
    it('EXP-NAM-01: Generates standard deterministic filename from structured components', () => {
      const filename = ExcelFilenameResolver.resolveExportFilename({
        categoryCode: 'StationLighting',
        reportDate: '2026-10-22',
        stationCodeOrName: 'Station04',
        shift: 'Day',
        sessionOrSequenceId: 'SES-001',
      });

      expect(filename).toBe('StationLighting_2026-10-22_Station04_Day_SES-001.xlsx');
    });

    it('EXP-NAM-02: Sanitizes illegal Windows characters in filename components', () => {
      const filename = ExcelFilenameResolver.resolveExportFilename({
        categoryCode: 'Cat<eg>ory:Test',
        reportDate: '2026/10/22',
        stationCodeOrName: 'Stn|North*Zone',
        shift: 'Shift"1?',
        sessionOrSequenceId: 'ID/123',
      });

      expect(filename).not.toMatch(/[<>:"/\\|?*]/);
      expect(filename.endsWith('.xlsx')).toBe(true);
      expect(filename).toBe('Cat_eg_ory_Test_2026_10_22_Stn_North_Zone_Shift_1_ID_123.xlsx');
    });

    it('EXP-NAM-03: Neutralizes directory traversal sequences and slashes', () => {
      const filename = ExcelFilenameResolver.resolveExportFilename({
        customFilename: '../../../etc/passwd.xlsx',
      });

      expect(filename).not.toContain('..');
      expect(filename).not.toContain('/');
      expect(filename).not.toContain('\\');
      expect(filename).toBe('passwd.xlsx');
    });

    it('EXP-NAM-04: Shields Windows reserved device names (CON, PRN, AUX, NUL, COM1, LPT1)', () => {
      const reservedNames = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'LPT1'];
      for (const resName of reservedNames) {
        const sanitized = ExcelFilenameResolver.sanitizeComponent(resName);
        expect(sanitized).toBe(`Report_${resName}`);

        const filename = ExcelFilenameResolver.resolveExportFilename({
          customFilename: `${resName}.xlsx`,
        });
        expect(filename).toBe(`Report_${resName}.xlsx`);
      }
    });

    it('EXP-NAM-05: Trims trailing spaces and periods from filename and components', () => {
      const sanitized = ExcelFilenameResolver.sanitizeComponent('ReportName...   ');
      expect(sanitized).toBe('ReportName');

      const filename = ExcelFilenameResolver.resolveExportFilename({
        customFilename: 'MonthlyAudit . . .xlsx',
      });
      expect(filename).toBe('MonthlyAudit.xlsx');
    });

    it('EXP-NAM-06: Preserves valid Unicode characters in filenames', () => {
      const unicodeName = ' станция_Северная_2026 ';
      const sanitized = ExcelFilenameResolver.sanitizeComponent(unicodeName);
      expect(sanitized).toBe('станция_Северная_2026');

      const filename = ExcelFilenameResolver.resolveExportFilename({
        categoryCode: 'Inspection_北京',
        reportDate: '2026-10-22',
      });
      expect(filename).toContain('Inspection_北京');
      expect(filename.endsWith('.xlsx')).toBe(true);
    });

    it('EXP-NAM-07: Enforces strict single .xlsx extension without duplication', () => {
      const fn1 = ExcelFilenameResolver.resolveExportFilename({
        customFilename: 'MyReport.xlsx',
      });
      expect(fn1).toBe('MyReport.xlsx');

      const fn2 = ExcelFilenameResolver.resolveExportFilename({
        customFilename: 'MyReport.xlsx.xlsx',
      });
      expect(fn2).toBe('MyReport.xlsx');
    });

    it('EXP-NAM-08: Enforces maximum safe filename length', () => {
      const excessivelyLongCategory = 'A'.repeat(300);
      const filename = ExcelFilenameResolver.resolveExportFilename({
        categoryCode: excessivelyLongCategory,
      });

      expect(filename.length).toBeLessThanOrEqual(245);
      expect(filename.endsWith('.xlsx')).toBe(true);
    });

    it('EXP-NAM-09: Collapses repeated separators and provides safe default for empty inputs', () => {
      const filename = ExcelFilenameResolver.resolveExportFilename({
        categoryCode: '   ',
        reportDate: '',
      });

      expect(filename).toMatch(/^OpsReport_\d{4}-\d{2}-\d{2}\.xlsx$/);
    });
  });

  // ===========================================================================
  // 2. Collision Handling & Destination Validation Tests (Objective C)
  // ===========================================================================
  describe('Collision Handling & Destination Safety (Objective C)', () => {
    it('EXP-COL-01: Rejects export when file exists under FAIL_IF_EXISTS policy', () => {
      const testDir = path.join(tempRoot, 'Exports');
      fs.mkdirSync(testDir, { recursive: true });
      fs.writeFileSync(path.join(testDir, 'Report.xlsx'), 'dummy content');

      const res = ExcelFilenameResolver.resolveCollision(testDir, 'Report.xlsx', 'FAIL_IF_EXISTS');
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe(ErrorCode.OUTPUT_DESTINATION_COLLISION);
      }
    });

    it('EXP-COL-02: Increments sequential suffix under INCREMENT_SUFFIX policy', () => {
      const testDir = path.join(tempRoot, 'Exports');
      fs.mkdirSync(testDir, { recursive: true });

      // Create Report.xlsx and Report_1.xlsx
      fs.writeFileSync(path.join(testDir, 'Report.xlsx'), 'dummy 0');
      fs.writeFileSync(path.join(testDir, 'Report_1.xlsx'), 'dummy 1');

      const res = ExcelFilenameResolver.resolveCollision(
        testDir,
        'Report.xlsx',
        'INCREMENT_SUFFIX'
      );
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value).toBe('Report_2.xlsx');
      }
    });

    it('EXP-COL-03: No overwrite policy exists; an existing report is never selected as the target', () => {
      const testDir = path.join(tempRoot, 'Exports');
      fs.mkdirSync(testDir, { recursive: true });
      fs.writeFileSync(path.join(testDir, 'Report.xlsx'), 'dummy');

      for (const policy of ['FAIL_IF_EXISTS', 'INCREMENT_SUFFIX'] as const) {
        const res = ExcelFilenameResolver.resolveCollision(testDir, 'Report.xlsx', policy);
        if (res.ok) {
          expect(res.value).not.toBe('Report.xlsx');
        } else {
          expect(res.error.code).toBe(ErrorCode.OUTPUT_DESTINATION_COLLISION);
        }
      }
      expect(fs.readFileSync(path.join(testDir, 'Report.xlsx'), 'utf-8')).toBe('dummy');
    });

    it('EXP-COL-04: Rejects destination targeting Master Template Vault (INV-DAT-006)', () => {
      const { templateId } = setupTestTemplate();
      const sessionRes = sessionRepo.createSession({
        sessionTitle: 'Vault Attack Test',
        categoryId: toReportCategoryId('RPT-POLE-LIGHT'),
        templateId,
      });
      expect(sessionRes.ok).toBe(true);
      const sessionId = sessionRes.ok
        ? sessionRes.value.session.sessionId
        : toReportSessionId('s1');

      cloningService.prepareExcelWorkspace({ templateId, sessionId });

      // Attempt export directly into Templates/ directory
      const exportRes = exportService.exportReport({
        sessionId,
        destinationDir: vaultManager.templatesDir,
      });

      expect(exportRes.ok).toBe(false);
      if (!exportRes.ok) {
        expect(exportRes.error.code).toBe(ErrorCode.SECURITY_VIOLATION);
      }
    });
  });

  // ===========================================================================
  // 3. Artifact Eligibility & Freshness Verification (Objective A)
  // ===========================================================================
  describe('Artifact Eligibility & Freshness (Objective A)', () => {
    it('EXP-ELG-01: Rejects export when report session does not exist', () => {
      const res = exportService.exportReport({
        sessionId: toReportSessionId('SES-NONEXISTENT'),
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe(ErrorCode.DRAFT_NOT_FOUND);
      }
    });

    it('EXP-ELG-02: Rejects export when session is CANCELLED', () => {
      const { templateId } = setupTestTemplate();
      const sessionRes = sessionRepo.createSession({
        sessionTitle: 'Cancelled Session',
        categoryId: toReportCategoryId('RPT-POLE-LIGHT'),
        templateId,
        status: 'CANCELLED',
      });
      expect(sessionRes.ok).toBe(true);
      const sessionId = sessionRes.ok
        ? sessionRes.value.session.sessionId
        : toReportSessionId('s1');

      const res = exportService.exportReport({ sessionId });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe(ErrorCode.VALIDATION_FAILED);
        expect(res.error.userMessage).toContain('cancelled');
      }
    });

    it('EXP-ELG-03: Rejects export when no active generation workspace exists', () => {
      const sessionRes = sessionRepo.createSession({
        sessionTitle: 'No Workspace Session',
        categoryId: toReportCategoryId('RPT-POLE-LIGHT'),
      });
      expect(sessionRes.ok).toBe(true);
      const sessionId = sessionRes.ok
        ? sessionRes.value.session.sessionId
        : toReportSessionId('s1');

      const res = exportService.exportReport({ sessionId });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe(ErrorCode.FILE_NOT_FOUND);
        expect(res.error.userMessage).toContain('No active generation workspace found');
      }
    });

    it('EXP-ELG-04: Rejects export when workspace document format is not EXCEL_XLSX', () => {
      const { templateId, versionId } = setupTestTemplate();
      const sessionRes = sessionRepo.createSession({
        sessionTitle: 'Word Session Test',
        categoryId: toReportCategoryId('RPT-POLE-LIGHT'),
        templateId,
      });
      const sessionId = sessionRes.ok
        ? sessionRes.value.session.sessionId
        : toReportSessionId('s1');

      // Create a mock workspace record with WORD_DOCX
      const wsRes = workspaceRepo.createWorkspace({
        workspaceId: toGenerationWorkspaceId('ws_word_test'),
        sessionId,
        templateId,
        versionId,
        versionNumber: 1,
        documentType: 'WORD_DOCX',
        fileName: 'test.docx',
        relativePath: 'test.docx',
        sha256Hash: 'dummy',
        fileSizeBytes: 100,
        status: 'PREPARED',
      });
      expect(wsRes.ok).toBe(true);

      const res = exportService.exportReport({ sessionId });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe(ErrorCode.TEMPLATE_UNSUPPORTED_FORMAT);
      }
    });

    it('EXP-ELG-05: Rejects export when working file in Workspace/ was tampered externally', () => {
      const { templateId } = setupTestTemplate();

      const sessionRes = sessionRepo.createSession({
        sessionTitle: 'Tamper Session',
        categoryId: toReportCategoryId('RPT-POLE-LIGHT'),
        templateId,
      });
      const sessionId = sessionRes.ok
        ? sessionRes.value.session.sessionId
        : toReportSessionId('s1');

      const cloneRes = cloningService.prepareExcelWorkspace({
        templateId,
        sessionId,
      });
      expect(cloneRes.ok).toBe(true);
      const workingPath = cloneRes.ok ? cloneRes.value.workspace.absolutePath : '';

      // Tamper with the working file on disk without updating SQLite
      fs.appendFileSync(workingPath, 'tampered_bytes');

      const res = exportService.exportReport({ sessionId });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe(ErrorCode.TEMPLATE_INTEGRITY_COMPROMISED);
      }
    });
  });

  // ===========================================================================
  // 4. End-to-End Export, Final Validation & Data Verification (Objective D & E)
  // ===========================================================================
  describe('Final Export, Workbook Validation & Data Verification (Objective D & E)', () => {
    it('EXP-FIN-01: Finalizes valid Excel report with deterministic naming, Open XML validity, and status update', () => {
      const { templateId, masterHash, vaultPath } = setupTestTemplate();

      const sessionRes = sessionRepo.createSession({
        sessionTitle: 'Q4 Final Audit',
        categoryId: toReportCategoryId('RPT-POLE-LIGHT'),
        templateId,
        payload: {
          'FLD-COM-DATE': '2026-10-22',
          'FLD-COM-SHIFT': 'Morning',
        },
      });
      expect(sessionRes.ok).toBe(true);
      const sessionId = sessionRes.ok
        ? sessionRes.value.session.sessionId
        : toReportSessionId('s1');

      const cloneRes = cloningService.prepareExcelWorkspace({
        templateId,
        sessionId,
      });
      expect(cloneRes.ok).toBe(true);

      const exportDir = path.join(tempRoot, 'FinalReports');
      const exportRes = exportService.exportReport({
        sessionId,
        destinationDir: exportDir,
        markSessionCompleted: true,
      });

      expect(exportRes.ok).toBe(true);
      if (exportRes.ok) {
        const result = exportRes.value;
        expect(result.fileName).toMatch(/_2026-10-22_Morning_.*\.xlsx$/);
        expect(fs.existsSync(result.finalPath)).toBe(true);
        expect(result.fileSizeBytes).toBeGreaterThan(0);
        expect(result.validationSummary.isOpenXmlCompliant).toBe(true);
        expect(result.validationSummary.masterUntouched).toBe(true);
        expect(result.validationSummary.sheetsVerified).toContain('StationAudit');

        // Check workspace status transitioned to COMPLETED in database
        const wsQuery = workspaceRepo.getWorkspaceById(result.workspaceId);
        expect(wsQuery.ok && wsQuery.value?.status).toBe('COMPLETED');

        // Check session marked as COMPLETED
        const sessionQuery = sessionRepo.getSessionById(sessionId);
        expect(sessionQuery.ok && sessionQuery.value?.session.status).toBe('COMPLETED');
      }

      // Check Master Immutability Invariant: 0-byte variance on master template in vault
      const postMasterBuf = fs.readFileSync(vaultPath);
      const postMasterHash = crypto.createHash('sha256').update(postMasterBuf).digest('hex');
      expect(postMasterHash).toBe(masterHash);
    });

    it('EXP-FIN-02: Content Verification verifies mapped scalar fields', () => {
      const { templateId, versionId } = setupTestTemplate();

      // Save mapping for scalar field FLD-COM-SHIFT on B1
      const saveRes = excelMappingRepo.saveMappings({
        templateId,
        versionId,
        worksheetName: 'StationAudit',
        mappings: [
          {
            fieldId: 'FLD-COM-SHIFT',
            fieldLabel: 'Operating Shift',
            mappingType: 'FIXED_CELL',
            targetCoordinate: 'B1',
          },
        ],
      });
      expect(saveRes.ok).toBe(true);

      // Create session with FLD-COM-SHIFT = 'Day'
      const sessionRes = sessionRepo.createSession({
        sessionTitle: 'Content Test Session',
        categoryId: toReportCategoryId('RPT-POLE-LIGHT'),
        templateId,
        payload: {
          'FLD-COM-SHIFT': 'Day',
        },
      });
      const sessionId = sessionRes.ok
        ? sessionRes.value.session.sessionId
        : toReportSessionId('s1');

      // Clone workspace & Inject data
      cloningService.prepareExcelWorkspace({ templateId, sessionId });
      const activeWs = workspaceRepo.getActiveWorkspaceBySessionId(sessionId);
      if (!activeWs.ok || !activeWs.value) throw new Error('Active workspace missing');

      const injectRes = injectionService.injectSessionData({
        workspaceId: activeWs.value.workspaceId,
        sessionId,
      });
      expect(injectRes.ok).toBe(true);

      // Export report with content validation enabled
      const exportRes = exportService.exportReport({
        sessionId,
        skipContentValidation: false,
      });

      expect(exportRes.ok).toBe(true);
      if (exportRes.ok) {
        expect(exportRes.value.validationSummary.scalarFieldsVerifiedCount).toBeGreaterThanOrEqual(
          1
        );
        expect(exportRes.value.validationSummary.isOpenXmlCompliant).toBe(true);
      }
    });

    it('EXP-FIN-03: Rejects export when candidate workbook fails structural preservation verification', () => {
      const { templateId } = setupTestTemplate();

      const sessionRes = sessionRepo.createSession({
        sessionTitle: 'Preservation Fail Session',
        categoryId: toReportCategoryId('RPT-POLE-LIGHT'),
        templateId,
      });
      const sessionId = sessionRes.ok
        ? sessionRes.value.session.sessionId
        : toReportSessionId('s1');

      const cloneRes = cloningService.prepareExcelWorkspace({ templateId, sessionId });
      if (!cloneRes.ok) throw new Error('Clone failed');
      const workingPath = cloneRes.value.workspace.absolutePath;

      // Modify working file to drop the formula cell at A2 without being a planned write target
      const zip = new PizZip(fs.readFileSync(workingPath));
      let sheetXml = zip.file('xl/worksheets/sheet1.xml')!.asText();
      sheetXml = sheetXml.replace(/<c r="A2".*?<\/c>/, '<c r="A2"><v>999</v></c>');
      zip.file('xl/worksheets/sheet1.xml', sheetXml);
      const modifiedBuf = zip.generate({ type: 'nodebuffer' });
      fs.writeFileSync(workingPath, modifiedBuf);

      // Update workspace record hash to simulate valid working copy state
      const newHash = crypto.createHash('sha256').update(modifiedBuf).digest('hex');
      workspaceRepo.updateWorkspaceFile(cloneRes.value.workspace.workspaceId, {
        sha256Hash: newHash,
        fileSizeBytes: modifiedBuf.length,
        status: 'IN_USE',
      });

      // Attempt export: preservation verifier will flag missing formula as BLOCKING
      const exportRes = exportService.exportReport({ sessionId });
      expect(exportRes.ok).toBe(false);
      if (!exportRes.ok) {
        expect(exportRes.error.code).toBe(ErrorCode.VALIDATION_FAILED);
        expect(exportRes.error.userMessage).toContain('structural preservation verification');
      }
    });

    it('EXP-FIN-04: Working copy in Workspace/ remains untouched upon export failure (Non-Destructive)', () => {
      const { templateId } = setupTestTemplate();

      const sessionRes = sessionRepo.createSession({
        sessionTitle: 'Rollback Session',
        categoryId: toReportCategoryId('RPT-POLE-LIGHT'),
        templateId,
      });
      const sessionId = sessionRes.ok
        ? sessionRes.value.session.sessionId
        : toReportSessionId('s1');

      const cloneRes = cloningService.prepareExcelWorkspace({ templateId, sessionId });
      expect(cloneRes.ok).toBe(true);
      const workingPath = cloneRes.ok ? cloneRes.value.workspace.absolutePath : '';
      const workingBufBefore = fs.readFileSync(workingPath);

      // Attempt export to pre-existing file that will fail under FAIL_IF_EXISTS
      const exportDir = path.join(tempRoot, 'ExportsCollision');
      fs.mkdirSync(exportDir, { recursive: true });
      fs.writeFileSync(path.join(exportDir, 'MyFixedReport.xlsx'), 'pre-existing file');

      const exportRes = exportService.exportReport({
        sessionId,
        destinationDir: exportDir,
        namingOptions: { customFilename: 'MyFixedReport.xlsx' },
        collisionPolicy: 'FAIL_IF_EXISTS',
      });

      expect(exportRes.ok).toBe(false);
      if (!exportRes.ok) {
        expect(exportRes.error.code).toBe(ErrorCode.OUTPUT_DESTINATION_COLLISION);
      }

      // Verify working file in Workspace/ was NOT touched or deleted
      expect(fs.existsSync(workingPath)).toBe(true);
      const workingBufAfter = fs.readFileSync(workingPath);
      expect(workingBufAfter.equals(workingBufBefore)).toBe(true);

      // Verify pre-existing file in export folder was NOT overwritten or deleted
      expect(fs.readFileSync(path.join(exportDir, 'MyFixedReport.xlsx'), 'utf-8')).toBe(
        'pre-existing file'
      );
    });
  });

  // ===========================================================================
  // 5. Failure Injection, Staleness & Partial-Outcome Recovery (Objective F)
  // ===========================================================================
  describe('Failure Injection & Recovery (Objective F)', () => {
    function prepareGeneratedSession() {
      const { templateId, vaultPath, masterHash } = setupTestTemplate();
      const sessionRes = sessionRepo.createSession({
        sessionTitle: 'Recovery Session',
        categoryId: toReportCategoryId('RPT-POLE-LIGHT'),
        templateId,
      });
      if (!sessionRes.ok) throw new Error('session create failed');
      const sessionId = sessionRes.value.session.sessionId;
      const cloneRes = cloningService.prepareExcelWorkspace({ templateId, sessionId });
      if (!cloneRes.ok) throw new Error('clone failed');
      const exportDir = path.join(tempRoot, 'RecoveryExports');
      fs.mkdirSync(exportDir, { recursive: true });
      return {
        sessionId,
        workspace: cloneRes.value.workspace,
        exportDir,
        vaultPath,
        masterHash,
      };
    }

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('EXP-STL-01: Rejects a stale workbook generated before the session was modified', () => {
      const ctx = prepareGeneratedSession();
      dbManager
        .getDatabase()
        .prepare(
          "UPDATE generation_workspaces SET updated_at = '2000-01-01 00:00:00' WHERE workspace_id = ?"
        )
        .run(ctx.workspace.workspaceId);

      const res = exportService.exportReport({
        sessionId: ctx.sessionId,
        destinationDir: ctx.exportDir,
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe(ErrorCode.VALIDATION_FAILED);
        expect(res.error.userMessage).toContain('outdated');
      }
      expect(fs.readdirSync(ctx.exportDir)).toEqual([]);
      expect(fs.existsSync(ctx.workspace.absolutePath)).toBe(true);
    });

    it('EXP-RACE-01: A file created at the target during promotion is never overwritten (INCREMENT_SUFFIX picks a new name)', () => {
      const ctx = prepareGeneratedSession();
      const realCopy = fs.copyFileSync.bind(fs);
      let raced = false;
      vi.spyOn(fs, 'copyFileSync').mockImplementation((src, dest, mode) => {
        if (mode === fs.constants.COPYFILE_EXCL && !raced) {
          raced = true;
          // Simulate another process claiming the chosen name after the existence check
          fs.writeFileSync(dest as string, 'created-by-other-process');
          const err = new Error('exists') as NodeJS.ErrnoException;
          err.code = 'EEXIST';
          throw err;
        }
        return realCopy(src, dest, mode);
      });

      const res = exportService.exportReport({
        sessionId: ctx.sessionId,
        destinationDir: ctx.exportDir,
        namingOptions: { customFilename: 'Raced.xlsx' },
        collisionPolicy: 'INCREMENT_SUFFIX',
      });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value.fileName).toBe('Raced_1.xlsx');
      }
      expect(fs.readFileSync(path.join(ctx.exportDir, 'Raced.xlsx'), 'utf-8')).toBe(
        'created-by-other-process'
      );
      expect(fs.readdirSync(ctx.exportDir).sort()).toEqual(['Raced.xlsx', 'Raced_1.xlsx']);
    });

    it('EXP-RACE-02: Race under FAIL_IF_EXISTS reports a collision, leaves the other file intact and cleans staging', () => {
      const ctx = prepareGeneratedSession();
      const realCopy = fs.copyFileSync.bind(fs);
      vi.spyOn(fs, 'copyFileSync').mockImplementation((src, dest, mode) => {
        if (mode === fs.constants.COPYFILE_EXCL) {
          fs.writeFileSync(dest as string, 'created-by-other-process');
          const err = new Error('exists') as NodeJS.ErrnoException;
          err.code = 'EEXIST';
          throw err;
        }
        return realCopy(src, dest, mode);
      });

      const res = exportService.exportReport({
        sessionId: ctx.sessionId,
        destinationDir: ctx.exportDir,
        namingOptions: { customFilename: 'Raced.xlsx' },
        collisionPolicy: 'FAIL_IF_EXISTS',
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe(ErrorCode.OUTPUT_DESTINATION_COLLISION);
      }
      expect(fs.readdirSync(ctx.exportDir)).toEqual(['Raced.xlsx']);
      expect(fs.readFileSync(path.join(ctx.exportDir, 'Raced.xlsx'), 'utf-8')).toBe(
        'created-by-other-process'
      );
    });

    it('EXP-FAIL-01: Promotion permission failure leaves no files, keeps the workspace usable and reports access denied', () => {
      const ctx = prepareGeneratedSession();
      const realCopy = fs.copyFileSync.bind(fs);
      vi.spyOn(fs, 'copyFileSync').mockImplementation((src, dest, mode) => {
        if (mode === fs.constants.COPYFILE_EXCL) {
          const err = new Error('denied') as NodeJS.ErrnoException;
          err.code = 'EACCES';
          throw err;
        }
        return realCopy(src, dest, mode);
      });

      const res = exportService.exportReport({
        sessionId: ctx.sessionId,
        destinationDir: ctx.exportDir,
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe(ErrorCode.FILE_ACCESS_DENIED);
      }
      expect(fs.readdirSync(ctx.exportDir)).toEqual([]);
      expect(fs.existsSync(ctx.workspace.absolutePath)).toBe(true);
      const ws = workspaceRepo.getWorkspaceById(ctx.workspace.workspaceId);
      expect(ws.ok && ws.value?.status).not.toBe('COMPLETED');
      expect(crypto.createHash('sha256').update(fs.readFileSync(ctx.vaultPath)).digest('hex')).toBe(
        ctx.masterHash
      );
    });

    it('EXP-FAIL-02: Staging copy failure reports an error and creates no output', () => {
      const ctx = prepareGeneratedSession();
      vi.spyOn(fs, 'copyFileSync').mockImplementation(() => {
        const err = new Error('disk full') as NodeJS.ErrnoException;
        err.code = 'ENOSPC';
        throw err;
      });

      const res = exportService.exportReport({
        sessionId: ctx.sessionId,
        destinationDir: ctx.exportDir,
      });

      expect(res.ok).toBe(false);
      vi.restoreAllMocks();
      expect(fs.readdirSync(ctx.exportDir)).toEqual([]);
    });

    it('EXP-PER-01: Database failure after a verified file is saved reports partial success and keeps the file', () => {
      const ctx = prepareGeneratedSession();
      vi.spyOn(workspaceRepo, 'updateWorkspaceStatus').mockReturnValue(
        Err(
          new AppError({
            code: ErrorCode.PERSISTENCE_FAILED,
            userMessage: 'simulated database failure',
            isOperational: true,
          })
        )
      );

      const res = exportService.exportReport({
        sessionId: ctx.sessionId,
        destinationDir: ctx.exportDir,
      });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value.persistenceComplete).toBe(false);
        expect(res.value.warnings.length).toBeGreaterThan(0);
        expect(fs.existsSync(res.value.finalPath)).toBe(true);
      }
      expect(fs.readdirSync(ctx.exportDir)).toHaveLength(1);
    });

    it('EXP-PER-02: A fully successful export reports complete persistence and no leftover staging files', () => {
      const ctx = prepareGeneratedSession();

      const res = exportService.exportReport({
        sessionId: ctx.sessionId,
        destinationDir: ctx.exportDir,
      });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value.persistenceComplete).toBe(true);
        expect(res.value.warnings).toEqual([]);
      }
      const files = fs.readdirSync(ctx.exportDir);
      expect(files).toHaveLength(1);
      expect(files[0].startsWith('.export_staging_')).toBe(false);
    });
  });

  // ===========================================================================
  // Exact station identity & row-order content verification
  // ===========================================================================
  describe('Station Row Content Verification (exact IDs and order)', () => {
    const STN = {
      gamma: {
        id: 'STN-GAMMA',
        name: 'Gamma Perimeter',
        code: 'GAMM',
        status: 'Functional',
        note: 'Note G',
      },
      alpha: {
        id: 'STN-ALPHA',
        name: 'Alpha Substation',
        code: 'ALPH',
        status: 'Dark / Bulb Out',
        note: 'Note A',
      },
      beta: {
        id: 'STN-BETA',
        name: 'Beta Yard',
        code: 'BETA',
        status: 'Flickering',
        note: 'Note B',
      },
    };
    // Deliberately neither alphabetical nor creation order.
    const SESSION_ORDER = [STN.gamma, STN.alpha, STN.beta];
    const HEADER_ROW = 5;

    function buildStationSession() {
      const { templateId, versionId } = setupTestTemplate();
      const db = dbManager.getDatabase();
      const stationRepo = new StationRepository(db);
      for (const s of [STN.alpha, STN.beta, STN.gamma]) {
        const res = stationRepo.createStation({
          stationId: toStationId(s.id),
          stationName: s.name,
          stationCode: s.code,
        });
        expect(res.ok).toBe(true);
      }

      const mapRes = excelMappingRepo.saveMappings({
        templateId,
        versionId,
        worksheetName: 'StationAudit',
        headerRowNumber: HEADER_ROW,
        mappings: [
          {
            fieldId: 'FLD-COM-STATION',
            fieldLabel: 'Station',
            mappingType: 'TABLE_COLUMN',
            targetCoordinate: 'C',
          },
          {
            fieldId: 'FLD-POL-STATUS',
            fieldLabel: 'Status',
            mappingType: 'TABLE_COLUMN',
            targetCoordinate: 'D',
          },
          {
            fieldId: 'FLD-COM-REMARKS',
            fieldLabel: 'Remarks',
            mappingType: 'TABLE_COLUMN',
            targetCoordinate: 'E',
          },
        ],
      });
      expect(mapRes.ok).toBe(true);

      const sessionRes = sessionRepo.createSession({
        sessionTitle: 'Station Content Session',
        categoryId: toReportCategoryId('RPT-POLE-LIGHT'),
        templateId,
        stations: SESSION_ORDER.map((s, i) => ({
          stationId: toStationId(s.id),
          sequenceOrder: i + 1,
          stationNameSnapshot: s.name,
          stationCodeSnapshot: s.code,
        })),
        payload: {
          'FLD-COM-DATE': '2026-10-22',
          'FLD-COM-SHIFT': 'Morning',
          stations: SESSION_ORDER.map(s => ({
            stationId: s.id,
            'FLD-POL-STATUS': s.status,
            'FLD-COM-REMARKS': s.note,
          })),
        },
      });
      expect(sessionRes.ok).toBe(true);
      if (!sessionRes.ok) throw new Error('session');
      const sessionId = sessionRes.value.session.sessionId;

      const cloneRes = cloningService.prepareExcelWorkspace({ templateId, sessionId });
      if (!cloneRes.ok) throw new Error('clone failed');
      const injectRes = injectionService.injectSessionData({
        workspaceId: cloneRes.value.workspace.workspaceId,
        sessionId,
      });
      expect(injectRes.ok).toBe(true);
      return { sessionId, workspace: cloneRes.value.workspace };
    }

    function readCell(buf: Buffer, ref: string): string | null {
      const zip = new PizZip(buf);
      const shared = WorksheetXmlEditor.readSharedStrings(zip).strings;
      const cell = WorksheetXmlEditor.readCellRaw(zip, 'xl/worksheets/sheet1.xml', ref, shared);
      return cell && cell.value !== null ? String(cell.value) : null;
    }

    function tamperWorkingCopy(
      workspace: { absolutePath: string; workspaceId: any },
      edit: (xml: string) => string
    ) {
      const zip = new PizZip(fs.readFileSync(workspace.absolutePath));
      zip.file('xl/worksheets/sheet1.xml', edit(zip.file('xl/worksheets/sheet1.xml')!.asText()));
      const buf = zip.generate({ type: 'nodebuffer' });
      fs.writeFileSync(workspace.absolutePath, buf);
      workspaceRepo.updateWorkspaceFile(workspace.workspaceId, {
        sha256Hash: crypto.createHash('sha256').update(buf).digest('hex'),
        fileSizeBytes: buf.length,
        status: 'IN_USE',
      });
    }

    it('EXP-CNT-01: exported rows match the session station IDs and order exactly', () => {
      const { sessionId } = buildStationSession();
      const exportRes = exportService.exportReport({
        sessionId,
        destinationDir: path.join(tempRoot, 'Out'),
      });
      expect(exportRes.ok).toBe(true);
      if (!exportRes.ok) return;

      const summary = exportRes.value.validationSummary;
      expect(summary.stationRowsVerifiedCount).toBe(3);
      expect(summary.verifiedStationOrder).toEqual(SESSION_ORDER.map(s => s.id));

      // Independent check against the final file on disk.
      const out = fs.readFileSync(exportRes.value.finalPath);
      const idByName = new Map(SESSION_ORDER.map(s => [s.name, s.id]));
      const rowIds = SESSION_ORDER.map((_, i) =>
        idByName.get(readCell(out, `C${HEADER_ROW + 1 + i}`) ?? '')
      );
      expect(rowIds).toEqual(['STN-GAMMA', 'STN-ALPHA', 'STN-BETA']);
      SESSION_ORDER.forEach((s, i) => {
        const row = HEADER_ROW + 1 + i;
        expect(readCell(out, `C${row}`)).toBe(s.name);
        expect(readCell(out, `D${row}`)).toBe(s.status);
        expect(readCell(out, `E${row}`)).toBe(s.note);
      });
      // No extra station rows beyond the session's stations.
      expect(readCell(out, `C${HEADER_ROW + 1 + SESSION_ORDER.length}`)).toBeNull();
    });

    it('EXP-CNT-02: rejects an export whose station rows are swapped (order mismatch)', () => {
      const { sessionId, workspace } = buildStationSession();
      tamperWorkingCopy(workspace, xml => {
        const cell = (ref: string) => new RegExp(`<c r="${ref}"[^>]*>[\\s\\S]*?</c>`).exec(xml)![0];
        const c6 = cell(`C${HEADER_ROW + 1}`);
        const c7 = cell(`C${HEADER_ROW + 2}`);
        const v = (c: string) => /<v>([^<]*)<\/v>/.exec(c)![1];
        return xml
          .replace(c6, c6.replace(`<v>${v(c6)}</v>`, `<v>${v(c7)}</v>`))
          .replace(c7, c7.replace(`<v>${v(c7)}</v>`, `<v>${v(c6)}</v>`));
      });
      const res = exportService.exportReport({
        sessionId,
        destinationDir: path.join(tempRoot, 'Out'),
      });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe(ErrorCode.GENERATION_FAILED);
        expect(res.error.userMessage).toContain(`row ${HEADER_ROW + 1}`);
        expect(res.error.userMessage).toContain('STN-GAMMA');
      }
      expect(
        fs.existsSync(path.join(tempRoot, 'Out')) ? fs.readdirSync(path.join(tempRoot, 'Out')) : []
      ).toHaveLength(0);
    });

    it('EXP-CNT-03: rejects an export where a per-station value is attributed to the wrong row', () => {
      const { sessionId, workspace } = buildStationSession();
      tamperWorkingCopy(workspace, xml => {
        const cell = (ref: string) => new RegExp(`<c r="${ref}"[^>]*>[\\s\\S]*?</c>`).exec(xml)![0];
        const d6 = cell(`D${HEADER_ROW + 1}`);
        const d7 = cell(`D${HEADER_ROW + 2}`);
        const v = (c: string) => /<v>([^<]*)<\/v>/.exec(c)![1];
        return xml
          .replace(d6, d6.replace(`<v>${v(d6)}</v>`, `<v>${v(d7)}</v>`))
          .replace(d7, d7.replace(`<v>${v(d7)}</v>`, `<v>${v(d6)}</v>`));
      });
      const res = exportService.exportReport({
        sessionId,
        destinationDir: path.join(tempRoot, 'Out'),
      });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.userMessage).toContain('FLD-POL-STATUS');
    });

    it('EXP-CNT-04: rejects an export that is missing a station row', () => {
      const { sessionId, workspace } = buildStationSession();
      tamperWorkingCopy(workspace, xml =>
        xml.replace(new RegExp(`<c r="C${HEADER_ROW + 3}"[^>]*>[\\s\\S]*?</c>`), '')
      );
      const res = exportService.exportReport({
        sessionId,
        destinationDir: path.join(tempRoot, 'Out'),
      });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.userMessage).toContain('STN-BETA');
    });

    it('EXP-NAM-10: exported file follows the approved [Category]_[Date]_[Station]_[Shift]_[Session] pattern', () => {
      const { sessionId } = buildStationSession();
      const cat = categoryRepo.getCategoryById(toReportCategoryId('RPT-POLE-LIGHT'));
      const categoryPart = ExcelFilenameResolver.sanitizeComponent(
        cat.ok && cat.value ? cat.value.display_name : 'RPT-POLE-LIGHT',
        50
      );
      const res = exportService.exportReport({
        sessionId,
        destinationDir: path.join(tempRoot, 'Out'),
        namingOptions: { stationCodeOrName: 'Alpha' },
      });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      const parts = res.value.fileName.replace(/\.xlsx$/, '').split('_');
      // Category may itself contain no underscore after sanitisation of spaces; assert by order.
      const expectedPrefix = `${categoryPart}_2026-10-22_Alpha_Morning_`;
      expect(res.value.fileName.startsWith(expectedPrefix)).toBe(true);
      expect(res.value.fileName.slice(expectedPrefix.length)).toMatch(/^[A-Za-z0-9-]{1,30}\.xlsx$/);
      expect(parts.length).toBeGreaterThanOrEqual(5);
      expect(path.extname(res.value.fileName)).toBe('.xlsx');
    });
  });
});
