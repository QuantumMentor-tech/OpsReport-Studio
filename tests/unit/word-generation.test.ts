/**
 * OpsReport Studio — Step 31: Word Document Cloning & Placeholder Replacement Engine Tests
 *
 * Uses isolated temp vaults, synthetic sessions and synthetic .docx fixtures only.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
  WordXmlError,
  findTokens,
  paragraphText,
  parseWordPart,
  replaceBodyPlaceholders,
  scanWordPackage,
  validateReplacementText,
} from '../../src/storage/generation/word-placeholder-engine.ts';
import {
  toTemplateId,
  toReportSessionId,
  toReportCategoryId,
  toTemplateVersionId,
  toGenerationWorkspaceId,
} from '../../src/shared/types/identifiers.ts';
import { ErrorCode } from '../../src/shared/errors/error-codes.ts';
import { Ok, Err } from '../../src/shared/types/result.ts';
import { AppError } from '../../src/shared/errors/app-error.ts';
import type { WordFieldMappingRecord } from '../../src/shared/types/word-mapping.ts';

const WNS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

const r = (text: string, rpr = ''): string =>
  `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ''}<w:t xml:space="preserve">${text}</w:t></w:r>`;
const para = (...runs: string[]): string => `<w:p>${runs.join('')}</w:p>`;
const table = (...inner: string[]): string =>
  `<w:tbl><w:tr><w:tc>${inner.join('')}</w:tc></w:tr></w:tbl>`;

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

function docParagraphs(buf: Buffer): string[] {
  const xml = new PizZip(buf).file('word/document.xml')!.asText();
  return parseWordPart(xml).paragraphs.map(paragraphText);
}

const sha = (buf: Buffer): string => crypto.createHash('sha256').update(buf).digest('hex');

// =============================================================================
// A. Engine (pure) tests
// =============================================================================
describe('Step 31 — Word placeholder engine', () => {
  const run = (body: string, values: Record<string, string>) => {
    const part = parseWordPart(`<w:document ${WNS}><w:body>${body}</w:body></w:document>`);
    const out = replaceBodyPlaceholders(part, new Map(Object.entries(values)));
    return { out, texts: parseWordPart(out.xml).paragraphs.map(paragraphText) };
  };

  it('WRD-ENG-01: replaces a token surrounded by text and preserves the rest', () => {
    const { texts } = run(para(r('Date: {report_date}, shift ok.')), {
      '{report_date}': '2026-10-22',
    });
    expect(texts).toEqual(['Date: 2026-10-22, shift ok.']);
  });

  it('WRD-ENG-02: replaces a token occupying an entire paragraph', () => {
    const { texts } = run(para(r('{a}')) + para(r('keep')), { '{a}': 'X' });
    expect(texts).toEqual(['X', 'keep']);
  });

  it('WRD-ENG-03: handles multiple distinct and repeated tokens across paragraphs', () => {
    const { texts, out } = run(para(r('{a} and {b} and {a}')) + para(r('again {a}')), {
      '{a}': '1',
      '{b}': '2',
    });
    expect(texts).toEqual(['1 and 2 and 1', 'again 1']);
    expect(out.counts.get('{a}')).toBe(3);
    expect(out.counts.get('{b}')).toBe(1);
  });

  it('WRD-ENG-04: replaces a token split across two runs, keeping run properties', () => {
    const { texts, out } = run(para(r('Hello {inc', '<w:b/>'), r('ident_id} bye', '<w:i/>')), {
      '{incident_id}': 'INC-7',
    });
    expect(texts).toEqual(['Hello INC-7 bye']);
    expect(out.xml).toContain('<w:b/>');
    expect(out.xml).toContain('<w:i/>');
    expect(out.xml.match(/<w:r>/g)?.length).toBe(2);
  });

  it('WRD-ENG-05: replaces a token split across several runs at paragraph start and end', () => {
    const { texts } = run(
      para(r('{'), r('rep'), r('ort'), r('_date}'), r(' mid '), r('{x'), r('}')),
      { '{report_date}': 'D', '{x}': 'Y' }
    );
    expect(texts).toEqual(['D mid Y']);
  });

  it('WRD-ENG-06: leaves similar-looking tokens untouched', () => {
    const { texts } = run(para(r('{a_b} {a} {ab} { a } {} {a b}')), { '{a}': 'Z' });
    expect(texts).toEqual(['{a_b} Z {ab} { a } {} {a b}']);
    expect(findTokens('{ a } {} { }')).toHaveLength(0);
  });

  it('WRD-ENG-07: values stay literal text — no recursion, no markup injection', () => {
    const { texts, out } = run(para(r('v={a};w={b}')), {
      '{a}': '{b}',
      '{b}': '</w:t><w:p>& <x/>',
    });
    expect(texts).toEqual(['v={b};w=</w:t><w:p>& <x/>']);
    expect(out.xml).toContain('&lt;/w:t&gt;&lt;w:p&gt;&amp; &lt;x/&gt;');
    expect(() => parseWordPart(out.xml)).not.toThrow();
  });

  it('WRD-ENG-08: preserves Unicode, spaces, empty values, zero and false text', () => {
    const { texts } = run(para(r('[{a}][{b}][{c}][{d}]')), {
      '{a}': ' Привет 北京 😀 ',
      '{b}': '',
      '{c}': '0',
      '{d}': 'false',
    });
    expect(texts).toEqual(['[ Привет 北京 😀 ][][0][false]']);
  });

  it('WRD-ENG-09: does not mutate table, text-box or unsafe paragraphs, but reports them', () => {
    const body =
      para(r('{a} body')) +
      table(para(r('{a} in table'))) +
      para(`<w:r><w:pict><w:txbxContent>${para(r('{a} in box'))}</w:txbxContent></w:pict></w:r>`) +
      `<w:p><w:hyperlink>${r('{a} link')}</w:hyperlink></w:p>` +
      `<w:p><w:fldSimple w:instr="X">${r('{a} field')}</w:fldSimple></w:p>` +
      `<w:p><w:ins>${r('{a} tracked')}</w:ins></w:p>`;
    const doc = `<?xml version="1.0"?><w:document ${WNS}><w:body>${body}</w:body></w:document>`;
    const zip = new PizZip();
    zip.file('word/document.xml', doc);
    zip.file('word/header1.xml', headerPart(para(r('{a} head'))));
    zip.file('word/footer1.xml', headerPart(para(r('{a} foot'))));
    const scan = scanWordPackage(zip);
    expect(scan.bodyTokenCounts.get('{a}')).toBe(1);
    const locs = scan.unsupported.map(u => u.location).sort();
    expect(locs).toEqual(['FOOTER', 'HEADER', 'TABLE', 'TEXT_BOX', 'UNSAFE_PARAGRAPH']);
    const { out } = (() => {
      const o = replaceBodyPlaceholders(scan.bodyPart, new Map([['{a}', 'R']]));
      return { out: o };
    })();
    const texts = parseWordPart(out.xml).paragraphs.map(paragraphText);
    expect(texts[0]).toBe('R body');
    expect(texts.filter(t => t.includes('{a}'))).toHaveLength(5);
    expect(out.counts.get('{a}')).toBe(1);
  });

  it('WRD-ENG-10: a tab or break between runs prevents a false cross-boundary match', () => {
    const body = `<w:p>${r('{a')}<w:r><w:tab/></w:r>${r('b}')}</w:p>`;
    const { texts } = run(body, { '{ab}': 'X' });
    expect(texts[0]).toContain('{a');
    expect(texts[0]).not.toContain('X');
  });

  it('WRD-ENG-11: rejects DTDs, CDATA, namespace prefix changes and malformed XML', () => {
    expect(() => parseWordPart('<!DOCTYPE x [<!ENTITY a "b">]><w:document/>')).toThrow(
      WordXmlError
    );
    expect(() => parseWordPart(`<w:p><w:r><w:t><![CDATA[x]]></w:t></w:r></w:p>`)).toThrow(
      WordXmlError
    );
    expect(() => parseWordPart('<w:p><w:r></w:p></w:r>')).toThrow(WordXmlError);
    expect(() => parseWordPart('<w:p><w:r><w:t>&bogus;</w:t></w:r></w:p>')).toThrow(WordXmlError);
    const zip = new PizZip();
    zip.file('word/document.xml', '<x:document xmlns:x="urn:other"><x:body/></x:document>');
    expect(() => scanWordPackage(zip)).toThrow(WordXmlError);
  });

  it('WRD-ENG-12: validates replacement text content', () => {
    expect(validateReplacementText('ok ünï 😀')).toBeNull();
    expect(validateReplacementText('a\nb')).not.toBeNull();
    expect(validateReplacementText('a\tb')).not.toBeNull();
    expect(validateReplacementText('a\u0000b')).not.toBeNull();
    expect(validateReplacementText('\ud800')).not.toBeNull();
  });

  it('WRD-ENG-13: output is deterministic across repeated runs', () => {
    const body = para(r('{a} x {b'), r('}'));
    const a = run(body, { '{a}': '1', '{b}': '2' }).out.xml;
    const b = run(body, { '{a}': '1', '{b}': '2' }).out.xml;
    expect(a).toBe(b);
  });
});

// =============================================================================
// B. Service tests
// =============================================================================
describe('Step 31 — Word cloning & generation service', () => {
  let tempRoot: string;
  let vaultManager: VaultManager;
  let dbManager: DatabaseManager;
  let templateRepo: TemplateMetadataRepository;
  let sessionRepo: SessionRepository;
  let workspaceRepo: GenerationWorkspaceRepository;
  let wordMappingRepo: WordMappingRepository;
  let profileRepo: MappingProfileRepository;
  let cloning: WordDocumentCloningService;
  let generator: WordGenerationService;

  const templateId = toTemplateId('TPL-INCIDENT-STANDARD');

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opsreport-step31-test-'));
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
    cloning = new WordDocumentCloningService(
      templateRepo,
      vaultManager,
      sessionRepo,
      workspaceRepo
    );
    generator = new WordGenerationService(
      sessionRepo,
      templateRepo,
      workspaceRepo,
      wordMappingRepo,
      profileRepo,
      vaultManager
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    VaultManager.setInstance(null);
    if (dbManager?.isOpen()) dbManager.close();
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  const DEFAULT_BODY =
    para(r('Incident: '), r('{inc', '<w:b/>'), r('ident_id}', '<w:b/>'), r(' on {report_date}.')) +
    para(r('Inspector {inspector} / again {inspector}')) +
    para(r('Police notified: {police_notified}. Ref: [{police_ref}]')) +
    para(r('Static footer line.'));

  function setupDoc(body = DEFAULT_BODY, extra: Record<string, string> = {}) {
    const bytes = buildDocx(body, extra);
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
    return { bytes, hash, vaultPath: vp.value, versionId: ver.value.version_id };
  }

  function saveMaps(pairs: Array<[string, string]>, versionId: string) {
    const res = wordMappingRepo.saveMappings({
      templateId,
      versionId: toTemplateVersionId(versionId),
      mappings: pairs.map(([fieldId, token]) => ({
        mappingType: 'PLACEHOLDER' as const,
        fieldId,
        fieldLabel: fieldId,
        targetCoordinate: token,
      })),
    });
    expect(res.ok).toBe(true);
  }

  const DEFAULT_MAPS: Array<[string, string]> = [
    ['FLD-INC-ID', '{incident_id}'],
    ['FLD-COM-DATE', '{report_date}'],
    ['FLD-COM-INSPECTOR', '{inspector}'],
    ['FLD-INC-POLICE-NOTIFIED', '{police_notified}'],
    ['FLD-INC-POLICE-REF', '{police_ref}'],
  ];

  const GOOD_DATA = {
    'FLD-INC-ID': 'INC-2026-0042',
    'FLD-COM-DATE': '2026-10-22',
    'FLD-COM-INSPECTOR': 'Zoë Ñandú',
    'FLD-INC-POLICE-NOTIFIED': false,
    'FLD-INC-POLICE-REF': '',
  };

  function prepare(
    opts: { body?: string; extra?: Record<string, string>; maps?: Array<[string, string]> } = {}
  ) {
    const doc = setupDoc(opts.body, opts.extra);
    saveMaps(opts.maps ?? DEFAULT_MAPS, doc.versionId);
    const sessionRes = sessionRepo.createSession({
      sessionTitle: 'Word Step 31',
      categoryId: toReportCategoryId('RPT-INCIDENT'),
      templateId,
    });
    if (!sessionRes.ok) throw new Error('session');
    const sessionId = sessionRes.value.session.sessionId;
    const clone = cloning.prepareWordWorkspace({ templateId, sessionId });
    if (!clone.ok) throw new Error('clone failed: ' + clone.error.userMessage);
    return { ...doc, sessionId, clone: clone.value, ws: clone.value.workspace };
  }

  const generate = (
    ctx: ReturnType<typeof prepare>,
    data: Record<string, unknown> = GOOD_DATA,
    extra = {}
  ) =>
    generator.generateWordDocument({
      workspaceId: ctx.ws.workspaceId,
      sessionId: ctx.sessionId,
      overrideFormData: data,
      ...extra,
    });

  const candidates = (): string[] =>
    fs.readdirSync(vaultManager.workspaceDir).filter(f => f.startsWith('word_candidate_'));

  // ---- Cloning ---------------------------------------------------------------------
  describe('cloning', () => {
    it('WRD-CLN-01: clones the registered version into Workspace/ with identical bytes; master unchanged', () => {
      const ctx = prepare();
      expect(ctx.ws.documentType).toBe('WORD_DOCX');
      expect(ctx.ws.absolutePath.startsWith(vaultManager.workspaceDir)).toBe(true);
      expect(ctx.ws.absolutePath).not.toBe(ctx.vaultPath);
      expect(ctx.ws.fileName.endsWith('.docx')).toBe(true);
      expect(sha(fs.readFileSync(ctx.ws.absolutePath))).toBe(ctx.hash);
      expect(sha(fs.readFileSync(ctx.vaultPath))).toBe(ctx.hash);
      expect(ctx.clone.sourceUntouched).toBe(true);
      expect(ctx.ws.versionId).toBe(ctx.versionId);
    });

    it('WRD-CLN-02: rejects unknown templates, Excel templates and bad identifiers', () => {
      setupDoc();
      const missing = cloning.prepareWordWorkspace({
        templateId: toTemplateId('TPL-DOES-NOT-EXIST'),
      });
      expect(!missing.ok && missing.error.code).toBe(ErrorCode.TEMPLATE_NOT_FOUND);
      const excel = cloning.prepareWordWorkspace({
        templateId: toTemplateId('TPL-POLE-LIGHT-STANDARD'),
      });
      expect(!excel.ok && excel.error.code).toBe(ErrorCode.TEMPLATE_UNSUPPORTED_FORMAT);
      const bad = cloning.prepareWordWorkspace({ templateId: toTemplateId('../etc') });
      expect(!bad.ok && bad.error.code).toBe(ErrorCode.VALIDATION_FAILED);
    });

    it('WRD-CLN-03: rejects a version belonging to another template and traversal prefixes', () => {
      setupDoc();
      const v = cloning.prepareWordWorkspace({
        templateId,
        versionId: toTemplateVersionId('VER-TPL-POLE-LIGHT-STANDARD-V1'),
      });
      expect(!v.ok && v.error.code).toBe(ErrorCode.SECURITY_VIOLATION);
      const p = cloning.prepareWordWorkspace({ templateId, customPrefix: '../evil' });
      expect(!p.ok && p.error.code).toBe(ErrorCode.SECURITY_VIOLATION);
    });

    it('WRD-CLN-04: refuses a tampered master (hash mismatch) and a corrupt package; leaves no clone', () => {
      const doc = setupDoc();
      fs.writeFileSync(doc.vaultPath, Buffer.concat([doc.bytes, Buffer.from('x')]));
      const t = cloning.prepareWordWorkspace({ templateId });
      expect(!t.ok && t.error.code).toBe(ErrorCode.TEMPLATE_INTEGRITY_COMPROMISED);

      const junk = Buffer.from('this is not a zip package');
      fs.writeFileSync(doc.vaultPath, junk);
      dbManager
        .getDatabase()
        .prepare('UPDATE template_versions SET sha256_hash = ? WHERE version_id = ?')
        .run(sha(junk), doc.versionId);
      const c = cloning.prepareWordWorkspace({ templateId });
      expect(c.ok).toBe(false);
      expect(fs.readdirSync(vaultManager.workspaceDir)).toHaveLength(0);
    });

    it('WRD-CLN-05: rejects a session bound to a different template', () => {
      setupDoc();
      const s = sessionRepo.createSession({
        sessionTitle: 'x',
        categoryId: toReportCategoryId('RPT-POLE-LIGHT'),
        templateId: toTemplateId('TPL-POLE-LIGHT-STANDARD'),
      });
      if (!s.ok) throw new Error('session');
      const res = cloning.prepareWordWorkspace({
        templateId,
        sessionId: s.value.session.sessionId,
      });
      expect(!res.ok && res.error.code).toBe(ErrorCode.VALIDATION_FAILED);
    });
  });

  // ---- Successful generation ------------------------------------------------------------
  describe('generation', () => {
    it('WRD-GEN-01: replaces mapped placeholders, preserves the rest, accepts the validated candidate', () => {
      const ctx = prepare();
      const res = generate(ctx);
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.value.candidateAccepted).toBe(true);
      expect(res.value.masterUntouched).toBe(true);
      expect(res.value.replacementsApplied).toBe(6);
      expect(res.value.plan.find(p => p.token === '{inspector}')?.isRepeated).toBe(true);

      const out = fs.readFileSync(ctx.ws.absolutePath);
      expect(docParagraphs(out)).toEqual([
        'Incident: INC-2026-0042 on 2026-10-22.',
        'Inspector Zoë Ñandú / again Zoë Ñandú',
        'Police notified: false. Ref: []',
        'Static footer line.',
      ]);
      // Master unchanged; accepted artifact is the validated candidate.
      expect(sha(fs.readFileSync(ctx.vaultPath))).toBe(ctx.hash);
      expect(res.value.sha256Hash).toBe(sha(out));
      const wsAfter = workspaceRepo.getWorkspaceById(ctx.ws.workspaceId);
      expect(wsAfter.ok && wsAfter.value?.status).toBe('IN_USE');
      expect(wsAfter.ok && wsAfter.value?.sha256Hash).toBe(sha(out));
      expect(candidates()).toHaveLength(0);

      // Untouched package parts remain byte-identical.
      const a = new PizZip(ctx.bytes);
      const b = new PizZip(out);
      for (const n of Object.keys(a.files)) {
        if (n === 'word/document.xml') continue;
        expect(b.file(n)!.asNodeBuffer().equals(a.file(n)!.asNodeBuffer())).toBe(true);
      }
      // Run formatting for split placeholder preserved.
      expect(b.file('word/document.xml')!.asText()).toContain('<w:b/>');
    });

    it('WRD-GEN-02: distinguishes missing from empty, zero and false (optional field absent => empty)', () => {
      const ctx = prepare({
        body: para(r('[{police_ref}] [{witness}] {police_notified}')),
        maps: [
          ['FLD-INC-POLICE-REF', '{police_ref}'],
          ['FLD-INC-WITNESS', '{witness}'],
          ['FLD-INC-POLICE-NOTIFIED', '{police_notified}'],
        ],
      });
      const res = generate(ctx, { 'FLD-INC-POLICE-REF': '', 'FLD-INC-POLICE-NOTIFIED': true });
      expect(res.ok).toBe(true);
      expect(docParagraphs(fs.readFileSync(ctx.ws.absolutePath))[0]).toBe('[] [] true');
    });

    it('WRD-GEN-03: replacement values that resemble placeholders are not expanded', () => {
      const ctx = prepare({
        body: para(r('{incident_id} / {inspector}')),
        maps: [
          ['FLD-INC-ID', '{incident_id}'],
          ['FLD-COM-INSPECTOR', '{inspector}'],
        ],
      });
      const res = generate(ctx, { 'FLD-INC-ID': '{inspector}', 'FLD-COM-INSPECTOR': 'A & <B>' });
      expect(res.ok).toBe(true);
      expect(docParagraphs(fs.readFileSync(ctx.ws.absolutePath))[0]).toBe('{inspector} / A & <B>');
    });
  });

  // ---- Pre-mutation validation failures -----------------------------------------------
  describe('plan validation (no mutation)', () => {
    function expectRejected(ctx: ReturnType<typeof prepare>, res: ReturnType<typeof generate>) {
      expect(res.ok).toBe(false);
      expect(sha(fs.readFileSync(ctx.ws.absolutePath))).toBe(ctx.hash);
      expect(sha(fs.readFileSync(ctx.vaultPath))).toBe(ctx.hash);
      expect(candidates()).toHaveLength(0);
      const ws = workspaceRepo.getWorkspaceById(ctx.ws.workspaceId);
      expect(ws.ok && ws.value?.status).toBe('PREPARED');
      return res.ok ? null : res.error;
    }
    const codes = (e: AppError | null): string[] =>
      ((e?.details?.issues as Array<{ code: string }> | undefined) ?? []).map(i => i.code);

    it('WRD-VAL-01: missing required value', () => {
      const ctx = prepare();
      const { 'FLD-COM-DATE': _d, ...rest } = GOOD_DATA;
      void _d;
      const err = expectRejected(ctx, generate(ctx, rest));
      expect(codes(err)).toContain('MISSING_REQUIRED_VALUE');
      expect(JSON.stringify(err?.details)).not.toContain('INC-2026-0042');
    });

    it('WRD-VAL-02: required empty string is treated as missing; null is missing', () => {
      const ctx = prepare();
      expect(
        codes(expectRejected(ctx, generate(ctx, { ...GOOD_DATA, 'FLD-COM-INSPECTOR': '' })))
      ).toContain('MISSING_REQUIRED_VALUE');
      expect(
        codes(expectRejected(ctx, generate(ctx, { ...GOOD_DATA, 'FLD-INC-ID': null })))
      ).toContain('MISSING_REQUIRED_VALUE');
    });

    it('WRD-VAL-03: invalid value type and invalid content', () => {
      const ctx = prepare();
      const e1 = expectRejected(
        ctx,
        generate(ctx, { ...GOOD_DATA, 'FLD-INC-POLICE-NOTIFIED': 'yes' })
      );
      expect(e1?.code).toBe(ErrorCode.FIELD_TYPE_MISMATCH);
      const e2 = expectRejected(ctx, generate(ctx, { ...GOOD_DATA, 'FLD-INC-ID': 42 }));
      expect(codes(e2)).toContain('INVALID_VALUE_TYPE');
      const e3 = expectRejected(ctx, generate(ctx, { ...GOOD_DATA, 'FLD-INC-ID': 'a\nb' }));
      expect(codes(e3)).toContain('INVALID_VALUE_CONTENT');
    });

    it('WRD-VAL-04: unauthorized, wrong-category and unapproved fields are blocked', () => {
      const ctx = prepare({
        body: para(r('{a} {b}')),
        maps: [
          ['FLD-FAN-MODE', '{a}'],
          ['FLD-NOT-APPROVED', '{b}'],
        ],
      });
      const err = expectRejected(
        ctx,
        generate(ctx, { 'FLD-FAN-MODE': 'Auto', 'FLD-NOT-APPROVED': 'x' })
      );
      expect(err?.code).toBe(ErrorCode.MAPPING_INCOMPATIBLE);
      expect(codes(err).filter(c => c === 'UNAUTHORIZED_FIELD')).toHaveLength(2);
    });

    it('WRD-VAL-05: unknown body placeholder blocks, unless explicitly downgraded', () => {
      const ctx = prepare({
        body: para(r('{incident_id} {mystery}')),
        maps: [['FLD-INC-ID', '{incident_id}']],
      });
      const err = expectRejected(ctx, generate(ctx));
      expect(codes(err)).toContain('UNKNOWN_PLACEHOLDER');
      const ok = generate(ctx, GOOD_DATA, { allowUnmappedTokens: true });
      expect(ok.ok).toBe(true);
      expect(ok.ok && ok.value.warnings.some(w => w.code === 'UNKNOWN_PLACEHOLDER')).toBe(true);
      expect(docParagraphs(fs.readFileSync(ctx.ws.absolutePath))[0]).toBe(
        'INC-2026-0042 {mystery}'
      );
    });

    it('WRD-VAL-06: required placeholder missing from the template blocks; optional only warns', () => {
      const ctx = prepare({
        body: para(r('{incident_id}')),
        maps: [
          ['FLD-INC-ID', '{incident_id}'],
          ['FLD-COM-DATE', '{report_date}'],
          ['FLD-INC-WITNESS', '{witness}'],
        ],
      });
      const err = expectRejected(ctx, generate(ctx));
      expect(codes(err)).toEqual(['PLACEHOLDER_NOT_FOUND']);

      const ctx2 = prepare({
        body: para(r('{incident_id}')),
        maps: [
          ['FLD-INC-ID', '{incident_id}'],
          ['FLD-INC-WITNESS', '{witness}'],
        ],
      });
      const ok = generate(ctx2);
      expect(ok.ok).toBe(true);
      expect(ok.ok && ok.value.warnings.map(w => w.code)).toEqual(['PLACEHOLDER_NOT_FOUND']);
    });

    it('WRD-VAL-07: required placeholder in an unsupported location (text box) prevents false success', () => {
      const box = prepare({
        body:
          para(r('{incident_id}')) +
          para(`<w:r><w:pict><w:txbxContent>${para(r('{report_date}'))}</w:txbxContent></w:pict></w:r>`),
        maps: [
          ['FLD-INC-ID', '{incident_id}'],
          ['FLD-COM-DATE', '{report_date}'],
        ],
      });
      const e1 = expectRejected(box, generate(box));
      expect(e1?.details?.issues).toEqual([
        expect.objectContaining({ code: 'PLACEHOLDER_UNSUPPORTED_LOCATION', location: 'TEXT_BOX' }),
      ]);
    });

    it('WRD-VAL-08: header and footer tokens are replaced in candidate', () => {
      const ctx = prepare({
        body: para(r('{incident_id}')),
        extra: {
          'word/header1.xml': headerPart(para(r('Header Date: {report_date}'))),
          'word/footer1.xml': headerPart(para(r('Footer Date: {report_date}'))),
        },
        maps: [
          ['FLD-INC-ID', '{incident_id}'],
          ['FLD-COM-DATE', '{report_date}'],
        ],
      });
      const res = generate(ctx);
      expect(res.ok).toBe(true);
      if (res.ok) {
        const zip = new PizZip(fs.readFileSync(ctx.ws.absolutePath));
        expect(zip.file('word/header1.xml')!.asText()).toContain('Header Date: 2026-10-22');
        expect(zip.file('word/footer1.xml')!.asText()).toContain('Footer Date: 2026-10-22');
      }
    });

    it('WRD-VAL-09: a required token in both body and a table is replaced in both locations', () => {
      const ctx = prepare({
        body: para(r('{incident_id}')) + table(para(r('Table ID: {incident_id}'))),
        maps: [['FLD-INC-ID', '{incident_id}']],
      });
      const res = generate(ctx);
      expect(res.ok).toBe(true);
      if (res.ok) {
        const text = fs.readFileSync(ctx.ws.absolutePath);
        const zip = new PizZip(text);
        const xml = zip.file('word/document.xml')!.asText();
        expect(xml).toContain('INC-2026-0042');
        expect(xml).toContain('Table ID: INC-2026-0042');
      }
    });

    it('WRD-VAL-10: ambiguous and unsupported mapping types are detected (stubbed repository)', () => {
      const ctx = prepare({
        body: para(r('{incident_id} {x}')),
        maps: [['FLD-INC-ID', '{incident_id}']],
      });
      const base = {
        templateId,
        versionId: toTemplateVersionId(ctx.versionId),
        fieldLabel: 'l',
        createdAt: '',
        updatedAt: '',
      };
      const mk = (id: string, type: WordFieldMappingRecord['mappingType'], coord: string) =>
        ({
          ...base,
          mappingId: 'm' + id,
          fieldId: id,
          mappingType: type,
          targetCoordinate: coord,
          placeholderToken: type === 'PLACEHOLDER' ? coord : null,
        }) as WordFieldMappingRecord;
      const stubRepo = {
        getMappings: () =>
          Ok([
            mk('FLD-INC-ID', 'PLACEHOLDER', '{incident_id}'),
            mk('FLD-INC-SEVERITY', 'PLACEHOLDER', '{INCIDENT_ID}'),
            mk('FLD-COM-DATE', 'TABLE_CELL', 'T1:R1:C1'),
            mk('FLD-INC-WITNESS', 'PARAGRAPH', 'P:1'),
          ]),
      } as unknown as WordMappingRepository;
      const gen = new WordGenerationService(
        sessionRepo,
        templateRepo,
        workspaceRepo,
        stubRepo,
        profileRepo,
        vaultManager
      );
      const res = gen.generateWordDocument({
        workspaceId: ctx.ws.workspaceId,
        sessionId: ctx.sessionId,
        overrideFormData: GOOD_DATA,
      });
      const err = expectRejected(ctx, res);
      const c = codes(err);
      expect(c).toContain('AMBIGUOUS_MAPPING');
      expect(c).toContain('UNSUPPORTED_MAPPING_TYPE');
    });

    it('WRD-VAL-11: no mappings configured', () => {
      const ctx = prepare();
      wordMappingRepo.deleteMappings(templateId, toTemplateVersionId(ctx.versionId));
      const err = expectRejected(ctx, generate(ctx));
      expect(err?.code).toBe(ErrorCode.VALIDATION_FAILED);
    });

    it('WRD-VAL-12: unsafe constructs (tracked change/field/hyperlink) containing a required token block', () => {
      const ctx = prepare({
        body: `<w:p><w:ins>${r('{incident_id}')}</w:ins></w:p>`,
        maps: [['FLD-INC-ID', '{incident_id}']],
      });
      expect(codes(expectRejected(ctx, generate(ctx)))).toEqual(['PLACEHOLDER_UNSAFE_CONSTRUCT']);
    });

    it('WRD-VAL-13: malformed document XML and DTDs are rejected as template errors', () => {
      const ctx = prepare({
        body: para(r('{incident_id}')),
        maps: [['FLD-INC-ID', '{incident_id}']],
      });
      // Re-point the pristine working copy and registry at a DTD-bearing package.
      const evil = new PizZip(ctx.bytes);
      evil.file(
        'word/document.xml',
        `<?xml version="1.0"?><!DOCTYPE d [<!ENTITY e "x">]><w:document ${WNS}><w:body></w:body></w:document>`
      );
      const buf = evil.generate({ type: 'nodebuffer' });
      fs.writeFileSync(ctx.ws.absolutePath, buf);
      fs.writeFileSync(ctx.vaultPath, buf);
      dbManager
        .getDatabase()
        .prepare('UPDATE template_versions SET sha256_hash = ? WHERE version_id = ?')
        .run(sha(buf), ctx.versionId);
      dbManager
        .getDatabase()
        .prepare('UPDATE generation_workspaces SET sha256_hash = ? WHERE workspace_id = ?')
        .run(sha(buf), ctx.ws.workspaceId);
      const res = generate(ctx);
      expect(!res.ok && res.error.code).toBe(ErrorCode.TEMPLATE_UNSUPPORTED_FORMAT);
    });
  });

  // ---- Eligibility ---------------------------------------------------------------------
  describe('operation eligibility', () => {
    it('WRD-ELG-01: cannot regenerate from an already generated workspace', () => {
      const ctx = prepare();
      expect(generate(ctx).ok).toBe(true);
      const again = generate(ctx);
      expect(!again.ok && again.error.code).toBe(ErrorCode.GENERATION_FAILED);
    });

    it('WRD-ELG-02: rejects tampered working copy and tampered master', () => {
      const ctx = prepare();
      fs.appendFileSync(ctx.ws.absolutePath, 'x');
      const a = generate(ctx);
      expect(!a.ok && a.error.code).toBe(ErrorCode.TEMPLATE_INTEGRITY_COMPROMISED);

      const ctx2 = prepare();
      fs.appendFileSync(ctx2.vaultPath, 'x');
      const b = generate(ctx2);
      expect(!b.ok && b.error.code).toBe(ErrorCode.TEMPLATE_INTEGRITY_COMPROMISED);
    });

    it('WRD-ELG-03: rejects unknown/invalid workspace, foreign session, cancelled session, Excel workspace', () => {
      const ctx = prepare();
      const unk = generator.generateWordDocument({
        workspaceId: toGenerationWorkspaceId('ws_unknown'),
        sessionId: ctx.sessionId,
        overrideFormData: GOOD_DATA,
      });
      expect(!unk.ok && unk.error.code).toBe(ErrorCode.GENERATION_FAILED);
      const bad = generator.generateWordDocument({
        workspaceId: toGenerationWorkspaceId('../x'),
        sessionId: ctx.sessionId,
      });
      expect(!bad.ok && bad.error.code).toBe(ErrorCode.VALIDATION_FAILED);

      const other = sessionRepo.createSession({
        sessionTitle: 'other',
        categoryId: toReportCategoryId('RPT-INCIDENT'),
        templateId,
      });
      if (!other.ok) throw new Error('s');
      const foreign = generator.generateWordDocument({
        workspaceId: ctx.ws.workspaceId,
        sessionId: other.value.session.sessionId,
        overrideFormData: GOOD_DATA,
      });
      expect(!foreign.ok && foreign.error.code).toBe(ErrorCode.VALIDATION_FAILED);

      sessionRepo.updateSessionDraft(ctx.sessionId, { status: 'CANCELLED' } as never);
      const cancelled = generate(ctx);
      expect(cancelled.ok).toBe(false);

      const ghost = generator.generateWordDocument({
        workspaceId: ctx.ws.workspaceId,
        sessionId: toReportSessionId('nope'),
      });
      expect(!ghost.ok && ghost.error.code).toBe(ErrorCode.DRAFT_NOT_FOUND);
    });

    it('WRD-ELG-04: two operations for the same template/session own separate artifacts', () => {
      const a = prepare();
      const second = cloning.prepareWordWorkspace({
        templateId,
        sessionId: a.sessionId,
        replaceExistingSessionWorkspace: false,
      });
      if (!second.ok) throw new Error('clone2');
      expect(second.value.workspace.fileName).not.toBe(a.ws.fileName);
      expect(generate(a).ok).toBe(true);
      const r2 = generator.generateWordDocument({
        workspaceId: second.value.workspace.workspaceId,
        sessionId: a.sessionId,
        overrideFormData: { ...GOOD_DATA, 'FLD-INC-ID': 'INC-SECOND' },
      });
      expect(r2.ok).toBe(true);
      expect(docParagraphs(fs.readFileSync(a.ws.absolutePath))[0]).toContain('INC-2026-0042');
      expect(docParagraphs(fs.readFileSync(second.value.workspace.absolutePath))[0]).toContain(
        'INC-SECOND'
      );
    });
  });

  // ---- Failure recovery ------------------------------------------------------------------
  describe('failure recovery', () => {
    function expectUntouched(ctx: ReturnType<typeof prepare>) {
      expect(sha(fs.readFileSync(ctx.ws.absolutePath))).toBe(ctx.hash);
      expect(sha(fs.readFileSync(ctx.vaultPath))).toBe(ctx.hash);
      expect(candidates()).toHaveLength(0);
      const ws = workspaceRepo.getWorkspaceById(ctx.ws.workspaceId);
      expect(ws.ok && ws.value?.status).toBe('PREPARED');
    }

    it('WRD-REC-01: candidate save failure is reported and nothing is accepted', () => {
      const ctx = prepare();
      vi.spyOn(fs, 'writeFileSync').mockImplementationOnce(() => {
        throw Object.assign(new Error('EACCES: denied'), { code: 'EACCES' });
      });
      const res = generate(ctx);
      expect(!res.ok && res.error.code).toBe(ErrorCode.FILE_ACCESS_DENIED);
      expectUntouched(ctx);
    });

    it('WRD-REC-02: a corrupt saved candidate fails reopen validation and is cleaned up', () => {
      const ctx = prepare();
      const real = fs.writeFileSync.bind(fs);
      vi.spyOn(fs, 'writeFileSync').mockImplementationOnce(((
        p: fs.PathOrFileDescriptor,
        _d: unknown,
        o: fs.WriteFileOptions
      ) => real(p, Buffer.from('corrupt'), o)) as typeof fs.writeFileSync);
      const res = generate(ctx);
      expect(res.ok).toBe(false);
      expectUntouched(ctx);
    });

    it('WRD-REC-03: promotion failure keeps the previous artifact and cleans the candidate', () => {
      const ctx = prepare();
      vi.spyOn(fs, 'renameSync').mockImplementationOnce(() => {
        throw Object.assign(new Error('EPERM'), { code: 'EPERM' });
      });
      const res = generate(ctx);
      expect(!res.ok && res.error.code).toBe(ErrorCode.FILE_ACCESS_DENIED);
      expectUntouched(ctx);
    });

    it('WRD-REC-04: persistence failure after promotion restores the previous working document truthfully', () => {
      const ctx = prepare();
      vi.spyOn(workspaceRepo, 'updateWorkspaceFile').mockReturnValue(
        Err(new AppError({ code: ErrorCode.PERSISTENCE_FAILED, userMessage: 'db down' }))
      );
      const res = generate(ctx);
      expect(!res.ok && res.error.code).toBe(ErrorCode.PERSISTENCE_FAILED);
      expect(!res.ok && res.error.details?.previousDocumentRestored).toBe(true);
      expectUntouched(ctx);
    });

    it('WRD-REC-05: unexpected replacement exception returns a structured failure', () => {
      const ctx = prepare();
      vi.spyOn(fs, 'readFileSync').mockImplementationOnce(() => {
        throw new Error('boom');
      });
      const res = generate(ctx);
      expect(res.ok).toBe(false);
      vi.restoreAllMocks();
      expectUntouched(ctx);
    });

    it('WRD-REC-06: diagnostics never contain report values', () => {
      const ctx = prepare();
      const res = generate(ctx, { ...GOOD_DATA, 'FLD-INC-POLICE-NOTIFIED': 'SECRET-VALUE' });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(JSON.stringify(res.error.details) + res.error.userMessage).not.toContain(
          'SECRET-VALUE'
        );
      }
    });
  });

  describe('scan helper on cloned package', () => {
    it('WRD-SCN-01: scanning is read-only and reports body counts', () => {
      const ctx = prepare();
      const scan = scanWordPackage(new PizZip(fs.readFileSync(ctx.ws.absolutePath)));
      expect(scan.bodyTokenCounts.get('{inspector}')).toBe(2);
      expect(sha(fs.readFileSync(ctx.ws.absolutePath))).toBe(ctx.hash);
    });
  });
});
