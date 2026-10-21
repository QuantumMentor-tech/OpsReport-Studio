import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import PizZip from 'pizzip';
import { DatabaseManager } from '../../src/storage/database/connection.ts';
import { VaultManager } from '../../src/storage/vault/vault-manager.ts';
import { TemplateMetadataRepository } from '../../src/storage/database/repositories/template-metadata-repository.ts';
import {
  toTemplateId,
  toTemplateVersionId,
  toReportCategoryId,
} from '../../src/shared/types/identifiers.ts';
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

function computeHash(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

describe('OpsReport Studio — Master Immutability, Cloning & Versioning (Step 19)', () => {
  let tempRoot: string;
  let vaultManager: VaultManager;
  let dbManager: DatabaseManager;
  let templateRepo: TemplateMetadataRepository;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opsreport-step19-test-'));
    const appDataRoot = path.join(tempRoot, 'AppData');
    fs.mkdirSync(appDataRoot, { recursive: true });

    vaultManager = new VaultManager(appDataRoot);
    vaultManager.initializeVault();
    VaultManager.setInstance(vaultManager);

    const dbPath = path.join(vaultManager.databaseDir, 'test_opsreport.db');
    dbManager = new DatabaseManager({ databasePath: dbPath });
    dbManager.initialize();

    templateRepo = new TemplateMetadataRepository(dbManager.getDatabase());
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
  // 1. Master Template Immutability Tests
  // ---------------------------------------------------------------------------
  describe('Master Template Immutability', () => {
    it('IMM-01: Sets read-only mode (0o444) on accepted master template file in vault', () => {
      const templateId = toTemplateId('TPL-FAN-TEST');
      const targetPathRes = vaultManager.resolveTemplateVaultPath(templateId, '.xlsx');
      expect(targetPathRes.ok).toBe(true);
      if (!targetPathRes.ok) return;

      fs.writeFileSync(targetPathRes.value, createMinimalExcelZip());
      const roRes = vaultManager.makeFileReadOnly(targetPathRes.value);
      expect(roRes.ok).toBe(true);

      const stat = fs.statSync(targetPathRes.value);
      const isReadOnly = (stat.mode & 0o222) === 0;
      expect(isReadOnly).toBe(true);
    });

    it('IMM-02: Routine metadata updates do NOT alter physical document bytes or hash', () => {
      const templateId = toTemplateId('TPL-STATION-LIGHT-STANDARD');
      const targetPathRes = vaultManager.resolveTemplateVaultPath(templateId, '.xlsx');
      expect(targetPathRes.ok).toBe(true);
      if (!targetPathRes.ok) return;

      fs.writeFileSync(targetPathRes.value, createMinimalExcelZip());
      const originalHash = computeHash(targetPathRes.value);

      // Perform metadata title and description update
      const updateRes = templateRepo.updateTemplate(templateId, {
        templateName: 'Updated Display Name for Station Light Inspection',
        description: 'New operational instructions added to metadata.',
      });

      expect(updateRes.ok).toBe(true);

      // Physical master bytes remain completely unchanged
      const afterHash = computeHash(targetPathRes.value);
      expect(afterHash).toBe(originalHash);
    });

    it('IMM-03: Verifies physical file integrity and detects external byte tampering', () => {
      const templateId = toTemplateId('TPL-FAN-INTEGRITY');
      const targetPathRes = vaultManager.resolveTemplateVaultPath(templateId, '.xlsx');
      expect(targetPathRes.ok).toBe(true);
      if (!targetPathRes.ok) return;

      const initialBytes = createMinimalExcelZip();
      fs.writeFileSync(targetPathRes.value, initialBytes);
      const initialHash = computeHash(targetPathRes.value);

      // Register template metadata and version 1
      templateRepo.createTemplate({
        templateId,
        templateName: 'Fan Integrity Master',
        categoryId: toReportCategoryId('RPT-FAN'),
        documentType: 'EXCEL_XLSX',
        fileName: path.basename(targetPathRes.value),
      });

      const versionRes = templateRepo.registerNewVersion({
        templateId,
        fileName: path.basename(targetPathRes.value),
        sha256Hash: initialHash,
        fileSizeBytes: initialBytes.length,
        changeSummary: 'Initial version',
      });
      expect(versionRes.ok).toBe(true);
      if (!versionRes.ok) return;

      // 1. Verify intact version
      const intactCheck = vaultManager.verifyVersionIntegrity(versionRes.value);
      expect(intactCheck.ok).toBe(true);
      if (intactCheck.ok) {
        expect(intactCheck.value.isIntact).toBe(true);
        expect(intactCheck.value.actualHash).toBe(initialHash);
      }

      // 2. Tamper with file on disk (simulate external unauthorized modification)
      try {
        fs.chmodSync(targetPathRes.value, 0o666);
      } catch {
        // ignore
      }
      fs.writeFileSync(
        targetPathRes.value,
        Buffer.concat([initialBytes, Buffer.from('TAMPERED_BYTES')])
      );

      const tamperedCheck = vaultManager.verifyVersionIntegrity(versionRes.value);
      expect(tamperedCheck.ok).toBe(true);
      if (tamperedCheck.ok) {
        expect(tamperedCheck.value.isIntact).toBe(false);
        expect(tamperedCheck.value.actualHash).not.toBe(initialHash);
        expect(tamperedCheck.value.statusMessage).toContain('Integrity check failed');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Safe Template Cloning Tests
  // ---------------------------------------------------------------------------
  describe('Safe Template Cloning Service', () => {
    it('CLN-01: Creates an independent copy of an accepted master template version', () => {
      const templateId = toTemplateId('TPL-POLE-LIGHT-STANDARD');
      const activeVersionRes = templateRepo.getActiveVersion(templateId);
      expect(activeVersionRes.ok).toBe(true);
      if (!activeVersionRes.ok || !activeVersionRes.value) return;

      const targetPathRes = vaultManager.resolveTemplateFileVaultPath(
        activeVersionRes.value.file_name
      );
      expect(targetPathRes.ok).toBe(true);
      if (!targetPathRes.ok) return;

      const masterBytes = createMinimalExcelZip();
      fs.writeFileSync(targetPathRes.value, masterBytes);
      const masterHash = computeHash(targetPathRes.value);

      const cloneRes = vaultManager.cloneMasterTemplate(activeVersionRes.value, {
        purpose: 'WORKING_COPY',
        templateId,
      });

      expect(cloneRes.ok).toBe(true);
      if (cloneRes.ok) {
        // 1. Cloned file exists and is in Scratch sandbox
        expect(fs.existsSync(cloneRes.value.clonedPath)).toBe(true);
        expect(cloneRes.value.clonedPath.startsWith(vaultManager.scratchDir)).toBe(true);

        // 2. Hash of clone exactly matches master source hash
        expect(cloneRes.value.sha256Hash).toBe(masterHash);
        expect(computeHash(cloneRes.value.clonedPath)).toBe(masterHash);

        // 3. Source master remains 100% UNTOUCHED
        expect(computeHash(targetPathRes.value)).toBe(masterHash);

        // 4. Source and clone paths are completely distinct
        expect(cloneRes.value.clonedPath).not.toBe(targetPathRes.value);
      }
    });

    it('CLN-02: Cloning Word template preserves document structure and byte equality', () => {
      const templateId = toTemplateId('TPL-INCIDENT-STANDARD');
      const targetPathRes = vaultManager.resolveTemplateFileVaultPath(
        'security_incident_report_master.docx'
      );
      expect(targetPathRes.ok).toBe(true);
      if (!targetPathRes.ok) return;

      const docxBytes = createMinimalWordZip();
      fs.writeFileSync(targetPathRes.value, docxBytes);
      const docxHash = computeHash(targetPathRes.value);

      const activeVersionRes = templateRepo.getActiveVersion(templateId);
      expect(activeVersionRes.ok).toBe(true);
      if (!activeVersionRes.ok || !activeVersionRes.value) return;

      const cloneRes = vaultManager.cloneMasterTemplate(activeVersionRes.value, {
        purpose: 'REPORT_GENERATION',
        templateId,
      });

      expect(cloneRes.ok).toBe(true);
      if (cloneRes.ok) {
        expect(fs.existsSync(cloneRes.value.clonedPath)).toBe(true);
        expect(cloneRes.value.fileName.endsWith('.docx')).toBe(true);
        expect(computeHash(cloneRes.value.clonedPath)).toBe(docxHash);
      }
    });

    it('CLN-03: Rejects clone request when source master file is missing', () => {
      const activeVersionRes = templateRepo.getActiveVersion(
        toTemplateId('TPL-FIRE-EXTINGUISHER-STANDARD')
      );
      expect(activeVersionRes.ok).toBe(true);
      if (!activeVersionRes.ok || !activeVersionRes.value) return;

      // File was never created on disk in this fresh test run
      const cloneRes = vaultManager.cloneMasterTemplate(activeVersionRes.value, {
        purpose: 'WORKING_COPY',
      });

      expect(cloneRes.ok).toBe(false);
      if (!cloneRes.ok) {
        expect(cloneRes.error.code).toBe(ErrorCode.TEMPLATE_NOT_FOUND);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Template Versioning & History Tests
  // ---------------------------------------------------------------------------
  describe('Template Versioning & History', () => {
    it('VER-01: Initial migration seeds version 1 for all default templates', () => {
      const allTemplates = templateRepo.getAllTemplates();
      expect(allTemplates.ok).toBe(true);
      if (!allTemplates.ok) return;

      expect(allTemplates.value).toHaveLength(7);
      for (const tpl of allTemplates.value) {
        expect(tpl.total_versions).toBe(1);
        expect(tpl.active_version_id).toBe(`VER-${tpl.template_id}-V1`);

        const versionsRes = templateRepo.getVersionsByTemplateId(tpl.template_id);
        expect(versionsRes.ok).toBe(true);
        if (versionsRes.ok) {
          expect(versionsRes.value).toHaveLength(1);
          expect(versionsRes.value[0].version_number).toBe(1);
          expect(versionsRes.value[0].is_active).toBe(1);
        }
      }
    });

    it('VER-02: Registers sequential new versions without overwriting older version files', () => {
      const templateId = toTemplateId('TPL-FAN-STANDARD');

      // Create physical files for v1, v2, v3
      const v1Filename = 'platform_fan_audit_master.xlsx';
      const v2Filename = 'TPL-FAN-STANDARD_v2.xlsx';
      const v3Filename = 'TPL-FAN-STANDARD_v3.xlsx';

      const p1 = path.join(vaultManager.templatesDir, v1Filename);
      const p2 = path.join(vaultManager.templatesDir, v2Filename);
      const p3 = path.join(vaultManager.templatesDir, v3Filename);

      fs.writeFileSync(p1, createMinimalExcelZip());
      fs.writeFileSync(p2, Buffer.concat([createMinimalExcelZip(), Buffer.from('REV2')]));
      fs.writeFileSync(p3, Buffer.concat([createMinimalExcelZip(), Buffer.from('REV3')]));

      const h1 = computeHash(p1);
      const h2 = computeHash(p2);
      const h3 = computeHash(p3);

      // Register v2
      const regV2 = templateRepo.registerNewVersion({
        templateId,
        fileName: v2Filename,
        sha256Hash: h2,
        fileSizeBytes: fs.statSync(p2).size,
        changeSummary: 'Second revision with updated fan circuit references',
        setActive: true,
      });
      expect(regV2.ok).toBe(true);

      // Register v3
      const regV3 = templateRepo.registerNewVersion({
        templateId,
        fileName: v3Filename,
        sha256Hash: h3,
        fileSizeBytes: fs.statSync(p3).size,
        changeSummary: 'Third revision with calibrated pressure thresholds',
        setActive: true,
      });
      expect(regV3.ok).toBe(true);

      // Verify version history ordering: v3, v2, v1
      const historyRes = templateRepo.getVersionsByTemplateId(templateId);
      expect(historyRes.ok).toBe(true);
      if (historyRes.ok) {
        expect(historyRes.value).toHaveLength(3);
        expect(historyRes.value[0].version_number).toBe(3);
        expect(historyRes.value[0].file_name).toBe(v3Filename);
        expect(historyRes.value[0].is_active).toBe(1);

        expect(historyRes.value[1].version_number).toBe(2);
        expect(historyRes.value[1].file_name).toBe(v2Filename);
        expect(historyRes.value[1].is_active).toBe(0);

        expect(historyRes.value[2].version_number).toBe(1);
        expect(historyRes.value[2].file_name).toBe(v1Filename);
        expect(historyRes.value[2].is_active).toBe(0);
      }

      // Verify all physical files remain intact on disk with distinct hashes
      expect(computeHash(p1)).toBe(h1);
      expect(computeHash(p2)).toBe(h2);
      expect(computeHash(p3)).toBe(h3);
    });

    it('VER-03: Allows switching active version deterministically', () => {
      const templateId = toTemplateId('TPL-POLE-LIGHT-STANDARD');
      const v1Id = toTemplateVersionId(`VER-${templateId}-V1`);

      // Register version 2
      const regV2 = templateRepo.registerNewVersion({
        templateId,
        fileName: 'TPL-POLE-LIGHT-STANDARD_v2.xlsx',
        sha256Hash: '1111111111111111111111111111111111111111111111111111111111111111',
        fileSizeBytes: 12000,
        changeSummary: 'Revision 2',
        setActive: true,
      });
      expect(regV2.ok).toBe(true);

      let activeVer = templateRepo.getActiveVersion(templateId);
      expect(activeVer.ok && activeVer.value?.version_number).toBe(2);

      // Revert active designation to Version 1
      const revertRes = templateRepo.setActiveVersion(templateId, v1Id);
      expect(revertRes.ok).toBe(true);

      activeVer = templateRepo.getActiveVersion(templateId);
      expect(activeVer.ok && activeVer.value?.version_number).toBe(1);

      const tplRecord = templateRepo.getTemplateById(templateId);
      expect(tplRecord.ok && tplRecord.value?.active_version_id).toBe(v1Id);
    });
  });
});
