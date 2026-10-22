/**
 * OpsReport Studio — Step 28: Multi-Station Rows, Status Fields, Remarks & Data Validation Tests
 *
 * Verifies:
 * - Deterministic station ordering from report_session_stations snapshots (MSR-ORD-001, MSR-ORD-004)
 * - Fallback to canonical station table ordering when snapshot is absent (MSR-ORD-002)
 * - Duplicate station assignment detection and rejection before workbook mutation (MSR-ORD-003)
 * - Clean zero-station handling without throwing or corrupting workbook (MSR-ROW-001)
 * - Single-station and multi-station repeated row expansion at headerRow + 1..N (MSR-ROW-002, MSR-ROW-003)
 * - Column collision detection (two table fields targeting same column letter) (MSR-ROW-004)
 * - Row capacity conflict detection (static footer labels "TOTAL" or formula cells) (MSR-ROW-005)
 * - Approved status enumeration validation against DIC-OPSREPORT-001 (MSR-STA-001, MSR-STA-002)
 * - Unicode remarks and punctuation preservation (MSR-REM-001)
 * - Formula-injection immunity (text starting with '=', '+', '-', '@' stored strictly as text) (MSR-SEC-001)
 * - Master template immutability invariant (INV-DAT-006: 0-byte variance before and after injection) (MSR-INV-001)
 * - Safe rollback: candidate unlinked and working workbook untouched on validation failure (MSR-ROL-001)
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
import { StationRepository } from '../../src/storage/database/repositories/station-repository.ts';
import { ExcelWorkbookCloningService } from '../../src/storage/generation/excel-workbook-cloning-service.ts';
import { ExcelDataInjectionService } from '../../src/storage/generation/excel-data-injection-service.ts';
import {
  toTemplateId,
  toReportSessionId,
  toStationId,
  toReportCategoryId,
} from '../../src/shared/types/identifiers.ts';
import { ErrorCode } from '../../src/shared/errors/error-codes.ts';

const TEST_CATEGORY_ID = toReportCategoryId('RPT-POLE-LIGHT');

function createMultiStationTemplateZip(options?: {
  includeFooterAtRow?: number;
  footerText?: string;
  includeFormulaAtCell?: string;
}): Buffer {
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
    '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="StationReport" sheetId="1" r:id="rId1"/></sheets></workbook>'
  );
  zip.file(
    'xl/_rels/workbook.xml.rels',
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>'
  );
  zip.file(
    'xl/styles.xml',
    '<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="1" borderId="1" xfId="0" applyFont="1"/></cellXfs></styleSheet>'
  );

  const sharedStringsList = ['Station Name', 'Status', 'Remarks', 'Total'];
  if (options?.footerText && !sharedStringsList.includes(options.footerText)) {
    sharedStringsList.push(options.footerText);
  }

  const sstXml = `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${sharedStringsList.length}" uniqueCount="${sharedStringsList.length}">${sharedStringsList.map(s => `<si><t>${s}</t></si>`).join('')}</sst>`;
  zip.file('xl/sharedStrings.xml', sstXml);

  let extraRows = '';
  if (options?.includeFooterAtRow) {
    const fRow = options.includeFooterAtRow;
    const fText = options.footerText ?? 'Total';
    const sstIdx = sharedStringsList.indexOf(fText);
    extraRows += `<row r="${fRow}"><c r="A${fRow}" t="s"><v>${sstIdx}</v></c></row>`;
  }
  if (options?.includeFormulaAtCell) {
    const cellRef = options.includeFormulaAtCell;
    const rMatch = cellRef.match(/\d+/);
    const rNum = rMatch ? rMatch[0] : '5';
    extraRows += `<row r="${rNum}"><c r="${cellRef}"><f>SUM(B2:B4)</f><v>0</v></c></row>`;
  }

  // Row 1: Header Row
  const sheetXml = `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:D30"/><sheetData><row r="1"><c r="A1" s="1" t="s"><v>0</v></c><c r="B1" s="1" t="s"><v>1</v></c><c r="C1" s="1" t="s"><v>2</v></c></row>${extraRows}</sheetData></worksheet>`;
  zip.file('xl/worksheets/sheet1.xml', sheetXml);

  return zip.generate({ type: 'nodebuffer' });
}

function computeFileHash(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

describe('OpsReport Studio — Step 28: Multi-Station Rows, Status Fields, Remarks & Data Validation', () => {
  let tempRoot: string;
  let vaultManager: VaultManager;
  let dbManager: DatabaseManager;
  let templateRepo: TemplateMetadataRepository;
  let sessionRepo: SessionRepository;
  let workspaceRepo: GenerationWorkspaceRepository;
  let excelMappingRepo: ExcelMappingRepository;
  let profileRepo: MappingProfileRepository;
  let stationRepo: StationRepository;
  let cloningService: ExcelWorkbookCloningService;
  let injectionService: ExcelDataInjectionService;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opsreport-step28-test-'));
    const appDataRoot = path.join(tempRoot, 'AppData');
    fs.mkdirSync(appDataRoot, { recursive: true });

    vaultManager = new VaultManager(appDataRoot);
    vaultManager.initializeVault();
    VaultManager.setInstance(vaultManager);

    const dbPath = path.join(vaultManager.databaseDir, 'test_opsreport_s28.db');
    dbManager = new DatabaseManager({ databasePath: dbPath });
    dbManager.initialize();
    const db = dbManager.getDatabase();

    templateRepo = new TemplateMetadataRepository(db);
    sessionRepo = new SessionRepository(db);
    workspaceRepo = new GenerationWorkspaceRepository(db, vaultManager);
    excelMappingRepo = new ExcelMappingRepository(db);
    profileRepo = new MappingProfileRepository(db);
    stationRepo = new StationRepository(db);

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
      vaultManager,
      stationRepo
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

  function setupTemplateAndStations(options?: {
    includeFooterAtRow?: number;
    footerText?: string;
    includeFormulaAtCell?: string;
  }) {
    const db = dbManager.getDatabase();
    const templateId = toTemplateId('TPL-POLE-LIGHT-STANDARD');
    const activeVerRes = templateRepo.getActiveVersion(templateId);
    expect(activeVerRes.ok).toBe(true);
    if (!activeVerRes.ok || !activeVerRes.value) throw new Error('Active version missing');

    const versionId = activeVerRes.value.version_id;
    const vaultPathRes = vaultManager.resolveTemplateFileVaultPath(activeVerRes.value.file_name);
    expect(vaultPathRes.ok).toBe(true);
    if (!vaultPathRes.ok) throw new Error('Vault path resolution failed');
    const vaultPath = vaultPathRes.value;

    const buf = createMultiStationTemplateZip(options);
    fs.writeFileSync(vaultPath, buf);
    const masterHash = computeFileHash(vaultPath);

    db.prepare('UPDATE template_versions SET sha256_hash = ? WHERE version_id = ?').run(
      masterHash,
      versionId
    );

    // Clear existing mappings
    excelMappingRepo.deleteMappings(templateId, versionId);

    // Standard table mappings on sheet StationReport with headerRowNumber = 1
    // A: FLD-COM-STATION (Station Name)
    // B: FLD-POL-STATUS (Pole Light Status)
    // C: FLD-COM-REMARKS (General Remarks)
    db.prepare(
      `
      INSERT INTO excel_template_mappings (mapping_id, template_id, version_id, worksheet_name, mapping_type, field_id, field_label, target_coordinate, header_row_number, created_at, updated_at)
      VALUES 
      ('m_stn', ?, ?, 'StationReport', 'TABLE_COLUMN', 'FLD-COM-STATION', 'Station Name', 'A', 1, datetime('now'), datetime('now')),
      ('m_sta', ?, ?, 'StationReport', 'TABLE_COLUMN', 'FLD-POL-STATUS', 'Status', 'B', 1, datetime('now'), datetime('now')),
      ('m_rem', ?, ?, 'StationReport', 'TABLE_COLUMN', 'FLD-COM-REMARKS', 'Remarks', 'C', 1, datetime('now'), datetime('now'))
    `
    ).run(
      String(templateId),
      versionId,
      String(templateId),
      versionId,
      String(templateId),
      versionId
    );

    // Create 3 canonical stations
    const stn1Res = stationRepo.createStation({
      stationId: toStationId('STN-ALPHA'),
      stationName: 'Alpha Substation',
      stationCode: 'ALPH',
    });
    const stn2Res = stationRepo.createStation({
      stationId: toStationId('STN-BETA'),
      stationName: 'Beta Yard',
      stationCode: 'BETA',
    });
    const stn3Res = stationRepo.createStation({
      stationId: toStationId('STN-GAMMA'),
      stationName: 'Gamma Perimeter',
      stationCode: 'GAMM',
    });

    expect(stn1Res.ok).toBe(true);
    expect(stn2Res.ok).toBe(true);
    expect(stn3Res.ok).toBe(true);

    const mapStn = (r: { station_id: any; station_name: string; station_code: string | null }) => ({
      stationId: r.station_id,
      stationName: r.station_name,
      stationCode: r.station_code,
    });

    return {
      templateId,
      versionId,
      vaultPath,
      masterHash,
      stn1: stn1Res.ok ? mapStn(stn1Res.value) : null!,
      stn2: stn2Res.ok ? mapStn(stn2Res.value) : null!,
      stn3: stn3Res.ok ? mapStn(stn3Res.value) : null!,
    };
  }

  // ---------------------------------------------------------------------------
  // 1. Station Ordering & Session Snapshot Tests
  // ---------------------------------------------------------------------------
  describe('Station Ordering & Session Snapshots (Objective A)', () => {
    it('MSR-ORD-001: Preserves explicit station snapshot sequence order deterministically in generated rows', () => {
      const { templateId, stn1, stn2, stn3 } = setupTemplateAndStations();
      const sessId = toReportSessionId('sess_ordered_01');

      // Create session with reverse station order: Gamma (1), Alpha (2), Beta (3)
      const sessRes = sessionRepo.createSession({
        sessionId: sessId,
        sessionTitle: 'Ordered Inspection',
        categoryId: TEST_CATEGORY_ID,
        templateId,
        stations: [
          {
            stationId: stn3.stationId,
            sequenceOrder: 1,
            stationNameSnapshot: 'Gamma Perimeter (Snapshot)',
            stationCodeSnapshot: 'GAMM',
          },
          {
            stationId: stn1.stationId,
            sequenceOrder: 2,
            stationNameSnapshot: 'Alpha Substation (Snapshot)',
            stationCodeSnapshot: 'ALPH',
          },
          {
            stationId: stn2.stationId,
            sequenceOrder: 3,
            stationNameSnapshot: 'Beta Yard (Snapshot)',
            stationCodeSnapshot: 'BETA',
          },
        ],
        payload: {
          stations: [
            {
              stationId: stn3.stationId,
              'FLD-POL-STATUS': 'Functional',
              'FLD-COM-REMARKS': 'OK G',
            },
            {
              stationId: stn1.stationId,
              'FLD-POL-STATUS': 'Dark / Bulb Out',
              'FLD-COM-REMARKS': 'OK A',
            },
            {
              stationId: stn2.stationId,
              'FLD-POL-STATUS': 'Flickering',
              'FLD-COM-REMARKS': 'OK B',
            },
          ],
        },
      });
      expect(sessRes.ok).toBe(true);

      const cloneRes = cloningService.prepareExcelWorkspace({ templateId, sessionId: sessId });
      expect(cloneRes.ok).toBe(true);
      if (!cloneRes.ok) return;

      const injRes = injectionService.injectSessionData({
        workspaceId: cloneRes.value.workspace.workspaceId,
        sessionId: sessId,
      });
      expect(injRes.ok).toBe(true);
      if (!injRes.ok) return;

      const result = injRes.value;
      expect(result.stationRowsGeneratedCount).toBe(3);
      expect(result.stationsEvaluatedCount).toBe(3);
      expect(result.tableColumnsWrittenCount).toBe(9); // 3 stations * 3 columns

      // Verify row 2 is Gamma, row 3 is Alpha, row 4 is Beta
      const row2Station = result.executedWrites.find(w => w.targetCoordinate === 'A2');
      const row3Station = result.executedWrites.find(w => w.targetCoordinate === 'A3');
      const row4Station = result.executedWrites.find(w => w.targetCoordinate === 'A4');

      expect(row2Station?.value).toBe('Gamma Perimeter (Snapshot)');
      expect(row3Station?.value).toBe('Alpha Substation (Snapshot)');
      expect(row4Station?.value).toBe('Beta Yard (Snapshot)');

      // Verify status fields follow the respective station
      const row2Status = result.executedWrites.find(w => w.targetCoordinate === 'B2');
      const row3Status = result.executedWrites.find(w => w.targetCoordinate === 'B3');
      const row4Status = result.executedWrites.find(w => w.targetCoordinate === 'B4');

      expect(row2Status?.value).toBe('Functional');
      expect(row3Status?.value).toBe('Dark / Bulb Out');
      expect(row4Status?.value).toBe('Flickering');
    });

    it('MSR-ORD-002: Falls back to canonical station table order when session snapshot is absent', () => {
      const { templateId, stn1, stn2 } = setupTemplateAndStations();
      const sessId = toReportSessionId('sess_fallback_order_01');

      // Create session without stations snapshot, but with payload stations
      const sessRes = sessionRepo.createSession({
        sessionId: sessId,
        sessionTitle: 'Fallback Inspection',
        categoryId: TEST_CATEGORY_ID,
        templateId,
        payload: {
          stations: [
            { stationId: stn2.stationId, 'FLD-POL-STATUS': 'Functional' },
            { stationId: stn1.stationId, 'FLD-POL-STATUS': 'Flickering' },
          ],
        },
      });
      expect(sessRes.ok).toBe(true);

      const cloneRes = cloningService.prepareExcelWorkspace({ templateId, sessionId: sessId });
      expect(cloneRes.ok).toBe(true);
      if (!cloneRes.ok) return;

      const injRes = injectionService.injectSessionData({
        workspaceId: cloneRes.value.workspace.workspaceId,
        sessionId: sessId,
      });

      expect(injRes.ok).toBe(true);
      if (!injRes.ok) return;

      const result = injRes.value;
      expect(result.stationRowsGeneratedCount).toBe(2);

      // In canonical station table, stn1 was created first (order 1), stn2 second (order 2)
      const row2Station = result.executedWrites.find(w => w.targetCoordinate === 'A2');
      const row3Station = result.executedWrites.find(w => w.targetCoordinate === 'A3');

      expect(row2Station?.value).toBe(stn1.stationName);
      expect(row3Station?.value).toBe(stn2.stationName);
    });

    it('MSR-ORD-003: Rejects duplicate station assignments in session payload before workbook mutation', () => {
      const { templateId, stn1 } = setupTemplateAndStations();
      const sessId = toReportSessionId('sess_duplicate_stn');
      const db = dbManager.getDatabase();

      // Directly insert session with duplicate station in payload
      db.prepare(
        `
        INSERT INTO report_sessions (session_id, session_title, category_id, template_id, status, form_data, payload_version, created_at, updated_at)
        VALUES (?, 'Duplicate Station Audit', 'RPT-POLE-LIGHT', ?, 'DRAFT', ?, 1, datetime('now'), datetime('now'))
      `
      ).run(
        String(sessId),
        String(templateId),
        JSON.stringify({
          data: {
            stations: [
              { stationId: stn1.stationId, 'FLD-POL-STATUS': 'Functional' },
              { stationId: stn1.stationId, 'FLD-POL-STATUS': 'Flickering' },
            ],
          },
        })
      );

      const cloneRes = cloningService.prepareExcelWorkspace({ templateId, sessionId: sessId });
      expect(cloneRes.ok).toBe(true);
      if (!cloneRes.ok) return;

      const injRes = injectionService.injectSessionData({
        workspaceId: cloneRes.value.workspace.workspaceId,
        sessionId: sessId,
      });

      expect(injRes.ok).toBe(false);
      if (injRes.ok) return;
      expect(injRes.error.code).toBe(ErrorCode.VALIDATION_FAILED);
      expect(injRes.error.userMessage).toContain('Duplicate station assignment');
    });

    it('MSR-ORD-004: Historical session snapshot order is immune to global station reordering', () => {
      const { templateId, stn1, stn2 } = setupTemplateAndStations();
      const sessId = toReportSessionId('sess_frozen_order');

      // Create session snapshot with stn1 (1) and stn2 (2)
      sessionRepo.createSession({
        sessionId: sessId,
        sessionTitle: 'Frozen Order Session',
        categoryId: TEST_CATEGORY_ID,
        templateId,
        stations: [
          {
            stationId: stn1.stationId,
            sequenceOrder: 1,
            stationNameSnapshot: stn1.stationName,
            stationCodeSnapshot: stn1.stationCode,
          },
          {
            stationId: stn2.stationId,
            sequenceOrder: 2,
            stationNameSnapshot: stn2.stationName,
            stationCodeSnapshot: stn2.stationCode,
          },
        ],
        payload: {
          stations: [
            { stationId: stn1.stationId, 'FLD-POL-STATUS': 'Functional' },
            { stationId: stn2.stationId, 'FLD-POL-STATUS': 'Functional' },
          ],
        },
      });

      // Now reverse canonical station sequence in global stations table
      stationRepo.updateStationOrder([stn2.stationId, stn1.stationId]);

      const cloneRes = cloningService.prepareExcelWorkspace({ templateId, sessionId: sessId });
      expect(cloneRes.ok).toBe(true);
      if (!cloneRes.ok) return;

      const injRes = injectionService.injectSessionData({
        workspaceId: cloneRes.value.workspace.workspaceId,
        sessionId: sessId,
      });

      expect(injRes.ok).toBe(true);
      if (!injRes.ok) return;

      // Session snapshot order (stn1 first, stn2 second) is preserved!
      const row2Station = injRes.value.executedWrites.find(w => w.targetCoordinate === 'A2');
      const row3Station = injRes.value.executedWrites.find(w => w.targetCoordinate === 'A3');

      expect(row2Station?.value).toBe(stn1.stationName);
      expect(row3Station?.value).toBe(stn2.stationName);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Repeating-Row Generation & Capacity Checks (Objective B)
  // ---------------------------------------------------------------------------
  describe('Repeating-Row Generation & Capacity Checks (Objective B)', () => {
    it('MSR-ROW-001: Gracefully handles zero station records by tracking table mappings as deferred', () => {
      const { templateId } = setupTemplateAndStations();
      const sessId = toReportSessionId('sess_zero_stations');

      sessionRepo.createSession({
        sessionId: sessId,
        sessionTitle: 'Zero Station Audit',
        categoryId: TEST_CATEGORY_ID,
        templateId,
        payload: {}, // No stations
      });

      const cloneRes = cloningService.prepareExcelWorkspace({ templateId, sessionId: sessId });
      expect(cloneRes.ok).toBe(true);
      if (!cloneRes.ok) return;

      const injRes = injectionService.injectSessionData({
        workspaceId: cloneRes.value.workspace.workspaceId,
        sessionId: sessId,
      });
      expect(injRes.ok).toBe(true);
      if (!injRes.ok) return;

      expect(injRes.value.stationRowsGeneratedCount).toBe(0);
      expect(injRes.value.tableColumnsDeferredCount).toBe(3); // 3 table columns deferred
      expect(injRes.value.deferredWrites[0].note).toContain('Step 28');
    });

    it('MSR-ROW-002: Single station generates exactly 1 row at headerRow + 1', () => {
      const { templateId, stn1 } = setupTemplateAndStations();
      const sessId = toReportSessionId('sess_single_station');

      sessionRepo.createSession({
        sessionId: sessId,
        sessionTitle: 'Single Station Audit',
        categoryId: TEST_CATEGORY_ID,
        templateId,
        stations: [
          {
            stationId: stn1.stationId,
            sequenceOrder: 1,
            stationNameSnapshot: stn1.stationName,
            stationCodeSnapshot: stn1.stationCode,
          },
        ],
        payload: {
          stations: [
            {
              stationId: stn1.stationId,
              'FLD-POL-STATUS': 'Functional',
              'FLD-COM-REMARKS': 'Single check done',
            },
          ],
        },
      });

      const cloneRes = cloningService.prepareExcelWorkspace({ templateId, sessionId: sessId });
      expect(cloneRes.ok).toBe(true);
      if (!cloneRes.ok) return;

      const injRes = injectionService.injectSessionData({
        workspaceId: cloneRes.value.workspace.workspaceId,
        sessionId: sessId,
      });

      expect(injRes.ok).toBe(true);
      if (!injRes.ok) return;

      expect(injRes.value.stationRowsGeneratedCount).toBe(1);
      expect(injRes.value.tableColumnsWrittenCount).toBe(3);

      // Verify exact cell writes at row 2
      const stnCell = injRes.value.executedWrites.find(w => w.targetCoordinate === 'A2');
      const staCell = injRes.value.executedWrites.find(w => w.targetCoordinate === 'B2');
      const remCell = injRes.value.executedWrites.find(w => w.targetCoordinate === 'C2');

      expect(stnCell?.value).toBe(stn1.stationName);
      expect(staCell?.value).toBe('Functional');
      expect(remCell?.value).toBe('Single check done');
    });

    it('MSR-ROW-003: Multiple stations generate repeated contiguous rows without data cross-contamination', () => {
      const { templateId, stn1, stn2, stn3 } = setupTemplateAndStations();
      const sessId = toReportSessionId('sess_multi_row');

      sessionRepo.createSession({
        sessionId: sessId,
        sessionTitle: 'Multi Row Audit',
        categoryId: TEST_CATEGORY_ID,
        templateId,
        stations: [
          {
            stationId: stn1.stationId,
            sequenceOrder: 1,
            stationNameSnapshot: stn1.stationName,
            stationCodeSnapshot: stn1.stationCode,
          },
          {
            stationId: stn2.stationId,
            sequenceOrder: 2,
            stationNameSnapshot: stn2.stationName,
            stationCodeSnapshot: stn2.stationCode,
          },
          {
            stationId: stn3.stationId,
            sequenceOrder: 3,
            stationNameSnapshot: stn3.stationName,
            stationCodeSnapshot: stn3.stationCode,
          },
        ],
        payload: {
          stations: [
            {
              stationId: stn1.stationId,
              'FLD-POL-STATUS': 'Functional',
              'FLD-COM-REMARKS': 'Row 2 Remarks',
            },
            {
              stationId: stn2.stationId,
              'FLD-POL-STATUS': 'Dark / Bulb Out',
              'FLD-COM-REMARKS': 'Row 3 Remarks',
            },
            {
              stationId: stn3.stationId,
              'FLD-POL-STATUS': 'Dayburning',
              'FLD-COM-REMARKS': 'Row 4 Remarks',
            },
          ],
        },
      });

      const cloneRes = cloningService.prepareExcelWorkspace({ templateId, sessionId: sessId });
      expect(cloneRes.ok).toBe(true);
      if (!cloneRes.ok) return;

      const injRes = injectionService.injectSessionData({
        workspaceId: cloneRes.value.workspace.workspaceId,
        sessionId: sessId,
      });

      expect(injRes.ok).toBe(true);
      if (!injRes.ok) return;

      expect(injRes.value.stationRowsGeneratedCount).toBe(3);
      expect(injRes.value.tableColumnsWrittenCount).toBe(9);

      // Verify each row has isolated data belonging strictly to that station
      const row2 = injRes.value.executedWrites.filter(w => w.targetCoordinate.endsWith('2'));
      const row3 = injRes.value.executedWrites.filter(w => w.targetCoordinate.endsWith('3'));
      const row4 = injRes.value.executedWrites.filter(w => w.targetCoordinate.endsWith('4'));

      expect(row2.find(w => w.targetCoordinate === 'A2')?.value).toBe(stn1.stationName);
      expect(row2.find(w => w.targetCoordinate === 'B2')?.value).toBe('Functional');
      expect(row2.find(w => w.targetCoordinate === 'C2')?.value).toBe('Row 2 Remarks');

      expect(row3.find(w => w.targetCoordinate === 'A3')?.value).toBe(stn2.stationName);
      expect(row3.find(w => w.targetCoordinate === 'B3')?.value).toBe('Dark / Bulb Out');
      expect(row3.find(w => w.targetCoordinate === 'C3')?.value).toBe('Row 3 Remarks');

      expect(row4.find(w => w.targetCoordinate === 'A4')?.value).toBe(stn3.stationName);
      expect(row4.find(w => w.targetCoordinate === 'B4')?.value).toBe('Dayburning');
      expect(row4.find(w => w.targetCoordinate === 'C4')?.value).toBe('Row 4 Remarks');
    });

    it('MSR-ROW-004: Detects conflicting column mapping (two fields assigned to same column) before write', () => {
      const { templateId, stn1, versionId } = setupTemplateAndStations();
      const db = dbManager.getDatabase();

      // Add conflicting mapping: both FLD-COM-STATION and FLD-POL-STATUS assigned to column A
      db.prepare(
        `
        UPDATE excel_template_mappings SET target_coordinate = 'A' WHERE field_id = 'FLD-POL-STATUS' AND template_id = ? AND version_id = ?
      `
      ).run(String(templateId), versionId);

      const sessId = toReportSessionId('sess_col_conflict');
      sessionRepo.createSession({
        sessionId: sessId,
        sessionTitle: 'Conflict Test',
        categoryId: TEST_CATEGORY_ID,
        templateId,
        stations: [
          {
            stationId: stn1.stationId,
            sequenceOrder: 1,
            stationNameSnapshot: stn1.stationName,
            stationCodeSnapshot: stn1.stationCode,
          },
        ],
        payload: {
          stations: [{ stationId: stn1.stationId, 'FLD-POL-STATUS': 'Functional' }],
        },
      });

      const cloneRes = cloningService.prepareExcelWorkspace({ templateId, sessionId: sessId });
      expect(cloneRes.ok).toBe(true);
      if (!cloneRes.ok) return;

      const injRes = injectionService.injectSessionData({
        workspaceId: cloneRes.value.workspace.workspaceId,
        sessionId: sessId,
      });

      expect(injRes.ok).toBe(false);
      if (injRes.ok) return;
      expect(injRes.error.code).toBe(ErrorCode.MAPPING_INCOMPATIBLE);
      expect(injRes.error.userMessage).toContain('Conflict detected: Destination column "A"');
    });

    it('MSR-ROW-005: Rejects expansion before mutation if target rows collide with template static summary/footer label', () => {
      // Template has static footer label 'Total' at row 3
      const { templateId, stn1, stn2, stn3 } = setupTemplateAndStations({
        includeFooterAtRow: 3,
        footerText: 'Total',
      });

      const sessId = toReportSessionId('sess_footer_conflict');
      sessionRepo.createSession({
        sessionId: sessId,
        sessionTitle: 'Footer Conflict Session',
        categoryId: TEST_CATEGORY_ID,
        templateId,
        stations: [
          {
            stationId: stn1.stationId,
            sequenceOrder: 1,
            stationNameSnapshot: stn1.stationName,
            stationCodeSnapshot: stn1.stationCode,
          },
          {
            stationId: stn2.stationId,
            sequenceOrder: 2,
            stationNameSnapshot: stn2.stationName,
            stationCodeSnapshot: stn2.stationCode,
          },
          {
            stationId: stn3.stationId,
            sequenceOrder: 3,
            stationNameSnapshot: stn3.stationName,
            stationCodeSnapshot: stn3.stationCode,
          },
        ],
        payload: {
          stations: [
            { stationId: stn1.stationId, 'FLD-POL-STATUS': 'Functional' },
            { stationId: stn2.stationId, 'FLD-POL-STATUS': 'Functional' },
            { stationId: stn3.stationId, 'FLD-POL-STATUS': 'Functional' },
          ],
        },
      });

      const cloneRes = cloningService.prepareExcelWorkspace({ templateId, sessionId: sessId });
      expect(cloneRes.ok).toBe(true);
      if (!cloneRes.ok) return;

      const injRes = injectionService.injectSessionData({
        workspaceId: cloneRes.value.workspace.workspaceId,
        sessionId: sessId,
      });

      expect(injRes.ok).toBe(false);
      if (injRes.ok) return;
      expect(injRes.error.code).toBe(ErrorCode.VALIDATION_FAILED);
      expect(injRes.error.userMessage).toContain('static template summary/footer');
    });

    it('MSR-ROW-006: Rejects expansion before mutation if target rows collide with template formula cell', () => {
      // Template has formula cell at B3: <f>SUM(B2:B4)</f>
      const { templateId, stn1, stn2 } = setupTemplateAndStations({
        includeFormulaAtCell: 'B3',
      });

      const sessId = toReportSessionId('sess_formula_conflict');
      sessionRepo.createSession({
        sessionId: sessId,
        sessionTitle: 'Formula Conflict Session',
        categoryId: TEST_CATEGORY_ID,
        templateId,
        stations: [
          {
            stationId: stn1.stationId,
            sequenceOrder: 1,
            stationNameSnapshot: stn1.stationName,
            stationCodeSnapshot: stn1.stationCode,
          },
          {
            stationId: stn2.stationId,
            sequenceOrder: 2,
            stationNameSnapshot: stn2.stationName,
            stationCodeSnapshot: stn2.stationCode,
          },
        ],
        payload: {
          stations: [
            { stationId: stn1.stationId, 'FLD-POL-STATUS': 'Functional' },
            { stationId: stn2.stationId, 'FLD-POL-STATUS': 'Functional' },
          ],
        },
      });

      const cloneRes = cloningService.prepareExcelWorkspace({ templateId, sessionId: sessId });
      expect(cloneRes.ok).toBe(true);
      if (!cloneRes.ok) return;

      const injRes = injectionService.injectSessionData({
        workspaceId: cloneRes.value.workspace.workspaceId,
        sessionId: sessId,
      });

      expect(injRes.ok).toBe(false);
      if (injRes.ok) return;
      expect(injRes.error.code).toBe(ErrorCode.VALIDATION_FAILED);
      expect(injRes.error.userMessage).toContain('contains formula cell');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Status Fields & Remarks Validation (Objectives C & D)
  // ---------------------------------------------------------------------------
  describe('Status Fields & Remarks Validation (Objectives C & D)', () => {
    it('MSR-STA-001: Accepts and canonicalizes approved status enums from DIC-OPSREPORT-001', () => {
      const { templateId, stn1, stn2, stn3 } = setupTemplateAndStations();
      const sessId = toReportSessionId('sess_approved_status');

      sessionRepo.createSession({
        sessionId: sessId,
        sessionTitle: 'Status Validation Audit',
        categoryId: TEST_CATEGORY_ID,
        templateId,
        stations: [
          {
            stationId: stn1.stationId,
            sequenceOrder: 1,
            stationNameSnapshot: stn1.stationName,
            stationCodeSnapshot: stn1.stationCode,
          },
          {
            stationId: stn2.stationId,
            sequenceOrder: 2,
            stationNameSnapshot: stn2.stationName,
            stationCodeSnapshot: stn2.stationCode,
          },
          {
            stationId: stn3.stationId,
            sequenceOrder: 3,
            stationNameSnapshot: stn3.stationName,
            stationCodeSnapshot: stn3.stationCode,
          },
        ],
        payload: {
          stations: [
            // Case-insensitive matching to canonical dictionary value
            { stationId: stn1.stationId, 'FLD-POL-STATUS': 'functional' },
            { stationId: stn2.stationId, 'FLD-POL-STATUS': 'dark / bulb out' },
            { stationId: stn3.stationId, 'FLD-POL-STATUS': 'Physical Damage' },
          ],
        },
      });

      const cloneRes = cloningService.prepareExcelWorkspace({ templateId, sessionId: sessId });
      expect(cloneRes.ok).toBe(true);
      if (!cloneRes.ok) return;

      const injRes = injectionService.injectSessionData({
        workspaceId: cloneRes.value.workspace.workspaceId,
        sessionId: sessId,
      });

      expect(injRes.ok).toBe(true);
      if (!injRes.ok) return;

      const b2 = injRes.value.executedWrites.find(w => w.targetCoordinate === 'B2');
      const b3 = injRes.value.executedWrites.find(w => w.targetCoordinate === 'B3');
      const b4 = injRes.value.executedWrites.find(w => w.targetCoordinate === 'B4');

      expect(b2?.value).toBe('Functional');
      expect(b3?.value).toBe('Dark / Bulb Out');
      expect(b4?.value).toBe('Physical Damage');
    });

    it('MSR-STA-002: Rejects invalid, invented, or unapproved status values before write', () => {
      const { templateId, stn1 } = setupTemplateAndStations();
      const sessId = toReportSessionId('sess_bad_status');

      sessionRepo.createSession({
        sessionId: sessId,
        sessionTitle: 'Bad Status Session',
        categoryId: TEST_CATEGORY_ID,
        templateId,
        stations: [
          {
            stationId: stn1.stationId,
            sequenceOrder: 1,
            stationNameSnapshot: stn1.stationName,
            stationCodeSnapshot: stn1.stationCode,
          },
        ],
        payload: {
          stations: [
            // "Broken" is NOT an approved choice in DIC-OPSREPORT-001 for FLD-POL-STATUS
            { stationId: stn1.stationId, 'FLD-POL-STATUS': 'Broken' },
          ],
        },
      });

      const cloneRes = cloningService.prepareExcelWorkspace({ templateId, sessionId: sessId });
      expect(cloneRes.ok).toBe(true);
      if (!cloneRes.ok) return;

      const injRes = injectionService.injectSessionData({
        workspaceId: cloneRes.value.workspace.workspaceId,
        sessionId: sessId,
      });

      expect(injRes.ok).toBe(false);
      if (injRes.ok) return;
      expect(injRes.error.code).toBe(ErrorCode.VALIDATION_FAILED);
      expect(injRes.error.userMessage).toContain('Invalid status value "Broken"');
      expect(injRes.error.userMessage).toContain('Allowed values: Functional, Dark / Bulb Out');
    });

    it('MSR-REM-001: Preserves Unicode text, quotes, and multiline remarks without truncation', () => {
      const { templateId, stn1 } = setupTemplateAndStations();
      const sessId = toReportSessionId('sess_unicode_remarks');
      const complexRemark =
        'Substation A-1: Überprüfung abgeschlossen ✓\nLine 2: "Normal operation" (50Hz / 230V) — 日本語テスト';

      sessionRepo.createSession({
        sessionId: sessId,
        sessionTitle: 'Unicode Remark Test',
        categoryId: TEST_CATEGORY_ID,
        templateId,
        stations: [
          {
            stationId: stn1.stationId,
            sequenceOrder: 1,
            stationNameSnapshot: stn1.stationName,
            stationCodeSnapshot: stn1.stationCode,
          },
        ],
        payload: {
          stations: [
            {
              stationId: stn1.stationId,
              'FLD-POL-STATUS': 'Functional',
              'FLD-COM-REMARKS': complexRemark,
            },
          ],
        },
      });

      const cloneRes = cloningService.prepareExcelWorkspace({ templateId, sessionId: sessId });
      expect(cloneRes.ok).toBe(true);
      if (!cloneRes.ok) return;

      const injRes = injectionService.injectSessionData({
        workspaceId: cloneRes.value.workspace.workspaceId,
        sessionId: sessId,
      });

      expect(injRes.ok).toBe(true);
      if (!injRes.ok) return;

      const remCell = injRes.value.executedWrites.find(w => w.targetCoordinate === 'C2');
      expect(remCell?.value).toBe(complexRemark);

      // Re-read physical output zip to verify sharedStrings contains the exact Unicode string
      const workingPath = cloneRes.value.workspace.absolutePath;
      const readBuf = fs.readFileSync(workingPath);
      const readZip = new PizZip(readBuf);
      const sstXml = readZip.file('xl/sharedStrings.xml')?.asText() ?? '';
      expect(sstXml).toContain('Überprüfung abgeschlossen ✓');
      expect(sstXml).toContain('日本語テスト');
    });

    it('MSR-SEC-001: Enforces formula-injection immunity for station names and remarks starting with formula triggers', () => {
      const { templateId, stn1 } = setupTemplateAndStations();
      const sessId = toReportSessionId('sess_formula_injection');
      const dangerousPayload = '=SUM(A1:A100)';

      sessionRepo.createSession({
        sessionId: sessId,
        sessionTitle: 'Security Test',
        categoryId: TEST_CATEGORY_ID,
        templateId,
        stations: [
          {
            stationId: stn1.stationId,
            sequenceOrder: 1,
            stationNameSnapshot: stn1.stationName,
            stationCodeSnapshot: stn1.stationCode,
          },
        ],
        payload: {
          stations: [
            {
              stationId: stn1.stationId,
              'FLD-POL-STATUS': 'Functional',
              'FLD-COM-REMARKS': dangerousPayload,
            },
          ],
        },
      });

      const cloneRes = cloningService.prepareExcelWorkspace({ templateId, sessionId: sessId });
      expect(cloneRes.ok).toBe(true);
      if (!cloneRes.ok) return;

      const injRes = injectionService.injectSessionData({
        workspaceId: cloneRes.value.workspace.workspaceId,
        sessionId: sessId,
      });

      expect(injRes.ok).toBe(true);
      if (!injRes.ok) return;

      // Inspect physical worksheet XML: C2 must be cell type "s" pointing to shared string, NOT a formula <f>
      const workingPath = cloneRes.value.workspace.absolutePath;
      const readBuf = fs.readFileSync(workingPath);
      const readZip = new PizZip(readBuf);
      const sheetXml = readZip.file('xl/worksheets/sheet1.xml')?.asText() ?? '';

      // Must NOT contain <c r="C2"><f>=SUM
      expect(sheetXml).not.toMatch(/<c\s+[^>]*r="C2"[^>]*><f>/);
      // Must contain <c r="C2" t="s">
      expect(sheetXml).toMatch(/<c\s+[^>]*r="C2"[^>]*t="s"/);

      // Shared strings must contain the verbatim text
      const sstXml = readZip.file('xl/sharedStrings.xml')?.asText() ?? '';
      expect(sstXml).toContain(dangerousPayload);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Master Immutability Invariant & Rollback Safety (Objective F)
  // ---------------------------------------------------------------------------
  describe('Master Immutability & Rollback Safety (Objective F)', () => {
    it('MSR-INV-001: Master template in Vault exhibits strict 0-byte variance before and after multi-station injection', () => {
      const { templateId, vaultPath, masterHash, stn1, stn2 } = setupTemplateAndStations();
      const sessId = toReportSessionId('sess_master_immutability');

      sessionRepo.createSession({
        sessionId: sessId,
        sessionTitle: 'Immutability Audit',
        categoryId: TEST_CATEGORY_ID,
        templateId,
        stations: [
          {
            stationId: stn1.stationId,
            sequenceOrder: 1,
            stationNameSnapshot: stn1.stationName,
            stationCodeSnapshot: stn1.stationCode,
          },
          {
            stationId: stn2.stationId,
            sequenceOrder: 2,
            stationNameSnapshot: stn2.stationName,
            stationCodeSnapshot: stn2.stationCode,
          },
        ],
        payload: {
          stations: [
            { stationId: stn1.stationId, 'FLD-POL-STATUS': 'Functional' },
            { stationId: stn2.stationId, 'FLD-POL-STATUS': 'Dark / Bulb Out' },
          ],
        },
      });

      const cloneRes = cloningService.prepareExcelWorkspace({ templateId, sessionId: sessId });
      expect(cloneRes.ok).toBe(true);
      if (!cloneRes.ok) return;

      const injRes = injectionService.injectSessionData({
        workspaceId: cloneRes.value.workspace.workspaceId,
        sessionId: sessId,
      });

      expect(injRes.ok).toBe(true);
      if (!injRes.ok) return;

      // Verify post-operation master hash in Vault
      const postMasterHash = computeFileHash(vaultPath);
      expect(postMasterHash).toBe(masterHash);
      expect(injRes.value.masterUntouched).toBe(true);
    });

    it('MSR-ROL-001: Cleans up candidate staging file and leaves working workbook untouched on validation failure', () => {
      const { templateId, stn1 } = setupTemplateAndStations();
      const sessId = toReportSessionId('sess_rollback_test');

      sessionRepo.createSession({
        sessionId: sessId,
        sessionTitle: 'Rollback Test',
        categoryId: TEST_CATEGORY_ID,
        templateId,
        stations: [
          {
            stationId: stn1.stationId,
            sequenceOrder: 1,
            stationNameSnapshot: stn1.stationName,
            stationCodeSnapshot: stn1.stationCode,
          },
        ],
        payload: {
          stations: [
            // Invalid status causes validation failure during planning
            { stationId: stn1.stationId, 'FLD-POL-STATUS': 'InvalidStatusChoice' },
          ],
        },
      });

      const cloneRes = cloningService.prepareExcelWorkspace({ templateId, sessionId: sessId });
      expect(cloneRes.ok).toBe(true);
      if (!cloneRes.ok) return;

      const workingPath = cloneRes.value.workspace.absolutePath;
      const initialWorkingHash = computeFileHash(workingPath);

      const injRes = injectionService.injectSessionData({
        workspaceId: cloneRes.value.workspace.workspaceId,
        sessionId: sessId,
      });

      expect(injRes.ok).toBe(false);

      // Working file must remain 100% untouched
      const currentWorkingHash = computeFileHash(workingPath);
      expect(currentWorkingHash).toBe(initialWorkingHash);

      // Verify no candidate_*.xlsx file is left lingering in workspace directory
      const workspaceDir = path.dirname(workingPath);
      const files = fs.readdirSync(workspaceDir);
      const candidateFiles = files.filter(f => f.startsWith('candidate_'));
      expect(candidateFiles.length).toBe(0);
    });
  });
});
