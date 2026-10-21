import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import PizZip from 'pizzip';
import { DatabaseManager } from '../../src/storage/database/connection.ts';
import { VaultManager } from '../../src/storage/vault/vault-manager.ts';
import { TemplateMetadataRepository } from '../../src/storage/database/repositories/template-metadata-repository.ts';
import { TemplateImporter } from '../../src/storage/vault/template-importer.ts';
import { TemplateHealthService } from '../../src/storage/vault/template-health-service.ts';
import type { Result } from '../../src/shared/types/result.ts';
import {
  toTemplateId,
  toReportCategoryId,
  toTemplateVersionId,
} from '../../src/shared/types/identifiers.ts';
import { ErrorCode } from '../../src/shared/errors/error-codes.ts';

function unwrap<T>(res: Result<T, unknown>): T {
  if (!res.ok) {
    const errMsg =
      res.error instanceof Error
        ? res.error.message
        : typeof res.error === 'object' && res.error !== null && 'userMessage' in res.error
          ? String((res.error as { userMessage: string }).userMessage)
          : JSON.stringify(res.error);
    throw new Error(`Expected Ok, got Err: ${errMsg}`);
  }
  return res.value;
}

function unwrapErr<E>(res: Result<unknown, E>): E {
  if (res.ok) {
    throw new Error(`Expected Err, got Ok: ${JSON.stringify(res.value)}`);
  }
  return res.error;
}

function createMinimalExcelZip(contentMarker = 'sheet1'): Buffer {
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
    `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><data>${contentMarker}</data></workbook>`
  );
  return zip.generate({ type: 'nodebuffer' });
}

function createMinimalWordZip(contentMarker = 'doc1'): Buffer {
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
    `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>${contentMarker}</w:t></w:r></w:p></w:document>`
  );
  return zip.generate({ type: 'nodebuffer' });
}

function computeHash(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

describe('OpsReport Studio — Template Library Management, Replacement & Recovery (Step 21)', () => {
  let tempRoot: string;
  let vaultManager: VaultManager;
  let dbManager: DatabaseManager;
  let templateRepo: TemplateMetadataRepository;
  let templateImporter: TemplateImporter;
  let healthService: TemplateHealthService;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opsreport-step21-test-'));
    const appDataRoot = path.join(tempRoot, 'AppData');
    fs.mkdirSync(appDataRoot, { recursive: true });

    vaultManager = new VaultManager(appDataRoot);
    vaultManager.initializeVault();
    VaultManager.setInstance(vaultManager);

    const dbPath = path.join(vaultManager.databaseDir, 'test_opsreport.db');
    dbManager = new DatabaseManager({ databasePath: dbPath });
    dbManager.initialize();

    templateRepo = new TemplateMetadataRepository(dbManager.getDatabase());
    templateImporter = new TemplateImporter(dbManager.getDatabase(), vaultManager);
    healthService = new TemplateHealthService(dbManager.getDatabase(), vaultManager);
  });

  afterEach(() => {
    VaultManager.setInstance(null);
    if (dbManager?.isOpen()) {
      dbManager.close();
    }
    if (fs.existsSync(tempRoot)) {
      try {
        fs.rmSync(tempRoot, { recursive: true, force: true });
      } catch {
        // safe ignore
      }
    }
  });

  // ---------------------------------------------------------------------------
  // 1. Library Query, Filtering & Sorting Tests
  // ---------------------------------------------------------------------------
  describe('Library Query, Filtering & Sorting', () => {
    it('LIB-01: Retrieves all registered templates with active version and version count', async () => {
      const src1 = path.join(tempRoot, 'fan_template.xlsx');
      fs.writeFileSync(src1, createMinimalExcelZip('fan'));
      await templateImporter.importTemplate({
        sourceFilePath: src1,
        templateName: 'Station Fan Inspection',
        categoryId: toReportCategoryId('RPT-FAN'),
        documentType: 'EXCEL_XLSX',
        templateId: toTemplateId('TPL-FAN'),
      });

      const src2 = path.join(tempRoot, 'incident_template.docx');
      fs.writeFileSync(src2, createMinimalWordZip('incident'));
      await templateImporter.importTemplate({
        sourceFilePath: src2,
        templateName: 'Incident Briefing Document',
        categoryId: toReportCategoryId('RPT-INCIDENT'),
        documentType: 'WORD_DOCX',
        templateId: toTemplateId('TPL-INCIDENT'),
      });

      const all = unwrap(templateRepo.getAllTemplates());
      expect(all.length).toBeGreaterThanOrEqual(2);

      const fanTpl = all.find(t => t.template_id === 'TPL-FAN');
      expect(fanTpl).toBeDefined();
      expect(fanTpl?.document_type).toBe('EXCEL_XLSX');
      expect(fanTpl?.active_version_id).toBe('VER-TPL-FAN-V1');
      expect(fanTpl?.total_versions).toBe(1);
    });

    it('LIB-02: Filters templates by category, status, and document type', async () => {
      const src1 = path.join(tempRoot, 'tpl1.xlsx');
      fs.writeFileSync(src1, createMinimalExcelZip('1'));
      await templateImporter.importTemplate({
        sourceFilePath: src1,
        templateName: 'Light Inspection',
        categoryId: toReportCategoryId('RPT-STATION-LIGHT'),
        documentType: 'EXCEL_XLSX',
        templateId: toTemplateId('TPL-LIGHT'),
      });

      const src2 = path.join(tempRoot, 'tpl2.docx');
      fs.writeFileSync(src2, createMinimalWordZip('2'));
      unwrap(
        await templateImporter.importTemplate({
          sourceFilePath: src2,
          templateName: 'Security Incident Protocol',
          categoryId: toReportCategoryId('RPT-INCIDENT'),
          documentType: 'WORD_DOCX',
          templateId: toTemplateId('TPL-INCIDENT-CUSTOM'),
        })
      );

      // Filter by category
      const lightFiltered = unwrap(
        templateRepo.getAllTemplates({
          categoryId: toReportCategoryId('RPT-STATION-LIGHT'),
        })
      );
      expect(lightFiltered.some(t => t.template_id === 'TPL-LIGHT')).toBe(true);
      expect(lightFiltered.every(t => t.category_id === 'RPT-STATION-LIGHT')).toBe(true);

      // Filter by status
      unwrap(templateRepo.setTemplateStatus(toTemplateId('TPL-INCIDENT-CUSTOM'), 'ARCHIVED'));
      const archivedFiltered = unwrap(templateRepo.getAllTemplates({ status: 'ARCHIVED' }));
      expect(archivedFiltered.some(t => t.template_id === 'TPL-INCIDENT-CUSTOM')).toBe(true);

      const activeFiltered = unwrap(templateRepo.getAllTemplates({ status: 'ACTIVE' }));
      expect(activeFiltered.some(t => t.template_id === 'TPL-INCIDENT-CUSTOM')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Safe Metadata Management Tests
  // ---------------------------------------------------------------------------
  describe('Safe Metadata Management', () => {
    it('META-01: Permitted fields (name, description) are updated without altering master file bytes', async () => {
      const src = path.join(tempRoot, 'meta_test.xlsx');
      fs.writeFileSync(src, createMinimalExcelZip('original-bytes'));
      const importRes = unwrap(
        await templateImporter.importTemplate({
          sourceFilePath: src,
          templateName: 'Original Name',
          categoryId: toReportCategoryId('RPT-FAN'),
          documentType: 'EXCEL_XLSX',
          templateId: toTemplateId('TPL-META-SAFE'),
          description: 'Original description',
        })
      );

      const originalHash = computeHash(importRes.vaultPath);

      // Perform metadata-only update
      const updated = unwrap(
        templateRepo.updateTemplate(toTemplateId('TPL-META-SAFE'), {
          templateName: 'Renamed Operational Fan Template',
          description: 'Updated operational guidance note',
        })
      );
      expect(updated.template_name).toBe('Renamed Operational Fan Template');
      expect(updated.description).toBe('Updated operational guidance note');

      // Invariant check: Master template bytes on disk are 100% unchanged
      const afterHash = computeHash(importRes.vaultPath);
      expect(afterHash).toBe(originalHash);
    });

    it('META-02: Category change is permitted only when format is compatible', async () => {
      const src = path.join(tempRoot, 'cat_test.xlsx');
      fs.writeFileSync(src, createMinimalExcelZip('cat-test'));
      await templateImporter.importTemplate({
        sourceFilePath: src,
        templateName: 'Category Switch Test',
        categoryId: toReportCategoryId('RPT-FAN'), // EXCEL_XLSX
        documentType: 'EXCEL_XLSX',
        templateId: toTemplateId('TPL-CAT-TEST'),
      });

      // RPT-POLE-LIGHT is EXCEL_XLSX -> allowed
      const validUpdated = unwrap(
        templateRepo.updateTemplate(toTemplateId('TPL-CAT-TEST'), {
          categoryId: toReportCategoryId('RPT-POLE-LIGHT'),
        })
      );
      expect(validUpdated.category_id).toBe('RPT-POLE-LIGHT');

      // RPT-INCIDENT is WORD_DOCX -> rejected for EXCEL_XLSX template!
      const invalidErr = unwrapErr(
        templateRepo.updateTemplate(toTemplateId('TPL-CAT-TEST'), {
          categoryId: toReportCategoryId('RPT-INCIDENT'),
        })
      );
      expect(invalidErr.code).toBe(ErrorCode.VALIDATION_FAILED);
      expect(invalidErr.userMessage).toContain('Category format mismatch');

      // Invariant: Category remains RPT-POLE-LIGHT
      const current = unwrap(templateRepo.getTemplateById(toTemplateId('TPL-CAT-TEST')))!;
      expect(current.category_id).toBe('RPT-POLE-LIGHT');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Controlled Template Replacement Tests
  // ---------------------------------------------------------------------------
  describe('Controlled Template Replacement', () => {
    it('REPL-01: Replaces template by creating version N+1 and preserving historical master bytes', async () => {
      const src1 = path.join(tempRoot, 'version_1.xlsx');
      fs.writeFileSync(src1, createMinimalExcelZip('version 1 payload'));
      const importRes = unwrap(
        await templateImporter.importTemplate({
          sourceFilePath: src1,
          templateName: 'Station Lighting Master',
          categoryId: toReportCategoryId('RPT-STATION-LIGHT'),
          documentType: 'EXCEL_XLSX',
          templateId: toTemplateId('TPL-LIGHT-REPL'),
        })
      );

      const v1Path = importRes.vaultPath;
      const v1Hash = computeHash(v1Path);

      // Perform controlled replacement with Version 2 source file
      const src2 = path.join(tempRoot, 'version_2.xlsx');
      fs.writeFileSync(src2, createMinimalExcelZip('version 2 improved layout'));

      const rep = unwrap(
        await templateImporter.replaceTemplate({
          templateId: toTemplateId('TPL-LIGHT-REPL'),
          sourceFilePath: src2,
          changeSummary: 'Expanded inspection checklist for Step 21',
        })
      );

      expect(rep.newVersion.version_number).toBe(2);
      expect(rep.newVersion.version_id).toBe('VER-TPL-LIGHT-REPL-V2');
      expect(rep.template.active_version_id).toBe('VER-TPL-LIGHT-REPL-V2');
      expect(rep.previousVersionId).toBe('VER-TPL-LIGHT-REPL-V1');

      // Verify physical Version 1 file exists and is completely intact
      expect(fs.existsSync(v1Path)).toBe(true);
      expect(computeHash(v1Path)).toBe(v1Hash);

      // Verify physical Version 2 file exists and is marked read-only
      const v2Path = path.join(vaultManager.templatesDir, rep.newVersion.file_name);
      expect(fs.existsSync(v2Path)).toBe(true);
      expect(computeHash(v2Path)).toBe(rep.newVersion.sha256_hash);

      // Verify both versions exist in database
      const versions = unwrap(templateRepo.getVersionsByTemplateId(toTemplateId('TPL-LIGHT-REPL')));
      expect(versions.length).toBe(2);
      expect(versions.map(v => v.version_number).sort()).toEqual([1, 2]);
    });

    it('REPL-02: Rejects replacement when source document format is incompatible with target template', async () => {
      const srcExcel = path.join(tempRoot, 'excel_master.xlsx');
      fs.writeFileSync(srcExcel, createMinimalExcelZip('excel'));
      await templateImporter.importTemplate({
        sourceFilePath: srcExcel,
        templateName: 'Excel Format Lock',
        categoryId: toReportCategoryId('RPT-FAN'),
        documentType: 'EXCEL_XLSX',
        templateId: toTemplateId('TPL-FORMAT-LOCK'),
      });

      // Attempt to replace an Excel template with a Word docx file
      const srcWord = path.join(tempRoot, 'word_doc.docx');
      fs.writeFileSync(srcWord, createMinimalWordZip('word document'));

      const replaceErr = unwrapErr(
        await templateImporter.replaceTemplate({
          templateId: toTemplateId('TPL-FORMAT-LOCK'),
          sourceFilePath: srcWord,
        })
      );

      expect(replaceErr.code).toBe(ErrorCode.VALIDATION_FAILED);
      expect(replaceErr.userMessage).toContain('Incompatible document format');

      // Verify active version is still V1
      const tpl = unwrap(templateRepo.getTemplateById(toTemplateId('TPL-FORMAT-LOCK')))!;
      expect(tpl.active_version_id).toBe('VER-TPL-FORMAT-LOCK-V1');
      const versions = unwrap(
        templateRepo.getVersionsByTemplateId(toTemplateId('TPL-FORMAT-LOCK'))
      );
      expect(versions.length).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Lifecycle Actions & Dependency Safeguards Tests
  // ---------------------------------------------------------------------------
  describe('Lifecycle Actions & Dependency Safeguards', () => {
    it('LIFE-01: Reversible retirement (ACTIVE <-> ARCHIVED) preserves version history and vault assets', async () => {
      const src = path.join(tempRoot, 'retire_test.xlsx');
      fs.writeFileSync(src, createMinimalExcelZip('retire'));
      const imp = unwrap(
        await templateImporter.importTemplate({
          sourceFilePath: src,
          templateName: 'Retireable Template',
          categoryId: toReportCategoryId('RPT-FAN'),
          documentType: 'EXCEL_XLSX',
          templateId: toTemplateId('TPL-RETIRE'),
        })
      );

      // Archive template
      const archived = unwrap(
        templateRepo.setTemplateStatus(toTemplateId('TPL-RETIRE'), 'ARCHIVED')
      );
      expect(archived.status).toBe('ARCHIVED');

      // Vault file and version records remain intact
      expect(fs.existsSync(imp.vaultPath)).toBe(true);
      expect(unwrap(templateRepo.getVersionsByTemplateId(toTemplateId('TPL-RETIRE'))).length).toBe(
        1
      );

      // Reactivate template
      const activated = unwrap(
        templateRepo.setTemplateStatus(toTemplateId('TPL-RETIRE'), 'ACTIVE')
      );
      expect(activated.status).toBe('ACTIVE');
    });

    it('LIFE-02: Blocks permanent deletion when template is referenced by report sessions', async () => {
      const src = path.join(tempRoot, 'session_dep.xlsx');
      fs.writeFileSync(src, createMinimalExcelZip('session-dep'));
      await templateImporter.importTemplate({
        sourceFilePath: src,
        templateName: 'Session Protected Template',
        categoryId: toReportCategoryId('RPT-FAN'),
        documentType: 'EXCEL_XLSX',
        templateId: toTemplateId('TPL-SESSION-PROTECTED'),
      });

      // Insert station & report session referencing this template
      const db = dbManager.getDatabase();
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO stations (station_id, station_name, display_order, station_code, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, ?, ?)`
      ).run('STN-TEST-01', 'Central Station', 1, 'CEN', now, now);

      db.prepare(
        `INSERT INTO report_sessions (session_id, session_title, category_id, template_id, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'DRAFT', ?, ?)`
      ).run(
        'SES-2026-TEST',
        'Operational Shift Report',
        'RPT-FAN',
        'TPL-SESSION-PROTECTED',
        now,
        now
      );

      // Check dependency count
      const refCount = unwrap(
        templateRepo.getTemplateReferenceCount(toTemplateId('TPL-SESSION-PROTECTED'))
      );
      expect(refCount.sessionCount).toBe(1);

      // Attempt permanent delete -> MUST be blocked
      const delErr = unwrapErr(templateRepo.deleteTemplate(toTemplateId('TPL-SESSION-PROTECTED')));
      expect(delErr.code).toBe(ErrorCode.VALIDATION_FAILED);
      expect(delErr.userMessage).toContain('historical report session');

      // Template still exists
      expect(
        unwrap(templateRepo.getTemplateById(toTemplateId('TPL-SESSION-PROTECTED')))
      ).toBeDefined();
    });

    it('LIFE-03: Allows permanent deletion and deletes vault files when template has 0 session references', async () => {
      const src = path.join(tempRoot, 'clean_del.xlsx');
      fs.writeFileSync(src, createMinimalExcelZip('clean-delete'));
      const imp = unwrap(
        await templateImporter.importTemplate({
          sourceFilePath: src,
          templateName: 'Unreferenced Template',
          categoryId: toReportCategoryId('RPT-FAN'),
          documentType: 'EXCEL_XLSX',
          templateId: toTemplateId('TPL-CLEAN-DEL'),
        })
      );

      const vaultFile = imp.vaultPath;
      expect(fs.existsSync(vaultFile)).toBe(true);

      // Delete template
      const delRes = unwrap(templateRepo.deleteTemplate(toTemplateId('TPL-CLEAN-DEL')));
      expect(delRes).toBe(true);

      // Metadata record is gone
      expect(unwrap(templateRepo.getTemplateById(toTemplateId('TPL-CLEAN-DEL')))).toBeNull();
      // Physical vault file is cleaned up safely
      expect(fs.existsSync(vaultFile)).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Health Detection & User-Directed Recovery Tests
  // ---------------------------------------------------------------------------
  describe('Health Detection & User-Directed Recovery', () => {
    it('HLTH-01: Correctly detects OK, MISSING_FILE, and INTEGRITY_MISMATCH conditions', async () => {
      const src = path.join(tempRoot, 'health_fixture.xlsx');
      fs.writeFileSync(src, createMinimalExcelZip('health-fixture'));
      const imp = unwrap(
        await templateImporter.importTemplate({
          sourceFilePath: src,
          templateName: 'Health Test Template',
          categoryId: toReportCategoryId('RPT-FAN'),
          documentType: 'EXCEL_XLSX',
          templateId: toTemplateId('TPL-HEALTH-CHECK'),
        })
      );

      // 1. Initially intact -> OK
      const h1 = unwrap(healthService.checkTemplateHealth(toTemplateId('TPL-HEALTH-CHECK')));
      expect(h1.status).toBe('OK');
      expect(h1.expectedHash).toBe(h1.actualHash);

      // 2. Tamper with file contents -> INTEGRITY_MISMATCH
      fs.chmodSync(imp.vaultPath, 0o666);
      fs.appendFileSync(imp.vaultPath, Buffer.from('corrupted-bytes'));
      fs.chmodSync(imp.vaultPath, 0o444);

      const h2 = unwrap(healthService.checkTemplateHealth(toTemplateId('TPL-HEALTH-CHECK')));
      expect(h2.status).toBe('INTEGRITY_MISMATCH');

      // 3. Remove file -> MISSING_FILE
      fs.chmodSync(imp.vaultPath, 0o666);
      fs.unlinkSync(imp.vaultPath);

      const h3 = unwrap(healthService.checkTemplateHealth(toTemplateId('TPL-HEALTH-CHECK')));
      expect(h3.status).toBe('MISSING_FILE');
    });

    it('RECOV-01: Recovery Option 1 - Restores historical version when active version is missing', async () => {
      // Create version 1
      const src1 = path.join(tempRoot, 'v1.xlsx');
      fs.writeFileSync(src1, createMinimalExcelZip('v1 content'));
      await templateImporter.importTemplate({
        sourceFilePath: src1,
        templateName: 'Recovery Test Template',
        categoryId: toReportCategoryId('RPT-FAN'),
        documentType: 'EXCEL_XLSX',
        templateId: toTemplateId('TPL-RECOV-1'),
      });

      // Create version 2
      const src2 = path.join(tempRoot, 'v2.xlsx');
      fs.writeFileSync(src2, createMinimalExcelZip('v2 content'));
      const replaceRes = unwrap(
        await templateImporter.replaceTemplate({
          templateId: toTemplateId('TPL-RECOV-1'),
          sourceFilePath: src2,
        })
      );

      // Simulate catastrophic loss of Version 2 file
      const v2Path = path.join(vaultManager.templatesDir, replaceRes.newVersion.file_name);
      fs.chmodSync(v2Path, 0o666);
      fs.unlinkSync(v2Path);

      // Health reports MISSING_FILE, but lists Version 1 as intact historical version
      const healthBefore = unwrap(healthService.checkTemplateHealth(toTemplateId('TPL-RECOV-1')));
      expect(healthBefore.status).toBe('MISSING_FILE');
      expect(healthBefore.availableHistoricalVersionsCount).toBe(1);
      expect(healthBefore.intactHistoricalVersions[0].versionNumber).toBe(1);

      // Execute Recovery: Restore historical version 1
      const restoreRes = unwrap(
        healthService.restoreHistoricalVersion(
          toTemplateId('TPL-RECOV-1'),
          toTemplateVersionId('VER-TPL-RECOV-1-V1')
        )
      );
      expect(restoreRes.version_id).toBe('VER-TPL-RECOV-1-V1');

      // Verify template active version is now V1 and health is back to OK
      const healthAfter = unwrap(healthService.checkTemplateHealth(toTemplateId('TPL-RECOV-1')));
      expect(healthAfter.status).toBe('OK');
      expect(healthAfter.activeVersionId).toBe('VER-TPL-RECOV-1-V1');
      expect(healthAfter.versionNumber).toBe(1);
    });

    it('RECOV-02: Recovery Option 2 - Re-imports clean replacement file creating version N+1', async () => {
      const src1 = path.join(tempRoot, 'bad_v1.xlsx');
      fs.writeFileSync(src1, createMinimalExcelZip('bad v1'));
      const imp = unwrap(
        await templateImporter.importTemplate({
          sourceFilePath: src1,
          templateName: 'Corrupted Master Template',
          categoryId: toReportCategoryId('RPT-FAN'),
          documentType: 'EXCEL_XLSX',
          templateId: toTemplateId('TPL-RECOV-2'),
        })
      );

      // Corrupt file
      fs.chmodSync(imp.vaultPath, 0o666);
      fs.writeFileSync(imp.vaultPath, Buffer.from('junk-data'));
      fs.chmodSync(imp.vaultPath, 0o444);

      expect(unwrap(healthService.checkTemplateHealth(toTemplateId('TPL-RECOV-2'))).status).toBe(
        'INTEGRITY_MISMATCH'
      );

      // Operator provides verified clean replacement file
      const cleanSrc = path.join(tempRoot, 'clean_v2.xlsx');
      fs.writeFileSync(cleanSrc, createMinimalExcelZip('clean and restored payload'));

      unwrap(
        await templateImporter.replaceTemplate({
          templateId: toTemplateId('TPL-RECOV-2'),
          sourceFilePath: cleanSrc,
          changeSummary: 'Disaster recovery: clean replacement version promoted',
        })
      );

      // Health is restored to OK on Version 2
      const healthAfter = unwrap(healthService.checkTemplateHealth(toTemplateId('TPL-RECOV-2')));
      expect(healthAfter.status).toBe('OK');
      expect(healthAfter.versionNumber).toBe(2);
    });
  });
});
