import ExcelJS from 'exceljs';
import PizZip from 'pizzip';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.resolve(__dirname, '..', 'fixtures');

if (!fs.existsSync(fixturesDir)) {
  fs.mkdirSync(fixturesDir, { recursive: true });
}

console.log('[Fixtures] Generating synthetic test fixtures in:', fixturesDir);

// 1. Create standard Excel fixture
async function createExcelStandard() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'OpsReport Studio Test Suite';
  workbook.lastModifiedBy = 'Synthetic Fixture Generator';
  workbook.created = new Date('2026-10-19T00:00:00Z');
  workbook.modified = new Date('2026-10-19T00:00:00Z');

  const sheet = workbook.addWorksheet('StationAudit', {
    pageSetup: {
      paperSize: 9, // A4
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0
    }
  });

  // Title block: merged A1:F2
  sheet.mergeCells('A1:F2');
  const titleCell = sheet.getCell('A1');
  titleCell.value = 'OPSREPORT STUDIO — OPERATIONAL STATION INSPECTION AUDIT';
  titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FF1F4E79' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFD9E1F2' }
  };
  titleCell.border = {
    top: { style: 'thin' },
    left: { style: 'thin' },
    bottom: { style: 'thin' },
    right: { style: 'thin' }
  };

  // Metadata headers (Rows 4-6)
  sheet.getCell('B4').value = 'Inspection Date:';
  sheet.getCell('B4').font = { bold: true };
  sheet.getCell('C4').value = ''; // Placeholder for injection

  sheet.getCell('B5').value = 'Lead Inspector:';
  sheet.getCell('B5').font = { bold: true };
  sheet.getCell('C5').value = ''; // Placeholder for injection

  sheet.getCell('B6').value = 'Operational Shift:';
  sheet.getCell('B6').font = { bold: true };
  sheet.getCell('C6').value = ''; // Placeholder for injection

  // Table Headers (Row 9)
  const headers = ['Seq #', 'Station Name', 'Asset Description', 'Operational Status', 'Defect Count', 'Inspector Remarks'];
  const colLetters = ['A', 'B', 'C', 'D', 'E', 'F'];
  const colWidths = [10, 25, 30, 20, 15, 35];

  headers.forEach((h, i) => {
    const cell = sheet.getCell(`${colLetters[i]}9`);
    cell.value = h;
    cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2F5597' }
    };
    cell.border = {
      top: { style: 'medium' },
      left: { style: 'thin' },
      bottom: { style: 'medium' },
      right: { style: 'thin' }
    };
    sheet.getColumn(i + 1).width = colWidths[i];
  });

  // Pre-formatted station rows 10 to 29 (20 blank rows)
  for (let row = 10; row <= 29; row++) {
    for (let c = 0; c < 6; c++) {
      const cell = sheet.getCell(`${colLetters[c]}${row}`);
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD9D9D9' } },
        left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
        bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } },
        right: { style: 'thin', color: { argb: 'FFD9D9D9' } }
      };
      if (row % 2 === 0) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF9FAFC' }
        };
      }
    }
  }

  // Summary row at Row 30 with Formula
  sheet.getCell('D30').value = 'Total Defects:';
  sheet.getCell('D30').font = { name: 'Arial', size: 11, bold: true };
  sheet.getCell('D30').alignment = { horizontal: 'right' };
  
  sheet.getCell('E30').value = { formula: 'SUM(E10:E29)', result: 0 };
  sheet.getCell('E30').font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFC00000' } };
  sheet.getCell('E30').alignment = { horizontal: 'center' };
  sheet.getCell('E30').border = {
    top: { style: 'thin' },
    bottom: { style: 'double' }
  };

  const targetPath = path.join(fixturesDir, 'fixture_excel_standard.xlsx');
  await workbook.xlsx.writeFile(targetPath);
  console.log('✓ Created fixture_excel_standard.xlsx');
}

// 2. Create complex Excel fixture with embedded image/drawing
async function createExcelComplex() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('ComplexInspection');

  sheet.mergeCells('A1:D2');
  const title = sheet.getCell('A1');
  title.value = 'COMPLEX AUDIT TEMPLATE WITH LOGO';
  title.font = { bold: true, size: 14 };

  // Add dummy 1x1 transparent PNG image to test drawing preservation
  const base64Png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const imageId = workbook.addImage({
    base64: base64Png,
    extension: 'png'
  });

  sheet.addImage(imageId, {
    tl: { col: 5, row: 0 },
    ext: { width: 50, height: 50 }
  });

  // Table header
  sheet.getCell('A4').value = 'ID';
  sheet.getCell('B4').value = 'Item';
  sheet.getCell('C4').value = 'Score';
  sheet.getCell('C5').value = { formula: 'AVERAGE(C6:C10)', result: 0 };

  const targetPath = path.join(fixturesDir, 'fixture_excel_complex.xlsx');
  await workbook.xlsx.writeFile(targetPath);
  console.log('✓ Created fixture_excel_complex.xlsx');
}

// 3. Create malformed archive fixture (damaged ZIP)
function createMalformedArchive() {
  // PK\x03\x04 followed by corrupted nonsense
  const buffer = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0xff, 0xff, 0xde, 0xad, 0xbe, 0xef]);
  const targetPath = path.join(fixturesDir, 'fixture_malformed_archive.xlsx');
  fs.writeFileSync(targetPath, buffer);
  console.log('✓ Created fixture_malformed_archive.xlsx');
}

// 4. Create macro quarantine fixture (.xlsm containing vbaProject.bin)
function createMacroQuarantine() {
  const zip = new PizZip();
  // Standard minimum Open XML skeleton
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>');
  // Inject VBA macro indicator part
  zip.file('xl/vbaProject.bin', Buffer.from([0x56, 0x42, 0x41, 0x20, 0x4D, 0x61, 0x63, 0x72, 0x6F]));
  zip.file('xl/workbook.xml', '<workbook></workbook>');

  const targetPath = path.join(fixturesDir, 'fixture_macro_quarantine.xlsm');
  fs.writeFileSync(targetPath, zip.generate({ type: 'nodebuffer' }));
  console.log('✓ Created fixture_macro_quarantine.xlsm');
}

// Helper to create minimal valid Word DOCX package
function buildDocxPackage(documentXmlContent) {
  const zip = new PizZip();

  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);

  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);

  zip.file('word/document.xml', documentXmlContent);

  return zip.generate({ type: 'nodebuffer' });
}

// 5. Create standard Word DOCX fixture
function createWordStandard() {
  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="32"/></w:rPr><w:t>INCIDENT REPORT AUDIT</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>Report Date: </w:t></w:r>
      <w:r><w:t>{report_date}</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>Inspector: </w:t></w:r>
      <w:r><w:t>{inspector_name}</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>Operational Shift: </w:t></w:r>
      <w:r><w:t>{shift}</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>Narrative Summary: </w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>{incident_narrative}</w:t></w:r>
    </w:p>
  </w:body>
</w:document>`;

  const buffer = buildDocxPackage(docXml);
  const targetPath = path.join(fixturesDir, 'fixture_word_standard.docx');
  fs.writeFileSync(targetPath, buffer);
  console.log('✓ Created fixture_word_standard.docx');
}

// 6. Create fragmented split-run Word DOCX fixture
function createWordSplitRun() {
  // In this document, {incident_narrative} is split across multiple <w:r> tags with mixed styling
  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>Split-Run Test Document</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>Pre-token text. </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>{</w:t></w:r>
      <w:r><w:rPr><w:color w:val="FF0000"/></w:rPr><w:t>incident_narrative</w:t></w:r>
      <w:r><w:rPr><w:i/></w:rPr><w:t>}</w:t></w:r>
      <w:r><w:t> Post-token text.</w:t></w:r>
    </w:p>
  </w:body>
</w:document>`;

  const buffer = buildDocxPackage(docXml);
  const targetPath = path.join(fixturesDir, 'fixture_word_split_run.docx');
  fs.writeFileSync(targetPath, buffer);
  console.log('✓ Created fixture_word_split_run.docx');
}

// 7. Create table loop Word DOCX fixture
function createWordTable() {
  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t>Station Multi-Row Inspection Table</w:t></w:r>
    </w:p>
    <w:tbl>
      <w:tblPr>
        <w:tblBorders>
          <w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>
          <w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>
          <w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/>
        </w:tblBorders>
      </w:tblPr>
      <w:tr>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Seq #</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Station Name</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Operational Status</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Defects</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>{#station_rows}{sequence_index}</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>{station_name}</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>{status}</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>{defect_count}{/station_rows}</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
  </w:body>
</w:document>`;

  const buffer = buildDocxPackage(docXml);
  const targetPath = path.join(fixturesDir, 'fixture_word_table.docx');
  fs.writeFileSync(targetPath, buffer);
  console.log('✓ Created fixture_word_table.docx');
}

async function main() {
  await createExcelStandard();
  await createExcelComplex();
  createMalformedArchive();
  createMacroQuarantine();
  createWordStandard();
  createWordSplitRun();
  createWordTable();
  console.log('[Fixtures] All 7 synthetic test fixtures successfully created.');
}

main().catch(err => {
  console.error('[Fixtures] Failed to create fixtures:', err);
  process.exit(1);
});
