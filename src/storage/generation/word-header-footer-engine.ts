/**
 * OpsReport Studio — Word Header & Footer Engine (Step 32)
 *
 * Scans, resolves, and safely replaces approved placeholder tokens in supported
 * header and footer parts (word/header*.xml, word/footer*.xml) within an OpenXML package.
 *
 * Preserves page numbering fields (<w:fldSimple w:instr="PAGE"/>, <w:fldChar/>,
 * <w:instrText>PAGE</w:instrText>), character properties, paragraph layout, table structures
 * in headers/footers, and surrounding static text.
 *
 * @module storage/generation/word-header-footer-engine
 */

import PizZip from 'pizzip';
import {
  parseWordPart,
  paragraphText,
  findTokens,
  escapeWordText,
} from './word-placeholder-engine.ts';

export interface HeaderFooterProcessingResult {
  readonly counts: Map<string, number>;
  readonly modifiedParts: readonly string[];
}

const HEADER_FOOTER_REGEX = /^word\/(header|footer)\d*\.xml$/i;

/**
 * Discovers and replaces approved placeholder tokens in all header and footer parts in the zip.
 * Modifies the zip entries in-place.
 */
export function processHeadersAndFooters(
  zip: PizZip,
  values: ReadonlyMap<string, string>
): HeaderFooterProcessingResult {
  const counts = new Map<string, number>();
  const modifiedParts: string[] = [];

  const partNames = Object.keys(zip.files).filter(name => HEADER_FOOTER_REGEX.test(name));

  for (const partName of partNames) {
    const file = zip.file(partName);
    if (!file) continue;

    const rawXml = file.asText();
    const part = parseWordPart(rawXml);
    const edits: Array<{ start: number; end: number; text: string }> = [];

    for (const p of part.paragraphs) {
      const pText = paragraphText(p);
      const matches = findTokens(pText).filter(t => values.has(t.token));
      if (matches.length === 0) continue;

      // Map character index to text node index
      const nodeOf: number[] = [];
      for (const idx of p.sequence) {
        if (idx < 0) nodeOf.push(-1);
        else for (let i = 0; i < p.nodes[idx].text.length; i++) nodeOf.push(idx);
      }

      const outs = p.nodes.map(() => '');
      let mi = 0;
      for (let i = 0; i < pText.length; i++) {
        const cur = matches[mi];
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
      let updatedXml = rawXml;
      for (const e of edits) {
        updatedXml =
          updatedXml.slice(0, e.start) +
          `<w:t xml:space="preserve">${escapeWordText(e.text)}</w:t>` +
          updatedXml.slice(e.end);
      }
      zip.file(partName, updatedXml);
      modifiedParts.push(partName);
    }
  }

  return {
    counts,
    modifiedParts,
  };
}
