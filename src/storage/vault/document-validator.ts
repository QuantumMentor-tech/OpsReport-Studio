/**
 * OpsReport Studio — Open XML Document Validator & Container Security Guard
 *
 * Implements bounded container inspection, magic byte verification, format detection,
 * Open XML structure validation, decompression safety, and macro quarantine
 * for imported Excel (.xlsx) and Word (.docx) templates (Step 18).
 *
 * @module storage/vault/document-validator
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import PizZip from 'pizzip';
import type { ReportDocumentFormat } from '../../shared/types/categories.ts';
import type { TemplateValidationDetails } from '../../shared/types/templates.ts';
import { Result, Ok, Err } from '../../shared/types/result.ts';
import { AppError } from '../../shared/errors/app-error.ts';
import { ErrorCode } from '../../shared/errors/error-codes.ts';
import { normalizeTemplateExtension } from './path-security.ts';

/** Maximum permitted compressed template file size: 25 MB */
export const MAX_TEMPLATE_FILE_SIZE = 25 * 1024 * 1024;

/** Maximum permitted aggregate uncompressed byte size: 100 MB */
export const MAX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024;

/** Maximum permitted decompression expansion ratio (15:1) */
export const MAX_DECOMPRESSION_RATIO = 15.0;

/** Maximum permitted entries inside an Open XML archive */
export const MAX_ARCHIVE_ENTRIES = 1000;

/** Standard ZIP container header: PK\x03\x04 (0x50 0x4B 0x03 0x04) */
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

/** Legacy OLE Compound Document header: \xD0\xCF\x11\xE0 (legacy .xls/.doc or encrypted) */
const OLE_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0]);

/**
 * Validates an in-memory document buffer against Open XML format specifications,
 * container integrity rules, and security boundaries.
 */
export function validateDocumentBuffer(
  buffer: Buffer,
  expectedExtension?: string
): Result<TemplateValidationDetails, AppError> {
  const issues: string[] = [];

  // 1. Empty buffer check
  if (!buffer || buffer.length === 0) {
    return Err(
      new AppError({
        code: ErrorCode.TEMPLATE_MALFORMED,
        userMessage: 'The selected template file is empty (0 bytes).',
        isOperational: true,
      })
    );
  }

  // 2. Maximum file size check
  if (buffer.length > MAX_TEMPLATE_FILE_SIZE) {
    const sizeMb = (buffer.length / (1024 * 1024)).toFixed(1);
    return Err(
      new AppError({
        code: ErrorCode.VALIDATION_FAILED,
        userMessage: `Selected file (${sizeMb} MB) exceeds maximum allowed template size of 25 MB.`,
        isOperational: true,
      })
    );
  }

  // 3. Magic byte inspection
  if (buffer.length >= 4 && buffer.subarray(0, 4).equals(OLE_MAGIC)) {
    return Err(
      new AppError({
        code: ErrorCode.TEMPLATE_UNSUPPORTED_FORMAT,
        userMessage:
          'Legacy binary Office formats (.xls / .doc) and password-protected encrypted files are not supported. Please open the file in Microsoft Office and save it as an unencrypted, standard .xlsx or .docx document.',
        isOperational: true,
      })
    );
  }

  if (buffer.length < 4 || !buffer.subarray(0, 4).equals(ZIP_MAGIC)) {
    return Err(
      new AppError({
        code: ErrorCode.TEMPLATE_MALFORMED,
        userMessage:
          'File does not have a valid Open XML ZIP container header. Selected file may be corrupted, truncated, or an unrelated file type.',
        isOperational: true,
      })
    );
  }

  // 4. Archive container extraction & structural inspection via PizZip
  let zip: PizZip;
  try {
    zip = new PizZip(buffer);
  } catch (err) {
    return Err(
      new AppError({
        code: ErrorCode.TEMPLATE_MALFORMED,
        userMessage:
          'Failed to read Open XML ZIP container. The file appears to be corrupted or truncated.',
        details: { developerMessage: String(err) },
        isOperational: true,
        cause: err,
      })
    );
  }

  const entries = Object.keys(zip.files);

  // 5. Entry count limit
  if (entries.length > MAX_ARCHIVE_ENTRIES) {
    return Err(
      new AppError({
        code: ErrorCode.SECURITY_VIOLATION,
        userMessage: `Archive entry count (${entries.length}) exceeds safety limit (${MAX_ARCHIVE_ENTRIES}).`,
        isOperational: true,
      })
    );
  }

  if (entries.length === 0) {
    return Err(
      new AppError({
        code: ErrorCode.TEMPLATE_MALFORMED,
        userMessage: 'Open XML container is empty; no document parts found.',
        isOperational: true,
      })
    );
  }

  // 6. Archive traversal & decompression ratio safety check
  let totalUncompressedBytes = 0;
  for (const entryName of entries) {
    // Path traversal in entry names
    if (
      entryName.includes('..') ||
      entryName.startsWith('/') ||
      entryName.startsWith('\\') ||
      entryName.includes(':\\')
    ) {
      return Err(
        new AppError({
          code: ErrorCode.SECURITY_VIOLATION,
          userMessage: 'Security violation: Archive contains forbidden path traversal entry names.',
          isOperational: true,
        })
      );
    }

    const file = zip.files[entryName];
    if (file && !file.dir) {
      try {
        const fileBuf = file.asNodeBuffer();
        totalUncompressedBytes += fileBuf.length;
      } catch {
        // Skip unreadable entry
      }
    }
  }

  if (totalUncompressedBytes > MAX_UNCOMPRESSED_BYTES) {
    return Err(
      new AppError({
        code: ErrorCode.SECURITY_VIOLATION,
        userMessage: `Decompressed size (${(totalUncompressedBytes / (1024 * 1024)).toFixed(1)} MB) exceeds 100 MB safety limit.`,
        isOperational: true,
      })
    );
  }

  const ratio = totalUncompressedBytes / buffer.length;
  if (ratio > MAX_DECOMPRESSION_RATIO && totalUncompressedBytes > 5 * 1024 * 1024) {
    return Err(
      new AppError({
        code: ErrorCode.SECURITY_VIOLATION,
        userMessage: `Decompression expansion ratio (${ratio.toFixed(1)}:1) exceeds 15:1 safety ceiling.`,
        isOperational: true,
      })
    );
  }

  // 7. Macro Quarantine Policy (DEC-005, ADR-OPSREPORT-002)
  const hasMacros = entries.some(name => name.toLowerCase().includes('vbaproject.bin'));
  if (hasMacros) {
    return Err(
      new AppError({
        code: ErrorCode.TEMPLATE_UNSUPPORTED_FORMAT,
        userMessage:
          'Macro-enabled templates (.xlsm / .docm) are prohibited by security policy. Please remove all VBA macros and resave as a standard .xlsx or .docx document.',
        isOperational: true,
      })
    );
  }

  // 8. Required Open XML core package components
  const hasContentTypes = entries.some(name => name.toLowerCase() === '[content_types].xml');
  const hasRels = entries.some(
    name => name.toLowerCase() === '_rels/.rels' || name.toLowerCase() === '_rels\\.rels'
  );

  if (!hasContentTypes) {
    return Err(
      new AppError({
        code: ErrorCode.TEMPLATE_MALFORMED,
        userMessage: 'Invalid Open XML package: missing core [Content_Types].xml package entry.',
        isOperational: true,
      })
    );
  }

  if (!hasRels) {
    return Err(
      new AppError({
        code: ErrorCode.TEMPLATE_MALFORMED,
        userMessage: 'Invalid Open XML package: missing root _rels/.rels package relationships.',
        isOperational: true,
      })
    );
  }

  // 9. Format-specific package component detection
  const hasWorkbook = entries.some(name => name.toLowerCase() === 'xl/workbook.xml');
  const hasDocument = entries.some(name => name.toLowerCase() === 'word/document.xml');

  let detectedFormat: ReportDocumentFormat;

  if (expectedExtension) {
    const normExt = normalizeTemplateExtension(expectedExtension);
    if (normExt === '.xlsx') {
      if (hasDocument && !hasWorkbook) {
        return Err(
          new AppError({
            code: ErrorCode.TEMPLATE_UNSUPPORTED_FORMAT,
            userMessage:
              'Mismatched format: File has an .xlsx extension but contains Word document components (word/document.xml).',
            isOperational: true,
          })
        );
      }
      if (!hasWorkbook) {
        return Err(
          new AppError({
            code: ErrorCode.TEMPLATE_MALFORMED,
            userMessage:
              'Invalid Excel template: missing required xl/workbook.xml Open XML component.',
            isOperational: true,
          })
        );
      }
      detectedFormat = 'EXCEL_XLSX';
    } else {
      // normExt === '.docx'
      if (hasWorkbook && !hasDocument) {
        return Err(
          new AppError({
            code: ErrorCode.TEMPLATE_UNSUPPORTED_FORMAT,
            userMessage:
              'Mismatched format: File has a .docx extension but contains Excel workbook components (xl/workbook.xml).',
            isOperational: true,
          })
        );
      }
      if (!hasDocument) {
        return Err(
          new AppError({
            code: ErrorCode.TEMPLATE_MALFORMED,
            userMessage:
              'Invalid Word template: missing required word/document.xml Open XML component.',
            isOperational: true,
          })
        );
      }
      detectedFormat = 'WORD_DOCX';
    }
  } else {
    // Pure content-based detection
    if (hasWorkbook && !hasDocument) {
      detectedFormat = 'EXCEL_XLSX';
    } else if (hasDocument && !hasWorkbook) {
      detectedFormat = 'WORD_DOCX';
    } else {
      return Err(
        new AppError({
          code: ErrorCode.TEMPLATE_MALFORMED,
          userMessage:
            'Unable to determine Open XML document format. The package contains neither or conflicting Excel and Word components.',
          isOperational: true,
        })
      );
    }
  }

  // 10. Compute SHA-256 hash
  const sha256Hash = crypto.createHash('sha256').update(buffer).digest('hex');

  return Ok({
    isValid: true,
    detectedFormat,
    fileSizeBytes: buffer.length,
    uncompressedBytes: totalUncompressedBytes,
    entryCount: entries.length,
    sha256Hash,
    hasMacros: false,
    issues,
  });
}

/**
 * Validates a document file located at an accessible filesystem path.
 */
export function validateDocumentFile(
  filePath: string,
  expectedExtension?: string
): Result<TemplateValidationDetails, AppError> {
  try {
    if (!fs.existsSync(filePath)) {
      return Err(
        new AppError({
          code: ErrorCode.FILE_NOT_FOUND,
          userMessage: `Template file not found at path: "${filePath}".`,
          isOperational: true,
        })
      );
    }

    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      return Err(
        new AppError({
          code: ErrorCode.VALIDATION_FAILED,
          userMessage: `Path "${filePath}" exists but is not a regular file.`,
          isOperational: true,
        })
      );
    }

    if (stat.size === 0) {
      return Err(
        new AppError({
          code: ErrorCode.TEMPLATE_MALFORMED,
          userMessage: 'The selected template file is empty (0 bytes).',
          isOperational: true,
        })
      );
    }

    if (stat.size > MAX_TEMPLATE_FILE_SIZE) {
      const sizeMb = (stat.size / (1024 * 1024)).toFixed(1);
      return Err(
        new AppError({
          code: ErrorCode.VALIDATION_FAILED,
          userMessage: `Selected file (${sizeMb} MB) exceeds maximum allowed template size of 25 MB.`,
          isOperational: true,
        })
      );
    }

    const buffer = fs.readFileSync(filePath);
    const ext = expectedExtension ?? filePath.slice(filePath.lastIndexOf('.'));
    return validateDocumentBuffer(buffer, ext);
  } catch (err) {
    if (err instanceof AppError) {
      return Err(err);
    }
    return Err(
      new AppError({
        code: ErrorCode.FILE_ACCESS_DENIED,
        userMessage: 'Failed to read template file for validation.',
        details: { developerMessage: String(err) },
        isOperational: true,
        cause: err,
      })
    );
  }
}
