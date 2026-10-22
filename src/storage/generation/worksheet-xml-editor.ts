/**
 * OpsReport Studio — Open XML Worksheet XML Editor (Step 27)
 *
 * Provides targeted, structure-preserving Open XML cell read and write operations
 * using pure PizZip archive manipulation:
 * - Worksheet relationship and path resolution
 * - Shared Strings Table (xl/sharedStrings.xml) parsing, deduplication, and serialization
 * - Targeted cell writing preserving existing styles (s="..."), font, fill, and borders
 * - ECMA-376 compliant row and column ordering
 * - Post-write verification reading back cell values
 * - Formula-injection immunity (text always serialized as shared strings)
 *
 * @module storage/generation/worksheet-xml-editor
 */

import crypto from 'node:crypto';
import PizZip from 'pizzip';
import { parseCellAddress, indexToColLetter } from '../vault/template-inspector.ts';
import type {
  MergedCellRange,
  FormulaCellRecord,
  PageSetupSnapshot,
  DrawingMediaSnapshot,
} from '../../shared/types/generation.ts';

export interface CellWriteTarget {
  /** Target cell reference e.g. "B2", "AA10" */
  readonly cellRef: string;
  /** Value representation to write */
  readonly value: string | number | boolean | null;
  /** Storage type in Open XML: 's' (shared string), 'n' (number), 'b' (boolean), 'blank' */
  readonly type: 's' | 'n' | 'b' | 'blank';
}

export interface ReadCellResult {
  readonly cellRef: string;
  readonly value: string | number | boolean | null;
  readonly rawValue: string | null;
  readonly type?: string;
  readonly styleIndex?: string;
}

/**
 * Escapes standard XML characters.
 */
export function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Decodes standard XML entities into plain text.
 */
export function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

interface ParsedCellData {
  cellRef: string;
  colIndex: number;
  styleIndex?: string;
  type?: string;
  val?: string;
  formula?: string;
}

interface ParsedRowData {
  rowNum: number;
  rowAttrs: string; // attributes other than r="..." or preserved attributes
  cells: Map<string, ParsedCellData>;
}

export class WorksheetXmlEditor {
  /**
   * Returns all worksheet names declared in the workbook.
   */
  public static getWorksheetNames(zip: PizZip): string[] {
    const wbFile = zip.file('xl/workbook.xml');
    if (!wbFile) return [];
    const xml = wbFile.asText();
    const names: string[] = [];
    const sheetRegex = /<sheet[^>]*name="([^"]+)"/g;
    let match: RegExpExecArray | null;
    while ((match = sheetRegex.exec(xml)) !== null) {
      names.push(decodeXmlEntities(match[1]));
    }
    return names;
  }

  /**
   * Resolves the internal package path (e.g. "xl/worksheets/sheet1.xml") for a given sheet name.
   */
  public static resolveWorksheetPath(zip: PizZip, sheetName: string): string | null {
    const wbFile = zip.file('xl/workbook.xml');
    if (!wbFile) return null;
    const wbXml = wbFile.asText();

    // 1. Build relationship map from xl/_rels/workbook.xml.rels
    const relsMap = new Map<string, string>();
    const relsFile = zip.file('xl/_rels/workbook.xml.rels');
    if (relsFile) {
      const relsXml = relsFile.asText();
      const relRegex = /<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g;
      let relMatch: RegExpExecArray | null;
      while ((relMatch = relRegex.exec(relsXml)) !== null) {
        let target = relMatch[2];
        if (!target.startsWith('xl/')) {
          target = 'xl/' + target.replace(/^\//, '');
        }
        relsMap.set(relMatch[1], target);
      }
    }

    // 2. Find matching sheet in xl/workbook.xml (case-insensitive)
    const targetNameNorm = sheetName.trim().toLowerCase();
    const sheetRegex = /<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g;
    let match: RegExpExecArray | null;
    while ((match = sheetRegex.exec(wbXml)) !== null) {
      const name = decodeXmlEntities(match[1]).trim().toLowerCase();
      if (name === targetNameNorm) {
        const rId = match[2];
        return relsMap.get(rId) ?? null;
      }
    }

    // Fallback: look for attributes in reverse order (r:id before name)
    const altRegex = /<sheet[^>]*r:id="([^"]+)"[^>]*name="([^"]+)"/g;
    while ((match = altRegex.exec(wbXml)) !== null) {
      const name = decodeXmlEntities(match[2]).trim().toLowerCase();
      if (name === targetNameNorm) {
        const rId = match[1];
        return relsMap.get(rId) ?? null;
      }
    }

    return null;
  }

  /**
   * Reads and parses all entries from xl/sharedStrings.xml.
   */
  public static readSharedStrings(zip: PizZip): {
    strings: string[];
    stringMap: Map<string, number>;
  } {
    const strings: string[] = [];
    const stringMap = new Map<string, number>();

    const sstFile = zip.file('xl/sharedStrings.xml');
    if (!sstFile) {
      return { strings, stringMap };
    }

    const sstXml = sstFile.asText();
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
      const decoded = decodeXmlEntities(text);
      const index = strings.length;
      strings.push(decoded);
      if (!stringMap.has(decoded)) {
        stringMap.set(decoded, index);
      }
    }

    return { strings, stringMap };
  }

  /**
   * Serializes the shared strings array into xl/sharedStrings.xml and ensures package relationships.
   */
  public static writeSharedStrings(zip: PizZip, strings: string[]): void {
    let sstXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">`;
    for (const str of strings) {
      const preserveAttr = /[ \t\r\n]/.test(str) ? ' xml:space="preserve"' : '';
      sstXml += `<si><t${preserveAttr}>${escapeXml(str)}</t></si>`;
    }
    sstXml += '</sst>';
    zip.file('xl/sharedStrings.xml', sstXml);

    // Ensure relationships in xl/_rels/workbook.xml.rels
    const relsFile = zip.file('xl/_rels/workbook.xml.rels');
    if (relsFile) {
      let relsXml = relsFile.asText();
      if (!relsXml.includes('Target="sharedStrings.xml"')) {
        const nextIdMatch = relsXml.match(/Id="rId(\d+)"/g);
        let maxId = 10;
        if (nextIdMatch) {
          for (const m of nextIdMatch) {
            const num = parseInt(m.replace(/\D/g, ''), 10);
            if (num > maxId) maxId = num;
          }
        }
        const newRelId = `rId${maxId + 1}`;
        relsXml = relsXml.replace(
          '</Relationships>',
          `  <Relationship Id="${newRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>\n</Relationships>`
        );
        zip.file('xl/_rels/workbook.xml.rels', relsXml);
      }
    }

    // Ensure Content_Types has sharedStrings override
    const ctFile = zip.file('[Content_Types].xml');
    if (ctFile) {
      let ctXml = ctFile.asText();
      if (!ctXml.includes('PartName="/xl/sharedStrings.xml"')) {
        ctXml = ctXml.replace(
          '</Types>',
          `  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>\n</Types>`
        );
        zip.file('[Content_Types].xml', ctXml);
      }
    }
  }

  /**
   * Applies targeted cell writes to a worksheet in the ZIP archive.
   * Preserves cell style indices (s="..."), font, borders, and row structure.
   */
  public static applyCellWrites(
    zip: PizZip,
    sheetPath: string,
    writes: readonly CellWriteTarget[]
  ): void {
    const sheetFile = zip.file(sheetPath);
    if (!sheetFile) {
      throw new Error(`Worksheet file "${sheetPath}" not found in Open XML package.`);
    }

    const xml = sheetFile.asText();

    // 1. Parse existing <sheetData> into row/cell data structures
    const rowsMap = new Map<number, ParsedRowData>();
    const sheetDataMatch = xml.match(/<sheetData>(.*?)<\/sheetData>/s);
    const hasSelfClosingSheetData = /<sheetData\s*\/>/.test(xml);

    if (sheetDataMatch) {
      const sheetDataInner = sheetDataMatch[1];
      const rowRegex = /<row\s+([^>]*?)>(.*?)<\/row>/gs;
      let rMatch: RegExpExecArray | null;

      while ((rMatch = rowRegex.exec(sheetDataInner)) !== null) {
        const fullAttrs = rMatch[1];
        const rowContent = rMatch[2];
        const rNumMatch = fullAttrs.match(/\br="(\d+)"/);
        if (!rNumMatch) continue;
        const rowNum = parseInt(rNumMatch[1], 10);

        const cellsMap = new Map<string, ParsedCellData>();
        const cellRegex = /<c\s+([^>]*?)(?:\/>|>(.*?)<\/c>)/gs;
        let cMatch: RegExpExecArray | null;

        while ((cMatch = cellRegex.exec(rowContent)) !== null) {
          const cAttrs = cMatch[1];
          const cInner = cMatch[2] ?? '';
          const refMatch = cAttrs.match(/\br="([A-Za-z0-9]+)"/);
          if (!refMatch) continue;
          const cellRef = refMatch[1].toUpperCase();
          const parsedAddr = parseCellAddress(cellRef);
          if (!parsedAddr) continue;

          const sMatch = cAttrs.match(/\bs="(\d+)"/);
          const tMatch = cAttrs.match(/\bt="([^"]+)"/);
          const vMatch = cInner.match(/<v>([^<]*)<\/v>/);
          const fMatch = cInner.match(/<f[^>]*>([^<]*)<\/f>/);

          cellsMap.set(cellRef, {
            cellRef,
            colIndex: parsedAddr.colIndex,
            styleIndex: sMatch ? sMatch[1] : undefined,
            type: tMatch ? tMatch[1] : undefined,
            val: vMatch ? vMatch[1] : undefined,
            formula: fMatch ? fMatch[1] : undefined,
          });
        }

        rowsMap.set(rowNum, {
          rowNum,
          rowAttrs: fullAttrs,
          cells: cellsMap,
        });
      }
    }

    // 2. Apply writes
    for (const write of writes) {
      const parsedAddr = parseCellAddress(write.cellRef);
      if (!parsedAddr) continue;
      const { rowIndex, colIndex } = parsedAddr;
      const cellRef = write.cellRef.toUpperCase();

      let rowData = rowsMap.get(rowIndex);
      if (!rowData) {
        rowData = {
          rowNum: rowIndex,
          rowAttrs: `r="${rowIndex}"`,
          cells: new Map(),
        };
        rowsMap.set(rowIndex, rowData);
      }

      const existingCell = rowData.cells.get(cellRef);
      let styleIndex = existingCell?.styleIndex;

      // Inherit column cell style from earlier template row if newly generated cell has no style
      if (!styleIndex) {
        for (let r = rowIndex - 1; r >= 1; r--) {
          const priorRow = rowsMap.get(r);
          if (priorRow) {
            const priorCell = priorRow.cells.get(`${parsedAddr.colRef}${r}`);
            if (priorCell?.styleIndex) {
              styleIndex = priorCell.styleIndex;
              break;
            }
          }
        }
      }

      let cellType: string | undefined = undefined;
      let valStr: string | undefined = undefined;

      if (write.type === 's') {
        cellType = 's';
        valStr = String(write.value);
      } else if (write.type === 'n') {
        cellType = undefined; // In Open XML, omitted type or 'n' is number
        valStr = String(write.value);
      } else if (write.type === 'b') {
        cellType = 'b';
        valStr = write.value ? '1' : '0';
      } else {
        // blank / null
        cellType = undefined;
        valStr = undefined;
      }

      rowData.cells.set(cellRef, {
        cellRef,
        colIndex,
        styleIndex,
        type: cellType,
        val: valStr,
        formula: undefined, // Clear any prior formula when mapped value is written
      });
    }

    // 3. Serialize updated <sheetData> with ECMA-376 sorting (rows ascending, cells ascending)
    const sortedRowNums = Array.from(rowsMap.keys()).sort((a, b) => a - b);
    let newSheetDataXml = '<sheetData>';

    for (const rNum of sortedRowNums) {
      const row = rowsMap.get(rNum)!;
      const sortedCells = Array.from(row.cells.values()).sort((a, b) => a.colIndex - b.colIndex);

      let cellsXml = '';
      for (const cell of sortedCells) {
        cellsXml += `<c r="${cell.cellRef}"`;
        if (cell.styleIndex !== undefined) {
          cellsXml += ` s="${cell.styleIndex}"`;
        }
        if (cell.type !== undefined) {
          cellsXml += ` t="${cell.type}"`;
        }
        const hasFormula = cell.formula !== undefined && cell.formula !== '';
        const hasVal = cell.val !== undefined && cell.val !== '';
        if (hasFormula || hasVal) {
          cellsXml += '>';
          if (hasFormula) {
            cellsXml += `<f>${escapeXml(cell.formula!)}</f>`;
          }
          if (hasVal) {
            cellsXml += `<v>${escapeXml(cell.val!)}</v>`;
          }
          cellsXml += '</c>';
        } else {
          cellsXml += '/>';
        }
      }

      newSheetDataXml += `<row ${row.rowAttrs}>${cellsXml}</row>`;
    }
    newSheetDataXml += '</sheetData>';

    // 4. Update worksheet XML
    let updatedXml = xml;
    if (hasSelfClosingSheetData) {
      updatedXml = updatedXml.replace(/<sheetData\s*\/>/, newSheetDataXml);
    } else if (sheetDataMatch) {
      updatedXml = updatedXml.replace(/<sheetData>.*?<\/sheetData>/s, newSheetDataXml);
    } else {
      // Append before </worksheet>
      updatedXml = updatedXml.replace('</worksheet>', `${newSheetDataXml}\n</worksheet>`);
    }

    zip.file(sheetPath, updatedXml);
  }

  /**
   * Reads raw cell content and resolved value from a worksheet in the ZIP archive.
   */
  public static readCellRaw(
    zip: PizZip,
    sheetPath: string,
    cellRef: string,
    sharedStrings?: string[]
  ): ReadCellResult | null {
    const sheetFile = zip.file(sheetPath);
    if (!sheetFile) return null;

    const xml = sheetFile.asText();
    const targetRef = cellRef.toUpperCase();

    // Look for <c r="{targetRef}" ...>...</c> or <c r="{targetRef}" .../>
    const cellRegex = new RegExp(
      `<c\\s+([^>]*?\\br="${targetRef}"[^>]*?)(?:\\/>|>(.*?)<\\/c>)`,
      's'
    );
    const match = cellRegex.exec(xml);
    if (!match) return null;

    const attrs = match[1];
    const inner = match[2] ?? '';

    const sMatch = attrs.match(/\bs="(\d+)"/);
    const tMatch = attrs.match(/\bt="([^"]+)"/);
    const vMatch = inner.match(/<v>([^<]*)<\/v>/);

    const styleIndex = sMatch ? sMatch[1] : undefined;
    const type = tMatch ? tMatch[1] : undefined;
    const rawValue = vMatch ? decodeXmlEntities(vMatch[1]) : null;

    let value: string | number | boolean | null = rawValue;

    if (type === 's' && rawValue !== null) {
      const idx = parseInt(rawValue, 10);
      if (sharedStrings && idx >= 0 && idx < sharedStrings.length) {
        value = sharedStrings[idx];
      }
    } else if (type === 'b' && rawValue !== null) {
      value = rawValue === '1';
    } else if (type === undefined || type === 'n') {
      if (rawValue !== null && rawValue.trim() !== '') {
        const num = Number(rawValue);
        if (!isNaN(num)) {
          value = num;
        }
      }
    }

    return {
      cellRef: targetRef,
      value,
      rawValue,
      type,
      styleIndex,
    };
  }

  /**
   * Inspects a worksheet to detect if rows in range [startRow, startRow + requiredRows - 1]
   * collide with static footer rows, formulas, or unmapped static text content.
   */
  public static inspectRowCapacityConflict(
    zip: PizZip,
    sheetPath: string,
    startRow: number,
    requiredRows: number,
    _mappedColLetters: ReadonlySet<string>,
    sharedStrings?: string[]
  ): { hasConflict: boolean; conflictingRow?: number; conflictingCell?: string; reason?: string } {
    const sheetFile = zip.file(sheetPath);
    if (!sheetFile) return { hasConflict: false };

    const xml = sheetFile.asText();
    const sheetDataMatch = xml.match(/<sheetData>(.*?)<\/sheetData>/s);
    if (!sheetDataMatch) return { hasConflict: false };

    const sheetDataInner = sheetDataMatch[1];
    const rowRegex = /<row\s+([^>]*?)>(.*?)<\/row>/gs;
    let rMatch: RegExpExecArray | null;

    const endRow = startRow + requiredRows - 1;

    while ((rMatch = rowRegex.exec(sheetDataInner)) !== null) {
      const fullAttrs = rMatch[1];
      const rowContent = rMatch[2];
      const rNumMatch = fullAttrs.match(/\br="(\d+)"/);
      if (!rNumMatch) continue;
      const rowNum = parseInt(rNumMatch[1], 10);

      // Only check rows within candidate expansion range [startRow, endRow]
      if (rowNum < startRow || rowNum > endRow) continue;

      const cellRegex = /<c\s+([^>]*?)(?:\/>|>(.*?)<\/c>)/gs;
      let cMatch: RegExpExecArray | null;

      while ((cMatch = cellRegex.exec(rowContent)) !== null) {
        const cAttrs = cMatch[1];
        const cInner = cMatch[2] ?? '';
        const refMatch = cAttrs.match(/\br="([A-Za-z0-9]+)"/);
        if (!refMatch) continue;
        const cellRef = refMatch[1].toUpperCase();
        const parsedAddr = parseCellAddress(cellRef);
        if (!parsedAddr) continue;

        // Check for formulas <f>...</f>
        const hasFormula = /<f[^>]*>/.test(cInner);
        if (hasFormula) {
          return {
            hasConflict: true,
            conflictingRow: rowNum,
            conflictingCell: cellRef,
            reason: `Target row ${rowNum} contains formula cell "${cellRef}". Station row expansion would collide with template calculation.`,
          };
        }

        // Check for static footer/header/label text in template
        const tMatch = cAttrs.match(/\bt="([^"]+)"/);
        const vMatch = cInner.match(/<v>([^<]*)<\/v>/);
        let cellText = '';
        if (tMatch && tMatch[1] === 's' && vMatch && sharedStrings) {
          const idx = parseInt(vMatch[1], 10);
          if (idx >= 0 && idx < sharedStrings.length) {
            cellText = sharedStrings[idx];
          }
        } else if (vMatch) {
          cellText = vMatch[1];
        }

        const trimmed = cellText.trim().toLowerCase();
        const isFooterLabel =
          trimmed.includes('total') ||
          trimmed.includes('summary') ||
          trimmed.includes('subtotal') ||
          trimmed.includes('average') ||
          trimmed.includes('signature') ||
          trimmed.includes('approved by') ||
          trimmed.includes('prepared by');

        if (isFooterLabel) {
          return {
            hasConflict: true,
            conflictingRow: rowNum,
            conflictingCell: cellRef,
            reason: `Target row ${rowNum} contains static template summary/footer "${cellText}". Station row expansion would collide with footer.`,
          };
        }
      }
    }

    return { hasConflict: false };
  }

  /**
   * Extracts merged cell ranges from a worksheet XML file in the ZIP archive.
   */
  public static extractMergedCellRanges(zip: PizZip, sheetPath: string): MergedCellRange[] {
    const sheetFile = zip.file(sheetPath);
    if (!sheetFile) return [];

    const xml = sheetFile.asText();
    const mergeCellsMatch = xml.match(/<mergeCells[^>]*>(.*?)<\/mergeCells>/s);
    if (!mergeCellsMatch) return [];

    const inner = mergeCellsMatch[1];
    const regex = /<mergeCell\s+[^>]*?ref="([A-Za-z0-9:]+)"/g;
    const ranges: MergedCellRange[] = [];
    let match: RegExpExecArray | null;

    while ((match = regex.exec(inner)) !== null) {
      const ref = match[1].toUpperCase();
      const parts = ref.split(':');
      const startCell = parts[0];
      const endCell = parts[1] || parts[0];

      const startAddr = parseCellAddress(startCell);
      const endAddr = parseCellAddress(endCell);
      if (!startAddr || !endAddr) continue;

      const startCol = Math.min(startAddr.colIndex, endAddr.colIndex);
      const endCol = Math.max(startAddr.colIndex, endAddr.colIndex);
      const startRow = Math.min(startAddr.rowIndex, endAddr.rowIndex);
      const endRow = Math.max(startAddr.rowIndex, endAddr.rowIndex);

      const anchorCell = `${indexToColLetter(startCol)}${startRow}`;
      const coveredCells: string[] = [];

      for (let r = startRow; r <= endRow; r++) {
        for (let c = startCol; c <= endCol; c++) {
          const currentRef = `${indexToColLetter(c)}${r}`;
          if (currentRef !== anchorCell) {
            coveredCells.push(currentRef);
          }
        }
      }

      ranges.push({
        ref,
        startCol,
        startRow,
        endCol,
        endRow,
        anchorCell,
        coveredCells,
      });
    }

    return ranges;
  }

  /**
   * Extracts formula cell definitions from a worksheet XML file in the ZIP archive.
   */
  public static extractFormulaCells(
    zip: PizZip,
    sheetPath: string,
    sharedStrings?: string[]
  ): FormulaCellRecord[] {
    const sheetFile = zip.file(sheetPath);
    if (!sheetFile) return [];

    const xml = sheetFile.asText();
    const sheetDataMatch = xml.match(/<sheetData>(.*?)<\/sheetData>/s);
    if (!sheetDataMatch) return [];

    const sheetDataInner = sheetDataMatch[1];
    const cellRegex = /<c\s+([^>]*?)>(.*?)<\/c>/gs;
    const records: FormulaCellRecord[] = [];
    let match: RegExpExecArray | null;

    while ((match = cellRegex.exec(sheetDataInner)) !== null) {
      const attrs = match[1];
      const inner = match[2];

      const fMatch = inner.match(/<f[^>]*>([^<]*)<\/f>/);
      if (!fMatch) continue;

      const refMatch = attrs.match(/\br="([A-Za-z0-9]+)"/);
      if (!refMatch) continue;

      const cellRef = refMatch[1].toUpperCase();
      const formula = decodeXmlEntities(fMatch[1]);

      const vMatch = inner.match(/<v>([^<]*)<\/v>/);
      const tMatch = attrs.match(/\bt="([^"]+)"/);
      const type = tMatch ? tMatch[1] : undefined;
      let val: string | number | boolean | null = null;

      if (vMatch) {
        const raw = decodeXmlEntities(vMatch[1]);
        if (type === 's' && sharedStrings) {
          const idx = parseInt(raw, 10);
          val = sharedStrings[idx] ?? raw;
        } else if (type === 'b') {
          val = raw === '1';
        } else {
          const num = Number(raw);
          val = !isNaN(num) && raw.trim() !== '' ? num : raw;
        }
      }

      records.push({
        cellRef,
        formula,
        value: val,
      });
    }

    return records;
  }

  /**
   * Extracts page setup, print options, margins, and breaks from a worksheet XML file.
   */
  public static extractPageSetup(
    zip: PizZip,
    sheetPath: string,
    sheetName: string
  ): PageSetupSnapshot | undefined {
    const sheetFile = zip.file(sheetPath);
    if (!sheetFile) return undefined;

    const xml = sheetFile.asText();

    const hasPageSetup = /<pageSetup\b/.test(xml);
    const hasPageMargins = /<pageMargins\b/.test(xml);
    const hasPrintOptions = /<printOptions\b/.test(xml);
    const hasHeaderFooter = /<headerFooter\b/.test(xml);
    const hasRowBreaks = /<rowBreaks\b/.test(xml);
    const hasColBreaks = /<colBreaks\b/.test(xml);

    if (
      !hasPageSetup &&
      !hasPageMargins &&
      !hasPrintOptions &&
      !hasHeaderFooter &&
      !hasRowBreaks &&
      !hasColBreaks
    ) {
      return undefined;
    }

    let paperSize: string | undefined;
    let orientation: string | undefined;
    let fitToWidth: string | undefined;
    let fitToHeight: string | undefined;
    let scale: string | undefined;

    const setupMatch = xml.match(/<pageSetup\s+([^>]*?)(?:\/|>)/);
    if (setupMatch) {
      const attrs = setupMatch[1];
      const pMatch = attrs.match(/\bpaperSize="([^"]+)"/);
      if (pMatch) paperSize = pMatch[1];
      const oMatch = attrs.match(/\borientation="([^"]+)"/);
      if (oMatch) orientation = oMatch[1];
      const fwMatch = attrs.match(/\bfitToWidth="([^"]+)"/);
      if (fwMatch) fitToWidth = fwMatch[1];
      const fhMatch = attrs.match(/\bfitToHeight="([^"]+)"/);
      if (fhMatch) fitToHeight = fhMatch[1];
      const sMatch = attrs.match(/\bscale="([^"]+)"/);
      if (sMatch) scale = sMatch[1];
    }

    let margins: PageSetupSnapshot['margins'] | undefined;
    const marginsMatch = xml.match(/<pageMargins\s+([^>]*?)(?:\/|>)/);
    if (marginsMatch) {
      const attrs = marginsMatch[1];
      margins = {
        left: attrs.match(/\bleft="([^"]+)"/)?.[1],
        right: attrs.match(/\bright="([^"]+)"/)?.[1],
        top: attrs.match(/\btop="([^"]+)"/)?.[1],
        bottom: attrs.match(/\bbottom="([^"]+)"/)?.[1],
        header: attrs.match(/\bheader="([^"]+)"/)?.[1],
        footer: attrs.match(/\bfooter="([^"]+)"/)?.[1],
      };
    }

    let printOptions: PageSetupSnapshot['printOptions'] | undefined;
    const printOptionsMatch = xml.match(/<printOptions\s+([^>]*?)(?:\/|>)/);
    if (printOptionsMatch) {
      const attrs = printOptionsMatch[1];
      printOptions = {
        gridLines: attrs.match(/\bgridLines="1"/)?.[0] !== undefined,
        headings: attrs.match(/\bheadings="1"/)?.[0] !== undefined,
        horizontalCentered: attrs.match(/\bhorizontalCentered="1"/)?.[0] !== undefined,
        verticalCentered: attrs.match(/\bverticalCentered="1"/)?.[0] !== undefined,
      };
    }

    let headerFooter: PageSetupSnapshot['headerFooter'] | undefined;
    const hfMatch = xml.match(/<headerFooter[^>]*>(.*?)<\/headerFooter>/s);
    if (hfMatch) {
      const inner = hfMatch[1];
      const rawOddHeader = inner.match(/<oddHeader>([^<]*)<\/oddHeader>/)?.[1];
      const rawOddFooter = inner.match(/<oddFooter>([^<]*)<\/oddFooter>/)?.[1];
      const rawEvenHeader = inner.match(/<evenHeader>([^<]*)<\/evenHeader>/)?.[1];
      const rawEvenFooter = inner.match(/<evenFooter>([^<]*)<\/evenFooter>/)?.[1];

      headerFooter = {
        oddHeader: rawOddHeader ? decodeXmlEntities(rawOddHeader) : undefined,
        oddFooter: rawOddFooter ? decodeXmlEntities(rawOddFooter) : undefined,
        evenHeader: rawEvenHeader ? decodeXmlEntities(rawEvenHeader) : undefined,
        evenFooter: rawEvenFooter ? decodeXmlEntities(rawEvenFooter) : undefined,
      };
    }

    let manualRowBreaksCount = 0;
    const rowBreaksMatch = xml.match(/<rowBreaks\s+[^>]*?count="(\d+)"/);
    if (rowBreaksMatch) {
      manualRowBreaksCount = parseInt(rowBreaksMatch[1], 10);
    } else {
      const brkMatches = xml.match(/<rowBreaks[^>]*>.*?<\/rowBreaks>/s);
      if (brkMatches) {
        manualRowBreaksCount = (brkMatches[0].match(/<brk\b/g) || []).length;
      }
    }

    let manualColBreaksCount = 0;
    const colBreaksMatch = xml.match(/<colBreaks\s+[^>]*?count="(\d+)"/);
    if (colBreaksMatch) {
      manualColBreaksCount = parseInt(colBreaksMatch[1], 10);
    } else {
      const brkMatches = xml.match(/<colBreaks[^>]*>.*?<\/colBreaks>/s);
      if (brkMatches) {
        manualColBreaksCount = (brkMatches[0].match(/<brk\b/g) || []).length;
      }
    }

    return {
      sheetName,
      paperSize,
      orientation,
      fitToWidth,
      fitToHeight,
      scale,
      margins,
      printOptions,
      headerFooter,
      manualRowBreaksCount,
      manualColBreaksCount,
    };
  }

  /**
   * Extracts drawing media, binary image assets, and relationship counts.
   */
  public static extractDrawingMediaSnapshot(zip: PizZip): DrawingMediaSnapshot {
    let drawingPartCount = 0;
    const mediaFiles: { name: string; sizeBytes: number; sha256Hash: string }[] = [];
    let sheetDrawingRelCount = 0;

    for (const relativePath of Object.keys(zip.files)) {
      if (/^xl\/drawings\/drawing\d+\.xml$/i.test(relativePath)) {
        drawingPartCount++;
      } else if (relativePath.startsWith('xl/media/')) {
        const fileObj = zip.file(relativePath);
        if (fileObj) {
          const bytes = fileObj.asUint8Array();
          const hash = crypto.createHash('sha256').update(bytes).digest('hex');
          mediaFiles.push({
            name: relativePath,
            sizeBytes: bytes.length,
            sha256Hash: hash,
          });
        }
      } else if (relativePath.startsWith('xl/worksheets/_rels/')) {
        const fileObj = zip.file(relativePath);
        if (fileObj) {
          const text = fileObj.asText();
          const matches = text.match(/Type="[^"]*\/relationships\/drawing"/g);
          if (matches) {
            sheetDrawingRelCount += matches.length;
          }
        }
      }
    }

    mediaFiles.sort((a, b) => a.name.localeCompare(b.name));

    return {
      drawingPartCount,
      mediaFiles,
      sheetDrawingRelCount,
    };
  }

  /**
   * Extracts defined print areas and print title rows/cols from xl/workbook.xml.
   */
  public static extractPrintAreasAndTitles(
    zip: PizZip,
    sheetNames: readonly string[]
  ): { printAreas: Map<string, string>; printTitles: Map<string, string> } {
    const printAreas = new Map<string, string>();
    const printTitles = new Map<string, string>();

    const wbFile = zip.file('xl/workbook.xml');
    if (!wbFile) return { printAreas, printTitles };

    const xml = wbFile.asText();
    const definedNamesMatch = xml.match(/<definedNames>(.*?)<\/definedNames>/s);
    if (!definedNamesMatch) return { printAreas, printTitles };

    const regex = /<definedName\s+([^>]*?)>([^<]*)<\/definedName>/gs;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(definedNamesMatch[1])) !== null) {
      const attrs = match[1];
      const rawVal = decodeXmlEntities(match[2]);

      const nameMatch = attrs.match(/\bname="([^"]+)"/);
      if (!nameMatch) continue;
      const defName = nameMatch[1];

      const sheetIdMatch = attrs.match(/\blocalSheetId="(\d+)"/);
      let sheetKey = '';
      if (sheetIdMatch) {
        const sIdx = parseInt(sheetIdMatch[1], 10);
        sheetKey = sheetNames[sIdx] ?? `SheetIndex_${sIdx}`;
      } else {
        const formulaSheetMatch = rawVal.match(/^'?([^'!]+)'?!/);
        sheetKey = formulaSheetMatch ? formulaSheetMatch[1] : 'Workbook';
      }

      if (defName === '_xlnm.Print_Area') {
        printAreas.set(sheetKey, rawVal);
      } else if (defName === '_xlnm.Print_Titles') {
        printTitles.set(sheetKey, rawVal);
      }
    }

    return { printAreas, printTitles };
  }

  /**
   * Extracts worksheet metadata (names, sheetIds, visibility, relationship targets).
   */
  public static extractSheetMetadata(zip: PizZip): {
    name: string;
    sheetId: number;
    state: 'visible' | 'hidden';
    rId: string;
    targetPath: string;
  }[] {
    const relsFile = zip.file('xl/_rels/workbook.xml.rels');
    const relsMap = new Map<string, string>();
    if (relsFile) {
      const relsXml = relsFile.asText();
      const relRegex = /<Relationship\s+([^>]*?)\/>/gs;
      let rMatch: RegExpExecArray | null;
      while ((rMatch = relRegex.exec(relsXml)) !== null) {
        const attrs = rMatch[1];
        const idMatch = attrs.match(/\bId="([^"]+)"/);
        const targetMatch = attrs.match(/\bTarget="([^"]+)"/);
        if (idMatch && targetMatch) {
          relsMap.set(idMatch[1], targetMatch[1]);
        }
      }
    }

    const wbFile = zip.file('xl/workbook.xml');
    if (!wbFile) return [];

    const wbXml = wbFile.asText();
    const sheetRegex = /<sheet\s+([^>]*?)\/>/gs;
    const sheets: {
      name: string;
      sheetId: number;
      state: 'visible' | 'hidden';
      rId: string;
      targetPath: string;
    }[] = [];
    let sMatch: RegExpExecArray | null;

    while ((sMatch = sheetRegex.exec(wbXml)) !== null) {
      const attrs = sMatch[1];
      const nameMatch = attrs.match(/\bname="([^"]+)"/);
      const sheetIdMatch = attrs.match(/\bsheetId="(\d+)"/);
      const rIdMatch = attrs.match(/\br:id="([^"]+)"/);
      const stateMatch = attrs.match(/\bstate="([^"]+)"/);

      if (nameMatch && sheetIdMatch && rIdMatch) {
        const name = nameMatch[1];
        const sheetId = parseInt(sheetIdMatch[1], 10);
        const rId = rIdMatch[1];
        const state = stateMatch && stateMatch[1] === 'hidden' ? 'hidden' : 'visible';
        let rawTarget = relsMap.get(rId) || `worksheets/sheet${sheetId}.xml`;
        if (rawTarget.startsWith('/')) {
          rawTarget = rawTarget.slice(1);
        } else if (!rawTarget.startsWith('xl/')) {
          rawTarget = `xl/${rawTarget}`;
        }

        sheets.push({
          name,
          sheetId,
          state,
          rId,
          targetPath: rawTarget,
        });
      }
    }

    return sheets;
  }
}
