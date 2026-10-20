import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import PizZip from 'pizzip';
import { DatabaseManager } from '../../src/storage/database/connection.ts';
import { VaultManager } from '../../src/storage/vault/vault-manager.ts';
import { TemplateImporter } from '../../src/storage/vault/template-importer.ts';
import { toReportCategoryId, toTemplateId } from '../../src/shared/types/identifiers.ts';
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

function hashFile(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

describe('OpsReport Studio — Template Importer Pipeline (Step 18)', () => {
  let tempRoot: string;
  let sourceDir: string;
  let dbManager: DatabaseManager;
  let vaultManager: VaultManager;
  let importer: TemplateImporter;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opsreport-importer-test-'));
    sourceDir = path.join(tempRoot, 'UserSourceFiles');
    const appDataRoot = path.join(tempRoot, 'AppData');
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.mkdirSync(appDataRoot, { recursive: true });

    vaultManager = new VaultManager(appDataRoot);
    vaultManager.initializeVault();
    VaultManager.setInstance(vaultManager);

    const dbPath = path.join(vaultManager.databaseDir, 'test_opsreport.db');
    dbManager = new DatabaseManager({ databasePath: dbPath });
    dbManager.initialize();

    importer = new TemplateImporter(dbManager.getDatabase(), vaultManager);
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
        // Safe cleanup ignore
      }
    }
  });

  it('IMP-01: Successfully imports valid Excel template, preserves source file, and registers metadata', async () => {
    // 1. Create a source file in the user's directory
    const sourcePath = path.join(sourceDir, 'Platform_Fan_Audit_Source.xlsx');
    fs.writeFileSync(sourcePath, createMinimalExcelZip());
    const originalHash = hashFile(sourcePath);
    const originalStat = fs.statSync(sourcePath);

    // 2. Run import pipeline
    const importRes = await importer.importTemplate({
      sourceFilePath: sourcePath,
      templateName: 'Imported Platform Fan Master',
      categoryId: toReportCategoryId('RPT-FAN'),
      documentType: 'EXCEL_XLSX',
      description: 'Production operational template imported from user files',
    });

    expect(importRes.ok).toBe(true);
    if (importRes.ok) {
      expect(importRes.value.template.template_name).toBe('Imported Platform Fan Master');
      expect(importRes.value.template.category_id).toBe('RPT-FAN');
      expect(importRes.value.template.document_type).toBe('EXCEL_XLSX');
      expect(importRes.value.template.status).toBe('ACTIVE');

      // 3. Verify promoted file exists in the Master Vault
      expect(fs.existsSync(importRes.value.vaultPath)).toBe(true);
      expect(importRes.value.vaultPath.startsWith(vaultManager.templatesDir)).toBe(true);

      // 4. Invariant: Source file remains 100% UNTOUCHED
      expect(fs.existsSync(sourcePath)).toBe(true);
      const afterHash = hashFile(sourcePath);
      expect(afterHash).toBe(originalHash);
      const afterStat = fs.statSync(sourcePath);
      expect(afterStat.size).toBe(originalStat.size);

      // 5. Invariant: Ephemeral scratch directory is clean (staging artifact unlinked)
      const scratchFiles = fs.readdirSync(vaultManager.scratchDir);
      expect(scratchFiles).toHaveLength(0);
    }
  });

  it('IMP-02: Successfully imports valid Word template and assigns stable ID', async () => {
    const sourcePath = path.join(sourceDir, 'Incident_Standard_Source.docx');
    fs.writeFileSync(sourcePath, createMinimalWordZip());

    const importRes = await importer.importTemplate({
      sourceFilePath: sourcePath,
      templateName: 'Station Incident Standard Template',
      categoryId: toReportCategoryId('RPT-INCIDENT'),
      documentType: 'WORD_DOCX',
    });

    expect(importRes.ok).toBe(true);
    if (importRes.ok) {
      expect(importRes.value.template.template_id.startsWith('TPL-INCIDENT-')).toBe(true);
      expect(importRes.value.template.document_type).toBe('WORD_DOCX');
      expect(fs.existsSync(importRes.value.vaultPath)).toBe(true);
    }
  });

  it('IMP-03: Updates existing template descriptor with imported master file', async () => {
    const sourcePath = path.join(sourceDir, 'Updated_Light_Master.xlsx');
    fs.writeFileSync(sourcePath, createMinimalExcelZip());

    // Update the seeded template TPL-STATION-LIGHT-STANDARD
    const importRes = await importer.importTemplate({
      sourceFilePath: sourcePath,
      templateId: toTemplateId('TPL-STATION-LIGHT-STANDARD'),
      templateName: 'Station Light Inspection Master (Revised)',
      categoryId: toReportCategoryId('RPT-STATION-LIGHT'),
      documentType: 'EXCEL_XLSX',
      description: 'Revised inspection workbook',
    });

    expect(importRes.ok).toBe(true);
    if (importRes.ok) {
      expect(importRes.value.template.template_id).toBe('TPL-STATION-LIGHT-STANDARD');
      expect(importRes.value.template.template_name).toBe(
        'Station Light Inspection Master (Revised)'
      );
      expect(fs.existsSync(importRes.value.vaultPath)).toBe(true);
      expect(path.basename(importRes.value.vaultPath)).toBe('TPL-STATION-LIGHT-STANDARD.xlsx');
    }
  });

  it('IMP-04: Rejects corrupted file without modifying source or vault', async () => {
    const sourcePath = path.join(sourceDir, 'Corrupt_File.xlsx');
    fs.writeFileSync(sourcePath, 'PLAIN_TEXT_NOT_A_ZIP_FILE');
    const originalHash = hashFile(sourcePath);

    const initialVaultCount = vaultManager.getVaultFileCount();

    const importRes = await importer.importTemplate({
      sourceFilePath: sourcePath,
      templateName: 'Corrupt Template',
      categoryId: toReportCategoryId('RPT-FAN'),
      documentType: 'EXCEL_XLSX',
    });

    expect(importRes.ok).toBe(false);
    if (!importRes.ok) {
      expect(importRes.error.code).toBe(ErrorCode.TEMPLATE_MALFORMED);
    }

    // Source is untouched
    expect(hashFile(sourcePath)).toBe(originalHash);

    // Vault has no new files
    expect(vaultManager.getVaultFileCount()).toBe(initialVaultCount);

    // Staging was cleaned up
    expect(fs.readdirSync(vaultManager.scratchDir)).toHaveLength(0);
  });

  it('IMP-05: Rejects import if category requires Word but imported file is Excel', async () => {
    const sourcePath = path.join(sourceDir, 'Wrong_Format.xlsx');
    fs.writeFileSync(sourcePath, createMinimalExcelZip());

    // RPT-INCIDENT requires WORD_DOCX
    const importRes = await importer.importTemplate({
      sourceFilePath: sourcePath,
      templateName: 'Mismatch Template',
      categoryId: toReportCategoryId('RPT-INCIDENT'),
      documentType: 'EXCEL_XLSX',
    });

    expect(importRes.ok).toBe(false);
    if (!importRes.ok) {
      expect(importRes.error.code).toBe(ErrorCode.VALIDATION_FAILED);
      expect(importRes.error.userMessage).toContain('Document format mismatch');
    }
  });

  it('IMP-06: Rejects import if source file is inside the master template vault (INV-DAT-006)', async () => {
    // Attempt to select a file located directly inside the template vault
    const insideVaultPath = path.join(vaultManager.templatesDir, 'Sneaky_Inside.xlsx');
    fs.writeFileSync(insideVaultPath, createMinimalExcelZip());

    const importRes = await importer.importTemplate({
      sourceFilePath: insideVaultPath,
      templateName: 'Invalid Source Path',
      categoryId: toReportCategoryId('RPT-FAN'),
      documentType: 'EXCEL_XLSX',
    });

    expect(importRes.ok).toBe(false);
    if (!importRes.ok) {
      expect(importRes.error.code).toBe(ErrorCode.SECURITY_VIOLATION);
    }
  });

  it('IMP-07: Cleans up staging sandbox even when validation fails', async () => {
    const sourcePath = path.join(sourceDir, 'Invalid_Empty.xlsx');
    fs.writeFileSync(sourcePath, Buffer.alloc(0));

    const importRes = await importer.importTemplate({
      sourceFilePath: sourcePath,
      templateName: 'Empty File',
      categoryId: toReportCategoryId('RPT-FAN'),
      documentType: 'EXCEL_XLSX',
    });

    expect(importRes.ok).toBe(false);
    expect(fs.readdirSync(vaultManager.scratchDir)).toHaveLength(0);
  });
});
