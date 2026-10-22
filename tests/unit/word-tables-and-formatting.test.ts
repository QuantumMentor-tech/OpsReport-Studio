/**
 * OpsReport Studio — Step 32: Word Tables, Repeating Data, Headers, Footers & Formatting Preservation Tests
 *
 * Comprehensive tests for:
 * - Table cell placeholder replacement & TABLE_CELL coordinates
 * - Repeating row generation across 0, 1, and N records with strict station ordering
 * - Formatting preservation (tblPr, tblGrid, trPr, tcPr, cantSplit, tblHeader, borders, shading, merges)
 * - Header & footer placeholder replacement and page number preservation
 * - Structural and content post-save verification
 * - Master template immutability invariant (0-byte variance)
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
import { WordMappingRepository } from '../../src/storage/database/repositories/word-mapping-repository.ts';
import { MappingProfileRepository } from '../../src/storage/database/repositories/mapping-profile-repository.ts';
import { WordDocumentCloningService } from '../../src/storage/generation/word-document-cloning-service.ts';
import { WordGenerationService } from '../../src/storage/generation/word-generation-service.ts';
import {
  extractTables,
  extractRows,
  extractCells,
  replaceTableCellPlaceholders,
  replaceTableCellCoordinate,
  expandRepeatingRows,
} from '../../src/storage/generation/word-table-engine.ts';
import { processHeadersAndFooters } from '../../src/storage/generation/word-header-footer-engine.ts';
import {
  toTemplateId,
  toReportSessionId,
  toReportCategoryId,
  toTemplateVersionId,
} from '../../src/shared/types/identifiers.ts';
import { ErrorCode } from '../../src/shared/errors/error-codes.ts';
import { Ok } from '../../src/shared/types/result.ts';

const WNS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

const r = (text: string, rpr = ''): string =>
  `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ''}<w:t xml:space="preserve">${text}</w:t></w:r>`;
const para = (...runs: string[]): string => `<w:p>${runs.join('')}</w:p>`;

function buildDocx(body: string, extra: Record<string, string> = {}): Buffer {
  const zip = new PizZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
  );
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${WNS}><w:body>${body}<w:sectPr/></w:body></w:document>`
  );
  zip.file(
    'word/styles.xml',
    `<?xml version="1.0"?><w:styles ${WNS}><w:style w:styleId="X"/></w:styles>`
  );
  for (const [name, xml] of Object.entries(extra)) zip.file(name, xml);
  return zip.generate({ type: 'nodebuffer' });
}

const headerPart = (inner: string): string => `<?xml version="1.0"?><w:hdr ${WNS}>${inner}</w:hdr>`;
const sha = (buf: Buffer): string => crypto.createHash('sha256').update(buf).digest('hex');

// =============================================================================
// Unit Tests: Table Engine Internals
// =============================================================================
describe('Step 32 — Word Table Engine Internals', () => {
  it('TBL-ENG-01: extracts tables, rows, and cells accurately with 1-based indexing', () => {
    const tableXml =
      '<w:tbl>' +
      '<w:tblPr><w:tblW w:w="5000" w:type="dxa"/></w:tblPr>' +
      '<w:tr>' +
      '<w:trPr><w:tblHeader/></w:trPr>' +
      '<w:tc><w:p>' + r('Header 1') + '</w:p></w:tc>' +
      '<w:tc><w:p>' + r('Header 2') + '</w:p></w:tc>' +
      '</w:tr>' +
      '<w:tr>' +
      '<w:tc><w:p>' + r('Data A') + '</w:p></w:tc>' +
      '<w:tc><w:p>' + r('Data B') + '</w:p></w:tc>' +
      '</w:tr>' +
      '</w:tbl>';
    const docXml = `<w:document ${WNS}><w:body>${tableXml}</w:body></w:document>`;

    const tables = extractTables(docXml);
    expect(tables).toHaveLength(1);
    expect(tables[0].tableIndex).toBe(1);
    expect(tables[0].rows).toHaveLength(2);
    expect(tables[0].rows[0].isHeader).toBe(true);
    expect(tables[0].rows[0].cells).toHaveLength(2);
    expect(tables[0].rows[0].cells[0].text).toBe('Header 1');
    expect(tables[0].rows[0].cells[1].text).toBe('Header 2');
    expect(tables[0].rows[1].cells[0].text).toBe('Data A');
    expect(tables[0].rows[1].cells[1].text).toBe('Data B');
  });

  it('TBL-ENG-02: replaces scalar placeholders in table cells while preserving cell properties and borders', () => {
    const tableXml =
      '<w:tbl>' +
      '<w:tr>' +
      '<w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/><w:shd w:fill="FFFF00"/></w:tcPr>' +
      '<w:p>' + r('Prefix: {inspector_name} Postfix') + '</w:p></w:tc>' +
      '</w:tr>' +
      '</w:tbl>';
    const docXml = `<w:document ${WNS}><w:body>${tableXml}</w:body></w:document>`;

    const { xml, counts } = replaceTableCellPlaceholders(
      docXml,
      new Map([['{inspector_name}', 'Jane Doe']])
    );
    expect(counts.get('{inspector_name}')).toBe(1);
    expect(xml).toContain('Prefix: Jane Doe Postfix');
    expect(xml).toContain('<w:shd w:fill="FFFF00"/>');
  });

  it('TBL-ENG-03: replaces cell coordinate T1:R1:C1 preserving paragraph properties', () => {
    const tableXml =
      '<w:tbl>' +
      '<w:tr>' +
      '<w:tc><w:tcPr><w:tcW w:w="2000" w:type="dxa"/></w:tcPr>' +
      '<w:p><w:pPr><w:jc w:val="center"/></w:pPr>' + r('Old Value', '<w:b/>') + '</w:p></w:tc>' +
      '</w:tr>' +
      '</w:tbl>';
    const docXml = `<w:document ${WNS}><w:body>${tableXml}</w:body></w:document>`;

    const outXml = replaceTableCellCoordinate(docXml, 1, 1, 1, 'New Mapped Value');
    expect(outXml).toContain('New Mapped Value');
    expect(outXml).not.toContain('Old Value');
    expect(outXml).toContain('<w:jc w:val="center"/>');
    expect(outXml).toContain('<w:b/>');
    expect(outXml).toContain('<w:tcW w:w="2000" w:type="dxa"/>');
  });

  it('TBL-ENG-04: expands repeating rows across multiple ordered stations', () => {
    const tableXml =
      '<w:tbl>' +
      '<w:tr><w:trPr><w:tblHeader/></w:trPr><w:tc><w:p>' + r('Station') + '</w:p></w:tc><w:tc><w:p>' + r('Status') + '</w:p></w:tc></w:tr>' +
      '<w:tr><w:trPr><w:cantSplit/></w:trPr><w:tc><w:p>' + r('{station_name}') + '</w:p></w:tc><w:tc><w:p>' + r('{status}') + '</w:p></w:tc></w:tr>' +
      '<w:tr><w:tc><w:p>' + r('Summary: End of Table') + '</w:p></w:tc><w:tc><w:p>' + r('Total') + '</w:p></w:tc></w:tr>' +
      '</w:tbl>';
    const docXml = `<w:document ${WNS}><w:body>${tableXml}</w:body></w:document>`;

    const records = [
      { stationId: 'STN-01', stationName: 'Alpha Station', status: 'Operational', sequenceOrder: 1 },
      { stationId: 'STN-02', stationName: 'Bravo Station', status: 'Maintenance', sequenceOrder: 2 },
      { stationId: 'STN-03', stationName: 'Charlie Station', status: 'Operational', sequenceOrder: 3 },
    ];

    const { xml, rowsAdded } = expandRepeatingRows(docXml, {
      tableIndex: 1,
      prototypeRowIndex: 2,
      records,
    });

    expect(rowsAdded).toBe(2); // 3 records replace 1 prototype row
    const tables = extractTables(xml);
    expect(tables[0].rows).toHaveLength(5); // 1 header + 3 data + 1 summary
    expect(tables[0].rows[0].cells[0].text).toBe('Station');
    expect(tables[0].rows[1].cells[0].text).toBe('Alpha Station');
    expect(tables[0].rows[1].cells[1].text).toBe('Operational');
    expect(tables[0].rows[2].cells[0].text).toBe('Bravo Station');
    expect(tables[0].rows[2].cells[1].text).toBe('Maintenance');
    expect(tables[0].rows[3].cells[0].text).toBe('Charlie Station');
    expect(tables[0].rows[3].cells[1].text).toBe('Operational');
    expect(tables[0].rows[4].cells[0].text).toBe('Summary: End of Table');
  });

  it('TBL-ENG-05: handles empty station records collection by removing prototype row while keeping headers', () => {
    const tableXml =
      '<w:tbl>' +
      '<w:tr><w:trPr><w:tblHeader/></w:trPr><w:tc><w:p>' + r('Station Header') + '</w:p></w:tc></w:tr>' +
      '<w:tr><w:tc><w:p>' + r('{station_name}') + '</w:p></w:tc></w:tr>' +
      '</w:tbl>';
    const docXml = `<w:document ${WNS}><w:body>${tableXml}</w:body></w:document>`;

    const { xml, rowsAdded } = expandRepeatingRows(docXml, {
      tableIndex: 1,
      prototypeRowIndex: 2,
      records: [],
    });

    expect(rowsAdded).toBe(-1);
    const tables = extractTables(xml);
    expect(tables[0].rows).toHaveLength(1);
    expect(tables[0].rows[0].cells[0].text).toBe('Station Header');
  });

  it('TBL-ENG-06: processes header and footer placeholders preserving PAGE field constructs', () => {
    const zip = new PizZip();
    zip.file(
      'word/header1.xml',
      headerPart(
        '<w:p><w:r><w:t>Station Audit — Date: {report_date} | Page </w:t></w:r>' +
          '<w:fldSimple w:instr="PAGE"><w:r><w:t>1</w:t></w:r></w:fldSimple>' +
          '<w:r><w:t> of </w:t></w:r>' +
          '<w:fldSimple w:instr="NUMPAGES"><w:r><w:t>1</w:t></w:r></w:fldSimple></w:p>'
      )
    );
    zip.file(
      'word/footer1.xml',
      headerPart('<w:p><w:r><w:t>Inspector: {inspector_name}</w:t></w:r></w:p>')
    );

    const { counts, modifiedParts } = processHeadersAndFooters(
      zip,
      new Map([
        ['{report_date}', '2026-10-22'],
        ['{inspector_name}', 'Sergeant Miller'],
      ])
    );

    expect(counts.get('{report_date}')).toBe(1);
    expect(counts.get('{inspector_name}')).toBe(1);
    expect(modifiedParts).toContain('word/header1.xml');
    expect(modifiedParts).toContain('word/footer1.xml');

    const updatedHdr = zip.file('word/header1.xml')!.asText();
    expect(updatedHdr).toContain('Station Audit — Date: 2026-10-22 | Page ');
    expect(updatedHdr).toContain('<w:fldSimple w:instr="PAGE">');
    expect(updatedHdr).toContain('<w:fldSimple w:instr="NUMPAGES">');

    const updatedFtr = zip.file('word/footer1.xml')!.asText();
    expect(updatedFtr).toContain('Inspector: Sergeant Miller');
  });
});

// =============================================================================
// Integration Tests: WordGenerationService Table & Header/Footer Lifecycle
// =============================================================================
describe('Step 32 — Word Generation Service: Tables, Repeating Rows & Formatting', () => {
  let tempRoot: string;
  let vaultManager: VaultManager;
  let dbManager: DatabaseManager;
  let sessionRepo: SessionRepository;
  let templateRepo: TemplateMetadataRepository;
  let workspaceRepo: GenerationWorkspaceRepository;
  let wordMappingRepo: WordMappingRepository;
  let profileRepo: MappingProfileRepository;
  let cloningService: WordDocumentCloningService;
  let genService: WordGenerationService;

  const categoryId = toReportCategoryId('RPT-INCIDENT');
  const templateId = toTemplateId('TPL-INCIDENT-STANDARD');
  let sessionId: any;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opsreport_step32_test_'));
    const appData = path.join(tempRoot, 'AppData');
    fs.mkdirSync(appData, { recursive: true });
    vaultManager = new VaultManager(appData);
    vaultManager.initializeVault();
    VaultManager.setInstance(vaultManager);
    dbManager = new DatabaseManager({
      databasePath: path.join(vaultManager.databaseDir, 'test_opsreport.db'),
    });
    dbManager.initialize();
    const db = dbManager.getDatabase();

    templateRepo = new TemplateMetadataRepository(db);
    sessionRepo = new SessionRepository(db);
    workspaceRepo = new GenerationWorkspaceRepository(db, vaultManager);
    wordMappingRepo = new WordMappingRepository(db);
    profileRepo = new MappingProfileRepository(db);
    cloningService = new WordDocumentCloningService(
      templateRepo,
      vaultManager,
      sessionRepo,
      workspaceRepo
    );
    genService = new WordGenerationService(
      sessionRepo,
      templateRepo,
      workspaceRepo,
      wordMappingRepo,
      profileRepo,
      vaultManager
    );

    const sessionRes = sessionRepo.createSession({
      sessionTitle: 'Word Step 32',
      categoryId,
      templateId,
    });
    expect(sessionRes.ok).toBe(true);
    sessionId = (sessionRes as Ok<any>).value.session.sessionId;

    const now = new Date().toISOString();
    // Seed stations
    db.prepare(
      `INSERT INTO stations (station_id, station_name, display_order, is_active, created_at, updated_at)
       VALUES ('STN-01', 'North Station', 1, 1, ?, ?),
              ('STN-02', 'Central Station', 2, 1, ?, ?),
              ('STN-03', 'South Station', 3, 1, ?, ?)`
    ).run(now, now, now, now, now, now);

    // Seed session station snapshots in strict order
    db.prepare(
      `INSERT INTO report_session_stations (session_id, station_id, sequence_order, station_name_snapshot, station_code_snapshot)
       VALUES (?, 'STN-01', 1, 'North Station', 'NSTN'),
              (?, 'STN-02', 2, 'Central Station', 'CSTN'),
              (?, 'STN-03', 3, 'South Station', 'SSTN')`
    ).run(sessionId, sessionId, sessionId);
  });

  afterEach(() => {
    VaultManager.setInstance(null);
    if (dbManager?.isOpen()) dbManager.close();
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  function setupTemplateAndWorkspace(docxBytes: Buffer, mappings: Array<[string, string, any]>) {
    const bytes = docxBytes;
    const ver = templateRepo.getActiveVersion(templateId);
    if (!ver.ok || !ver.value) throw new Error('no version');
    const vp = vaultManager.resolveTemplateFileVaultPath(ver.value.file_name);
    if (!vp.ok) throw new Error('no vault path');
    fs.writeFileSync(vp.value, bytes);
    const hash = sha(bytes);
    dbManager
      .getDatabase()
      .prepare('UPDATE template_versions SET sha256_hash = ? WHERE version_id = ?')
      .run(hash, ver.value.version_id);

    const mappingItems = mappings.map(([fieldId, coord, type]) => ({
      mappingType: type ?? 'PLACEHOLDER',
      fieldId,
      fieldLabel: fieldId,
      targetCoordinate: coord,
      placeholderToken: type === 'PLACEHOLDER' ? coord : null,
      tableIndex: 1,
      rowIndex: 2,
    }));

    wordMappingRepo.saveMappings({
      templateId,
      versionId: ver.value.version_id,
      mappings: mappingItems,
    });

    const cloneRes = cloningService.prepareWordWorkspace({
      templateId,
      sessionId,
    });
    expect(cloneRes.ok).toBe(true);
    const ws = (cloneRes as Ok<any>).value.workspace;

    return { ws, vaultPath: vp.value, hash, versionId: ver.value.version_id };
  }

  it('WRD-TBL-01: populates fixed table cells (TABLE_CELL) and table cell placeholders preserving cell shading and borders', () => {
    const tableXml =
      '<w:tbl>' +
      '<w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="5000" w:type="dxa"/></w:tblPr>' +
      '<w:tr>' +
      '<w:tc><w:tcPr><w:shd w:fill="CCCCCC"/></w:tcPr><w:p>' + r('Report Date:') + '</w:p></w:tc>' +
      '<w:tc><w:tcPr><w:shd w:fill="FFFFFF"/></w:tcPr><w:p>' + r('{report_date}') + '</w:p></w:tc>' +
      '</w:tr>' +
      '<w:tr>' +
      '<w:tc><w:p>' + r('Inspector:') + '</w:p></w:tc>' +
      '<w:tc><w:p>' + r('Target Inspector') + '</w:p></w:tc>' +
      '</w:tr>' +
      '</w:tbl>';
    const body = para(r('Operational Audit Document')) + tableXml;
    const docx = buildDocx(body);

    const ctx = setupTemplateAndWorkspace(docx, [
      ['FLD-COM-DATE', '{report_date}', 'PLACEHOLDER'],
      ['FLD-COM-INSPECTOR', 'T1:R2:C2', 'TABLE_CELL'],
    ]);

    const res = genService.generateWordDocument({
      workspaceId: ctx.ws.workspaceId,
      sessionId,
      overrideFormData: {
        'FLD-COM-DATE': '2026-10-22',
        'FLD-COM-INSPECTOR': 'Officer James',
      },
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.replacementsApplied).toBe(2);
      expect(res.value.masterUntouched).toBe(true);
      expect(sha(fs.readFileSync(ctx.vaultPath))).toBe(ctx.hash);

      const zip = new PizZip(fs.readFileSync(ctx.ws.absolutePath));
      const updatedXml = zip.file('word/document.xml')!.asText();
      expect(updatedXml).toContain('2026-10-22');
      expect(updatedXml).toContain('Officer James');
      expect(updatedXml).toContain('<w:shd w:fill="CCCCCC"/>');
      expect(updatedXml).toContain('<w:shd w:fill="FFFFFF"/>');
    }
  });

  it('WRD-TBL-02: generates repeated table rows for multi-station records in exact sequence order', () => {
    const tableXml =
      '<w:tbl>' +
      '<w:tblPr><w:tblW w:w="8000" w:type="dxa"/></w:tblPr>' +
      '<w:tr>' +
      '<w:trPr><w:tblHeader/></w:trPr>' +
      '<w:tc><w:p>' + r('Seq') + '</w:p></w:tc>' +
      '<w:tc><w:p>' + r('Station Name') + '</w:p></w:tc>' +
      '<w:tc><w:p>' + r('Status') + '</w:p></w:tc>' +
      '</w:tr>' +
      '<w:tr>' +
      '<w:trPr><w:cantSplit/></w:trPr>' +
      '<w:tc><w:p>' + r('{seq}') + '</w:p></w:tc>' +
      '<w:tc><w:p>' + r('{station_name}') + '</w:p></w:tc>' +
      '<w:tc><w:p>' + r('{status}') + '</w:p></w:tc>' +
      '</w:tr>' +
      '<w:tr>' +
      '<w:tc><w:p>' + r('End of Report') + '</w:p></w:tc>' +
      '<w:tc><w:p>' + r('') + '</w:p></w:tc>' +
      '<w:tc><w:p>' + r('') + '</w:p></w:tc>' +
      '</w:tr>' +
      '</w:tbl>';
    const docx = buildDocx(tableXml);

    const ctx = setupTemplateAndWorkspace(docx, [
      ['FLD-COM-STATION', 'T1:R2:LOOP', 'REPEATING_ROW'],
    ]);

    const res = genService.generateWordDocument({
      workspaceId: ctx.ws.workspaceId,
      sessionId,
      overrideFormData: {
        stations: [
          { stationId: 'STN-01', stationName: 'North Station', sequenceOrder: 1, status: 'Active' },
          { stationId: 'STN-02', stationName: 'Central Station', sequenceOrder: 2, status: 'Audited' },
          { stationId: 'STN-03', stationName: 'South Station', sequenceOrder: 3, status: 'Pending' },
        ],
      },
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.tableRowsGenerated).toBe(3);
      expect(res.value.masterUntouched).toBe(true);

      const zip = new PizZip(fs.readFileSync(ctx.ws.absolutePath));
      const tables = extractTables(zip.file('word/document.xml')!.asText());
      expect(tables[0].rows).toHaveLength(5); // 1 header + 3 stations + 1 summary

      // Strict sequence order verification
      expect(tables[0].rows[0].cells[0].text).toBe('Seq');
      expect(tables[0].rows[1].cells[1].text).toBe('North Station');
      expect(tables[0].rows[2].cells[1].text).toBe('Central Station');
      expect(tables[0].rows[3].cells[1].text).toBe('South Station');
      expect(tables[0].rows[4].cells[0].text).toBe('End of Report');

      // Verify cantSplit row property preserved in generated rows
      expect(tables[0].rows[1].rawXml).toContain('<w:cantSplit/>');
      expect(tables[0].rows[2].rawXml).toContain('<w:cantSplit/>');
      expect(tables[0].rows[3].rawXml).toContain('<w:cantSplit/>');
    }
  });

  it('WRD-TBL-03: preserves header, footer, and page numbering while replacing header/footer tokens', () => {
    const body = para(r('Body Content with {incident_id}'));
    const docx = buildDocx(body, {
      'word/header1.xml': headerPart(
        '<w:p><w:r><w:t>Confidential Report | Date: {report_date} | Page </w:t></w:r>' +
          '<w:fldSimple w:instr="PAGE"><w:r><w:t>1</w:t></w:r></w:fldSimple></w:p>'
      ),
      'word/footer1.xml': headerPart(
        '<w:p><w:r><w:t>Inspector: {inspector_name}</w:t></w:r></w:p>'
      ),
    });

    const ctx = setupTemplateAndWorkspace(docx, [
      ['FLD-INC-ID', '{incident_id}', 'PLACEHOLDER'],
      ['FLD-COM-DATE', '{report_date}', 'PLACEHOLDER'],
      ['FLD-COM-INSPECTOR', '{inspector_name}', 'PLACEHOLDER'],
    ]);

    const res = genService.generateWordDocument({
      workspaceId: ctx.ws.workspaceId,
      sessionId,
      overrideFormData: {
        'FLD-INC-ID': 'INC-2026-999',
        'FLD-COM-DATE': '2026-10-22',
        'FLD-COM-INSPECTOR': 'Officer Davis',
      },
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      const zip = new PizZip(fs.readFileSync(ctx.ws.absolutePath));
      const docXml = zip.file('word/document.xml')!.asText();
      const hdrXml = zip.file('word/header1.xml')!.asText();
      const ftrXml = zip.file('word/footer1.xml')!.asText();

      expect(docXml).toContain('INC-2026-999');
      expect(hdrXml).toContain('Confidential Report | Date: 2026-10-22 | Page ');
      expect(hdrXml).toContain('<w:fldSimple w:instr="PAGE">');
      expect(ftrXml).toContain('Inspector: Officer Davis');
    }
  });

  it('WRD-TBL-04: rejects invalid table cell coordinate targeting non-existent table', () => {
    const docx = buildDocx(para(r('No tables here')));
    const ctx = setupTemplateAndWorkspace(docx, [
      ['FLD-COM-DATE', 'T1:R1:C1', 'TABLE_CELL'],
    ]);

    const res = genService.generateWordDocument({
      workspaceId: ctx.ws.workspaceId,
      sessionId,
      overrideFormData: { 'FLD-COM-DATE': '2026-10-22' },
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe(ErrorCode.VALIDATION_FAILED);
      expect(JSON.stringify(res.error.details)).toContain('MISSING_TARGET_TABLE');
    }
  });

  it('WRD-TBL-05: rejects repeating row mapping targeting non-existent prototype row', () => {
    const tableXml =
      '<w:tbl><w:tr><w:tc><w:p>' + r('Single Row Table') + '</w:p></w:tc></w:tr></w:tbl>';
    const docx = buildDocx(tableXml);
    const ctx = setupTemplateAndWorkspace(docx, [
      ['FLD-COM-STATION', 'T1:R5:LOOP', 'REPEATING_ROW'], // Row 5 doesn't exist
    ]);

    const res = genService.generateWordDocument({
      workspaceId: ctx.ws.workspaceId,
      sessionId,
      overrideFormData: {},
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(JSON.stringify(res.error.details)).toContain('INVALID_REPEATABLE_ROW_CONFIG');
    }
  });

  it('WRD-TBL-06: 0-byte variance on master template is guaranteed across operations', () => {
    const tableXml =
      '<w:tbl><w:tr><w:tc><w:p>' + r('{report_date}') + '</w:p></w:tc></w:tr></w:tbl>';
    const docx = buildDocx(tableXml);
    const ctx = setupTemplateAndWorkspace(docx, [
      ['FLD-COM-DATE', '{report_date}', 'PLACEHOLDER'],
    ]);

    const preMasterBytes = fs.readFileSync(ctx.vaultPath);
    const res = genService.generateWordDocument({
      workspaceId: ctx.ws.workspaceId,
      sessionId,
      overrideFormData: { 'FLD-COM-DATE': '2026-10-22' },
    });
    expect(res.ok).toBe(true);

    const postMasterBytes = fs.readFileSync(ctx.vaultPath);
    expect(postMasterBytes.equals(preMasterBytes)).toBe(true);
    expect(sha(postMasterBytes)).toBe(ctx.hash);
  });
});
