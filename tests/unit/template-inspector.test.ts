/**
 * OpsReport Studio — Template Metadata Inspection & Structure Preview Tests (Step 20)
 *
 * Automated test suite verifying:
 * - Authoritative metadata retrieval and version resolution
 * - Excel workbook inspection (sheets, dimensions, cell grid, formulas, merged cells, candidate headers)
 * - Word document inspection (paragraphs, tables, dimensions, candidate tokens, headers/footers)
 * - Strict master template immutability (byte-for-byte SHA-256 preservation)
 * - Non-persistence of candidate suggestions and heuristic readiness findings
 * - Bounded resource limits and truncation handling
 * - Error propagation for missing, corrupted, or incompatible assets
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
import { TemplateInspector } from '../../src/storage/vault/template-inspector.ts';
import { toTemplateId, toReportCategoryId } from '../../src/shared/types/identifiers.ts';
import { ErrorCode } from '../../src/shared/errors/error-codes.ts';

function createInspectableExcelZip(): Buffer {
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
    <sheet name="AuditData" sheetId="1" r:id="rId1"/>
    <sheet name="SummarySheet" sheetId="2" r:id="rId2"/>
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
  <si><t>Station Code</t></si>
  <si><t>Luminaire ID</t></si>
  <si><t>Status</t></si>
  <si><t>Lux Level</t></si>
  <si><t>STN-001</t></si>
  <si><t>LUM-101</t></si>
  <si><t>NORMAL</t></si>
  <si><t>STN-002</t></si>
  <si><t>LUM-102</t></si>
  <si><t>FAULT</t></si>
</sst>`
  );

  // Sheet 1: 3 rows, 4 cols, formulas, mergeCell
  zip.file(
    'xl/worksheets/sheet1.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:D3"/>
  <sheetData>
    <row r="1">
      <c r="A1" t="s"><v>0</v></c>
      <c r="B1" t="s"><v>1</v></c>
      <c r="C1" t="s"><v>2</v></c>
      <c r="D1" t="s"><v>3</v></c>
    </row>
    <row r="2">
      <c r="A2" t="s"><v>4</v></c>
      <c r="B2" t="s"><v>5</v></c>
      <c r="C2" t="s"><v>6</v></c>
      <c r="D2"><v>85.5</v></c>
    </row>
    <row r="3">
      <c r="A3" t="s"><v>7</v></c>
      <c r="B3" t="s"><v>8</v></c>
      <c r="C3" t="s"><v>9</v></c>
      <c r="D3"><f>SUM(D2:D2)</f><v>85.5</v></c>
    </row>
  </sheetData>
  <mergeCells count="1">
    <mergeCell ref="A1:B1"/>
  </mergeCells>
</worksheet>`
  );

  // Sheet 2: 2 rows, 2 cols
  zip.file(
    'xl/worksheets/sheet2.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:B2"/>
  <sheetData>
    <row r="1">
      <c r="A1" t="inlineStr"><is><t>Summary Category</t></is></c>
      <c r="B1" t="inlineStr"><is><t>Count</t></is></c>
    </row>
    <row r="2">
      <c r="A2" t="inlineStr"><is><t>Total Tested</t></is></c>
      <c r="B2"><v>10</v></c>
    </row>
  </sheetData>
</worksheet>`
  );

  return zip.generate({ type: 'nodebuffer' });
}

function createLargeExcelZip(numRows: number): Buffer {
  const zip = new PizZip();

  zip.file(
    'xl/workbook.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheets>
    <sheet name="LargeData" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`
  );

  zip.file(
    'xl/_rels/workbook.xml.rels',
    `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`
  );

  let rowsXml = '';
  for (let r = 1; r <= numRows; r++) {
    rowsXml += `<row r="${r}"><c r="A${r}"><v>${r}</v></c><c r="B${r}"><v>${r * 10}</v></c></row>`;
  }

  zip.file(
    'xl/worksheets/sheet1.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:B${numRows}"/>
  <sheetData>
    ${rowsXml}
  </sheetData>
</worksheet>`
  );

  return zip.generate({ type: 'nodebuffer' });
}

function createInspectableWordZip(): Buffer {
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
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r><w:t>Routine Security Audit — Date: {report_date}</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>Duty Inspector: {inspector_name} | Shift: {shift}</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>The following table itemizes perimeter observations:</w:t></w:r>
    </w:p>
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Station</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Severity</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Notes</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Central Station</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Low</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Gate locked securely.</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>North Terminal</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>None</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Normal patrol completed.</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
    <w:p>
      <w:r><w:t>End of shift log.</w:t></w:r>
    </w:p>
    <w:sectPr/>
  </w:body>
</w:document>`
  );

  // Headers and Footers
  zip.file(
    'word/header1.xml',
    '<?xml version="1.0" encoding="UTF-8"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>Header Logo</w:t></w:r></w:p></w:hdr>'
  );
  zip.file(
    'word/footer1.xml',
    '<?xml version="1.0" encoding="UTF-8"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>Page 1 of 1</w:t></w:r></w:p></w:ftr>'
  );

  return zip.generate({ type: 'nodebuffer' });
}

function computeHash(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

describe('OpsReport Studio — Template Metadata Inspection & Structure Preview (Step 20)', () => {
  let tempRoot: string;
  let vaultManager: VaultManager;
  let dbManager: DatabaseManager;
  let templateRepo: TemplateMetadataRepository;
  let inspector: TemplateInspector;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opsreport-step20-test-'));
    const appDataRoot = path.join(tempRoot, 'AppData');
    fs.mkdirSync(appDataRoot, { recursive: true });

    vaultManager = new VaultManager(appDataRoot);
    vaultManager.initializeVault();
    VaultManager.setInstance(vaultManager);

    const dbPath = path.join(vaultManager.databaseDir, 'test-opsreport.db');
    dbManager = new DatabaseManager({ databasePath: dbPath });
    dbManager.initialize();

    templateRepo = new TemplateMetadataRepository(dbManager.getDatabase());

    // Initialize TemplateInspector
    TemplateInspector.resetInstance();
    inspector = TemplateInspector.getInstance(dbManager.getDatabase(), vaultManager, templateRepo);
  });

  afterEach(() => {
    VaultManager.setInstance(null);
    TemplateInspector.resetInstance();
    if (dbManager?.isOpen()) {
      dbManager.close();
    }
    if (fs.existsSync(tempRoot)) {
      try {
        fs.rmSync(tempRoot, { recursive: true, force: true });
      } catch {
        // Safe cleanup ignore
      }
    }
  });

  it('INS-01: Inspects authoritative metadata and resolves active version for Excel template', async () => {
    const excelBuf = createInspectableExcelZip();
    const tplId = toTemplateId('TPL-FAN-TEST');
    const fileName = 'TPL-FAN-TEST_v1.xlsx';
    const filePath = path.join(vaultManager.templatesDir, fileName);
    fs.writeFileSync(filePath, excelBuf);
    const hash = computeHash(filePath);

    // Register logical template and version
    templateRepo.createTemplate({
      templateId: tplId,
      templateName: 'Platform Fan Master Inspection',
      categoryId: toReportCategoryId('RPT-FAN'),
      documentType: 'EXCEL_XLSX',
      fileName,
      status: 'ACTIVE',
    });

    const vRes = templateRepo.registerNewVersion({
      templateId: tplId,
      fileName,
      fileSizeBytes: excelBuf.length,
      sha256Hash: hash,
      changeSummary: 'Initial v1 master asset',
      setActive: true,
    });
    expect(vRes.ok).toBe(true);

    const res = await inspector.inspectTemplate({ templateId: tplId });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const val = res.value;
      expect(val.templateId).toBe(tplId);
      expect(val.templateName).toBe('Platform Fan Master Inspection');
      expect(val.versionNumber).toBe(1);
      expect(val.documentType).toBe('EXCEL_XLSX');
      expect(val.fileName).toBe(fileName);
      expect(val.fileSizeBytes).toBe(excelBuf.length);
      expect(val.sha256Hash).toBe(hash);
      expect(val.integrityVerified).toBe(true);
      expect(val.excelPreview).toBeDefined();
      expect(val.excelPreview?.sheets).toHaveLength(2);
      expect(val.excelPreview?.sheets[0].name).toBe('AuditData');
      expect(val.excelPreview?.sheets[1].name).toBe('SummarySheet');
    }
  });

  it('INS-02: Resolves specific historical version when versionId is explicitly provided', async () => {
    const excelBuf1 = createInspectableExcelZip();
    const excelBuf2 = createLargeExcelZip(5);
    const tplId = toTemplateId('TPL-MULTI-VER');

    // Create v1
    const file1 = 'TPL-MULTI-VER_v1.xlsx';
    const path1 = path.join(vaultManager.templatesDir, file1);
    fs.writeFileSync(path1, excelBuf1);
    const hash1 = computeHash(path1);

    // Create v2
    const file2 = 'TPL-MULTI-VER_v2.xlsx';
    const path2 = path.join(vaultManager.templatesDir, file2);
    fs.writeFileSync(path2, excelBuf2);
    const hash2 = computeHash(path2);

    templateRepo.createTemplate({
      templateId: tplId,
      templateName: 'Multi Version Template',
      categoryId: toReportCategoryId('RPT-FAN'),
      documentType: 'EXCEL_XLSX',
      fileName: file2,
      status: 'ACTIVE',
    });

    const v1Res = templateRepo.registerNewVersion({
      templateId: tplId,
      fileName: file1,
      fileSizeBytes: excelBuf1.length,
      sha256Hash: hash1,
      changeSummary: 'V1 initial',
      setActive: false,
    });
    expect(v1Res.ok).toBe(true);

    const v2Res = templateRepo.registerNewVersion({
      templateId: tplId,
      fileName: file2,
      fileSizeBytes: excelBuf2.length,
      sha256Hash: hash2,
      changeSummary: 'V2 promoted',
      setActive: true,
    });
    expect(v2Res.ok).toBe(true);

    if (v1Res.ok) {
      // Explicitly inspect historical v1
      const res = await inspector.inspectTemplate({
        templateId: tplId,
        versionId: v1Res.value.version_id,
      });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value.versionNumber).toBe(1);
        expect(res.value.fileName).toBe(file1);
        expect(res.value.sha256Hash).toBe(hash1);
        expect(res.value.excelPreview?.sheets[0].name).toBe('AuditData');
      }
    }
  });

  it('INS-03: Strictly preserves master file immutability (0-byte delta before and after inspection)', async () => {
    const excelBuf = createInspectableExcelZip();
    const tplId = toTemplateId('TPL-IMMUTABLE-CHECK');
    const fileName = 'TPL-IMMUTABLE-CHECK_v1.xlsx';
    const filePath = path.join(vaultManager.templatesDir, fileName);
    fs.writeFileSync(filePath, excelBuf);
    vaultManager.makeFileReadOnly(filePath);

    const hashBefore = computeHash(filePath);

    templateRepo.createTemplate({
      templateId: tplId,
      templateName: 'Immutability Check',
      categoryId: toReportCategoryId('RPT-FAN'),
      documentType: 'EXCEL_XLSX',
      fileName,
      status: 'ACTIVE',
    });

    templateRepo.registerNewVersion({
      templateId: tplId,
      fileName,
      fileSizeBytes: excelBuf.length,
      sha256Hash: hashBefore,
      setActive: true,
    });

    // Run inspection multiple times
    await inspector.inspectTemplate({ templateId: tplId });
    await inspector.inspectTemplate({ templateId: tplId, worksheetName: 'SummarySheet' });

    const hashAfter = computeHash(filePath);
    expect(hashAfter).toBe(hashBefore);
    expect(fs.readFileSync(filePath)).toEqual(excelBuf);
  });

  it('INS-04: Inspects Excel worksheet dimensions, cells, formulas, merged cells, and candidate headers', async () => {
    const excelBuf = createInspectableExcelZip();
    const tplId = toTemplateId('TPL-EXCEL-GRID');
    const fileName = 'TPL-EXCEL-GRID_v1.xlsx';
    const filePath = path.join(vaultManager.templatesDir, fileName);
    fs.writeFileSync(filePath, excelBuf);

    templateRepo.createTemplate({
      templateId: tplId,
      templateName: 'Excel Grid Audit',
      categoryId: toReportCategoryId('RPT-STATION-LIGHT'),
      documentType: 'EXCEL_XLSX',
      fileName,
      status: 'ACTIVE',
    });

    templateRepo.registerNewVersion({
      templateId: tplId,
      fileName,
      fileSizeBytes: excelBuf.length,
      sha256Hash: computeHash(filePath),
      setActive: true,
    });

    const res = await inspector.inspectTemplate({ templateId: tplId });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const activeSheet = res.value.excelPreview?.activeSheetPreview;
      expect(activeSheet).toBeDefined();
      if (activeSheet) {
        expect(activeSheet.sheetSummary.name).toBe('AuditData');
        expect(activeSheet.sheetSummary.hasFormulas).toBe(true);
        expect(activeSheet.sheetSummary.mergedCellCount).toBe(1);

        // Candidate Header Row Heuristic (Section 6.6)
        expect(activeSheet.candidateHeaderRow).toBeDefined();
        expect(activeSheet.candidateHeaderRow?.rowNumber).toBe(1);
        expect(activeSheet.candidateHeaderRow?.headers).toEqual([
          { colRef: 'A', text: 'Station Code' },
          { colRef: 'B', text: 'Luminaire ID' },
          { colRef: 'C', text: 'Status' },
          { colRef: 'D', text: 'Lux Level' },
        ]);

        // Merged cell check on A1
        const a1 = activeSheet.previewRows[0].cells.find(c => c.address === 'A1');
        expect(a1?.isMerged).toBe(true);

        // Formula check on D3
        const d3 = activeSheet.previewRows[2].cells.find(c => c.address === 'D3');
        expect(d3?.isFormula).toBe(true);
        expect(d3?.formula).toBe('SUM(D2:D2)');
      }
    }
  });

  it('INS-05: Inspects second worksheet when requested via worksheetName option', async () => {
    const excelBuf = createInspectableExcelZip();
    const tplId = toTemplateId('TPL-SHEET-SWITCH');
    const fileName = 'TPL-SHEET-SWITCH_v1.xlsx';
    const filePath = path.join(vaultManager.templatesDir, fileName);
    fs.writeFileSync(filePath, excelBuf);

    templateRepo.createTemplate({
      templateId: tplId,
      templateName: 'Sheet Switch Template',
      categoryId: toReportCategoryId('RPT-STATION-LIGHT'),
      documentType: 'EXCEL_XLSX',
      fileName,
      status: 'ACTIVE',
    });

    templateRepo.registerNewVersion({
      templateId: tplId,
      fileName,
      fileSizeBytes: excelBuf.length,
      sha256Hash: computeHash(filePath),
      setActive: true,
    });

    const res = await inspector.inspectTemplate({
      templateId: tplId,
      worksheetName: 'SummarySheet',
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      const activeSheet = res.value.excelPreview?.activeSheetPreview;
      expect(activeSheet?.sheetSummary.name).toBe('SummarySheet');
      expect(activeSheet?.previewRows).toHaveLength(2);
      expect(activeSheet?.previewRows[0].cells[0].value).toBe('Summary Category');
    }
  });

  it('INS-06: Bounded row limit truncates preview rows when worksheet exceeds 15 rows', async () => {
    const largeBuf = createLargeExcelZip(25);
    const tplId = toTemplateId('TPL-LARGE-SHEET');
    const fileName = 'TPL-LARGE-SHEET_v1.xlsx';
    const filePath = path.join(vaultManager.templatesDir, fileName);
    fs.writeFileSync(filePath, largeBuf);

    templateRepo.createTemplate({
      templateId: tplId,
      templateName: 'Large Sheet Test',
      categoryId: toReportCategoryId('RPT-FAN'),
      documentType: 'EXCEL_XLSX',
      fileName,
      status: 'ACTIVE',
    });

    templateRepo.registerNewVersion({
      templateId: tplId,
      fileName,
      fileSizeBytes: largeBuf.length,
      sha256Hash: computeHash(filePath),
      setActive: true,
    });

    const res = await inspector.inspectTemplate({ templateId: tplId });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const activeSheet = res.value.excelPreview?.activeSheetPreview;
      expect(activeSheet?.totalRowsInSheet).toBe(25);
      expect(activeSheet?.previewRows).toHaveLength(15); // bounded to MAX_PREVIEW_ROWS
      expect(activeSheet?.isTruncated).toBe(true);
      expect(activeSheet?.truncationReason).toContain('Display bounded to first 15 rows');
    }
  });

  it('INS-07: Inspects Word document paragraphs, headers/footers, and candidate placeholder tokens', async () => {
    const wordBuf = createInspectableWordZip();
    const tplId = toTemplateId('TPL-WORD-AUDIT');
    const fileName = 'TPL-WORD-AUDIT_v1.docx';
    const filePath = path.join(vaultManager.templatesDir, fileName);
    fs.writeFileSync(filePath, wordBuf);

    templateRepo.createTemplate({
      templateId: tplId,
      templateName: 'Security Audit Word Master',
      categoryId: toReportCategoryId('RPT-INCIDENT'),
      documentType: 'WORD_DOCX',
      fileName,
      status: 'ACTIVE',
    });

    templateRepo.registerNewVersion({
      templateId: tplId,
      fileName,
      fileSizeBytes: wordBuf.length,
      sha256Hash: computeHash(filePath),
      setActive: true,
    });

    const res = await inspector.inspectTemplate({ templateId: tplId });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const word = res.value.wordPreview;
      expect(word).toBeDefined();
      if (word) {
        expect(word.paragraphCount).toBe(4);
        expect(word.hasHeaders).toBe(true);
        expect(word.hasFooters).toBe(true);
        expect(word.hasImages).toBe(false);

        // Candidate tokens
        expect(word.candidateTokens).toContain('{report_date}');
        expect(word.candidateTokens).toContain('{inspector_name}');
        expect(word.candidateTokens).toContain('{shift}');

        // Paragraph text inspection
        expect(word.paragraphs[0].text).toContain('Routine Security Audit');
        expect(word.paragraphs[0].hasCandidateTokens).toBe(true);
        expect(word.paragraphs[0].candidateTokens).toEqual(['{report_date}']);
      }
    }
  });

  it('INS-08: Inspects Word document tables, dimensions, and cell text', async () => {
    const wordBuf = createInspectableWordZip();
    const tplId = toTemplateId('TPL-WORD-TBL');
    const fileName = 'TPL-WORD-TBL_v1.docx';
    const filePath = path.join(vaultManager.templatesDir, fileName);
    fs.writeFileSync(filePath, wordBuf);

    templateRepo.createTemplate({
      templateId: tplId,
      templateName: 'Word Table Audit',
      categoryId: toReportCategoryId('RPT-INCIDENT'),
      documentType: 'WORD_DOCX',
      fileName,
      status: 'ACTIVE',
    });

    templateRepo.registerNewVersion({
      templateId: tplId,
      fileName,
      fileSizeBytes: wordBuf.length,
      sha256Hash: computeHash(filePath),
      setActive: true,
    });

    const res = await inspector.inspectTemplate({ templateId: tplId });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const word = res.value.wordPreview;
      expect(word?.tableCount).toBe(1);
      expect(word?.tables).toHaveLength(1);
      const table1 = word?.tables[0];
      expect(table1?.rowCount).toBe(3);
      expect(table1?.colCount).toBe(3);
      expect(table1?.rows[0].cells).toEqual(['Station', 'Severity', 'Notes']);
      expect(table1?.rows[1].cells).toEqual(['Central Station', 'Low', 'Gate locked securely.']);
    }
  });

  it('INS-09: Rejects non-existent template ID with TEMPLATE_NOT_FOUND', async () => {
    const res = await inspector.inspectTemplate({
      templateId: toTemplateId('TPL-DOES-NOT-EXIST'),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe(ErrorCode.TEMPLATE_NOT_FOUND);
    }
  });

  it('INS-10: Rejects missing physical vault asset with FILE_NOT_FOUND', async () => {
    const tplId = toTemplateId('TPL-GHOST-FILE');
    const fileName = 'ghost_file.xlsx';

    templateRepo.createTemplate({
      templateId: tplId,
      templateName: 'Ghost Template',
      categoryId: toReportCategoryId('RPT-FAN'),
      documentType: 'EXCEL_XLSX',
      fileName,
      status: 'ACTIVE',
    });

    templateRepo.registerNewVersion({
      templateId: tplId,
      fileName,
      fileSizeBytes: 1234,
      sha256Hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      setActive: true,
    });

    const res = await inspector.inspectTemplate({ templateId: tplId });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe(ErrorCode.FILE_NOT_FOUND);
      expect(res.error.userMessage).toContain('missing from the Master Template Vault');
    }
  });

  it('INS-11: Rejects corrupted Open XML container with TEMPLATE_MALFORMED', async () => {
    const corruptBuf = Buffer.from('NOT A VALID ZIP CONTAINER OR CORRUPTED DATA');
    const tplId = toTemplateId('TPL-CORRUPT');
    const fileName = 'TPL-CORRUPT_v1.xlsx';
    const filePath = path.join(vaultManager.templatesDir, fileName);
    fs.writeFileSync(filePath, corruptBuf);

    templateRepo.createTemplate({
      templateId: tplId,
      templateName: 'Corrupted Template',
      categoryId: toReportCategoryId('RPT-FAN'),
      documentType: 'EXCEL_XLSX',
      fileName,
      status: 'ACTIVE',
    });

    templateRepo.registerNewVersion({
      templateId: tplId,
      fileName,
      fileSizeBytes: corruptBuf.length,
      sha256Hash: computeHash(filePath),
      setActive: true,
    });

    const res = await inspector.inspectTemplate({ templateId: tplId });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe(ErrorCode.TEMPLATE_MALFORMED);
      expect(res.error.userMessage).toContain('Failed to open template container');
    }
  });

  it('INS-12: Confirms candidate suggestions produce zero persistent database mappings', async () => {
    const excelBuf = createInspectableExcelZip();
    const tplId = toTemplateId('TPL-NO-MAPPING-LEAK');
    const fileName = 'TPL-NO-MAPPING-LEAK_v1.xlsx';
    const filePath = path.join(vaultManager.templatesDir, fileName);
    fs.writeFileSync(filePath, excelBuf);

    templateRepo.createTemplate({
      templateId: tplId,
      templateName: 'No Mapping Leak Audit',
      categoryId: toReportCategoryId('RPT-FAN'),
      documentType: 'EXCEL_XLSX',
      fileName,
      status: 'ACTIVE',
    });

    templateRepo.registerNewVersion({
      templateId: tplId,
      fileName,
      fileSizeBytes: excelBuf.length,
      sha256Hash: computeHash(filePath),
      setActive: true,
    });

    const res = await inspector.inspectTemplate({ templateId: tplId });
    expect(res.ok).toBe(true);

    // Verify readiness notes emphasize suggestions only
    if (res.ok) {
      expect(
        res.value.readinessNotes.some(n => n.includes('NOT saved as persistent mappings'))
      ).toBe(true);
    }

    // Verify no unexpected tables or columns were written in SQLite
    const tables = dbManager
      .getDatabase()
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as Array<{ name: string }>;
    const tableNames = tables.map(t => t.name);

    // Confirm no candidate suggestions were written to mapping tables
    expect(tableNames).not.toContain('template_mappings');
    expect(tableNames).not.toContain('cell_mappings');

    // Confirm mapping_profiles table has no auto-saved inspection candidates
    const mappingCount = dbManager
      .getDatabase()
      .prepare('SELECT count(*) as cnt FROM excel_template_mappings')
      .get() as { cnt: number };
    expect(mappingCount.cnt).toBe(0);
  });
});
