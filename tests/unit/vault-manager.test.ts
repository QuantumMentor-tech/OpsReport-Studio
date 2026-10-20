import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { VaultManager } from '../../src/storage/vault/vault-manager.ts';
import {
  isPathInsideRoot,
  assertPathInsideRoot,
  assertTargetNotInsideVault,
  validateInternalIdentifier,
  normalizeTemplateExtension,
} from '../../src/storage/vault/path-security.ts';
import { toTemplateId } from '../../src/shared/types/identifiers.ts';
import { ErrorCode } from '../../src/shared/errors/error-codes.ts';

describe('OpsReport Studio — Master Template Vault & Storage (Step 17)', () => {
  let tempRoot: string;
  let vault: VaultManager;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opsreport-vault-test-'));
    vault = new VaultManager(tempRoot);
    VaultManager.setInstance(vault);
  });

  afterEach(() => {
    VaultManager.setInstance(null);
    if (fs.existsSync(tempRoot)) {
      try {
        fs.rmSync(tempRoot, { recursive: true, force: true });
      } catch {
        // Safe cleanup ignore if locked by OS
      }
    }
  });

  it('VLT-01: Idempotently initializes storage layout in isolated app data root', () => {
    // Before initialization, directories do not exist
    const initialStatus = vault.getStorageStatus();
    expect(initialStatus.ok).toBe(true);
    if (initialStatus.ok) {
      expect(initialStatus.value.isReady).toBe(false);
      expect(initialStatus.value.templatesDir.exists).toBe(false);
    }

    // First initialization
    const initRes = vault.initializeVault();
    expect(initRes.ok).toBe(true);
    if (initRes.ok) {
      expect(initRes.value.isReady).toBe(true);
      expect(initRes.value.templatesDir.exists).toBe(true);
      expect(initRes.value.templatesDir.isWritable).toBe(true);
      expect(initRes.value.scratchDir.exists).toBe(true);
      expect(initRes.value.reportsDir.exists).toBe(true);
      expect(initRes.value.databaseDir.exists).toBe(true);
      expect(initRes.value.totalTemplatesInVault).toBe(0);
    }

    // Verify physical directories exist on disk
    expect(fs.existsSync(vault.templatesDir)).toBe(true);
    expect(fs.existsSync(vault.scratchDir)).toBe(true);
    expect(fs.existsSync(vault.reportsDir)).toBe(true);
    expect(fs.existsSync(vault.databaseDir)).toBe(true);
    expect(fs.existsSync(vault.logsDir)).toBe(true);
    expect(fs.existsSync(vault.backupsDir)).toBe(true);

    // Second initialization must be idempotent and succeed without altering files
    const secondInitRes = vault.initializeVault();
    expect(secondInitRes.ok).toBe(true);
  });

  it('VLT-02: Enforces physical separation between vault, scratch, reports, and database', () => {
    expect(vault.templatesDir).not.toBe(vault.scratchDir);
    expect(vault.templatesDir).not.toBe(vault.reportsDir);
    expect(vault.templatesDir).not.toBe(vault.databaseDir);
    expect(vault.reportsDir).not.toBe(vault.scratchDir);

    expect(vault.templatesDir).toBe(path.join(tempRoot, 'Templates'));
    expect(vault.scratchDir).toBe(path.join(tempRoot, 'Scratch'));
    expect(vault.reportsDir).toBe(path.join(tempRoot, 'Reports'));
    expect(vault.databaseDir).toBe(path.join(tempRoot, 'Database'));
    expect(vault.logsDir).toBe(path.join(tempRoot, 'Logs'));
    expect(vault.backupsDir).toBe(path.join(tempRoot, 'Backups'));
  });

  it('VLT-03: Fails cleanly if a regular file occupies an expected directory path', () => {
    // Create a regular file where the Templates directory should be
    const templatesPath = path.join(tempRoot, 'Templates');
    fs.mkdirSync(tempRoot, { recursive: true });
    fs.writeFileSync(templatesPath, 'I am a regular file');

    const initRes = vault.initializeVault();
    expect(initRes.ok).toBe(false);
    if (!initRes.ok) {
      expect(initRes.error.code).toBe(ErrorCode.FILE_ACCESS_DENIED);
      expect(initRes.error.userMessage).toContain('exists but is not a directory');
    }
  });

  it('VLT-04: Resolves stable template vault path for valid template identifiers', () => {
    vault.initializeVault();

    // Default to .xlsx
    const resXlsx = vault.resolveTemplateVaultPath(toTemplateId('TPL-INCIDENT-STANDARD'));
    expect(resXlsx.ok).toBe(true);
    if (resXlsx.ok) {
      expect(resXlsx.value).toBe(path.join(vault.templatesDir, 'TPL-INCIDENT-STANDARD.xlsx'));
    }

    // Explicit .docx
    const resDocx = vault.resolveTemplateVaultPath(toTemplateId('TPL-OBS-WORD'), '.docx');
    expect(resDocx.ok).toBe(true);
    if (resDocx.ok) {
      expect(resDocx.value).toBe(path.join(vault.templatesDir, 'TPL-OBS-WORD.docx'));
    }

    // Rejects unsupported extension
    const resPdf = vault.resolveTemplateVaultPath(toTemplateId('TPL-BAD'), '.pdf');
    expect(resPdf.ok).toBe(false);
    if (!resPdf.ok) {
      expect(resPdf.error.code).toBe(ErrorCode.TEMPLATE_UNSUPPORTED_FORMAT);
    }
  });

  it('VLT-05: Rejects path traversal and invalid characters in template identifiers', () => {
    // Traversal attempts
    const traversal1 = vault.resolveTemplateVaultPath(toTemplateId('../../../evil'));
    expect(traversal1.ok).toBe(false);
    if (!traversal1.ok) {
      expect(traversal1.error.code).toBe(ErrorCode.VALIDATION_FAILED);
    }

    const traversal2 = vault.resolveTemplateVaultPath(toTemplateId('..\\..\\windows_evil'));
    expect(traversal2.ok).toBe(false);

    // Characters like spaces, slashes, semicolons are invalid
    const invalidChars = vault.resolveTemplateVaultPath(toTemplateId('TPL INCIDENT;'));
    expect(invalidChars.ok).toBe(false);
  });

  it('VLT-06: Asserts null byte rejection in all path security guards', () => {
    expect(isPathInsideRoot('C:\\vault\0\\exploit.xlsx', 'C:\\vault')).toBe(false);

    expect(() => {
      assertPathInsideRoot('C:\\vault\0\\exploit.xlsx', 'C:\\vault');
    }).toThrow();

    const scratchRes = vault.resolveScratchPath('temp\0file.tmp');
    expect(scratchRes.ok).toBe(false);
    if (!scratchRes.ok) {
      expect(scratchRes.error.code).toBe(ErrorCode.SECURITY_VIOLATION);
    }
  });

  it('VLT-07: Resolves scratch path and prevents directory traversal within scratch sandbox', () => {
    vault.initializeVault();

    const validScratch = vault.resolveScratchPath('import_1234.tmp');
    expect(validScratch.ok).toBe(true);
    if (validScratch.ok) {
      expect(validScratch.value).toBe(path.join(vault.scratchDir, 'import_1234.tmp'));
    }

    // Prohibit traversal or separators in scratch names
    const escapeScratch = vault.resolveScratchPath('../templates/overwrite.xlsx');
    expect(escapeScratch.ok).toBe(false);
    if (!escapeScratch.ok) {
      expect(escapeScratch.error.code).toBe(ErrorCode.SECURITY_VIOLATION);
    }
  });

  it('VLT-08: Prevents generated report output paths from targeting the Master Template Vault (INV-DAT-006)', () => {
    vault.initializeVault();

    // Standard report path in Reports directory
    const validReport = vault.resolveReportOutputPath('Shift_Report_20261020.xlsx');
    expect(validReport.ok).toBe(true);
    if (validReport.ok) {
      expect(validReport.value).toBe(path.join(vault.reportsDir, 'Shift_Report_20261020.xlsx'));
    }

    // Violation: Attempting to point custom output dir into the Templates Vault
    const vaultViolation = vault.resolveReportOutputPath('Shift_Report.xlsx', vault.templatesDir);
    expect(vaultViolation.ok).toBe(false);
    if (!vaultViolation.ok) {
      expect(vaultViolation.error.code).toBe(ErrorCode.SECURITY_VIOLATION);
      expect(vaultViolation.error.userMessage).toContain('Master Template Vault is prohibited');
    }

    // Direct assertion test
    expect(() => assertTargetNotInsideVault(vault.templatesDir, vault.templatesDir)).toThrow();
  });

  it('VLT-09: Sweeps and purges stale .tmp files in scratch sandbox', () => {
    vault.initializeVault({ skipScratchPurge: true });

    const freshFile = path.join(vault.scratchDir, 'fresh.tmp');
    const staleFile = path.join(vault.scratchDir, 'stale.tmp');
    const keepOtherFile = path.join(vault.scratchDir, 'keep_me.txt');

    fs.writeFileSync(freshFile, 'fresh content');
    fs.writeFileSync(staleFile, 'stale content');
    fs.writeFileSync(keepOtherFile, 'not a tmp file');

    // Artificially age the stale file by 1 hour
    const oneHourAgo = new Date(Date.now() - 3600 * 1000);
    fs.utimesSync(staleFile, oneHourAgo, oneHourAgo);

    // Run purge with 15-minute threshold (900,000 ms)
    const purgeRes = vault.purgeStaleScratch(15 * 60 * 1000);
    expect(purgeRes.ok).toBe(true);
    if (purgeRes.ok) {
      expect(purgeRes.value).toBe(1);
    }

    expect(fs.existsSync(staleFile)).toBe(false);
    expect(fs.existsSync(freshFile)).toBe(true);
    expect(fs.existsSync(keepOtherFile)).toBe(true);
  });

  it('VLT-10: Accurately checks physical file existence and returns file descriptor', () => {
    vault.initializeVault();
    const tplId = toTemplateId('TPL-STATION-DAILY');

    // Initially does not exist on disk
    const existsBefore = vault.checkTemplateFileExists(tplId, '.xlsx');
    expect(existsBefore.ok).toBe(true);
    if (existsBefore.ok) {
      expect(existsBefore.value).toBe(false);
    }

    const descBefore = vault.getTemplateFileDescriptor(tplId, '.xlsx');
    expect(descBefore.ok).toBe(true);
    if (descBefore.ok) {
      expect(descBefore.value).toBeNull();
    }

    // Simulate placing a template file into the vault
    const targetPath = vault.resolveTemplateVaultPath(tplId, '.xlsx');
    expect(targetPath.ok).toBe(true);
    if (targetPath.ok) {
      fs.writeFileSync(targetPath.value, 'MOCK_EXCEL_BINARY_CONTENT');
    }

    // Now exists
    const existsAfter = vault.checkTemplateFileExists(tplId, '.xlsx');
    expect(existsAfter.ok).toBe(true);
    if (existsAfter.ok) {
      expect(existsAfter.value).toBe(true);
    }

    const descAfter = vault.getTemplateFileDescriptor(tplId, '.xlsx');
    expect(descAfter.ok).toBe(true);
    if (descAfter.ok && descAfter.value) {
      expect(descAfter.value.templateId).toBe('TPL-STATION-DAILY');
      expect(descAfter.value.fileName).toBe('TPL-STATION-DAILY.xlsx');
      expect(descAfter.value.extension).toBe('.xlsx');
      expect(descAfter.value.fileSizeBytes).toBeGreaterThan(0);
      expect(descAfter.value.relativeVaultPath).toBe('TPL-STATION-DAILY.xlsx');
    }
  });

  it('VLT-11: Reflects physical template file counts in vault storage status', () => {
    vault.initializeVault();

    // Zero files
    expect(vault.getVaultFileCount()).toBe(0);

    // Create 2 template files (.xlsx and .docx) and 1 non-template file
    fs.writeFileSync(path.join(vault.templatesDir, 'T1.xlsx'), 'content1');
    fs.writeFileSync(path.join(vault.templatesDir, 'T2.docx'), 'content2');
    fs.writeFileSync(path.join(vault.templatesDir, 'ignore.txt'), 'not-a-template');

    expect(vault.getVaultFileCount()).toBe(2);

    const status = vault.getStorageStatus();
    expect(status.ok).toBe(true);
    if (status.ok) {
      expect(status.value.totalTemplatesInVault).toBe(2);
      expect(status.value.statusMessage).toContain('2 master template file(s) in vault');
    }
  });

  it('VLT-12: Validates helper security functions independently', () => {
    expect(validateInternalIdentifier('TPL-VALID_123')).toBe(true);
    expect(validateInternalIdentifier('invalid/slash')).toBe(false);
    expect(validateInternalIdentifier('')).toBe(false);

    expect(normalizeTemplateExtension('.XLSX')).toBe('.xlsx');
    expect(normalizeTemplateExtension('docx')).toBe('.docx');
    expect(normalizeTemplateExtension()).toBe('.xlsx');
    expect(() => normalizeTemplateExtension('.exe')).toThrow();
  });
});
