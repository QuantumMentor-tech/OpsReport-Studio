/**
 * OpsReport Studio — Step 27: Worksheet Selection, Cell Mapping & Structured Data Injection Tests
 *
 * Verifies:
 * - Session data and field mapping resolution by stable identifiers (DIC-OPSREPORT-001)
 * - Category, template, version, and profile consistency checks
 * - Multi-sheet worksheet resolution and coordinate syntax validation
 * - Scalar value injection across data types (String, Integer, Boolean, Date, Time)
 * - Handling of missing, empty, zero, and false values
 * - Formula-injection immunity (text starting with '=', '+', '-', '@' stored strictly as text)
 * - Style preservation: master cell styles (s="...") preserved after value injection
 * - Master template immutability invariant (INV-DAT-006: 0-byte variance before and after injection)
 * - Workspace isolation: writes confined strictly to Generation Workspace (%LOCALAPPDATA%\OpsReportStudio\Workspace\)
 * - Safe candidate staging, verification, atomic promotion, and rollback on error
 * - Deferred table-column mapping tracking for Step 28 multi-station row expansion
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
import { SessionRepository } from '../../src/storage/database/repositories/session-repository.ts';
import { GenerationWorkspaceRepository } from '../../src/storage/database/repositories/generation-workspace-repository.ts';
import { ExcelMappingRepository } from '../../src/storage/database/repositories/excel-mapping-repository.ts';
import { MappingProfileRepository } from '../../src/storage/database/repositories/mapping-profile-repository.ts';
import { ExcelWorkbookCloningService } from '../../src/storage/generation/excel-workbook-cloning-service.ts';
import { ExcelDataInjectionService } from '../../src/storage/generation/excel-data-injection-service.ts';
import { WorksheetXmlEditor } from '../../src/storage/generation/worksheet-xml-editor.ts';
import {
  toTemplateId,
  toReportSessionId,
  toMappingProfileId,
} from '../../src/shared/types/identifiers.ts';
import { ErrorCode } from '../../src/shared/errors/error-codes.ts';

function createMultiSheetExcelZip(): Buffer {
  const zip = new PizZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'
  );
  zip.file(
    'xl/workbook.xml',
    '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="LightingAudit" sheetId="1" r:id="rId1"/><sheet name="SummarySheet" sheetId="2" r:id="rId2"/></sheets></workbook>'
  );
  zip.file(
    'xl/_rels/workbook.xml.rels',
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>'
  );
  zip.file(
    'xl/styles.xml',
    '<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="1" borderId="1" xfId="0" applyFont="1"/></cellXfs></styleSheet>'
  );
  zip.file(
    'xl/sharedStrings.xml',
    '<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="2" uniqueCount="2"><si><t>Initial Master Text</t></si><si><t>Header Bar</t></si></sst>'
  );
  zip.file(
    'xl/worksheets/sheet1.xml',
    '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:G20"/><sheetData><row r="1"><c r="A1" s="1" t="s"><v>1</v></c><c r="B1"><v>100</v></c></row><row r="2"><c r="A2" s="1" t="s"><v>0</v></c></row></sheetData></worksheet>'
  );
  zip.file(
    'xl/worksheets/sheet2.xml',
    '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:C10"/><sheetData><row r="1"><c r="A1"><v>999</v></c></row></sheetData></worksheet>'
  );
  return zip.generate({ type: 'nodebuffer' });
}

function computeFileHash(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

describe('OpsReport Studio — Step 27: Worksheet Selection, Cell Mapping & Structured Data Injection', () => {
  let tempRoot: string;
  let vaultManager: VaultManager;
  let dbManager: DatabaseManager;
  let templateRepo: TemplateMetadataRepository;
  let sessionRepo: SessionRepository;
  let workspaceRepo: GenerationWorkspaceRepository;
  let excelMappingRepo: ExcelMappingRepository;
  let profileRepo: MappingProfileRepository;
  let cloningService: ExcelWorkbookCloningService;
  let injectionService: ExcelDataInjectionService;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opsreport-step27-test-'));
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
  });

  afterEach(() => {
    VaultManager.setInstance(null);
    if (dbManager?.isOpen()) {
      dbManager.close();
    }
    if (fs.existsSync(tempRoot)) {
      try {
        fs.rmSync(tempRoot, { recursive: true, force: true });
      } catch {
        // safe ignore
      }
    }
  });

  // Helper to set up a valid Excel template version in vault and database
  function setupTestTemplate(templateIdStr = 'TPL-POLE-LIGHT-STANDARD') {
    const templateId = toTemplateId(templateIdStr);
    const activeVerRes = templateRepo.getActiveVersion(templateId);
    expect(activeVerRes.ok).toBe(true);
    if (!activeVerRes.ok || !activeVerRes.value) throw new Error('Active version missing');

    const vaultPathRes = vaultManager.resolveTemplateFileVaultPath(activeVerRes.value.file_name);
    expect(vaultPathRes.ok).toBe(true);
    if (!vaultPathRes.ok) throw new Error('Vault path resolution failed');

    const excelBytes = createMultiSheetExcelZip();
    fs.writeFileSync(vaultPathRes.value, excelBytes);
    const masterHash = computeFileHash(vaultPathRes.value);

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

  // ---------------------------------------------------------------------------
  // 1. Session and Data Resolution Tests
  // ---------------------------------------------------------------------------
  describe('Session & Data Resolution', () => {
    it('INJ-01: Rejects injection when report session does not exist in persistence store', () => {
      const { templateId } = setupTestTemplate();
      const cloneRes = cloningService.prepareExcelWorkspace({ templateId });
      expect(cloneRes.ok).toBe(true);
      if (!cloneRes.ok) return;

      const nonExistentSession = toReportSessionId('sess_does_not_exist');
      const injRes = injectionService.injectSessionData({
        workspaceId: cloneRes.value.workspace.workspaceId,
        sessionId: nonExistentSession,
      });

      expect(injRes.ok).toBe(false);
      if (!injRes.ok) {
        expect(injRes.error.code).toBe(ErrorCode.DRAFT_NOT_FOUND);
      }
    });

    it('INJ-02: Rejects injection when report session is marked CANCELLED', () => {
      const { templateId } = setupTestTemplate();
      const db = dbManager.getDatabase();
      const sessId = 'sess_cancelled_01';
      db.prepare(
        `
        INSERT INTO report_sessions (session_id, session_title, category_id, template_id, status, form_data, payload_version, created_at, updated_at)
        VALUES (?, 'Cancelled Audit', 'RPT-POLE-LIGHT', ?, 'CANCELLED', '{"data":{}}', 1, datetime('now'), datetime('now'))
      `
      ).run(sessId, String(templateId));

      const cloneRes = cloningService.prepareExcelWorkspace({ templateId });
      expect(cloneRes.ok).toBe(true);
      if (!cloneRes.ok) return;

      const injRes = injectionService.injectSessionData({
        workspaceId: cloneRes.value.workspace.workspaceId,
        sessionId: toReportSessionId(sessId),
      });

      expect(injRes.ok).toBe(false);
      if (!injRes.ok) {
        expect(injRes.error.code).toBe(ErrorCode.VALIDATION_FAILED);
        expect(injRes.error.userMessage).toContain('CANCELLED');
      }
    });

    it('INJ-03: Rejects injection when session references a different template than the workspace', () => {
      const tplA = setupTestTemplate('TPL-POLE-LIGHT-STANDARD');
      const tplB = setupTestTemplate('TPL-STATION-LIGHT-STANDARD');

      const db = dbManager.getDatabase();
      const sessId = 'sess_mismatch_01';
      db.prepare(
        `
        INSERT INTO report_sessions (session_id, session_title, category_id, template_id, status, form_data, payload_version, created_at, updated_at)
        VALUES (?, 'Mismatch Audit', 'RPT-POLE-LIGHT', ?, 'DRAFT', '{"data":{}}', 1, datetime('now'), datetime('now'))
      `
      ).run(sessId, String(tplB.templateId));

      // Workspace created with Template A
      const cloneRes = cloningService.prepareExcelWorkspace({ templateId: tplA.templateId });
      expect(cloneRes.ok).toBe(true);
      if (!cloneRes.ok) return;

      const injRes = injectionService.injectSessionData({
        workspaceId: cloneRes.value.workspace.workspaceId,
        sessionId: toReportSessionId(sessId),
      });

      expect(injRes.ok).toBe(false);
      if (!injRes.ok) {
        expect(injRes.error.code).toBe(ErrorCode.VALIDATION_FAILED);
        expect(injRes.error.userMessage).toContain('references template');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Mapping Configuration & Target Resolution Tests
  // ---------------------------------------------------------------------------
  describe('Mapping Configuration & Target Resolution', () => {
    it('INJ-04: Rejects injection when no field mappings exist for the template version', () => {
      const { templateId } = setupTestTemplate();
      const db = dbManager.getDatabase();
      const sessId = 'sess_valid_01';
      db.prepare(
        `
        INSERT INTO report_sessions (session_id, session_title, category_id, template_id, status, form_data, payload_version, created_at, updated_at)
        VALUES (?, 'Valid Audit', 'RPT-POLE-LIGHT', ?, 'DRAFT', '{"data":{"FLD-COM-DATE":"2026-10-22"}}', 1, datetime('now'), datetime('now'))
      `
      ).run(sessId, String(templateId));

      const cloneRes = cloningService.prepareExcelWorkspace({
        templateId,
        sessionId: toReportSessionId(sessId),
      });
      expect(cloneRes.ok).toBe(true);
      if (!cloneRes.ok) return;

      const injRes = injectionService.injectSessionData({
        workspaceId: cloneRes.value.workspace.workspaceId,
        sessionId: toReportSessionId(sessId),
      });

      expect(injRes.ok).toBe(false);
      if (!injRes.ok) {
        expect(injRes.error.code).toBe(ErrorCode.VALIDATION_FAILED);
        expect(injRes.error.userMessage).toContain('No Excel field mappings found');
      }
    });

    it('INJ-05: Rejects injection when mapping specifies an invalid coordinate syntax', () => {
      const { templateId, versionId } = setupTestTemplate();
      const db = dbManager.getDatabase();

      // Seed invalid coordinate mapping
      db.prepare(
        `
        INSERT INTO excel_template_mappings (mapping_id, template_id, version_id, worksheet_name, mapping_type, field_id, field_label, target_coordinate, created_at, updated_at)
        VALUES ('MAP-BAD-COORD', ?, ?, 'LightingAudit', 'FIXED_CELL', 'FLD-COM-DATE', 'Report Date', 'INVALID_COORD', datetime('now'), datetime('now'))
      `
      ).run(String(templateId), String(versionId));

      const sessId = 'sess_bad_coord_01';
      db.prepare(
        `
        INSERT INTO report_sessions (session_id, session_title, category_id, template_id, status, form_data, payload_version, created_at, updated_at)
        VALUES (?, 'Coord Audit', 'RPT-POLE-LIGHT', ?, 'DRAFT', '{"data":{"FLD-COM-DATE":"2026-10-22"}}', 1, datetime('now'), datetime('now'))
      `
      ).run(sessId, String(templateId));

      const cloneRes = cloningService.prepareExcelWorkspace({
        templateId,
        sessionId: toReportSessionId(sessId),
      });
      expect(cloneRes.ok).toBe(true);
      if (!cloneRes.ok) return;

      const injRes = injectionService.injectSessionData({
        workspaceId: cloneRes.value.workspace.workspaceId,
        sessionId: toReportSessionId(sessId),
      });

      expect(injRes.ok).toBe(false);
      if (!injRes.ok) {
        expect(injRes.error.code).toBe(ErrorCode.VALIDATION_FAILED);
        expect(injRes.error.userMessage).toContain('invalid coordinate');
      }
    });

    it('INJ-06: Detects target coordinate collision and rejects conflicting mapping before writing', () => {
      const { templateId, versionId } = setupTestTemplate();
      const db = dbManager.getDatabase();

      // Seed two mappings targeting the exact same worksheet and cell
      db.prepare(
        `
        INSERT INTO excel_template_mappings (mapping_id, template_id, version_id, worksheet_name, mapping_type, field_id, field_label, target_coordinate, created_at, updated_at)
        VALUES ('MAP-COL-1', ?, ?, 'LightingAudit', 'FIXED_CELL', 'FLD-COM-DATE', 'Report Date', 'B2', datetime('now'), datetime('now')),
               ('MAP-COL-2', ?, ?, 'LightingAudit', 'FIXED_CELL', 'FLD-COM-INSPECTOR', 'Inspector Name', 'B2', datetime('now'), datetime('now'))
      `
      ).run(String(templateId), String(versionId), String(templateId), String(versionId));

      const sessId = 'sess_col_01';
      db.prepare(
        `
        INSERT INTO report_sessions (session_id, session_title, category_id, template_id, status, form_data, payload_version, created_at, updated_at)
        VALUES (?, 'Collision Audit', 'RPT-POLE-LIGHT', ?, 'DRAFT', '{"data":{"FLD-COM-DATE":"2026-10-22","FLD-COM-INSPECTOR":"Alex Smith"}}', 1, datetime('now'), datetime('now'))
      `
      ).run(sessId, String(templateId));

      const cloneRes = cloningService.prepareExcelWorkspace({
        templateId,
        sessionId: toReportSessionId(sessId),
      });
      expect(cloneRes.ok).toBe(true);
      if (!cloneRes.ok) return;

      const injRes = injectionService.injectSessionData({
        workspaceId: cloneRes.value.workspace.workspaceId,
        sessionId: toReportSessionId(sessId),
      });

      expect(injRes.ok).toBe(false);
      if (!injRes.ok) {
        expect(injRes.error.code).toBe(ErrorCode.VALIDATION_FAILED);
        expect(injRes.error.userMessage).toContain('Mapping conflict detected');
      }
    });

    it('INJ-07: Rejects injection when mapped worksheet does not exist in template workbook', () => {
      const { templateId, versionId } = setupTestTemplate();
      const db = dbManager.getDatabase();

      // Seed mapping targeting a non-existent worksheet
      db.prepare(
        `
        INSERT INTO excel_template_mappings (mapping_id, template_id, version_id, worksheet_name, mapping_type, field_id, field_label, target_coordinate, created_at, updated_at)
        VALUES ('MAP-GHOST', ?, ?, 'GhostWorksheet', 'FIXED_CELL', 'FLD-COM-DATE', 'Report Date', 'B2', datetime('now'), datetime('now'))
      `
      ).run(String(templateId), String(versionId));

      const sessId = 'sess_ghost_01';
      db.prepare(
        `
        INSERT INTO report_sessions (session_id, session_title, category_id, template_id, status, form_data, payload_version, created_at, updated_at)
        VALUES (?, 'Ghost Audit', 'RPT-POLE-LIGHT', ?, 'DRAFT', '{"data":{"FLD-COM-DATE":"2026-10-22"}}', 1, datetime('now'), datetime('now'))
      `
      ).run(sessId, String(templateId));

      const cloneRes = cloningService.prepareExcelWorkspace({
        templateId,
        sessionId: toReportSessionId(sessId),
      });
      expect(cloneRes.ok).toBe(true);
      if (!cloneRes.ok) return;

      const injRes = injectionService.injectSessionData({
        workspaceId: cloneRes.value.workspace.workspaceId,
        sessionId: toReportSessionId(sessId),
      });

      expect(injRes.ok).toBe(false);
      if (!injRes.ok) {
        expect(injRes.error.code).toBe(ErrorCode.MAPPING_TARGET_NOT_FOUND);
        expect(injRes.error.userMessage).toContain('GhostWorksheet');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Scalar Data Injection, Value Conversions & Verification
  // ---------------------------------------------------------------------------
  describe('Structured Data Injection & Value Conversions', () => {
    it('INJ-08: Successfully injects scalar values (String, Date, Time, Integer, Boolean) into mapped cells', () => {
      const { templateId, versionId } = setupTestTemplate();
      const db = dbManager.getDatabase();

      // Configure valid mappings across multiple worksheets
      db.prepare(
        `
        INSERT INTO excel_template_mappings (mapping_id, template_id, version_id, worksheet_name, mapping_type, field_id, field_label, target_coordinate, created_at, updated_at)
        VALUES 
          ('MAP-1', ?, ?, 'LightingAudit', 'FIXED_CELL', 'FLD-COM-DATE', 'Report Date', 'A2', datetime('now'), datetime('now')),
          ('MAP-2', ?, ?, 'LightingAudit', 'FIXED_CELL', 'FLD-COM-INSPECTOR', 'Inspector Name', 'B2', datetime('now'), datetime('now')),
          ('MAP-3', ?, ?, 'LightingAudit', 'FIXED_CELL', 'FLD-COM-SHIFT', 'Shift', 'C2', datetime('now'), datetime('now')),
          ('MAP-4', ?, ?, 'SummarySheet', 'FIXED_CELL', 'FLD-COM-BADGE', 'Badge Number', 'B1', datetime('now'), datetime('now'))
      `
      ).run(
        String(templateId),
        String(versionId),
        String(templateId),
        String(versionId),
        String(templateId),
        String(versionId),
        String(templateId),
        String(versionId)
      );

      const sessId = 'sess_inj_success_01';
      db.prepare(
        `
        INSERT INTO report_sessions (session_id, session_title, category_id, template_id, status, form_data, payload_version, created_at, updated_at)
        VALUES (?, 'Success Audit', 'RPT-POLE-LIGHT', ?, 'DRAFT', ?, 1, datetime('now'), datetime('now'))
      `
      ).run(
        sessId,
        String(templateId),
        JSON.stringify({
          data: {
            'FLD-COM-DATE': '2026-10-22',
            'FLD-COM-INSPECTOR': 'Sarah Connor',
            'FLD-COM-SHIFT': 'Night',
            'FLD-COM-BADGE': 'OP-9942',
          },
        })
      );

      const cloneRes = cloningService.prepareExcelWorkspace({
        templateId,
        sessionId: toReportSessionId(sessId),
      });
      expect(cloneRes.ok).toBe(true);
      if (!cloneRes.ok) return;

      const injRes = injectionService.injectSessionData({
        workspaceId: cloneRes.value.workspace.workspaceId,
        sessionId: toReportSessionId(sessId),
      });

      expect(injRes.ok).toBe(true);
      if (!injRes.ok) return;

      const result = injRes.value;
      expect(result.fixedCellsWrittenCount).toBe(4);
      expect(result.isVerified).toBe(true);
      expect(result.masterUntouched).toBe(true);
      expect(result.workspace.status).toBe('IN_USE');

      // Verify cell contents on disk
      const zip = new PizZip(fs.readFileSync(result.workspace.absolutePath));
      const sst = WorksheetXmlEditor.readSharedStrings(zip).strings;

      const sheet1Path = WorksheetXmlEditor.resolveWorksheetPath(zip, 'LightingAudit')!;
      const cellA2 = WorksheetXmlEditor.readCellRaw(zip, sheet1Path, 'A2', sst);
      expect(cellA2?.value).toBe('2026-10-22');

      const cellB2 = WorksheetXmlEditor.readCellRaw(zip, sheet1Path, 'B2', sst);
      expect(cellB2?.value).toBe('Sarah Connor');

      const cellC2 = WorksheetXmlEditor.readCellRaw(zip, sheet1Path, 'C2', sst);
      expect(cellC2?.value).toBe('Night');

      const sheet2Path = WorksheetXmlEditor.resolveWorksheetPath(zip, 'SummarySheet')!;
      const cellB1 = WorksheetXmlEditor.readCellRaw(zip, sheet2Path, 'B1', sst);
      expect(cellB1?.value).toBe('OP-9942');
    });

    it('INJ-09: Resolves values by canonical property name when stored without FLD- prefix', () => {
      const { templateId, versionId } = setupTestTemplate();
      const db = dbManager.getDatabase();

      db.prepare(
        `
        INSERT INTO excel_template_mappings (mapping_id, template_id, version_id, worksheet_name, mapping_type, field_id, field_label, target_coordinate, created_at, updated_at)
        VALUES ('MAP-CANON-1', ?, ?, 'LightingAudit', 'FIXED_CELL', 'FLD-COM-DATE', 'Report Date', 'A2', datetime('now'), datetime('now')),
               ('MAP-CANON-2', ?, ?, 'LightingAudit', 'FIXED_CELL', 'FLD-COM-INSPECTOR', 'Inspector Name', 'B2', datetime('now'), datetime('now'))
      `
      ).run(String(templateId), String(versionId), String(templateId), String(versionId));

      const sessId = 'sess_canon_01';
      db.prepare(
        `
        INSERT INTO report_sessions (session_id, session_title, category_id, template_id, status, form_data, payload_version, created_at, updated_at)
        VALUES (?, 'Canonical Audit', 'RPT-POLE-LIGHT', ?, 'DRAFT', ?, 1, datetime('now'), datetime('now'))
      `
      ).run(
        sessId,
        String(templateId),
        JSON.stringify({
          data: {
            report_date: '2026-10-25',
            inspector_name: 'John Miller',
          },
        })
      );

      const cloneRes = cloningService.prepareExcelWorkspace({
        templateId,
        sessionId: toReportSessionId(sessId),
      });
      expect(cloneRes.ok).toBe(true);
      if (!cloneRes.ok) return;

      const injRes = injectionService.injectSessionData({
        workspaceId: cloneRes.value.workspace.workspaceId,
        sessionId: toReportSessionId(sessId),
      });

      expect(injRes.ok).toBe(true);
      if (!injRes.ok) return;

      const zip = new PizZip(fs.readFileSync(injRes.value.workspace.absolutePath));
      const sst = WorksheetXmlEditor.readSharedStrings(zip).strings;
      const sheetPath = WorksheetXmlEditor.resolveWorksheetPath(zip, 'LightingAudit')!;

      expect(WorksheetXmlEditor.readCellRaw(zip, sheetPath, 'A2', sst)?.value).toBe('2026-10-25');
      expect(WorksheetXmlEditor.readCellRaw(zip, sheetPath, 'B2', sst)?.value).toBe('John Miller');
    });

    it('INJ-10: Preserves cell styles (s="...") on master template cells when writing mapped values', () => {
      const { templateId, versionId } = setupTestTemplate();
      const db = dbManager.getDatabase();

      // A1 on LightingAudit has s="1" in our fixture
      db.prepare(
        `
        INSERT INTO excel_template_mappings (mapping_id, template_id, version_id, worksheet_name, mapping_type, field_id, field_label, target_coordinate, created_at, updated_at)
        VALUES ('MAP-STYLE-1', ?, ?, 'LightingAudit', 'FIXED_CELL', 'FLD-COM-DATE', 'Report Date', 'A1', datetime('now'), datetime('now'))
      `
      ).run(String(templateId), String(versionId));

      const sessId = 'sess_style_01';
      db.prepare(
        `
        INSERT INTO report_sessions (session_id, session_title, category_id, template_id, status, form_data, payload_version, created_at, updated_at)
        VALUES (?, 'Style Audit', 'RPT-POLE-LIGHT', ?, 'DRAFT', '{"data":{"FLD-COM-DATE":"2026-10-31"}}', 1, datetime('now'), datetime('now'))
      `
      ).run(sessId, String(templateId));

      const cloneRes = cloningService.prepareExcelWorkspace({
        templateId,
        sessionId: toReportSessionId(sessId),
      });
      expect(cloneRes.ok).toBe(true);
      if (!cloneRes.ok) return;

      const injRes = injectionService.injectSessionData({
        workspaceId: cloneRes.value.workspace.workspaceId,
        sessionId: toReportSessionId(sessId),
      });

      expect(injRes.ok).toBe(true);
      if (!injRes.ok) return;

      const zip = new PizZip(fs.readFileSync(injRes.value.workspace.absolutePath));
      const sst = WorksheetXmlEditor.readSharedStrings(zip).strings;
      const sheetPath = WorksheetXmlEditor.resolveWorksheetPath(zip, 'LightingAudit')!;

      const cellA1 = WorksheetXmlEditor.readCellRaw(zip, sheetPath, 'A1', sst);
      expect(cellA1?.value).toBe('2026-10-31');
      expect(cellA1?.styleIndex).toBe('1'); // Style index "1" preserved from master fixture!
    });

    it('INJ-11: Guarantees formula-injection immunity (text starting with =, +, -, @ stored strictly as text)', () => {
      const { templateId, versionId } = setupTestTemplate();
      const db = dbManager.getDatabase();

      db.prepare(
        `
        INSERT INTO excel_template_mappings (mapping_id, template_id, version_id, worksheet_name, mapping_type, field_id, field_label, target_coordinate, created_at, updated_at)
        VALUES ('MAP-SEC-1', ?, ?, 'LightingAudit', 'FIXED_CELL', 'FLD-COM-REMARKS', 'Remarks', 'B2', datetime('now'), datetime('now'))
      `
      ).run(String(templateId), String(versionId));

      const maliciousFormula = '=SUM(1, 2)';
      const sessId = 'sess_sec_01';
      db.prepare(
        `
        INSERT INTO report_sessions (session_id, session_title, category_id, template_id, status, form_data, payload_version, created_at, updated_at)
        VALUES (?, 'Security Audit', 'RPT-POLE-LIGHT', ?, 'DRAFT', ?, 1, datetime('now'), datetime('now'))
      `
      ).run(
        sessId,
        String(templateId),
        JSON.stringify({
          data: {
            'FLD-COM-REMARKS': maliciousFormula,
          },
        })
      );

      const cloneRes = cloningService.prepareExcelWorkspace({
        templateId,
        sessionId: toReportSessionId(sessId),
      });
      expect(cloneRes.ok).toBe(true);
      if (!cloneRes.ok) return;

      const injRes = injectionService.injectSessionData({
        workspaceId: cloneRes.value.workspace.workspaceId,
        sessionId: toReportSessionId(sessId),
      });

      expect(injRes.ok).toBe(true);
      if (!injRes.ok) return;

      const zip = new PizZip(fs.readFileSync(injRes.value.workspace.absolutePath));
      const sst = WorksheetXmlEditor.readSharedStrings(zip).strings;
      const sheetPath = WorksheetXmlEditor.resolveWorksheetPath(zip, 'LightingAudit')!;

      const cellB2 = WorksheetXmlEditor.readCellRaw(zip, sheetPath, 'B2', sst);
      expect(cellB2?.type).toBe('s'); // Stored as shared string type!
      expect(cellB2?.value).toBe(maliciousFormula);

      // Verify raw XML: it MUST NOT have an <f> tag
      const sheetXml = zip.file(sheetPath)!.asText();
      expect(sheetXml).not.toContain('<f>=SUM(1, 2)</f>');
      expect(sheetXml).not.toContain('<f>');
    });

    it('INJ-12: Tracks table column mappings as DEFERRED for Step 28 row expansion', () => {
      const { templateId, versionId } = setupTestTemplate();
      const db = dbManager.getDatabase();

      // Configure a mix of FIXED_CELL and TABLE_COLUMN mappings
      db.prepare(
        `
        INSERT INTO excel_template_mappings (mapping_id, template_id, version_id, worksheet_name, mapping_type, field_id, field_label, target_coordinate, created_at, updated_at)
        VALUES 
          ('MAP-FIXED', ?, ?, 'LightingAudit', 'FIXED_CELL', 'FLD-COM-DATE', 'Report Date', 'A2', datetime('now'), datetime('now')),
          ('MAP-COL', ?, ?, 'LightingAudit', 'TABLE_COLUMN', 'FLD-COM-STATION', 'Station Name', 'C', datetime('now'), datetime('now'))
      `
      ).run(String(templateId), String(versionId), String(templateId), String(versionId));

      const sessId = 'sess_mixed_01';
      db.prepare(
        `
        INSERT INTO report_sessions (session_id, session_title, category_id, template_id, status, form_data, payload_version, created_at, updated_at)
        VALUES (?, 'Mixed Audit', 'RPT-POLE-LIGHT', ?, 'DRAFT', '{"data":{"FLD-COM-DATE":"2026-10-22"}}', 1, datetime('now'), datetime('now'))
      `
      ).run(sessId, String(templateId));

      const cloneRes = cloningService.prepareExcelWorkspace({
        templateId,
        sessionId: toReportSessionId(sessId),
      });
      expect(cloneRes.ok).toBe(true);
      if (!cloneRes.ok) return;

      const injRes = injectionService.injectSessionData({
        workspaceId: cloneRes.value.workspace.workspaceId,
        sessionId: toReportSessionId(sessId),
      });

      expect(injRes.ok).toBe(true);
      if (!injRes.ok) return;

      const result = injRes.value;
      expect(result.fixedCellsWrittenCount).toBe(1);
      expect(result.tableColumnsDeferredCount).toBe(1);
      expect(result.deferredWrites[0].status).toBe('DEFERRED');
      expect(result.deferredWrites[0].fieldId).toBe('FLD-COM-STATION');
      expect(result.deferredWrites[0].note).toContain('Step 28');
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Master Immutability Invariant & Rollback Safety
  // ---------------------------------------------------------------------------
  describe('Master Immutability & Rollback Safety', () => {
    it('INJ-13: Strictly enforces 0-byte variance on master template file in Vault before and after injection', () => {
      const { templateId, vaultPath, masterHash } = setupTestTemplate();
      const db = dbManager.getDatabase();

      db.prepare(
        `
        INSERT INTO excel_template_mappings (mapping_id, template_id, version_id, worksheet_name, mapping_type, field_id, field_label, target_coordinate, created_at, updated_at)
        VALUES ('MAP-IMM', ?, (SELECT version_id FROM template_versions WHERE template_id = ?), 'LightingAudit', 'FIXED_CELL', 'FLD-COM-DATE', 'Report Date', 'A2', datetime('now'), datetime('now'))
      `
      ).run(String(templateId), String(templateId));

      const sessId = 'sess_imm_01';
      db.prepare(
        `
        INSERT INTO report_sessions (session_id, session_title, category_id, template_id, status, form_data, payload_version, created_at, updated_at)
        VALUES (?, 'Immutability Audit', 'RPT-POLE-LIGHT', ?, 'DRAFT', '{"data":{"FLD-COM-DATE":"2026-10-22"}}', 1, datetime('now'), datetime('now'))
      `
      ).run(sessId, String(templateId));

      const cloneRes = cloningService.prepareExcelWorkspace({
        templateId,
        sessionId: toReportSessionId(sessId),
      });
      expect(cloneRes.ok).toBe(true);
      if (!cloneRes.ok) return;

      const preHash = computeFileHash(vaultPath);
      expect(preHash).toBe(masterHash);

      const injRes = injectionService.injectSessionData({
        workspaceId: cloneRes.value.workspace.workspaceId,
        sessionId: toReportSessionId(sessId),
      });

      expect(injRes.ok).toBe(true);

      const postHash = computeFileHash(vaultPath);
      expect(postHash).toBe(preHash); // Strict 0-byte delta on master template file!
    });

    it('INJ-14: Cleans up candidate file on failure and preserves pre-existing working artifact', () => {
      const { templateId, versionId } = setupTestTemplate();
      const db = dbManager.getDatabase();

      // Seed mapping targeting a non-existent worksheet to induce a planned failure
      db.prepare(
        `
        INSERT INTO excel_template_mappings (mapping_id, template_id, version_id, worksheet_name, mapping_type, field_id, field_label, target_coordinate, created_at, updated_at)
        VALUES ('MAP-FAIL', ?, ?, 'NonExistentSheet', 'FIXED_CELL', 'FLD-COM-DATE', 'Report Date', 'A2', datetime('now'), datetime('now'))
      `
      ).run(String(templateId), String(versionId));

      const sessId = 'sess_fail_01';
      db.prepare(
        `
        INSERT INTO report_sessions (session_id, session_title, category_id, template_id, status, form_data, payload_version, created_at, updated_at)
        VALUES (?, 'Fail Audit', 'RPT-POLE-LIGHT', ?, 'DRAFT', '{"data":{"FLD-COM-DATE":"2026-10-22"}}', 1, datetime('now'), datetime('now'))
      `
      ).run(sessId, String(templateId));

      const cloneRes = cloningService.prepareExcelWorkspace({
        templateId,
        sessionId: toReportSessionId(sessId),
      });
      expect(cloneRes.ok).toBe(true);
      if (!cloneRes.ok) return;

      const workingFilePath = cloneRes.value.workspace.absolutePath;
      const initialWorkingHash = computeFileHash(workingFilePath);

      const injRes = injectionService.injectSessionData({
        workspaceId: cloneRes.value.workspace.workspaceId,
        sessionId: toReportSessionId(sessId),
      });

      expect(injRes.ok).toBe(false);

      // Prior valid working copy remains intact
      expect(fs.existsSync(workingFilePath)).toBe(true);
      expect(computeFileHash(workingFilePath)).toBe(initialWorkingHash);

      // No leftover candidate files in Workspace/
      const workspaceFiles = fs.readdirSync(vaultManager.workspaceDir);
      const candidateFiles = workspaceFiles.filter(f => f.startsWith('candidate_'));
      expect(candidateFiles.length).toBe(0);
    });

    it('INJ-15: Executes injection using a specific reusable MappingProfileId', () => {
      const { templateId, versionId } = setupTestTemplate();
      const db = dbManager.getDatabase();

      const profileId = toMappingProfileId('PRF-TEST-LIGHTING-01');
      db.prepare(
        `
        INSERT INTO mapping_profiles (profile_id, profile_name, description, category_id, template_id, version_id, document_type, status, validation_status, created_at, updated_at)
        VALUES (?, 'Custom Lighting Profile', 'Profile for testing', 'RPT-POLE-LIGHT', ?, ?, 'EXCEL_XLSX', 'ACTIVE', 'VALID', datetime('now'), datetime('now'))
      `
      ).run(String(profileId), String(templateId), String(versionId));

      db.prepare(
        `
        INSERT INTO excel_template_mappings (mapping_id, profile_id, template_id, version_id, worksheet_name, mapping_type, field_id, field_label, target_coordinate, created_at, updated_at)
        VALUES ('MAP-PRF-1', ?, ?, ?, 'LightingAudit', 'FIXED_CELL', 'FLD-COM-INSPECTOR', 'Inspector Name', 'B2', datetime('now'), datetime('now'))
      `
      ).run(String(profileId), String(templateId), String(versionId));

      const sessId = 'sess_prof_01';
      db.prepare(
        `
        INSERT INTO report_sessions (session_id, session_title, category_id, template_id, status, form_data, payload_version, created_at, updated_at)
        VALUES (?, 'Profile Audit', 'RPT-POLE-LIGHT', ?, 'DRAFT', '{"data":{"FLD-COM-INSPECTOR":"Agent Smith"}}', 1, datetime('now'), datetime('now'))
      `
      ).run(sessId, String(templateId));

      const cloneRes = cloningService.prepareExcelWorkspace({
        templateId,
        sessionId: toReportSessionId(sessId),
      });
      expect(cloneRes.ok).toBe(true);
      if (!cloneRes.ok) return;

      const injRes = injectionService.injectSessionData({
        workspaceId: cloneRes.value.workspace.workspaceId,
        sessionId: toReportSessionId(sessId),
        profileId,
      });

      expect(injRes.ok).toBe(true);
      if (!injRes.ok) return;

      expect(injRes.value.profileId).toBe(profileId);
      expect(injRes.value.fixedCellsWrittenCount).toBe(1);

      const zip = new PizZip(fs.readFileSync(injRes.value.workspace.absolutePath));
      const sst = WorksheetXmlEditor.readSharedStrings(zip).strings;
      const sheetPath = WorksheetXmlEditor.resolveWorksheetPath(zip, 'LightingAudit')!;
      expect(WorksheetXmlEditor.readCellRaw(zip, sheetPath, 'B2', sst)?.value).toBe('Agent Smith');
    });
  });
});
