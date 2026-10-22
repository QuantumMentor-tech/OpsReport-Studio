/**
 * OpsReport Studio — Word Table & Repeating Data Engine (Step 32)
 *
 * Structure-aware table discovery, table-cell placeholder replacement,
 * fixed cell coordinate mapping, repeating-row generation, and formatting preservation.
 *
 * All transformations are performed in-memory on OpenXML without touching master templates.
 * Preserves table properties (<w:tblPr>), grid (<w:tblGrid>), row properties (<w:trPr>),
 * cell properties (<w:tcPr>), borders, shading, column widths, row heights, cantSplit,
 * tblHeader, cell margins, and run/paragraph formatting.
 *
 * @module storage/generation/word-table-engine
 */

import { escapeWordText, parseWordPart, paragraphText, findTokens } from './word-placeholder-engine.ts';

export interface ExtractedCell {
  readonly colIndex: number; // 1-based
  readonly rawXml: string;
  readonly start: number; // start index in rowXml
  readonly end: number; // end index in rowXml
  readonly tcPrXml: string | null;
  readonly paragraphs: string[];
  readonly text: string;
  readonly gridSpan: number;
  readonly vMerge: 'restart' | 'continue' | null;
}

export interface ExtractedRow {
  readonly rowIndex: number; // 1-based
  readonly rawXml: string;
  readonly start: number; // start index in tblXml
  readonly end: number; // end index in tblXml
  readonly trPrXml: string | null;
  readonly isHeader: boolean;
  readonly cells: ExtractedCell[];
}

export interface ExtractedTable {
  readonly tableIndex: number; // 1-based
  readonly rawXml: string;
  readonly start: number; // start index in docXml
  readonly end: number; // end index in docXml
  readonly tblPrXml: string | null;
  readonly tblGridXml: string | null;
  readonly rows: ExtractedRow[];
}

export interface RepeatingRecordItem {
  readonly stationId?: string;
  readonly stationName?: string;
  readonly sequenceOrder?: number;
  readonly [key: string]: unknown;
}

export interface RepeatingRowPlan {
  readonly tableIndex: number;
  readonly rowIndex: number;
  readonly fieldId: string;
  readonly targetCoordinate: string;
}

export interface TableVerificationResult {
  readonly valid: boolean;
  readonly code?: string;
  readonly message?: string;
}

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/**
 * Extracts all top-level tables from document.xml.
 * Properly tracks nesting depth to avoid conflating nested tables with top-level tables.
 */
export function extractTables(docXml: string): ExtractedTable[] {
  const tables: ExtractedTable[] = [];
  const tagRegex = /<\/?w:tbl\b[^>]*>/g;
  let match: RegExpExecArray | null;
  let depth = 0;
  let tblStart = -1;
  let tableIndex = 1;

  while ((match = tagRegex.exec(docXml)) !== null) {
    const isClose = match[0].startsWith('</');
    if (!isClose) {
      if (depth === 0) {
        tblStart = match.index;
      }
      depth++;
    } else {
      depth--;
      if (depth === 0 && tblStart !== -1) {
        const tblEnd = match.index + match[0].length;
        const tblXml = docXml.slice(tblStart, tblEnd);
        const rows = extractRows(tblXml, tableIndex);
        const tblPrMatch = tblXml.match(/<w:tblPr\b[\s\S]*?<\/w:tblPr>/);
        const tblGridMatch = tblXml.match(/<w:tblGrid\b[\s\S]*?<\/w:tblGrid>/);
        tables.push({
          tableIndex,
          rawXml: tblXml,
          start: tblStart,
          end: tblEnd,
          tblPrXml: tblPrMatch ? tblPrMatch[0] : null,
          tblGridXml: tblGridMatch ? tblGridMatch[0] : null,
          rows,
        });
        tableIndex++;
        tblStart = -1;
      }
    }
  }
  return tables;
}

/**
 * Extracts rows from a table XML string.
 * Depth-aware so rows in nested tables are not mixed into parent table rows.
 */
export function extractRows(tblXml: string, tableIndex: number): ExtractedRow[] {
  const rows: ExtractedRow[] = [];
  const tagRegex = /<\/?w:(tbl|tr)\b[^>]*>/g;
  let match: RegExpExecArray | null;
  let tblDepth = 0;
  let trDepth = 0;
  let trStart = -1;
  let rowIndex = 1;

  while ((match = tagRegex.exec(tblXml)) !== null) {
    const isClose = match[0].startsWith('</');
    const isTbl = match[0].startsWith('<w:tbl') || match[0].startsWith('</w:tbl');
    const isTr = match[0].startsWith('<w:tr') || match[0].startsWith('</w:tr');

    if (isTbl) {
      if (isClose) tblDepth--;
      else tblDepth++;
      continue;
    }

    if (isTr) {
      if (tblDepth === 1) {
        if (!isClose) {
          if (trDepth === 0) trStart = match.index;
          trDepth++;
        } else {
          trDepth--;
          if (trDepth === 0 && trStart !== -1) {
            const trEnd = match.index + match[0].length;
            const rowXml = tblXml.slice(trStart, trEnd);
            const trPrMatch = rowXml.match(/<w:trPr\b[\s\S]*?<\/w:trPr>/);
            const isHeader = trPrMatch ? /<w:tblHeader\b/.test(trPrMatch[0]) : false;
            const cells = extractCells(rowXml, tableIndex, rowIndex);
            rows.push({
              rowIndex,
              rawXml: rowXml,
              start: trStart,
              end: trEnd,
              trPrXml: trPrMatch ? trPrMatch[0] : null,
              isHeader,
              cells,
            });
            rowIndex++;
            trStart = -1;
          }
        }
      }
    }
  }
  return rows;
}

/**
 * Extracts cells from a row XML string.
 * Depth-aware so cells in nested tables are not mixed into parent row cells.
 */
export function extractCells(rowXml: string, _tableIndex?: number, _rowIndex?: number): ExtractedCell[] {
  const cells: ExtractedCell[] = [];
  const tagRegex = /<\/?w:(tbl|tr|tc)\b[^>]*>/g;
  let match: RegExpExecArray | null;
  let tblDepth = 0;
  let trDepth = 0;
  let tcDepth = 0;
  let tcStart = -1;
  let colIndex = 1;

  while ((match = tagRegex.exec(rowXml)) !== null) {
    const isClose = match[0].startsWith('</');
    const isTbl = match[0].startsWith('<w:tbl') || match[0].startsWith('</w:tbl');
    const isTr = match[0].startsWith('<w:tr') || match[0].startsWith('</w:tr');
    const isTc = match[0].startsWith('<w:tc') || match[0].startsWith('</w:tc');

    if (isTbl) {
      if (isClose) tblDepth--;
      else tblDepth++;
      continue;
    }
    if (isTr) {
      if (isClose) trDepth--;
      else trDepth++;
      continue;
    }

    if (isTc) {
      if (tblDepth === 0 && trDepth === 1) {
        if (!isClose) {
          if (tcDepth === 0) tcStart = match.index;
          tcDepth++;
        } else {
          tcDepth--;
          if (tcDepth === 0 && tcStart !== -1) {
            const tcEnd = match.index + match[0].length;
            const cellXml = rowXml.slice(tcStart, tcEnd);
            const tcPrMatch = cellXml.match(/<w:tcPr\b[\s\S]*?<\/w:tcPr>/);
            const tcPr = tcPrMatch ? tcPrMatch[0] : null;

            let gridSpan = 1;
            if (tcPr) {
              const gsMatch = tcPr.match(/<w:gridSpan\b[^>]*w:val="(\d+)"/);
              if (gsMatch) gridSpan = parseInt(gsMatch[1], 10);
            }

            let vMerge: 'restart' | 'continue' | null = null;
            if (tcPr) {
              const vmMatch = tcPr.match(/<w:vMerge\b([^>]*)\/?>/);
              if (vmMatch) {
                const valMatch = vmMatch[1].match(/w:val="([^"]+)"/);
                vMerge = valMatch && valMatch[1] === 'restart' ? 'restart' : 'continue';
              }
            }

            // Extract visible text
            const textMatches = cellXml.match(/<w:t\b[^>]*>([^<]*)<\/w:t>/g) || [];
            let cellText = '';
            for (const tm of textMatches) {
              const inner = tm.replace(/<[^>]+>/g, '');
              cellText += decodeXmlEntities(inner);
            }

            const paraMatches = cellXml.match(/<w:p\b[\s\S]*?<\/w:p>/g) || [];

            cells.push({
              colIndex,
              rawXml: cellXml,
              start: tcStart,
              end: tcEnd,
              tcPrXml: tcPr,
              paragraphs: paraMatches,
              text: cellText,
              gridSpan,
              vMerge,
            });
            colIndex++;
            tcStart = -1;
          }
        }
      }
    }
  }
  return cells;
}

/**
 * Replaces placeholders inside table cells across all tables in docXml.
 * Preserves cell properties, borders, shading, multiple paragraphs, and run styles.
 */
export function replaceTableCellPlaceholders(
  docXml: string,
  values: ReadonlyMap<string, string>
): { xml: string; counts: Map<string, number> } {
  const counts = new Map<string, number>();
  const tables = extractTables(docXml);
  if (tables.length === 0) return { xml: docXml, counts };

  let result = docXml;
  // Replace tables in reverse order so string offsets remain valid
  for (let tIdx = tables.length - 1; tIdx >= 0; tIdx--) {
    const table = tables[tIdx];
    let tblXml = table.rawXml;

    // Check rows in reverse order
    for (let rIdx = table.rows.length - 1; rIdx >= 0; rIdx--) {
      const row = table.rows[rIdx];
      let rowXml = row.rawXml;

      // Check cells in reverse order
      for (let cIdx = row.cells.length - 1; cIdx >= 0; cIdx--) {
        const cell = row.cells[cIdx];
        const cellText = cell.text;

        // Check if this cell contains any token from values
        const tokens = findTokens(cellText).filter(t => values.has(t.token));
        if (tokens.length === 0) continue;

        // Perform safe replacement inside this cell
        const cellPart = parseWordPart(cell.rawXml);
        const edits: Array<{ start: number; end: number; text: string }> = [];

        for (const p of cellPart.paragraphs) {
          const pText = paragraphText(p);
          const pTokens = findTokens(pText).filter(t => values.has(t.token));
          if (pTokens.length === 0) continue;

          // Track node character mapping
          const nodeOf: number[] = [];
          for (const idx of p.sequence) {
            if (idx < 0) nodeOf.push(-1);
            else for (let i = 0; i < p.nodes[idx].text.length; i++) nodeOf.push(idx);
          }

          const outs = p.nodes.map(() => '');
          let mi = 0;
          for (let i = 0; i < pText.length; i++) {
            const cur = pTokens[mi];
            if (cur && i >= cur.start && i < cur.end) {
              if (i === cur.start) {
                const repVal = values.get(cur.token) as string;
                outs[nodeOf[i]] += repVal;
                counts.set(cur.token, (counts.get(cur.token) ?? 0) + 1);
              }
              if (i === cur.end - 1) mi += 1;
              continue;
            }
            if (nodeOf[i] >= 0) outs[nodeOf[i]] += pText[i];
          }

          p.nodes.forEach((node, i) => {
            if (outs[i] !== node.text) {
              edits.push({ start: node.openStart, end: node.closeEnd, text: outs[i] });
            }
          });
        }

        if (edits.length > 0) {
          edits.sort((a, b) => b.start - a.start);
          let newCellXml = cell.rawXml;
          for (const e of edits) {
            newCellXml =
              newCellXml.slice(0, e.start) +
              `<w:t xml:space="preserve">${escapeWordText(e.text)}</w:t>` +
              newCellXml.slice(e.end);
          }
          rowXml = rowXml.slice(0, cell.start) + newCellXml + rowXml.slice(cell.end);
        }
      }

      if (rowXml !== row.rawXml) {
        tblXml = tblXml.slice(0, row.start) + rowXml + tblXml.slice(row.end);
      }
    }

    if (tblXml !== table.rawXml) {
      result = result.slice(0, table.start) + tblXml + result.slice(table.end);
    }
  }

  return { xml: result, counts };
}

/**
 * Replaces the content of a specific table cell identified by 1-based coordinates T{t}:R{r}:C{c}.
 * Preserves cell properties (<w:tcPr>), borders, shading, and paragraph properties (<w:pPr>).
 */
export function replaceTableCellCoordinate(
  docXml: string,
  tableIndex: number,
  rowIndex: number,
  colIndex: number,
  value: string
): string {
  const tables = extractTables(docXml);
  const table = tables.find(t => t.tableIndex === tableIndex);
  if (!table) return docXml;

  const row = table.rows.find(r => r.rowIndex === rowIndex);
  if (!row) return docXml;

  const cell = row.cells.find(c => c.colIndex === colIndex);
  if (!cell) return docXml;

  // Extract tcPr
  const tcPr = cell.tcPrXml ?? '';

  // Extract first paragraph's pPr and rPr if present to preserve run formatting
  let pPr = '';
  let rPr = '';
  const firstP = cell.paragraphs[0];
  if (firstP) {
    const pPrMatch = firstP.match(/<w:pPr\b[\s\S]*?<\/w:pPr>/);
    if (pPrMatch) pPr = pPrMatch[0];
    const rPrMatch = firstP.match(/<w:rPr\b[\s\S]*?<\/w:rPr>/);
    if (rPrMatch) rPr = rPrMatch[0];
  }

  const escaped = escapeWordText(value);
  const newCellXml = `<w:tc>${tcPr}<w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">${escaped}</w:t></w:r></w:p></w:tc>`;

  const newRowXml = row.rawXml.slice(0, cell.start) + newCellXml + row.rawXml.slice(cell.end);
  const newTblXml = table.rawXml.slice(0, row.start) + newRowXml + table.rawXml.slice(row.end);
  return docXml.slice(0, table.start) + newTblXml + docXml.slice(table.end);
}

/**
 * Expands repeating rows in a table from an authorized record collection.
 * - row at prototypeRowIndex serves as the template row (with trPr, tcPr, styling).
 * - for empty collections: prototype row is removed, preserving table header rows and non-repeating rows.
 * - for N records: N rows are cloned in strict sequence order, populating mapped fields and tokens.
 * - All row properties (cantSplit, tblHeader, height), cell properties, and formatting are preserved.
 */
export function expandRepeatingRows(
  docXml: string,
  options: {
    readonly tableIndex: number;
    readonly prototypeRowIndex: number;
    readonly records: readonly RepeatingRecordItem[];
    readonly columnMappings?: ReadonlyMap<number, string>; // colIndex (1-based) -> fieldId
    readonly fieldValues?: ReadonlyMap<string, string>; // scalar/lookup values
  }
): { xml: string; rowsAdded: number } {
  const { tableIndex, prototypeRowIndex, records, columnMappings, fieldValues } = options;
  const tables = extractTables(docXml);
  const table = tables.find(t => t.tableIndex === tableIndex);
  if (!table) return { xml: docXml, rowsAdded: 0 };

  const prototypeRow = table.rows.find(r => r.rowIndex === prototypeRowIndex);
  if (!prototypeRow) return { xml: docXml, rowsAdded: 0 };

  // If collection is empty: remove prototype row, preserving header rows and summary rows
  if (records.length === 0) {
    const newTblXml =
      table.rawXml.slice(0, prototypeRow.start) + table.rawXml.slice(prototypeRow.end);
    const newDocXml = docXml.slice(0, table.start) + newTblXml + docXml.slice(table.end);
    return { xml: newDocXml, rowsAdded: -1 };
  }

  // Clone prototype row for each record
  const generatedRowsXml: string[] = [];

  for (let recIdx = 0; recIdx < records.length; recIdx++) {
    const record = records[recIdx];
    let rowXml = prototypeRow.rawXml;

    // Build value map for this record: tokens & canonical field names
    const recValues = new Map<string, string>();
    if (fieldValues) {
      for (const [k, v] of fieldValues) recValues.set(k, v);
    }

    // Add record properties
    for (const [key, val] of Object.entries(record)) {
      if (val !== undefined && val !== null) {
        const strVal = String(val);
        recValues.set(`{${key}}`, strVal);
        recValues.set(key, strVal);
      }
    }
    // Standard aliases
    if (record.stationName !== undefined) {
      recValues.set('{station_name}', String(record.stationName));
      recValues.set('{station}', String(record.stationName));
    }
    if (record.stationId !== undefined) {
      recValues.set('{station_id}', String(record.stationId));
      recValues.set('{id}', String(record.stationId));
    }
    const seq = record.sequenceOrder ?? recIdx + 1;
    recValues.set('{sequence_order}', String(seq));
    recValues.set('{row_num}', String(recIdx + 1));
    recValues.set('{seq}', String(seq));

    // Also inject column mappings if configured
    if (columnMappings && columnMappings.size > 0) {
      for (const [colIdx, fieldId] of columnMappings) {
        let val = '';
        if (record[fieldId] !== undefined && record[fieldId] !== null) {
          val = String(record[fieldId]);
        } else if (fieldValues?.has(fieldId)) {
          val = fieldValues.get(fieldId)!;
        }
        // Replace in cell
        const rowCells = extractCells(rowXml, tableIndex, prototypeRowIndex);
        const targetCell = rowCells.find(c => c.colIndex === colIdx);
        if (targetCell) {
          const tcPr = targetCell.tcPrXml ?? '';
          let pPr = '';
          let rPr = '';
          const firstP = targetCell.paragraphs[0];
          if (firstP) {
            const pPrMatch = firstP.match(/<w:pPr\b[\s\S]*?<\/w:pPr>/);
            if (pPrMatch) pPr = pPrMatch[0];
            const rPrMatch = firstP.match(/<w:rPr\b[\s\S]*?<\/w:rPr>/);
            if (rPrMatch) rPr = rPrMatch[0];
          }
          const escaped = escapeWordText(val);
          const newCellXml = `<w:tc>${tcPr}<w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">${escaped}</w:t></w:r></w:p></w:tc>`;
          rowXml = rowXml.slice(0, targetCell.start) + newCellXml + rowXml.slice(targetCell.end);
        }
      }
    }

    // Now replace any remaining placeholders in the cloned row's cells
    const cellRegex = /<w:tc\b[\s\S]*?<\/w:tc>/g;
    rowXml = rowXml.replace(cellRegex, cellMatch => {
      let cellXml = cellMatch;
      for (const [token, val] of recValues) {
        if (!token.startsWith('{') || !token.endsWith('}')) continue;
        if (cellXml.includes(token)) {
          // Replace token in w:t tags while preserving runs and formatting
          const tRegex = new RegExp(
            token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
            'g'
          );
          cellXml = cellXml.replace(tRegex, escapeWordText(val));
        }
      }
      return cellXml;
    });

    generatedRowsXml.push(rowXml);
  }

  // Replace prototype row with generated rows
  const newTblXml =
    table.rawXml.slice(0, prototypeRow.start) +
    generatedRowsXml.join('') +
    table.rawXml.slice(prototypeRow.end);

  const newDocXml = docXml.slice(0, table.start) + newTblXml + docXml.slice(table.end);
  return { xml: newDocXml, rowsAdded: records.length - 1 };
}
