import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import PizZip from 'pizzip';
import {
  validateDocumentBuffer,
  validateDocumentFile,
  MAX_TEMPLATE_FILE_SIZE,
} from '../../src/storage/vault/document-validator.ts';
import { ErrorCode } from '../../src/shared/errors/error-codes.ts';

function createMinimalExcelZip(): Buffer {
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
    '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"></workbook>'
  );
  return zip.generate({ type: 'nodebuffer' });
}

function createMinimalWordZip(): Buffer {
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
    '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"></w:document>'
  );
  return zip.generate({ type: 'nodebuffer' });
}

describe('OpsReport Studio — Document Validator (Step 18)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opsreport-validator-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Safe cleanup ignore
      }
    }
  });

  it('VAL-01: Validates legitimate Excel .xlsx Open XML container buffer', () => {
    const buf = createMinimalExcelZip();
    const res = validateDocumentBuffer(buf, '.xlsx');

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.isValid).toBe(true);
      expect(res.value.detectedFormat).toBe('EXCEL_XLSX');
      expect(res.value.hasMacros).toBe(false);
      expect(res.value.entryCount).toBeGreaterThanOrEqual(3);
      expect(res.value.sha256Hash).toHaveLength(64);
    }
  });

  it('VAL-02: Validates legitimate Word .docx Open XML container buffer', () => {
    const buf = createMinimalWordZip();
    const res = validateDocumentBuffer(buf, '.docx');

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.isValid).toBe(true);
      expect(res.value.detectedFormat).toBe('WORD_DOCX');
      expect(res.value.hasMacros).toBe(false);
      expect(res.value.entryCount).toBeGreaterThanOrEqual(3);
      expect(res.value.sha256Hash).toHaveLength(64);
    }
  });

  it('VAL-03: Rejects empty file buffer (0 bytes)', () => {
    const emptyBuf = Buffer.alloc(0);
    const res = validateDocumentBuffer(emptyBuf, '.xlsx');

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe(ErrorCode.TEMPLATE_MALFORMED);
      expect(res.error.userMessage).toContain('empty (0 bytes)');
    }
  });

  it('VAL-04: Rejects non-ZIP / random bytes with Office extension', () => {
    const randomBuf = Buffer.from(
      'This is a plain text file pretending to be an excel spreadsheet'
    );
    const res = validateDocumentBuffer(randomBuf, '.xlsx');

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe(ErrorCode.TEMPLATE_MALFORMED);
      expect(res.error.userMessage).toContain('valid Open XML ZIP container header');
    }
  });

  it('VAL-05: Rejects legacy binary Office or password-protected OLE documents', () => {
    // Magic bytes for OLE Compound Document: \xD0\xCF\x11\xE0
    const oleBuf = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0x00, 0x00, 0x00, 0x00]);
    const res = validateDocumentBuffer(oleBuf, '.xls');

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe(ErrorCode.TEMPLATE_UNSUPPORTED_FORMAT);
      expect(res.error.userMessage).toContain('Legacy binary Office formats (.xls / .doc)');
    }
  });

  it('VAL-06: Rejects truncated / corrupted ZIP package', () => {
    // Start with valid PK\x03\x04 header but followed by random corrupted garbage
    const corruptBuf = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x99, 0x88, 0x77, 0x66, 0x55, 0x44]);
    const res = validateDocumentBuffer(corruptBuf, '.xlsx');

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe(ErrorCode.TEMPLATE_MALFORMED);
    }
  });

  it('VAL-07: Rejects Open XML package missing [Content_Types].xml or _rels/.rels', () => {
    const zip = new PizZip();
    zip.file('xl/workbook.xml', '<workbook/>');
    const buf = zip.generate({ type: 'nodebuffer' });

    const res = validateDocumentBuffer(buf, '.xlsx');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe(ErrorCode.TEMPLATE_MALFORMED);
      expect(res.error.userMessage).toContain('missing core [Content_Types].xml');
    }
  });

  it('VAL-08: Rejects format mismatch (Word document renamed to .xlsx)', () => {
    const wordBuf = createMinimalWordZip();
    const res = validateDocumentBuffer(wordBuf, '.xlsx');

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe(ErrorCode.TEMPLATE_UNSUPPORTED_FORMAT);
      expect(res.error.userMessage).toContain('Mismatched format');
    }
  });

  it('VAL-09: Rejects format mismatch (Excel workbook renamed to .docx)', () => {
    const excelBuf = createMinimalExcelZip();
    const res = validateDocumentBuffer(excelBuf, '.docx');

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe(ErrorCode.TEMPLATE_UNSUPPORTED_FORMAT);
      expect(res.error.userMessage).toContain('Mismatched format');
    }
  });

  it('VAL-10: Quarantines and rejects macro-enabled templates (.xlsm / vbaProject.bin)', () => {
    const zip = new PizZip();
    zip.file('[Content_Types].xml', '<Types/>');
    zip.file('_rels/.rels', '<Relationships/>');
    zip.file('xl/workbook.xml', '<workbook/>');
    zip.file('xl/vbaProject.bin', 'FAKE_VBA_BINARY_STREAM');
    const buf = zip.generate({ type: 'nodebuffer' });

    const res = validateDocumentBuffer(buf, '.xlsx');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe(ErrorCode.TEMPLATE_UNSUPPORTED_FORMAT);
      expect(res.error.userMessage).toContain(
        'Macro-enabled templates (.xlsm / .docm) are prohibited'
      );
    }
  });

  it('VAL-11: Rejects package with path traversal in entry names', () => {
    const zip = new PizZip();
    zip.file('[Content_Types].xml', '<Types/>');
    zip.file('_rels/.rels', '<Relationships/>');
    zip.file('xl/workbook.xml', '<workbook/>');
    zip.file('../secret_file.txt', 'evil data');
    const buf = zip.generate({ type: 'nodebuffer' });

    const res = validateDocumentBuffer(buf, '.xlsx');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe(ErrorCode.SECURITY_VIOLATION);
      expect(res.error.userMessage).toContain('path traversal');
    }
  });

  it('VAL-12: Rejects file exceeding 25 MB limit', () => {
    const hugeBuf = Buffer.alloc(MAX_TEMPLATE_FILE_SIZE + 1024);
    hugeBuf[0] = 0x50;
    hugeBuf[1] = 0x4b;
    hugeBuf[2] = 0x03;
    hugeBuf[3] = 0x04;

    const res = validateDocumentBuffer(hugeBuf, '.xlsx');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe(ErrorCode.VALIDATION_FAILED);
      expect(res.error.userMessage).toContain('exceeds maximum allowed template size');
    }
  });

  it('VAL-13: Validates physical file via validateDocumentFile', () => {
    const filePath = path.join(tempDir, 'valid_template.xlsx');
    fs.writeFileSync(filePath, createMinimalExcelZip());

    const res = validateDocumentFile(filePath, '.xlsx');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.detectedFormat).toBe('EXCEL_XLSX');
      expect(res.value.isValid).toBe(true);
    }

    // Non-existent file
    const missingRes = validateDocumentFile(path.join(tempDir, 'non_existent.xlsx'));
    expect(missingRes.ok).toBe(false);
    if (!missingRes.ok) {
      expect(missingRes.error.code).toBe(ErrorCode.FILE_NOT_FOUND);
    }
  });
});
