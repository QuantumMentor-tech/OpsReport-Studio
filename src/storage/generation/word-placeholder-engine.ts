/**
 * OpsReport Studio — Word Placeholder Engine (Step 31)
 *
 * Structure-aware scanning and replacement of `{token}` placeholders in the
 * ordinary main-body paragraphs (outside tables) of a `.docx` package.
 *
 * Placeholder syntax (authoritative source: WORD_PLACEHOLDER_REGEX in
 * word-mapping-repository.ts, Step 23): `{name}` where name matches
 * `[a-zA-Z0-9_#/-]+`.
 *
 * Design:
 * - word/document.xml is tokenised into a tag stream (no regex replacement over raw XML).
 * - Paragraph (`w:p`) and text (`w:t`) nodes are indexed; only the byte ranges of
 *   `w:t` elements that actually change are rewritten, so all other XML stays byte-identical.
 * - A placeholder split across several runs is matched on the concatenated run text.
 *   Replacement policy: the value is written into the text node that holds the opening
 *   brace; the matched characters are removed from the remaining nodes. Run properties
 *   are never touched, so the replacement takes the style of the run holding `{`.
 * - Replacement values are written as XML-escaped text and are never rescanned.
 * - Tables, text boxes, headers, footers, footnotes, endnotes, comments and paragraphs
 *   containing tracked changes, fields, hyperlinks, content controls, smart tags or
 *   custom XML are never mutated. Tokens found there are reported (Step 32 extends this).
 *
 * @module storage/generation/word-placeholder-engine
 */

import PizZip from 'pizzip';
import type { WordPlaceholderLocation } from '../../shared/types/word-generation.ts';

export const WORD_BODY_PLACEHOLDER_SOURCE = '\\{[a-zA-Z0-9_#/-]+\\}';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const SEPARATOR = '\u0000';

const UNSAFE_ELEMENTS = new Set([
  'w:sdt',
  'w:sdtContent',
  'w:ins',
  'w:del',
  'w:moveFrom',
  'w:moveTo',
  'w:hyperlink',
  'w:smartTag',
  'w:customXml',
  'w:fldSimple',
  'w:fldChar',
  'w:instrText',
]);

const SEPARATOR_ELEMENTS = new Set([
  'w:tab',
  'w:br',
  'w:cr',
  'w:noBreakHyphen',
  'w:softHyphen',
  'w:sym',
  'w:ptab',
  'w:drawing',
  'w:pict',
  'w:object',
  'w:footnoteReference',
  'w:endnoteReference',
  'w:commentReference',
  'w:delText',
  'w:fldChar',
  'w:instrText',
]);

const TAG_REGEX =
  /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<(\/?)([A-Za-z_][\w.:-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;

/** Raised for malformed or unsupported package XML. Messages never contain document text. */
export class WordXmlError extends Error {
  public constructor(
    message: string,
    public readonly kind: 'MALFORMED' | 'UNSUPPORTED' = 'MALFORMED'
  ) {
    super(message);
    this.name = 'WordXmlError';
  }
}

export interface WordTextNode {
  readonly openStart: number;
  readonly closeEnd: number;
  readonly text: string;
}

export interface WordParsedParagraph {
  readonly ordinal: number;
  readonly inTable: boolean;
  readonly inTextBox: boolean;
  unsafe: boolean;
  readonly nodes: WordTextNode[];
  /** Node index per text node, or -1 for a non-text separator (tab, break, drawing...). */
  readonly sequence: number[];
}

export interface WordParsedPart {
  readonly xml: string;
  readonly paragraphs: WordParsedParagraph[];
}

export interface WordTokenMatch {
  readonly token: string;
  readonly start: number;
  readonly end: number;
}

export interface WordUnsupportedOccurrence {
  readonly token: string;
  readonly location: WordPlaceholderLocation;
  readonly count: number;
}

export interface WordPackageScan {
  readonly bodyPart: WordParsedPart;
  readonly bodyParagraphCount: number;
  readonly bodyTokenCounts: ReadonlyMap<string, number>;
  readonly unsupported: readonly WordUnsupportedOccurrence[];
  readonly tableTokenCounts: ReadonlyMap<string, number>;
  readonly headerTokenCounts: ReadonlyMap<string, number>;
  readonly footerTokenCounts: ReadonlyMap<string, number>;
}

function decodeStrict(text: string): string {
  // Reject any ampersand that is not part of a recognised reference (checked on the raw text).
  if (/&(?!(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);)/.test(text)) {
    throw new WordXmlError('Unsupported XML entity in document text.', 'UNSUPPORTED');
  }
  const decoded = text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);/g, (_m, ent) => {
    switch (ent) {
      case 'amp':
        return '&';
      case 'lt':
        return '<';
      case 'gt':
        return '>';
      case 'quot':
        return '"';
      case 'apos':
        return "'";
      default: {
        const code = ent[1] === 'x' ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
        if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) {
          throw new WordXmlError('Invalid numeric character reference in document text.');
        }
        return String.fromCodePoint(code);
      }
    }
  });
  return decoded;
}

/** XML-escapes plain text for a w:t element. Values are never interpreted as markup. */
export function escapeWordText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Tokenises a WordprocessingML part and indexes its paragraphs and text nodes.
 */
export function parseWordPart(xml: string): WordParsedPart {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
    throw new WordXmlError('DTD or entity declarations are not permitted.', 'UNSUPPORTED');
  }

  const paragraphs: WordParsedParagraph[] = [];
  const stack: string[] = [];
  const paraStack: WordParsedParagraph[] = [];
  let pending: { openStart: number; openEnd: number } | null = null;

  const re = new RegExp(TAG_REGEX.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const full = m[0];
    if (full.startsWith('<![CDATA[')) {
      throw new WordXmlError('CDATA sections are not supported.', 'UNSUPPORTED');
    }
    const name = m[2];
    if (name === undefined) continue; // comment or processing instruction
    const isClose = m[1] === '/';
    const selfClose = m[4] === '/';
    const top = paraStack[paraStack.length - 1];

    if (pending && !(isClose && name === 'w:t')) {
      throw new WordXmlError('Unexpected markup inside a text element.');
    }

    if (isClose) {
      if (stack[stack.length - 1] !== name) {
        throw new WordXmlError('Mismatched closing tag in document part.');
      }
      stack.pop();
      if (name === 'w:t' && pending && top) {
        const text = decodeStrict(xml.slice(pending.openEnd, m.index));
        top.nodes.push({
          openStart: pending.openStart,
          closeEnd: m.index + full.length,
          text,
        });
        top.sequence.push(top.nodes.length - 1);
        pending = null;
      } else if (name === 'w:t') {
        pending = null;
      } else if (name === 'w:p') {
        paraStack.pop();
      }
      continue;
    }

    if (name === 'w:p' && !selfClose) {
      const para: WordParsedParagraph = {
        ordinal: paragraphs.length,
        inTable: stack.includes('w:tbl'),
        inTextBox: stack.includes('w:txbxContent'),
        unsafe: stack.some(s => UNSAFE_ELEMENTS.has(s)),
        nodes: [],
        sequence: [],
      };
      paragraphs.push(para);
      paraStack.push(para);
    } else if (top) {
      if (UNSAFE_ELEMENTS.has(name)) top.unsafe = true;
      if (SEPARATOR_ELEMENTS.has(name)) top.sequence.push(-1);
    }

    if (name === 'w:t' && !selfClose) {
      pending = { openStart: m.index, openEnd: m.index + full.length };
    }

    if (!selfClose) stack.push(name);
  }

  if (stack.length !== 0 || pending) {
    throw new WordXmlError('Document part ended with unclosed elements.');
  }
  return { xml, paragraphs };
}

/** Concatenated visible text of a paragraph; non-text content appears as a separator. */
export function paragraphText(p: WordParsedParagraph): string {
  let out = '';
  for (const idx of p.sequence) {
    out += idx < 0 ? SEPARATOR : p.nodes[idx].text;
  }
  return out;
}

export function findTokens(text: string): WordTokenMatch[] {
  const re = new RegExp(WORD_BODY_PLACEHOLDER_SOURCE, 'g');
  const out: WordTokenMatch[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push({ token: m[0], start: m.index, end: m.index + m[0].length });
  }
  return out;
}

export function isSupportedBodyParagraph(p: WordParsedParagraph): boolean {
  return !p.inTable && !p.inTextBox && !p.unsafe;
}

function readText(zip: PizZip, name: string): string {
  const f = zip.file(name);
  if (!f) throw new WordXmlError(`Package part "${name}" is missing.`);
  return f.asText();
}

const EXTRA_PART_LOCATIONS: Array<[RegExp, WordPlaceholderLocation]> = [
  [/^word\/header\d*\.xml$/, 'HEADER'],
  [/^word\/footer\d*\.xml$/, 'FOOTER'],
  [/^word\/footnotes\.xml$/, 'FOOTNOTE'],
  [/^word\/endnotes\.xml$/, 'ENDNOTE'],
  [/^word\/comments\.xml$/, 'COMMENT'],
];

/**
 * Single indexed pass over the package: body tokens in supported paragraphs and
 * tokens located in unsupported regions.
 */
export function scanWordPackage(zip: PizZip): WordPackageScan {
  const xml = readText(zip, 'word/document.xml');
  if (!xml.includes(`xmlns:w="${W_NS}"`)) {
    throw new WordXmlError('Unsupported WordprocessingML namespace prefix.', 'UNSUPPORTED');
  }
  const bodyPart = parseWordPart(xml);

  const bodyTokenCounts = new Map<string, number>();
  const tableTokenCounts = new Map<string, number>();
  const headerTokenCounts = new Map<string, number>();
  const footerTokenCounts = new Map<string, number>();
  const unsupportedMap = new Map<string, WordUnsupportedOccurrence>();
  const addUnsupported = (token: string, location: WordPlaceholderLocation): void => {
    const key = `${location}|${token}`;
    const prev = unsupportedMap.get(key);
    unsupportedMap.set(key, { token, location, count: (prev?.count ?? 0) + 1 });
  };

  let supportedCount = 0;
  for (const p of bodyPart.paragraphs) {
    const matches = findTokens(paragraphText(p));
    if (isSupportedBodyParagraph(p)) {
      supportedCount += 1;
      for (const t of matches)
        bodyTokenCounts.set(t.token, (bodyTokenCounts.get(t.token) ?? 0) + 1);
    } else {
      const loc: WordPlaceholderLocation = p.inTable
        ? 'TABLE'
        : p.inTextBox
          ? 'TEXT_BOX'
          : 'UNSAFE_PARAGRAPH';
      if (loc === 'TABLE') {
        for (const t of matches)
          tableTokenCounts.set(t.token, (tableTokenCounts.get(t.token) ?? 0) + 1);
      }
      for (const t of matches) addUnsupported(t.token, loc);
    }
  }

  for (const entry of Object.keys(zip.files)) {
    const hit = EXTRA_PART_LOCATIONS.find(([re]) => re.test(entry));
    if (!hit) continue;
    const part = parseWordPart(readText(zip, entry));
    for (const p of part.paragraphs) {
      for (const t of findTokens(paragraphText(p))) {
        if (hit[1] === 'HEADER') {
          headerTokenCounts.set(t.token, (headerTokenCounts.get(t.token) ?? 0) + 1);
        } else if (hit[1] === 'FOOTER') {
          footerTokenCounts.set(t.token, (footerTokenCounts.get(t.token) ?? 0) + 1);
        }
        addUnsupported(t.token, hit[1]);
      }
    }
  }

  return {
    bodyPart,
    bodyParagraphCount: supportedCount,
    bodyTokenCounts,
    tableTokenCounts,
    headerTokenCounts,
    footerTokenCounts,
    unsupported: [...unsupportedMap.values()],
  };
}

function nodeOfChars(p: WordParsedParagraph): number[] {
  const out: number[] = [];
  for (const idx of p.sequence) {
    if (idx < 0) out.push(-1);
    else for (let i = 0; i < p.nodes[idx].text.length; i++) out.push(idx);
  }
  return out;
}

/**
 * Applies values to one paragraph. Returns the new text per node and the per-token counts.
 * Values are never rescanned, so replacement text that resembles a token stays literal.
 */
function transformParagraph(
  p: WordParsedParagraph,
  values: ReadonlyMap<string, string>
): { outs: string[]; counts: Map<string, number> } {
  const text = paragraphText(p);
  const nodeOf = nodeOfChars(p);
  const matches = findTokens(text).filter(t => values.has(t.token));
  const outs = p.nodes.map(() => '');
  const counts = new Map<string, number>();
  let mi = 0;
  for (let i = 0; i < text.length; i++) {
    const cur = matches[mi];
    if (cur && i >= cur.start && i < cur.end) {
      if (i === cur.start) {
        outs[nodeOf[i]] += values.get(cur.token) as string;
        counts.set(cur.token, (counts.get(cur.token) ?? 0) + 1);
      }
      if (i === cur.end - 1) mi += 1;
      continue;
    }
    if (nodeOf[i] >= 0) outs[nodeOf[i]] += text[i];
  }
  return { outs, counts };
}

/** Pure expected-text model used for post-save verification. */
export function expectedParagraphText(
  p: WordParsedParagraph,
  values: ReadonlyMap<string, string>
): string {
  const text = paragraphText(p);
  const matches = findTokens(text).filter(t => values.has(t.token));
  let out = '';
  let last = 0;
  for (const m of matches) {
    out += text.slice(last, m.start) + (values.get(m.token) as string);
    last = m.end;
  }
  return out + text.slice(last);
}

/**
 * Replaces mapped tokens in supported body paragraphs and returns the new document.xml.
 * Only the byte ranges of changed w:t elements are rewritten.
 */
export function replaceBodyPlaceholders(
  part: WordParsedPart,
  values: ReadonlyMap<string, string>
): { xml: string; counts: Map<string, number> } {
  const edits: Array<{ start: number; end: number; text: string }> = [];
  const counts = new Map<string, number>();

  for (const p of part.paragraphs) {
    if (!isSupportedBodyParagraph(p)) continue;
    const { outs, counts: pc } = transformParagraph(p, values);
    for (const [k, v] of pc) counts.set(k, (counts.get(k) ?? 0) + v);
    p.nodes.forEach((node, i) => {
      if (outs[i] !== node.text) {
        edits.push({ start: node.openStart, end: node.closeEnd, text: outs[i] });
      }
    });
  }

  edits.sort((a, b) => b.start - a.start);
  let xml = part.xml;
  for (const e of edits) {
    xml =
      xml.slice(0, e.start) +
      `<w:t xml:space="preserve">${escapeWordText(e.text)}</w:t>` +
      xml.slice(e.end);
  }
  return { xml, counts };
}

/** Returns a reason when text is unsafe for document content, otherwise null. */
export function validateReplacementText(value: string): string | null {
  if (/[\u0000-\u001F\u007F\uFFFE\uFFFF]/.test(value)) {
    return 'contains control or line-break characters, which are not supported';
  }
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const n = value.charCodeAt(i + 1);
      if (!(n >= 0xdc00 && n <= 0xdfff)) return 'contains an unpaired surrogate';
      i += 1;
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      return 'contains an unpaired surrogate';
    }
  }
  return null;
}
