/**
 * OpsReport Studio — Template Metadata Inspection & Document Structure Preview
 *
 * Implements bounded, read-only structural inspection for registered Excel (.xlsx)
 * and Word (.docx) master templates (Step 20):
 * - Persisted metadata retrieval from authoritative SQLite registry
 * - Exact version resolution and canonical vault path validation
 * - Cryptographic SHA-256 integrity check against stored baseline
 * - Bounded Excel workbook inspection (worksheets, dimensions, cell grid, candidate headers, formulas)
 * - Bounded Word document inspection (paragraphs, tables, dimensions, candidate tokens, headers/footers)
 * - Lightweight, non-persistent mapping-readiness summaries (strictly suggestions, zero auto-persistence)
 * - 100% Master template immutability guarantee (file is never modified, reserialized, or overwritten)
 *
 * @module storage/vault/template-inspector
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import type Database from 'better-sqlite3';
import PizZip from 'pizzip';
import type {
  TemplateVersionRecord,
  ExcelSheetSummary,
  ExcelCellPreview,
  ExcelWorksheetPreview,
  WordParagraphPreview,
  WordTablePreview,
  TemplateInspectionResult,
  InspectTemplateOptions,
} from '../../shared/types/index.ts';
import { Result, Ok, Err } from '../../shared/types/result.ts';
import { AppError } from '../../shared/errors/app-error.ts';
import { ErrorCode } from '../../shared/errors/error-codes.ts';
import { VaultManager } from './vault-manager.ts';
import { TemplateMetadataRepository } from '../database/repositories/template-metadata-repository.ts';
import { DatabaseManager } from '../database/connection.ts';

// -----------------------------------------------------------------------------
// Bounded Inspection Limits (Section 11.1)
// -----------------------------------------------------------------------------

/** Maximum rows to display in Excel cell preview */
export const MAX_PREVIEW_ROWS = 15;

/** Maximum columns to display in Excel cell preview */
export const MAX_PREVIEW_COLS = 10;

/** Maximum text length for displayed cell content */
export const MAX_CELL_TEXT_LENGTH = 80;

/** Maximum paragraphs to display in Word preview */
export const MAX_PREVIEW_PARAGRAPHS = 25;

/** Maximum tables to inspect in Word preview */
export const MAX_PREVIEW_TABLES = 5;

/** Maximum table rows to display in Word table preview */
export const MAX_PREVIEW_TABLE_ROWS = 10;

/** Maximum table columns to display in Word table preview */
export const MAX_PREVIEW_TABLE_COLS = 8;

/** Candidate placeholder token regex: e.g. {report_date}, {#station_rows}, {/station_rows} */
const PLACEHOLDER_TOKEN_REGEX = /\{([a-zA-Z0-9_#/-]+)\}/g;

// -----------------------------------------------------------------------------
// Helper Utilities for Open XML Parsing
// -----------------------------------------------------------------------------

/**
 * Decodes standard XML entities into plain text.
 */
function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/**
 * Strips all XML tags and decodes entities.
 */
function extractXmlText(xmlSnippet: string): string {
  const stripped = xmlSnippet.replace(/<[^>]+>/g, '');
  return decodeXmlEntities(stripped);
}

/**
 * Converts a 1-based column index to an Excel column letter (e.g. 1 -> 'A', 27 -> 'AA').
 */
export function indexToColLetter(colIndex: number): string {
  let temp = colIndex;
  let letter = '';
  while (temp > 0) {
    const mod = (temp - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    temp = Math.floor((temp - mod) / 26);
  }
  return letter;
}

/**
 * Converts an Excel column letter to a 1-based index (e.g. 'A' -> 1, 'AA' -> 27).
 */
export function colLetterToIndex(colLetter: string): number {
  let index = 0;
  const upper = colLetter.toUpperCase();
  for (let i = 0; i < upper.length; i++) {
    index = index * 26 + (upper.charCodeAt(i) - 64);
  }
  return index;
}

/**
 * Parses an Excel cell reference into column letter, column index, and row number (e.g. 'B12').
 */
export function parseCellAddress(
  address: string
): { colRef: string; colIndex: number; rowIndex: number } | null {
  const match = address.match(/^([A-Za-z]+)(\d+)$/);
  if (!match) return null;
  const colRef = match[1].toUpperCase();
  const colIndex = colLetterToIndex(colRef);
  const rowIndex = parseInt(match[2], 10);
  return { colRef, colIndex, rowIndex };
}

// -----------------------------------------------------------------------------
// TemplateInspector Service
// -----------------------------------------------------------------------------

export class TemplateInspector {
  private static instance: TemplateInspector | null = null;
  private readonly templateRepo: TemplateMetadataRepository;
  private readonly vaultManager: VaultManager;

  public constructor(
    db?: Database.Database,
    vaultManager?: VaultManager,
    templateRepo?: TemplateMetadataRepository
  ) {
    if (templateRepo) {
      this.templateRepo = templateRepo;
    } else {
      const resolvedDb = db ?? DatabaseManager.getInstance().getDatabase();
      this.templateRepo = new TemplateMetadataRepository(resolvedDb);
    }
    this.vaultManager = vaultManager ?? VaultManager.getInstance();
  }

  public static getInstance(
    db?: Database.Database,
    vaultManager?: VaultManager,
    templateRepo?: TemplateMetadataRepository
  ): TemplateInspector {
    if (!TemplateInspector.instance || db || vaultManager || templateRepo) {
      TemplateInspector.instance = new TemplateInspector(db, vaultManager, templateRepo);
    }
    return TemplateInspector.instance;
  }

  public static resetInstance(): void {
    TemplateInspector.instance = null;
  }

  /**
   * Inspects a registered template version in a strictly read-only manner.
   *
   * Invariant: Never modifies, rewrites, saves, or unlinks the master template file.
   */
  public async inspectTemplate(
    options: InspectTemplateOptions
  ): Promise<Result<TemplateInspectionResult, AppError>> {
    try {
      // 1. Retrieve logical template metadata
      const tplRes = this.templateRepo.getTemplateById(options.templateId);
      if (!tplRes.ok) {
        return Err(tplRes.error);
      }
      const template = tplRes.value;
      if (!template) {
        return Err(
          new AppError({
            code: ErrorCode.TEMPLATE_NOT_FOUND,
            userMessage: `Template with identifier "${options.templateId}" was not found in the catalog.`,
            isOperational: true,
          })
        );
      }

      // 2. Resolve target version record
      let version: TemplateVersionRecord | null = null;
      if (options.versionId) {
        const vRes = this.templateRepo.getVersionById(options.versionId);
        version = vRes.ok ? vRes.value : null;
      } else if (template.active_version_id) {
        const vRes = this.templateRepo.getVersionById(template.active_version_id);
        version = vRes.ok ? vRes.value : null;
      } else {
        const vRes = this.templateRepo.getActiveVersion(template.template_id);
        version = vRes.ok ? vRes.value : null;
      }

      if (!version) {
        return Err(
          new AppError({
            code: ErrorCode.TEMPLATE_NOT_FOUND,
            userMessage: `Target version for template "${template.template_name}" could not be resolved.`,
            isOperational: true,
          })
        );
      }

      // 3. Resolve physical vault path
      const vaultPathResult = this.vaultManager.resolveTemplateFileVaultPath(version.file_name);
      if (!vaultPathResult.ok) {
        return Err(vaultPathResult.error);
      }
      const managedPath = vaultPathResult.value;

      // 4. Verify physical asset existence
      if (!fs.existsSync(managedPath)) {
        return Err(
          new AppError({
            code: ErrorCode.FILE_NOT_FOUND,
            userMessage: `The physical master template file for "${template.template_name}" (v${version.version_number}) is missing from the Master Template Vault. Expected location: "${version.file_name}".`,
            isOperational: true,
          })
        );
      }

      // 5. Cryptographic SHA-256 integrity verification
      const integrityCheck = this.vaultManager.verifyVersionIntegrity(version);
      const isIntegrityVerified = integrityCheck.ok && integrityCheck.value.isIntact;
      const integrityMessage = integrityCheck.ok
        ? integrityCheck.value.statusMessage
        : integrityCheck.error.userMessage;

      // 6. Record pre-inspection file hash to guarantee master immutability
      const preInspectionBuffer = fs.readFileSync(managedPath);
      const preHash = crypto.createHash('sha256').update(preInspectionBuffer).digest('hex');

      // 7. Open Open XML container using PizZip in read-only mode
      let zip: PizZip;
      try {
        zip = new PizZip(preInspectionBuffer);
      } catch (err) {
        return Err(
          new AppError({
            code: ErrorCode.TEMPLATE_MALFORMED,
            userMessage: `Failed to open template container. The archive appears corrupted or malformed.`,
            details: { developerMessage: String(err) },
            isOperational: true,
            cause: err,
          })
        );
      }

      // 8. Format-specific bounded structural inspection
      const readinessNotes: string[] = [];
      const unsupportedFeatures: string[] = [];

      let excelPreview: TemplateInspectionResult['excelPreview'] = undefined;
      let wordPreview: TemplateInspectionResult['wordPreview'] = undefined;

      if (template.document_type === 'EXCEL_XLSX') {
        const parsedExcel = this.inspectExcelContainer(
          zip,
          options.worksheetName,
          readinessNotes,
          unsupportedFeatures
        );
        excelPreview = parsedExcel;
      } else {
        const parsedWord = this.inspectWordContainer(zip, readinessNotes, unsupportedFeatures);
        wordPreview = parsedWord;
      }

      // Add general readiness notice (Section 8.4)
      readinessNotes.push(
        'Lightweight inspection preview only. Candidate headers and tokens are suggestions and are NOT saved as persistent mappings.'
      );

      // 9. Post-inspection immutability verification (assertion: master bytes unchanged)
      const postInspectionBuffer = fs.readFileSync(managedPath);
      const postHash = crypto.createHash('sha256').update(postInspectionBuffer).digest('hex');
      if (preHash !== postHash) {
        throw new Error(
          'CRITICAL INVARIANT VIOLATION: Master template file was mutated during read-only inspection!'
        );
      }

      // 10. Assemble structured inspection result
      const result: TemplateInspectionResult = {
        templateId: template.template_id,
        templateName: template.template_name,
        versionId: version.version_id,
        versionNumber: version.version_number,
        categoryId: template.category_id,
        documentType: template.document_type,
        fileName: version.file_name,
        fileSizeBytes: version.file_size_bytes,
        sha256Hash: version.sha256_hash,
        integrityVerified: isIntegrityVerified,
        integrityMessage,
        inspectedAt: new Date().toISOString(),
        excelPreview,
        wordPreview,
        readinessNotes,
        unsupportedFeatures,
      };

      return Ok(result);
    } catch (err) {
      if (err instanceof AppError) {
        return Err(err);
      }
      return Err(
        new AppError({
          code: ErrorCode.INTERNAL_UNEXPECTED,
          userMessage: `An unexpected error occurred while inspecting template: ${err instanceof Error ? err.message : String(err)}`,
          details: { developerMessage: String(err) },
          isOperational: false,
          cause: err,
        })
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Excel Inspection Internals
  // ---------------------------------------------------------------------------

  private inspectExcelContainer(
    zip: PizZip,
    requestedSheetName: string | undefined,
    readinessNotes: string[],
    unsupportedFeatures: string[]
  ): TemplateInspectionResult['excelPreview'] {
    const workbookXmlFile = zip.file('xl/workbook.xml');
    if (!workbookXmlFile) {
      unsupportedFeatures.push('Missing xl/workbook.xml in Open XML package.');
      return { sheets: [] };
    }

    const workbookXml = workbookXmlFile.asText();

    // 1. Parse relationship mapping (rId -> file path)
    const relsMap = new Map<string, string>();
    const relsFile = zip.file('xl/_rels/workbook.xml.rels');
    if (relsFile) {
      const relsXml = relsFile.asText();
      const relRegex = /<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g;
      let relMatch: RegExpExecArray | null;
      while ((relMatch = relRegex.exec(relsXml)) !== null) {
        const id = relMatch[1];
        let target = relMatch[2];
        if (!target.startsWith('xl/')) {
          target = 'xl/' + target.replace(/^\//, '');
        }
        relsMap.set(id, target);
      }
    }

    // 2. Parse shared strings table (xl/sharedStrings.xml)
    const sharedStrings: string[] = [];
    const sharedStringsFile = zip.file('xl/sharedStrings.xml');
    if (sharedStringsFile) {
      const sstXml = sharedStringsFile.asText();
      const siRegex = /<si>(.*?)<\/si>/gs;
      let siMatch: RegExpExecArray | null;
      while ((siMatch = siRegex.exec(sstXml)) !== null) {
        const siContent = siMatch[1];
        const tRegex = /<t[^>]*>([^<]*)<\/t>/g;
        let tMatch: RegExpExecArray | null;
        let text = '';
        while ((tMatch = tRegex.exec(siContent)) !== null) {
          text += tMatch[1];
        }
        sharedStrings.push(decodeXmlEntities(text));
      }
    }

    // 3. Parse sheets from xl/workbook.xml
    const sheetRegex =
      /<sheet[^>]*name="([^"]+)"[^>]*sheetId="([^"]+)"(?:\s+state="([^"]+)")?[^>]*r:id="([^"]+)"/g;
    const rawSheets: Array<{
      name: string;
      sheetId: number;
      state: 'visible' | 'hidden' | 'veryHidden';
      rId: string;
      targetPath: string;
    }> = [];

    let sheetMatch: RegExpExecArray | null;
    let fallbackIndex = 1;
    while ((sheetMatch = sheetRegex.exec(workbookXml)) !== null) {
      const name = decodeXmlEntities(sheetMatch[1]);
      const sheetId = parseInt(sheetMatch[2], 10);
      const rawState = sheetMatch[3] as string | undefined;
      const state: 'visible' | 'hidden' | 'veryHidden' =
        rawState === 'hidden' ? 'hidden' : rawState === 'veryHidden' ? 'veryHidden' : 'visible';
      const rId = sheetMatch[4];
      const targetPath = relsMap.get(rId) ?? `xl/worksheets/sheet${fallbackIndex}.xml`;

      rawSheets.push({ name, sheetId, state, rId, targetPath });
      fallbackIndex++;
    }

    if (rawSheets.length === 0) {
      // Fallback: look for sheets with attributes in different order
      const altSheetRegex = /<sheet\s+([^>]+)\/>/g;
      let altMatch: RegExpExecArray | null;
      let sheetNum = 1;
      while ((altMatch = altSheetRegex.exec(workbookXml)) !== null) {
        const attrs = altMatch[1];
        const nameMatch = attrs.match(/name="([^"]+)"/);
        const sheetIdMatch = attrs.match(/sheetId="([^"]+)"/);
        const stateMatch = attrs.match(/state="([^"]+)"/);
        const rIdMatch = attrs.match(/r:id="([^"]+)"/);

        const name = nameMatch ? decodeXmlEntities(nameMatch[1]) : `Sheet${sheetNum}`;
        const sheetId = sheetIdMatch ? parseInt(sheetIdMatch[1], 10) : sheetNum;
        const state = stateMatch && stateMatch[1] === 'hidden' ? 'hidden' : 'visible';
        const rId = rIdMatch ? rIdMatch[1] : `rId${sheetNum}`;
        const targetPath = relsMap.get(rId) ?? `xl/worksheets/sheet${sheetNum}.xml`;

        rawSheets.push({ name, sheetId, state, rId, targetPath });
        sheetNum++;
      }
    }

    // 4. Generate summaries for all sheets
    const sheets: ExcelSheetSummary[] = [];
    let selectedSheetRaw = rawSheets[0] ?? null;

    if (requestedSheetName) {
      const found = rawSheets.find(
        s => s.name.toLowerCase() === requestedSheetName.trim().toLowerCase()
      );
      if (found) {
        selectedSheetRaw = found;
      }
    }

    for (let i = 0; i < rawSheets.length; i++) {
      const raw = rawSheets[i];
      const sheetFile = zip.file(raw.targetPath);
      let dimension: string | null = null;
      let rowCount = 0;
      let colCount = 0;
      let hasFormulas = false;
      let mergedCellCount = 0;

      if (sheetFile) {
        const sheetXml = sheetFile.asText();

        // Dimension
        const dimMatch = sheetXml.match(/<dimension[^>]*ref="([^"]+)"/);
        if (dimMatch) {
          dimension = dimMatch[1];
          const parts = dimension.split(':');
          if (parts.length === 2) {
            const start = parseCellAddress(parts[0]);
            const end = parseCellAddress(parts[1]);
            if (start && end) {
              rowCount = Math.max(0, end.rowIndex - start.rowIndex + 1);
              colCount = Math.max(0, end.colIndex - start.colIndex + 1);
            }
          } else if (parts.length === 1) {
            rowCount = 1;
            colCount = 1;
          }
        }

        // Formulas
        hasFormulas = /<f[ >]/.test(sheetXml);

        // Merged cells
        const mergeCountMatch = sheetXml.match(/<mergeCells[^>]*count="(\d+)"/);
        if (mergeCountMatch) {
          mergedCellCount = parseInt(mergeCountMatch[1], 10);
        } else {
          const mergeMatches = sheetXml.match(/<mergeCell\b/g);
          mergedCellCount = mergeMatches ? mergeMatches.length : 0;
        }

        // Fallback row count if dimension is absent
        if (rowCount === 0) {
          const rowMatches = sheetXml.match(/<row\b/g);
          rowCount = rowMatches ? rowMatches.length : 0;
        }
      }

      sheets.push({
        name: raw.name,
        sheetId: raw.sheetId,
        index: i + 1,
        state: raw.state,
        dimension,
        rowCount,
        colCount,
        hasFormulas,
        mergedCellCount,
      });
    }

    // 5. Bounded worksheet cell preview for the selected sheet
    let activeSheetPreview: ExcelWorksheetPreview | undefined = undefined;

    if (selectedSheetRaw) {
      const sheetFile = zip.file(selectedSheetRaw.targetPath);
      const sheetSummary = sheets.find(s => s.name === selectedSheetRaw.name) ?? {
        name: selectedSheetRaw.name,
        sheetId: selectedSheetRaw.sheetId,
        index: 1,
        state: selectedSheetRaw.state,
        dimension: null,
        rowCount: 0,
        colCount: 0,
        hasFormulas: false,
        mergedCellCount: 0,
      };

      if (sheetFile) {
        const sheetXml = sheetFile.asText();
        activeSheetPreview = this.parseWorksheetGrid(sheetXml, sheetSummary, sharedStrings);
      }
    }

    // Check for advanced unsupported features
    if (zip.file('xl/pivotTables/pivotTable1.xml')) {
      unsupportedFeatures.push('Workbook contains PivotTables (unsupported for direct mapping).');
    }
    if (zip.file('xl/drawings/drawing1.xml')) {
      readinessNotes.push('Workbook contains embedded graphics or charts.');
    }

    if (sheets.length > 0) {
      readinessNotes.push(`Workbook contains ${sheets.length} inspectable worksheet(s).`);
    }

    return {
      sheets,
      activeSheetPreview,
    };
  }

  /**
   * Parses the bounded cell grid and detects candidate header rows for an Excel worksheet.
   */
  private parseWorksheetGrid(
    sheetXml: string,
    sheetSummary: ExcelSheetSummary,
    sharedStrings: string[]
  ): ExcelWorksheetPreview {
    // Collect merged cells for reference
    const mergedRanges: string[] = [];
    const mergeCellRegex = /<mergeCell[^>]*ref="([^"]+)"/g;
    let mergeMatch: RegExpExecArray | null;
    while ((mergeMatch = mergeCellRegex.exec(sheetXml)) !== null) {
      mergedRanges.push(mergeMatch[1].toUpperCase());
    }

    const isCellMerged = (address: string): boolean => {
      const upper = address.toUpperCase();
      return mergedRanges.some(m => {
        const parts = m.split(':');
        if (parts.length === 2) {
          const start = parseCellAddress(parts[0]);
          const end = parseCellAddress(parts[1]);
          const target = parseCellAddress(upper);
          if (start && end && target) {
            return (
              target.rowIndex >= start.rowIndex &&
              target.rowIndex <= end.rowIndex &&
              target.colIndex >= start.colIndex &&
              target.colIndex <= end.colIndex
            );
          }
        }
        return m === upper;
      });
    };

    // Parse rows inside <sheetData>
    const previewRows: Array<{ rowNumber: number; cells: ExcelCellPreview[] }> = [];
    const rowRegex = /<row[^>]*r="(\d+)"[^>]*>(.*?)<\/row>/gs;
    let rowMatch: RegExpExecArray | null;

    let totalRowsCounted = 0;
    let maxColObserved = 0;

    while ((rowMatch = rowRegex.exec(sheetXml)) !== null) {
      const rowNum = parseInt(rowMatch[1], 10);
      const rowContent = rowMatch[2];
      totalRowsCounted++;

      // If we are within bounded row limits, parse cells
      if (previewRows.length < MAX_PREVIEW_ROWS) {
        const cells: ExcelCellPreview[] = [];
        const cellRegex = /<c\s+([^>]+)(?:>(.*?)<\/c>|\/>)/gs;
        let cellMatch: RegExpExecArray | null;

        while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
          const attrs = cellMatch[1];
          const inner = cellMatch[2] ?? '';

          const rMatch = attrs.match(/r="([A-Za-z]+\d+)"/);
          if (!rMatch) continue;
          const address = rMatch[1].toUpperCase();
          const parsed = parseCellAddress(address);
          if (!parsed) continue;

          maxColObserved = Math.max(maxColObserved, parsed.colIndex);

          // Bound columns
          if (parsed.colIndex > MAX_PREVIEW_COLS) {
            continue;
          }

          const tMatch = attrs.match(/t="([^"]+)"/);
          const rawType = tMatch ? tMatch[1] : 'n';

          // Formula
          const fMatch = inner.match(/<f[^>]*>([^<]*)<\/f>/);
          const isFormula = !!fMatch;
          const formula = fMatch ? decodeXmlEntities(fMatch[1]) : undefined;

          // Value
          let value = '';
          const vMatch = inner.match(/<v[^>]*>([^<]*)<\/v>/);
          const isMatch = inner.match(/<is><t[^>]*>([^<]*)<\/t><\/is>/);

          if (rawType === 's' && vMatch) {
            const strIndex = parseInt(vMatch[1], 10);
            value = sharedStrings[strIndex] ?? '';
          } else if (rawType === 'b' && vMatch) {
            value = vMatch[1] === '1' ? 'TRUE' : 'FALSE';
          } else if (rawType === 'inlineStr' && isMatch) {
            value = decodeXmlEntities(isMatch[1]);
          } else if (vMatch) {
            value = decodeXmlEntities(vMatch[1]);
          } else if (formula) {
            value = `=${formula}`;
          }

          // Truncate cell text if length exceeds limit
          if (value.length > MAX_CELL_TEXT_LENGTH) {
            value = value.substring(0, MAX_CELL_TEXT_LENGTH - 3) + '...';
          }

          cells.push({
            row: rowNum,
            col: parsed.colIndex,
            colRef: parsed.colRef,
            address,
            value,
            rawType,
            isFormula,
            formula,
            isMerged: isCellMerged(address),
          });
        }

        previewRows.push({ rowNumber: rowNum, cells });
      }
    }

    // Candidate Header Row Heuristic (Section 6.6):
    // Inspect the first 5 rows for the first row with >= 2 non-empty text cells
    let candidateHeaderRow: ExcelWorksheetPreview['candidateHeaderRow'] = undefined;

    for (const r of previewRows) {
      const textCells = r.cells.filter(c => c.value.trim().length > 0 && !c.isFormula);
      if (textCells.length >= 2) {
        candidateHeaderRow = {
          rowNumber: r.rowNumber,
          headers: textCells.map(c => ({
            colRef: c.colRef,
            text: c.value,
          })),
        };
        break;
      }
    }

    const totalRowsInSheet = Math.max(totalRowsCounted, sheetSummary.rowCount);
    const totalColsInSheet = Math.max(maxColObserved, sheetSummary.colCount);

    const isTruncated = totalRowsInSheet > MAX_PREVIEW_ROWS || totalColsInSheet > MAX_PREVIEW_COLS;
    const truncationReason = isTruncated
      ? `Display bounded to first ${Math.min(totalRowsInSheet, MAX_PREVIEW_ROWS)} rows and ${Math.min(totalColsInSheet, MAX_PREVIEW_COLS)} columns (total: ${totalRowsInSheet} rows, ${totalColsInSheet} columns).`
      : undefined;

    return {
      sheetSummary,
      candidateHeaderRow,
      previewRows,
      totalRowsInSheet,
      totalColsInSheet,
      isTruncated,
      truncationReason,
    };
  }

  // ---------------------------------------------------------------------------
  // Word Inspection Internals
  // ---------------------------------------------------------------------------

  private inspectWordContainer(
    zip: PizZip,
    readinessNotes: string[],
    unsupportedFeatures: string[]
  ): TemplateInspectionResult['wordPreview'] {
    const docXmlFile = zip.file('word/document.xml');
    if (!docXmlFile) {
      unsupportedFeatures.push('Missing word/document.xml in Open XML package.');
      return {
        paragraphCount: 0,
        tableCount: 0,
        sectionCount: 0,
        hasHeaders: false,
        hasFooters: false,
        hasImages: false,
        paragraphs: [],
        tables: [],
        candidateTokens: [],
        isTruncated: false,
      };
    }

    const docXml = docXmlFile.asText();

    // 1. Check headers and footers
    const allFiles = Object.keys(zip.files);
    const hasHeaders = allFiles.some(f => /^word\/header\d+\.xml$/i.test(f));
    const hasFooters = allFiles.some(f => /^word\/footer\d+\.xml$/i.test(f));
    const hasImages =
      allFiles.some(f => f.startsWith('word/media/')) || docXml.includes('<w:drawing');

    // 2. Sections
    const sectionMatches = docXml.match(/<w:sectPr\b/g);
    const sectionCount = sectionMatches ? sectionMatches.length : 1;

    // 3. Paragraphs and candidate tokens
    const paragraphs: WordParagraphPreview[] = [];
    const candidateTokensSet = new Set<string>();

    // Strip table elements when inspecting document body paragraphs so table cell paragraphs
    // are not conflated with top-level document paragraphs.
    const bodyXmlWithoutTables = docXml.replace(/<w:tbl\b[\s\S]*?<\/w:tbl>/gs, '');

    const pRegex = /<w:p\b[^>]*>(.*?)<\/w:p>/gs;
    let pMatch: RegExpExecArray | null;
    let pIndex = 1;

    while ((pMatch = pRegex.exec(bodyXmlWithoutTables)) !== null) {
      const pInner = pMatch[1];

      // Extract all <w:t> inside this paragraph (natively stitching split runs)
      const tRegex = /<w:t\b[^>]*>([^<]*)<\/w:t>/g;
      let tMatch: RegExpExecArray | null;
      let pText = '';
      while ((tMatch = tRegex.exec(pInner)) !== null) {
        pText += tMatch[1];
      }

      pText = decodeXmlEntities(pText).trim();

      // Check for candidate tokens (e.g. {token_name})
      const foundTokens: string[] = [];
      let tokenMatch: RegExpExecArray | null;
      const regexCopy = new RegExp(PLACEHOLDER_TOKEN_REGEX);
      while ((tokenMatch = regexCopy.exec(pText)) !== null) {
        const token = tokenMatch[0];
        foundTokens.push(token);
        candidateTokensSet.add(token);
      }

      if (paragraphs.length < MAX_PREVIEW_PARAGRAPHS) {
        // Truncate overly long paragraphs for preview
        const displayText = pText.length > 200 ? pText.substring(0, 197) + '...' : pText;

        paragraphs.push({
          index: pIndex,
          text: displayText,
          hasCandidateTokens: foundTokens.length > 0,
          candidateTokens: foundTokens,
        });
      }

      pIndex++;
    }

    // 4. Tables and table cell inspection
    const tables: WordTablePreview[] = [];
    const tblRegex = /<w:tbl\b[^>]*>(.*?)<\/w:tbl>/gs;
    let tblMatch: RegExpExecArray | null;
    let tblIndex = 1;

    while ((tblMatch = tblRegex.exec(docXml)) !== null) {
      const tblInner = tblMatch[1];

      if (tables.length < MAX_PREVIEW_TABLES) {
        const rows: Array<{ rowIndex: number; cells: string[] }> = [];
        const trRegex = /<w:tr\b[^>]*>(.*?)<\/w:tr>/gs;
        let trMatch: RegExpExecArray | null;
        let rIndex = 1;
        let maxCols = 0;
        let hasMergedCells = false;

        while ((trMatch = trRegex.exec(tblInner)) !== null) {
          const trInner = trMatch[1];

          if (rows.length < MAX_PREVIEW_TABLE_ROWS) {
            const cells: string[] = [];
            const tcRegex = /<w:tc\b[^>]*>(.*?)<\/w:tc>/gs;
            let tcMatch: RegExpExecArray | null;

            while ((tcMatch = tcRegex.exec(trInner)) !== null) {
              const tcInner = tcMatch[1];

              if (tcInner.includes('<w:gridSpan') || tcInner.includes('<w:vMerge')) {
                hasMergedCells = true;
              }

              if (cells.length < MAX_PREVIEW_TABLE_COLS) {
                const cellText = extractXmlText(tcInner).trim();
                let tcTokenMatch: RegExpExecArray | null;
                const tcRegexCopy = new RegExp(PLACEHOLDER_TOKEN_REGEX);
                while ((tcTokenMatch = tcRegexCopy.exec(cellText)) !== null) {
                  candidateTokensSet.add(tcTokenMatch[0]);
                }
                const displayCellText =
                  cellText.length > 60 ? cellText.substring(0, 57) + '...' : cellText;
                cells.push(displayCellText);
              }
            }

            maxCols = Math.max(maxCols, cells.length);
            rows.push({ rowIndex: rIndex, cells });
          }

          rIndex++;
        }

        const totalRows = (tblInner.match(/<w:tr\b/g) || []).length;
        const isTableTruncated =
          totalRows > MAX_PREVIEW_TABLE_ROWS || maxCols > MAX_PREVIEW_TABLE_COLS;

        tables.push({
          tableIndex: tblIndex,
          rowCount: totalRows,
          colCount: maxCols,
          hasMergedCells,
          rows,
          isTruncated: isTableTruncated,
        });
      }

      tblIndex++;
    }

    const totalParagraphs = pIndex - 1;
    const totalTables = tblIndex - 1;
    const isTruncated =
      totalParagraphs > MAX_PREVIEW_PARAGRAPHS || totalTables > MAX_PREVIEW_TABLES;
    const truncationReason = isTruncated
      ? `Display bounded to first ${Math.min(totalParagraphs, MAX_PREVIEW_PARAGRAPHS)} paragraphs and ${Math.min(totalTables, MAX_PREVIEW_TABLES)} tables.`
      : undefined;

    const candidateTokens = Array.from(candidateTokensSet);

    if (totalParagraphs > 0) {
      readinessNotes.push(
        `Document contains ${totalParagraphs} paragraph(s) and ${totalTables} table(s).`
      );
    }
    if (candidateTokens.length > 0) {
      readinessNotes.push(
        `Detected ${candidateTokens.length} candidate placeholder token(s): ${candidateTokens.slice(0, 5).join(', ')}${candidateTokens.length > 5 ? '...' : ''}.`
      );
    }
    if (hasHeaders || hasFooters) {
      readinessNotes.push('Document contains custom header and/or footer package parts.');
    }
    if (hasImages) {
      readinessNotes.push('Document contains embedded images or graphic drawing elements.');
    }

    return {
      paragraphCount: totalParagraphs,
      tableCount: totalTables,
      sectionCount,
      hasHeaders,
      hasFooters,
      hasImages,
      paragraphs,
      tables,
      candidateTokens,
      isTruncated,
      truncationReason,
    };
  }
}
