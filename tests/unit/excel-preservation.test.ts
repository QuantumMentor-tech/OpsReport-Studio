/**
 * OpsReport Studio — Step 29: Formatting, Formulas, Merged Cells, Images & Print Layout Preservation Tests
 *
 * Verifies:
 * - Objective A: Structure & metadata preservation across working candidate workbooks
 * - Objective B: Formatting preservation on mapped cells and unchanged template cells
 * - Objective C: Unmapped formula preservation with exact expression and value retention
 * - Objective D: Merged-cell range preservation and rejection of non-anchor writes / colliding row expansions
 * - Objective E: Embedded images and drawing parts 0-loss preservation (exact SHA-256 match)
 * - Objective F: Print layout, page setup, margins, headers/footers, and print area preservation
 * - Objective G: Structural snapshot capture, diff classification, and integrity reporting
 * - Objective H: Master template 0-byte variance invariant and safe candidate cleanup on failure
 *
 * @module tests/unit/excel-preservation.test
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
import { WorkbookPreservationVerifier } from '../../src/storage/generation/workbook-preservation-verifier.ts';
import { WorksheetXmlEditor } from '../../src/storage/generation/worksheet-xml-editor.ts';
import {
  TemplateId,
  toTemplateId,
  toReportSessionId,
  toStationId,
  toReportCategoryId,
} from '../../src/shared/types/identifiers.ts';
import { ErrorCode } from '../../src/shared/errors/error-codes.ts';

const TEST_CATEGORY_ID = toReportCategoryId('RPT-POLE-LIGHT');

// 1x1 transparent PNG buffer for image preservation tests
const SAMPLE_PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

function createRichPreservationTemplateZip(options?: {
  includeImage?: boolean;
  includeMergedCells?: boolean;
  includeFormula?: boolean;
  includePageSetup?: boolean;
  includePrintArea?: boolean;
}): Buffer {
  const zip = new PizZip();

  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>'
  );

  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'
  );

  let definedNamesXml = '';
  if (options?.includePrintArea !== false) {
    definedNamesXml = `<definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">&apos;InspectionReport&apos;!$A$1:$H$50</definedName><definedName name="_xlnm.Print_Titles" localSheetId="0">&apos;InspectionReport&apos;!$1:$2</definedName></definedNames>`;
  }

  zip.file(
    'xl/workbook.xml',
    `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="InspectionReport" sheetId="1" r:id="rId1"/></sheets>${definedNamesXml}</workbook>`
  );

  zip.file(
    'xl/_rels/workbook.xml.rels',
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>'
  );

  zip.file(
    'xl/styles.xml',
    '<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="1" borderId="1" xfId="0" applyFont="1"/><xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>'
  );

  const sharedStringsList = [
    'Title Banner',
    'Inspector Name',
    'Inspection Date',
    'Remarks',
    'Summary Total',
  ];
  const sstXml = `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${sharedStringsList.length}" uniqueCount="${sharedStringsList.length}">${sharedStringsList.map(s => `<si><t>${s}</t></si>`).join('')}</sst>`;
  zip.file('xl/sharedStrings.xml', sstXml);

  // Drawing and Media Files
  if (options?.includeImage !== false) {
    zip.file('xl/media/logo.png', SAMPLE_PNG_BYTES);
    zip.file(
      'xl/drawings/drawing1.xml',
      '<?xml version="1.0" encoding="UTF-8"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><xdr:twoCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>2</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>1</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:pic><xdr:blipFill><a:blip r:embed="rId1"/></xdr:blipFill></xdr:pic><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>'
    );
    zip.file(
      'xl/worksheets/_rels/sheet1.xml.rels',
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>'
    );
  }

  // Worksheet construction
  let mergeCellsXml = '';
  if (options?.includeMergedCells !== false) {
    // A1:C1 title banner merge, and E10:F12 multi-row sign-off merge
    mergeCellsXml =
      '<mergeCells count="2"><mergeCell ref="A1:C1"/><mergeCell ref="E10:F12"/></mergeCells>';
  }

  let formulasXml = '';
  if (options?.includeFormula !== false) {
    // Formula in C25 outside write targets
    formulasXml = '<row r="25"><c r="C25"><f>SUM(C5:C20)</f><v>150</v></c></row>';
  }

  let pageSetupXml = '';
  if (options?.includePageSetup !== false) {
    pageSetupXml =
      '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="landscape" scale="100"/><printOptions gridLines="1" horizontalCentered="1"/><headerFooter><oddHeader>&amp;CStation Inspection</oddHeader><oddFooter>&amp;P of &amp;N</oddFooter></headerFooter>';
  }

  const drawingElem = options?.includeImage !== false ? '<drawing r:id="rId1"/>' : '';

  const sheetXml = `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><dimension ref="A1:H50"/><sheetData><row r="1" ht="28" customHeight="1"><c r="A1" s="3" t="s"><v>0</v></c></row><row r="2"><c r="A2" s="1" t="s"><v>1</v></c><c r="B2" s="0"/><c r="C2" s="1" t="s"><v>2</v></c><c r="D2" s="2"/></row><row r="4"><c r="A4" s="1" t="s"><v>0</v></c><c r="B4" s="1" t="s"><v>1</v></c><c r="C4" s="1" t="s"><v>2</v></c></row>${formulasXml}</sheetData>${mergeCellsXml}${pageSetupXml}${drawingElem}</worksheet>`;

  zip.file('xl/worksheets/sheet1.xml', sheetXml);

  return zip.generate({ type: 'nodebuffer' });
}

describe('OpsReport Studio — Step 29: Formatting, Formulas, Merged Cells, Images & Print Layout Preservation', () => {
  let tmpDir: string;
  let dbManager: DatabaseManager;
  let vaultManager: VaultManager;
  let templateRepo: TemplateMetadataRepository;
  let sessionRepo: SessionRepository;
  let workspaceRepo: GenerationWorkspaceRepository;
  let stationRepo: StationRepository;
  let cloningService: ExcelWorkbookCloningService;
  let injectionService: ExcelDataInjectionService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opsreport-preservation-'));
    const appDataRoot = path.join(tmpDir, 'AppData');
    fs.mkdirSync(appDataRoot, { recursive: true });

    vaultManager = new VaultManager(appDataRoot);
    vaultManager.initializeVault();
    VaultManager.setInstance(vaultManager);

    const dbPath = path.join(vaultManager.databaseDir, 'test_opsreport_s29.db');
    dbManager = new DatabaseManager({ databasePath: dbPath });
    dbManager.initialize();
    const db = dbManager.getDatabase();

    templateRepo = new TemplateMetadataRepository(db);
    sessionRepo = new SessionRepository(db);
    workspaceRepo = new GenerationWorkspaceRepository(db, vaultManager);
    const mappingRepo = new ExcelMappingRepository(db);
    stationRepo = new StationRepository(db);
    const profileRepo = new MappingProfileRepository(db);

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
      mappingRepo,
      profileRepo,
      vaultManager,
      stationRepo
    );

    // Populate stations
    stationRepo.createStation({
      stationId: toStationId('STN-001'),
      stationName: 'North Gate Substation',
      isActive: true,
    });
    stationRepo.createStation({
      stationId: toStationId('STN-002'),
      stationName: 'South Terminal Yard',
      isActive: true,
    });
  });

  afterEach(() => {
    VaultManager.setInstance(null);
    if (dbManager?.isOpen()) {
      dbManager.close();
    }
    if (fs.existsSync(tmpDir)) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // safe ignore
      }
    }
  });

  // Helper to import a master template
  function importRichMasterTemplate(options?: {
    includeImage?: boolean;
    includeMergedCells?: boolean;
    includeFormula?: boolean;
    includePageSetup?: boolean;
    includePrintArea?: boolean;
  }): { templateId: TemplateId; versionId: string; masterPath: string; masterHash: string } {
    const templateId = toTemplateId(
      `TPL-PRESERVE-${Date.now()}-${Math.floor(Math.random() * 1000)}`
    );
    const fileName = `rich_template_${Date.now()}_${Math.floor(Math.random() * 1000)}.xlsx`;
    const masterPath = path.join(vaultManager.templatesDir, fileName);

    const buf = createRichPreservationTemplateZip(options);
    fs.writeFileSync(masterPath, buf);
    const masterHash = crypto.createHash('sha256').update(buf).digest('hex');

    const createTplRes = templateRepo.createTemplate({
      templateId,
      templateName: `Preservation Standard Template ${Date.now()} ${Math.random()}`,
      categoryId: TEST_CATEGORY_ID,
      documentType: 'EXCEL_XLSX',
      description: 'Master template for preservation verification',
    });
    if (!createTplRes.ok) throw new Error(createTplRes.error.userMessage);

    const addVerRes = templateRepo.registerNewVersion({
      templateId,
      fileName,
      fileSizeBytes: buf.length,
      sha256Hash: masterHash,
      changeSummary: 'Initial preservation master template',
      setActive: true,
    });
    if (!addVerRes.ok) throw new Error(addVerRes.error.userMessage);

    const versionId = addVerRes.value.version_id;

    return { templateId, versionId, masterPath, masterHash };
  }

  // Helper to add mapping directly to database
  function addMapping(
    templateId: TemplateId,
    versionId: string,
    fieldId: string,
    fieldLabel: string,
    mappingType: 'FIXED_CELL' | 'TABLE_COLUMN',
    targetCoordinate: string,
    headerRowNumber?: number
  ) {
    const db = dbManager.getDatabase();
    db.prepare(
      `INSERT INTO excel_template_mappings (
        mapping_id, template_id, version_id, worksheet_name, mapping_type, field_id, field_label, target_coordinate, header_row_number, created_at, updated_at
      ) VALUES (?, ?, ?, 'InspectionReport', ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    ).run(
      `map_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      String(templateId),
      versionId,
      mappingType,
      fieldId,
      fieldLabel,
      targetCoordinate,
      headerRowNumber ?? null
    );
  }

  // ---------------------------------------------------------------------------
  // Objective A: Structural Snapshot & Extraction Verification
  // ---------------------------------------------------------------------------
  describe('Structural Snapshot & Extraction (Objective A & G)', () => {
    it('PRS-SNP-001: Captures full structural snapshot containing sheets, merged ranges, formulas, drawings, and print configuration', () => {
      const { masterPath } = importRichMasterTemplate();
      const zip = new PizZip(fs.readFileSync(masterPath));

      const snapshot = WorkbookPreservationVerifier.captureSnapshot(zip);

      expect(snapshot.sheetNames).toEqual(['InspectionReport']);
      expect(snapshot.sheets.length).toBe(1);

      const sheet = snapshot.sheets[0];
      expect(sheet.sheetName).toBe('InspectionReport');
      expect(sheet.state).toBe('visible');
      expect(sheet.mergedCells.length).toBe(2);
      expect(sheet.mergedCells[0].ref).toBe('A1:C1');
      expect(sheet.mergedCells[0].anchorCell).toBe('A1');
      expect(sheet.mergedCells[0].coveredCells).toEqual(['B1', 'C1']);

      // Formula cells
      expect(sheet.formulaCells.length).toBe(1);
      expect(sheet.formulaCells[0].cellRef).toBe('C25');
      expect(sheet.formulaCells[0].formula).toBe('SUM(C5:C20)');

      // Page Setup
      expect(sheet.pageSetup).toBeDefined();
      expect(sheet.pageSetup?.paperSize).toBe('9');
      expect(sheet.pageSetup?.orientation).toBe('landscape');
      expect(sheet.pageSetup?.margins?.left).toBe('0.7');
      expect(sheet.pageSetup?.headerFooter?.oddHeader).toBe('&CStation Inspection');

      // Drawing media
      expect(snapshot.drawingMedia.drawingPartCount).toBe(1);
      expect(snapshot.drawingMedia.mediaFiles.length).toBe(1);
      expect(snapshot.drawingMedia.mediaFiles[0].name).toBe('xl/media/logo.png');
      expect(snapshot.drawingMedia.mediaFiles[0].sizeBytes).toBe(SAMPLE_PNG_BYTES.length);

      // Print areas and titles
      expect(snapshot.printAreas.get('InspectionReport')).toBe("'InspectionReport'!$A$1:$H$50");
      expect(snapshot.printTitles.get('InspectionReport')).toBe("'InspectionReport'!$1:$2");
    });
  });

  // ---------------------------------------------------------------------------
  // Objective B: Formatting & Cell Style Preservation
  // ---------------------------------------------------------------------------
  describe('Cell Style & Formatting Preservation (Objective B)', () => {
    it('PRS-FMT-001: Injects scalar data into mapped cell while preserving existing cell style index', () => {
      const { templateId, versionId } = importRichMasterTemplate();
      const sessionId = toReportSessionId('SES-PRS-001');

      sessionRepo.createSession({
        sessionId,
        sessionTitle: 'Formatting Session',
        categoryId: TEST_CATEGORY_ID,
        templateId,
        payload: {
          'FLD-COM-INSPECTOR': 'Eng. Marcus Vance',
        },
      });

      addMapping(templateId, versionId, 'FLD-COM-INSPECTOR', 'Inspector Name', 'FIXED_CELL', 'B2');

      const cloneRes = cloningService.prepareExcelWorkspace({ templateId, sessionId });
      expect(cloneRes.ok).toBe(true);
      if (!cloneRes.ok) return;
      const workspace = cloneRes.value.workspace;

      const injRes = injectionService.injectSessionData({
        workspaceId: workspace.workspaceId,
        sessionId,
      });

      expect(injRes.ok).toBe(true);
      if (!injRes.ok) return;

      const report = injRes.value.structuralIntegrityReport;
      expect(report).toBeDefined();
      expect(report!.isPreserved).toBe(true);

      // Re-read working file to verify cell value AND cell style
      const verifyZip = new PizZip(fs.readFileSync(workspace.absolutePath));
      const readCell = WorksheetXmlEditor.readCellRaw(
        verifyZip,
        'xl/worksheets/sheet1.xml',
        'B2',
        WorksheetXmlEditor.readSharedStrings(verifyZip).strings
      );

      expect(readCell).toBeDefined();
      expect(readCell!.value).toBe('Eng. Marcus Vance');
      // Style index s="0" was on B2 in template, must be preserved
      expect(readCell!.styleIndex).toBe('0');
    });

    it('PRS-FMT-002: Preserves distinct formatting across different columns in repeated rows', () => {
      const { templateId, versionId } = importRichMasterTemplate();
      const sessionId = toReportSessionId('SES-PRS-002');

      sessionRepo.createSession({
        sessionId,
        sessionTitle: 'Multi-Col Style Session',
        categoryId: TEST_CATEGORY_ID,
        templateId,
        stations: [
          {
            stationId: toStationId('STN-001'),
            stationNameSnapshot: 'North Gate Substation',
            sequenceOrder: 1,
          },
        ],
        payload: {
          stations: [
            {
              stationId: toStationId('STN-001'),
              'FLD-COM-STATION': 'North Gate Substation',
              'FLD-COM-REMARKS': 'Operational status confirmed',
            },
          ],
        },
      });

      // Map Col A to station name, Col C to remarks (header row 4 -> data row 5)
      addMapping(templateId, versionId, 'FLD-COM-STATION', 'Station Name', 'TABLE_COLUMN', 'A', 4);
      addMapping(
        templateId,
        versionId,
        'FLD-COM-REMARKS',
        'Station Remarks',
        'TABLE_COLUMN',
        'C',
        4
      );

      const cloneRes = cloningService.prepareExcelWorkspace({ templateId, sessionId });
      expect(cloneRes.ok).toBe(true);
      if (!cloneRes.ok) return;
      const workspace = cloneRes.value.workspace;

      const injRes = injectionService.injectSessionData({
        workspaceId: workspace.workspaceId,
        sessionId,
      });

      expect(injRes.ok).toBe(true);
      if (!injRes.ok) return;

      const verifyZip = new PizZip(fs.readFileSync(workspace.absolutePath));
      const sst = WorksheetXmlEditor.readSharedStrings(verifyZip).strings;

      // Col A on row 5 inherits style from template row 4 col A (s="1")
      const cellA5 = WorksheetXmlEditor.readCellRaw(
        verifyZip,
        'xl/worksheets/sheet1.xml',
        'A5',
        sst
      );
      expect(cellA5?.value).toBe('North Gate Substation');
      expect(cellA5?.styleIndex).toBe('1');

      // Col C on row 5 inherits style from template row 4 col C (s="1")
      const cellC5 = WorksheetXmlEditor.readCellRaw(
        verifyZip,
        'xl/worksheets/sheet1.xml',
        'C5',
        sst
      );
      expect(cellC5?.value).toBe('Operational status confirmed');
      expect(cellC5?.styleIndex).toBe('1');
    });
  });

  // ---------------------------------------------------------------------------
  // Objective C: Formula Preservation & Formula Integrity
  // ---------------------------------------------------------------------------
  describe('Formula Preservation & Integrity (Objective C)', () => {
    it('PRS-FOR-001: Preserves unmapped template formulas (<f> and <v>) outside planned write targets', () => {
      const { templateId, versionId } = importRichMasterTemplate({ includeFormula: true });
      const sessionId = toReportSessionId('SES-PRS-003');

      sessionRepo.createSession({
        sessionId,
        sessionTitle: 'Formula Preservation Session',
        categoryId: TEST_CATEGORY_ID,
        templateId,
        payload: {
          'FLD-COM-INSPECTOR': 'Dr. Jane Watson',
        },
      });

      addMapping(templateId, versionId, 'FLD-COM-INSPECTOR', 'Inspector Name', 'FIXED_CELL', 'B2');

      const cloneRes = cloningService.prepareExcelWorkspace({ templateId, sessionId });
      expect(cloneRes.ok).toBe(true);
      if (!cloneRes.ok) return;
      const workspace = cloneRes.value.workspace;

      const injRes = injectionService.injectSessionData({
        workspaceId: workspace.workspaceId,
        sessionId,
      });

      expect(injRes.ok).toBe(true);
      if (!injRes.ok) return;

      expect(injRes.value.structuralIntegrityReport?.totalFormulasPreserved).toBe(1);

      // Verify serialized candidate XML has retained <f>SUM(C5:C20)</f>
      const verifyZip = new PizZip(fs.readFileSync(workspace.absolutePath));
      const formulas = WorksheetXmlEditor.extractFormulaCells(
        verifyZip,
        'xl/worksheets/sheet1.xml'
      );
      expect(formulas.length).toBe(1);
      expect(formulas[0].cellRef).toBe('C25');
      expect(formulas[0].formula).toBe('SUM(C5:C20)');
    });

    it('PRS-FOR-002: Replaces formula when cell is an approved write target and logs INFO finding', () => {
      const { templateId, versionId } = importRichMasterTemplate({ includeFormula: true });
      const sessionId = toReportSessionId('SES-PRS-004');

      // Target C25 directly (which in template had SUM(C5:C20))
      sessionRepo.createSession({
        sessionId,
        sessionTitle: 'Formula Overwrite Session',
        categoryId: TEST_CATEGORY_ID,
        templateId,
        payload: {
          'FLD-COM-INSPECTOR': 'Manual Override 999',
        },
      });

      addMapping(templateId, versionId, 'FLD-COM-INSPECTOR', 'Inspector Name', 'FIXED_CELL', 'C25');

      const cloneRes = cloningService.prepareExcelWorkspace({ templateId, sessionId });
      expect(cloneRes.ok).toBe(true);
      if (!cloneRes.ok) return;
      const workspace = cloneRes.value.workspace;

      const injRes = injectionService.injectSessionData({
        workspaceId: workspace.workspaceId,
        sessionId,
      });

      expect(injRes.ok).toBe(true);
      if (!injRes.ok) return;

      const report = injRes.value.structuralIntegrityReport!;
      const infoFinding = report.findings.find(f => f.code === 'FORMULA_INTENTIONALLY_OVERWRITTEN');
      expect(infoFinding).toBeDefined();
      expect(infoFinding?.target).toBe('C25');
    });

    it('PRS-FOR-003: Rejects candidate promotion if an unmapped formula is dropped', () => {
      const baseZip = new PizZip(createRichPreservationTemplateZip({ includeFormula: true }));
      const baseSnapshot = WorkbookPreservationVerifier.captureSnapshot(baseZip);

      // Create corrupted candidate where formula cell C25 is missing
      const candZip = new PizZip(createRichPreservationTemplateZip({ includeFormula: false }));
      const candSnapshot = WorkbookPreservationVerifier.captureSnapshot(candZip);

      const report = WorkbookPreservationVerifier.verifyPreservation(
        baseSnapshot,
        candSnapshot,
        []
      );
      expect(report.isPreserved).toBe(false);
      const droppedFinding = report.findings.find(f => f.code === 'UNMAPPED_FORMULA_DROPPED');
      expect(droppedFinding).toBeDefined();
      expect(droppedFinding?.severity).toBe('BLOCKING');
      expect(droppedFinding?.target).toBe('C25');
    });
  });

  // ---------------------------------------------------------------------------
  // Objective D: Merged-Cell Safety & Intersection Checks
  // ---------------------------------------------------------------------------
  describe('Merged-Cell Safety (Objective D)', () => {
    it('PRS-MRG-001: Allows writing to the top-left anchor cell of a merged range (A1 in A1:C1)', () => {
      const { templateId, versionId } = importRichMasterTemplate({ includeMergedCells: true });
      const sessionId = toReportSessionId('SES-PRS-005');

      sessionRepo.createSession({
        sessionId,
        sessionTitle: 'Merged Anchor Session',
        categoryId: TEST_CATEGORY_ID,
        templateId,
        payload: {
          'FLD-COM-BADGE': 'ANNUAL-INSPECT-01',
        },
      });

      addMapping(templateId, versionId, 'FLD-COM-BADGE', 'Report ID', 'FIXED_CELL', 'A1'); // Anchor cell of A1:C1

      const cloneRes = cloningService.prepareExcelWorkspace({ templateId, sessionId });
      expect(cloneRes.ok).toBe(true);
      if (!cloneRes.ok) return;
      const workspace = cloneRes.value.workspace;

      const injRes = injectionService.injectSessionData({
        workspaceId: workspace.workspaceId,
        sessionId,
      });

      expect(injRes.ok).toBe(true);
      if (!injRes.ok) return;

      expect(injRes.value.structuralIntegrityReport?.totalMergedCellsPreserved).toBe(2);

      // Verify merged range still exists in serialized candidate
      const verifyZip = new PizZip(fs.readFileSync(workspace.absolutePath));
      const ranges = WorksheetXmlEditor.extractMergedCellRanges(
        verifyZip,
        'xl/worksheets/sheet1.xml'
      );
      expect(ranges.some(r => r.ref === 'A1:C1')).toBe(true);
    });

    it('PRS-MRG-002: Rejects write targeting a non-anchor covered cell inside a merged range (B1 in A1:C1)', () => {
      const { templateId, versionId } = importRichMasterTemplate({ includeMergedCells: true });
      const sessionId = toReportSessionId('SES-PRS-006');

      sessionRepo.createSession({
        sessionId,
        sessionTitle: 'Merged Covered Cell Session',
        categoryId: TEST_CATEGORY_ID,
        templateId,
        payload: {
          'FLD-COM-BADGE': 'SHOULD FAIL',
        },
      });

      // Target B1 which is covered by A1:C1
      addMapping(templateId, versionId, 'FLD-COM-BADGE', 'Report ID', 'FIXED_CELL', 'B1');

      const cloneRes = cloningService.prepareExcelWorkspace({ templateId, sessionId });
      expect(cloneRes.ok).toBe(true);
      if (!cloneRes.ok) return;
      const workspace = cloneRes.value.workspace;

      const injRes = injectionService.injectSessionData({
        workspaceId: workspace.workspaceId,
        sessionId,
      });

      expect(injRes.ok).toBe(false);
      if (injRes.ok) return;

      expect(injRes.error.code).toBe(ErrorCode.VALIDATION_FAILED);
      expect(injRes.error.userMessage).toContain('covered cell inside merged range "A1:C1"');
      expect(injRes.error.userMessage).toContain(
        'Writes must target the top-left anchor cell "A1"'
      );
    });

    it('PRS-MRG-003: Rejects conflicting writes where two fields target the same merged range', () => {
      const { templateId, versionId } = importRichMasterTemplate({ includeMergedCells: true });
      const sessionId = toReportSessionId('SES-PRS-007');

      sessionRepo.createSession({
        sessionId,
        sessionTitle: 'Merged Conflict Session',
        categoryId: TEST_CATEGORY_ID,
        templateId,
        payload: {
          'FLD-COM-INSPECTOR': 'Title A',
          'FLD-COM-BADGE': 'Title B',
        },
      });

      addMapping(templateId, versionId, 'FLD-COM-INSPECTOR', 'Inspector Name', 'FIXED_CELL', 'A1');
      addMapping(templateId, versionId, 'FLD-COM-BADGE', 'Badge ID', 'FIXED_CELL', 'A1'); // Duplicate target on anchor

      const cloneRes = cloningService.prepareExcelWorkspace({ templateId, sessionId });
      expect(cloneRes.ok).toBe(true);
      if (!cloneRes.ok) return;
      const workspace = cloneRes.value.workspace;

      const injRes = injectionService.injectSessionData({
        workspaceId: workspace.workspaceId,
        sessionId,
      });

      expect(injRes.ok).toBe(false);
      if (injRes.ok) return;

      expect(injRes.error.code).toBe(ErrorCode.VALIDATION_FAILED);
    });

    it('PRS-MRG-004: Rejects station row expansion if target rows intersect a multi-row merged range', () => {
      const { templateId, versionId } = importRichMasterTemplate({ includeMergedCells: true }); // Contains E10:F12 merge
      const sessionId = toReportSessionId('SES-PRS-008');

      // Populate stations in stationRepo so foreign keys pass
      for (let i = 3; i <= 8; i++) {
        stationRepo.createStation({
          stationId: toStationId(`STN-00${i}`),
          stationName: `Station ${i}`,
          isActive: true,
        });
      }

      // 8 stations: rows 5, 6, 7, 8, 9, 10, 11, 12!
      // This will collide with E10:F12 on Col E!
      const stations = [];
      const stnPayload: Record<string, unknown>[] = [];
      for (let i = 1; i <= 8; i++) {
        const sId = toStationId(`STN-00${i}`);
        stations.push({
          stationId: sId,
          stationNameSnapshot: `Station ${i}`,
          sequenceOrder: i,
        });
        stnPayload.push({
          stationId: sId,
          'FLD-COM-STATION': `Station ${i}`,
        });
      }

      sessionRepo.createSession({
        sessionId,
        sessionTitle: 'Merged Row Collision Session',
        categoryId: TEST_CATEGORY_ID,
        templateId,
        stations,
        payload: {
          stations: stnPayload,
        },
      });

      addMapping(templateId, versionId, 'FLD-COM-STATION', 'Station Name', 'TABLE_COLUMN', 'E', 4);

      const cloneRes = cloningService.prepareExcelWorkspace({ templateId, sessionId });
      expect(cloneRes.ok).toBe(true);
      if (!cloneRes.ok) return;
      const workspace = cloneRes.value.workspace;

      const injRes = injectionService.injectSessionData({
        workspaceId: workspace.workspaceId,
        sessionId,
      });

      expect(injRes.ok).toBe(false);
      if (injRes.ok) return;

      expect(injRes.error.code).toBe(ErrorCode.VALIDATION_FAILED);
      expect(injRes.error.userMessage).toContain(
        'intersects multi-row merged cell range "E10:F12"'
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Objective E: Image & Drawing Media Preservation
  // ---------------------------------------------------------------------------
  describe('Image & Drawing Media 0-Loss Preservation (Objective E)', () => {
    it('PRS-IMG-001: Preserves embedded images in xl/media/ with identical SHA-256 hash and drawing parts', () => {
      const { templateId, versionId } = importRichMasterTemplate({ includeImage: true });
      const sessionId = toReportSessionId('SES-PRS-009');

      sessionRepo.createSession({
        sessionId,
        sessionTitle: 'Image Preservation Session',
        categoryId: TEST_CATEGORY_ID,
        templateId,
        payload: {
          'FLD-COM-INSPECTOR': 'Inspector Gadget',
        },
      });

      addMapping(templateId, versionId, 'FLD-COM-INSPECTOR', 'Inspector Name', 'FIXED_CELL', 'B2');

      const cloneRes = cloningService.prepareExcelWorkspace({ templateId, sessionId });
      expect(cloneRes.ok).toBe(true);
      if (!cloneRes.ok) return;
      const workspace = cloneRes.value.workspace;

      const injRes = injectionService.injectSessionData({
        workspaceId: workspace.workspaceId,
        sessionId,
      });

      expect(injRes.ok).toBe(true);
      if (!injRes.ok) return;

      const report = injRes.value.structuralIntegrityReport!;
      expect(report.imagesPreservedCount).toBe(1);

      // Verify candidate zip contains exact image file and hash
      const verifyZip = new PizZip(fs.readFileSync(workspace.absolutePath));
      const imageFile = verifyZip.file('xl/media/logo.png');
      expect(imageFile).toBeDefined();

      const imageBytes = imageFile!.asUint8Array();
      const imageHash = crypto.createHash('sha256').update(imageBytes).digest('hex');
      const expectedHash = crypto.createHash('sha256').update(SAMPLE_PNG_BYTES).digest('hex');
      expect(imageHash).toBe(expectedHash);
    });

    it('PRS-IMG-002: Rejects candidate promotion if an embedded media file is missing or corrupted', () => {
      const baseZip = new PizZip(createRichPreservationTemplateZip({ includeImage: true }));
      const baseSnapshot = WorkbookPreservationVerifier.captureSnapshot(baseZip);

      // Candidate missing image
      const candZip = new PizZip(createRichPreservationTemplateZip({ includeImage: false }));
      const candSnapshot = WorkbookPreservationVerifier.captureSnapshot(candZip);

      const report = WorkbookPreservationVerifier.verifyPreservation(
        baseSnapshot,
        candSnapshot,
        []
      );
      expect(report.isPreserved).toBe(false);
      const imgFinding = report.findings.find(f => f.code === 'EMBEDDED_IMAGE_MISSING');
      expect(imgFinding).toBeDefined();
      expect(imgFinding?.severity).toBe('BLOCKING');
    });
  });

  // ---------------------------------------------------------------------------
  // Objective F: Print Layout & Pagination Preservation
  // ---------------------------------------------------------------------------
  describe('Print Layout & Pagination Preservation (Objective F)', () => {
    it('PRS-PRN-001: Preserves page setup, margins, headers/footers, and print areas after data injection', () => {
      const { templateId, versionId } = importRichMasterTemplate({
        includePageSetup: true,
        includePrintArea: true,
      });
      const sessionId = toReportSessionId('SES-PRS-010');

      sessionRepo.createSession({
        sessionId,
        sessionTitle: 'Print Layout Session',
        categoryId: TEST_CATEGORY_ID,
        templateId,
        payload: {
          'FLD-COM-INSPECTOR': 'Print Specialist',
        },
      });

      addMapping(templateId, versionId, 'FLD-COM-INSPECTOR', 'Inspector Name', 'FIXED_CELL', 'B2');

      const cloneRes = cloningService.prepareExcelWorkspace({ templateId, sessionId });
      expect(cloneRes.ok).toBe(true);
      if (!cloneRes.ok) return;
      const workspace = cloneRes.value.workspace;

      const injRes = injectionService.injectSessionData({
        workspaceId: workspace.workspaceId,
        sessionId,
      });

      expect(injRes.ok).toBe(true);
      if (!injRes.ok) return;

      expect(injRes.value.structuralIntegrityReport?.pageSetupsPreservedCount).toBe(1);

      // Verify page setup in serialized candidate
      const verifyZip = new PizZip(fs.readFileSync(workspace.absolutePath));
      const pageSetup = WorksheetXmlEditor.extractPageSetup(
        verifyZip,
        'xl/worksheets/sheet1.xml',
        'InspectionReport'
      );

      expect(pageSetup).toBeDefined();
      expect(pageSetup?.paperSize).toBe('9');
      expect(pageSetup?.orientation).toBe('landscape');
      expect(pageSetup?.margins?.left).toBe('0.7');
      expect(pageSetup?.printOptions?.gridLines).toBe(true);
      expect(pageSetup?.headerFooter?.oddHeader).toBe('&CStation Inspection');

      // Verify print areas
      const { printAreas, printTitles } = WorksheetXmlEditor.extractPrintAreasAndTitles(verifyZip, [
        'InspectionReport',
      ]);
      expect(printAreas.get('InspectionReport')).toBe("'InspectionReport'!$A$1:$H$50");
      expect(printTitles.get('InspectionReport')).toBe("'InspectionReport'!$1:$2");
    });
  });

  // ---------------------------------------------------------------------------
  // Objective H: Master Immutability & Rollback Safety
  // ---------------------------------------------------------------------------
  describe('Master Immutability & Rollback Safety (Objective H)', () => {
    it('PRS-INV-001: Master template in Vault exhibits strict 0-byte variance before and after data injection', () => {
      const { templateId, versionId, masterPath, masterHash } = importRichMasterTemplate();
      const sessionId = toReportSessionId('SES-PRS-011');

      sessionRepo.createSession({
        sessionId,
        sessionTitle: 'Immutability Check Session',
        categoryId: TEST_CATEGORY_ID,
        templateId,
        payload: {
          'FLD-COM-INSPECTOR': 'Audit Officer',
        },
      });

      addMapping(templateId, versionId, 'FLD-COM-INSPECTOR', 'Inspector Name', 'FIXED_CELL', 'B2');

      const cloneRes = cloningService.prepareExcelWorkspace({ templateId, sessionId });
      expect(cloneRes.ok).toBe(true);
      if (!cloneRes.ok) return;
      const workspace = cloneRes.value.workspace;

      const injRes = injectionService.injectSessionData({
        workspaceId: workspace.workspaceId,
        sessionId,
      });

      expect(injRes.ok).toBe(true);
      if (!injRes.ok) return;

      expect(injRes.value.masterUntouched).toBe(true);

      // Verify vault master file has 0-byte variance
      const postMasterBuf = fs.readFileSync(masterPath);
      const postMasterHash = crypto.createHash('sha256').update(postMasterBuf).digest('hex');
      expect(postMasterHash).toBe(masterHash);
    });

    it('PRS-ROL-001: Preserves prior valid working copy and cleans up candidate file on structural rejection', () => {
      const { templateId, versionId } = importRichMasterTemplate({ includeMergedCells: true });
      const sessionId = toReportSessionId('SES-PRS-012');

      sessionRepo.createSession({
        sessionId,
        sessionTitle: 'Rollback Session',
        categoryId: TEST_CATEGORY_ID,
        templateId,
        payload: {
          'FLD-COM-BADGE': 'FAIL-VAL',
        },
      });

      // Attempt injection with invalid covered-cell target (B1 in A1:C1)
      addMapping(templateId, versionId, 'FLD-COM-BADGE', 'Report ID', 'FIXED_CELL', 'B1');

      const cloneRes = cloningService.prepareExcelWorkspace({ templateId, sessionId });
      expect(cloneRes.ok).toBe(true);
      if (!cloneRes.ok) return;
      const workspace = cloneRes.value.workspace;

      // Capture initial working file bytes
      const initialWorkingBytes = fs.readFileSync(workspace.absolutePath);

      const injRes = injectionService.injectSessionData({
        workspaceId: workspace.workspaceId,
        sessionId,
      });

      expect(injRes.ok).toBe(false);

      // Working file must remain 100% byte-for-byte identical to before injection
      const postFailureBytes = fs.readFileSync(workspace.absolutePath);
      expect(postFailureBytes.equals(initialWorkingBytes)).toBe(true);

      // No leftover candidate files in workspace directory
      const workspaceFiles = fs.readdirSync(vaultManager.workspaceDir);
      const candidateFiles = workspaceFiles.filter(f => f.startsWith('candidate_'));
      expect(candidateFiles.length).toBe(0);
    });
  });
});
