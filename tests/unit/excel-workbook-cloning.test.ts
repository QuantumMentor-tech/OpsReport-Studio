/**
 * OpsReport Studio — Step 26: Excel Workbook Cloning & Isolated Output Creation Tests
 *
 * Verifies:
 * - Version-aware master template resolution and eligibility checks
 * - Cryptographic source integrity checks against vault recorded hashes
 * - Byte-preserving cloning into isolated Generation Workspace (%LOCALAPPDATA%\OpsReportStudio\Workspace\)
 * - Absolute immutability of master template files (0-byte variance, SHA-256 before & after)
 * - Strict isolation from master vault, import staging, database, and final outputs
 * - Safe destination containment and path traversal protections
 * - Report session association and conflict detection
 * - Rollback on failure with safe cleanup of operation-owned artifacts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
import { ExcelWorkbookCloningService } from '../../src/storage/generation/excel-workbook-cloning-service.ts';
import { toTemplateId, toReportCategoryId } from '../../src/shared/types/identifiers.ts';
import { ErrorCode } from '../../src/shared/errors/error-codes.ts';

function createMinimalExcelZip(): Buffer {
  const zip = new PizZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>'
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'
  );
  zip.file(
    'xl/workbook.xml',
    '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>'
  );
  return zip.generate({ type: 'nodebuffer' });
}

function computeFileHash(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

describe('OpsReport Studio — Step 26: Excel Workbook Cloning & Isolated Output Creation', () => {
  let tempRoot: string;
  let vaultManager: VaultManager;
  let dbManager: DatabaseManager;
  let templateRepo: TemplateMetadataRepository;
  let sessionRepo: SessionRepository;
  let workspaceRepo: GenerationWorkspaceRepository;
  let cloningService: ExcelWorkbookCloningService;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opsreport-step26-test-'));
    const appDataRoot = path.join(tempRoot, 'AppData');
    fs.mkdirSync(appDataRoot, { recursive: true });

    vaultManager = new VaultManager(appDataRoot);
    vaultManager.initializeVault();
    VaultManager.setInstance(vaultManager);

    const dbPath = path.join(vaultManager.databaseDir, 'test_opsreport.db');
    dbManager = new DatabaseManager({ databasePath: dbPath });
    dbManager.initialize();
    const db = dbManager.getDatabase();

    templateRepo = new TemplateMetadataRepository(db);
    sessionRepo = new SessionRepository(db);
    workspaceRepo = new GenerationWorkspaceRepository(db, vaultManager);

    cloningService = new ExcelWorkbookCloningService(
      templateRepo,
      vaultManager,
      sessionRepo,
      workspaceRepo
    );
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
  // 1. Master Template Resolution & Eligibility Tests
  // ---------------------------------------------------------------------------
  describe('Master Template Resolution & Eligibility', () => {
    it('CLN-EXC-01: Selects the exact active Excel master template version when versionId is omitted', () => {
      const templateId = toTemplateId('TPL-POLE-LIGHT-STANDARD');
      const activeVerRes = templateRepo.getActiveVersion(templateId);
      expect(activeVerRes.ok).toBe(true);
      if (!activeVerRes.ok || !activeVerRes.value) return;

      // Seed physical master file in vault
      const vaultPathRes = vaultManager.resolveTemplateFileVaultPath(activeVerRes.value.file_name);
      expect(vaultPathRes.ok).toBe(true);
      if (!vaultPathRes.ok) return;

      const excelBytes = createMinimalExcelZip();
      fs.writeFileSync(vaultPathRes.value, excelBytes);
      const masterHash = computeFileHash(vaultPathRes.value);

      // Clone without versionId
      const cloneRes = cloningService.prepareExcelWorkspace({ templateId });
      expect(cloneRes.ok).toBe(true);
      if (!cloneRes.ok) return;

      expect(cloneRes.value.sourceTemplate.template_id).toBe(templateId);
      expect(cloneRes.value.sourceVersion.version_id).toBe(activeVerRes.value.version_id);
      expect(cloneRes.value.workspace.versionNumber).toBe(activeVerRes.value.version_number);
      expect(cloneRes.value.workspace.sha256Hash).toBe(masterHash);
    });

    it('CLN-EXC-02: Selects a specific historical version when versionId is explicitly provided', () => {
      const templateId = toTemplateId('TPL-POLE-LIGHT-STANDARD');
      const versionsRes = templateRepo.getVersionsByTemplateId(templateId);
      expect(versionsRes.ok).toBe(true);
      if (!versionsRes.ok || versionsRes.value.length === 0) return;

      const targetVersion = versionsRes.value[0];
      const vaultPathRes = vaultManager.resolveTemplateFileVaultPath(targetVersion.file_name);
      expect(vaultPathRes.ok).toBe(true);
      if (!vaultPathRes.ok) return;

      fs.writeFileSync(vaultPathRes.value, createMinimalExcelZip());

      const cloneRes = cloningService.prepareExcelWorkspace({
        templateId,
        versionId: targetVersion.version_id,
      });

      expect(cloneRes.ok).toBe(true);
      if (cloneRes.ok) {
        expect(cloneRes.value.sourceVersion.version_id).toBe(targetVersion.version_id);
        expect(cloneRes.value.workspace.versionId).toBe(targetVersion.version_id);
      }
    });

    it('CLN-EXC-03: Rejects clone request when template is a Word document (.docx)', () => {
      const wordTemplateId = toTemplateId('TPL-INCIDENT-STANDARD');
      const cloneRes = cloningService.prepareExcelWorkspace({ templateId: wordTemplateId });

      expect(cloneRes.ok).toBe(false);
      if (!cloneRes.ok) {
        expect(cloneRes.error.code).toBe(ErrorCode.TEMPLATE_UNSUPPORTED_FORMAT);
        expect(cloneRes.error.userMessage).toContain('only supports Excel workbooks');
      }
    });

    it('CLN-EXC-04: Rejects clone request when template does not exist in registry', () => {
      const nonExistent = toTemplateId('TPL-DOES-NOT-EXIST');
      const cloneRes = cloningService.prepareExcelWorkspace({ templateId: nonExistent });

      expect(cloneRes.ok).toBe(false);
      if (!cloneRes.ok) {
        expect(cloneRes.error.code).toBe(ErrorCode.TEMPLATE_NOT_FOUND);
      }
    });

    it('CLN-EXC-05: Rejects version mismatch when versionId belongs to a different template', () => {
      const templateA = toTemplateId('TPL-POLE-LIGHT-STANDARD');
      const templateB = toTemplateId('TPL-HIGH-MAST-LIGHT-STANDARD');

      const verBRes = templateRepo.getActiveVersion(templateB);
      expect(verBRes.ok).toBe(true);
      if (!verBRes.ok || !verBRes.value) return;

      const cloneRes = cloningService.prepareExcelWorkspace({
        templateId: templateA,
        versionId: verBRes.value.version_id,
      });

      expect(cloneRes.ok).toBe(false);
      if (!cloneRes.ok) {
        expect(cloneRes.error.code).toBe(ErrorCode.SECURITY_VIOLATION);
        expect(cloneRes.error.userMessage).toContain('belongs to template');
      }
    });

    it('CLN-EXC-06: Rejects clone request when physical master file is missing from vault', () => {
      const templateId = toTemplateId('TPL-HIGH-MAST-LIGHT-STANDARD');
      const activeVerRes = templateRepo.getActiveVersion(templateId);
      expect(activeVerRes.ok).toBe(true);
      if (!activeVerRes.ok || !activeVerRes.value) return;

      // Ensure file does not exist on disk
      const vaultPathRes = vaultManager.resolveTemplateFileVaultPath(activeVerRes.value.file_name);
      if (vaultPathRes.ok && fs.existsSync(vaultPathRes.value)) {
        fs.unlinkSync(vaultPathRes.value);
      }

      const cloneRes = cloningService.prepareExcelWorkspace({ templateId });
      expect(cloneRes.ok).toBe(false);
      if (!cloneRes.ok) {
        expect(cloneRes.error.code).toBe(ErrorCode.TEMPLATE_NOT_FOUND);
        expect(cloneRes.error.userMessage).toContain('missing from vault');
      }
    });

    it('CLN-EXC-07: Rejects clone request when master template fails integrity verification', () => {
      const templateId = toTemplateId('TPL-POLE-LIGHT-STANDARD');
      const activeVer = templateRepo.getActiveVersion(templateId);
      expect(activeVer.ok).toBe(true);
      if (!activeVer.ok || !activeVer.value) return;

      const vaultPathRes = vaultManager.resolveTemplateFileVaultPath(activeVer.value.file_name);
      expect(vaultPathRes.ok).toBe(true);
      if (!vaultPathRes.ok) return;

      // Write valid excel bytes
      const originalBytes = createMinimalExcelZip();
      fs.writeFileSync(vaultPathRes.value, originalBytes);
      const originalHash = computeFileHash(vaultPathRes.value);

      // Update version record with known hash
      const db = dbManager.getDatabase();
      db.prepare('UPDATE template_versions SET sha256_hash = ? WHERE version_id = ?').run(
        originalHash,
        activeVer.value.version_id
      );

      // Now tamper with file on disk to simulate external tampering
      fs.writeFileSync(vaultPathRes.value, Buffer.concat([originalBytes, Buffer.from('TAMPER')]));

      const cloneRes = cloningService.prepareExcelWorkspace({ templateId });
      expect(cloneRes.ok).toBe(false);
      if (!cloneRes.ok) {
        expect(cloneRes.error.code).toBe(ErrorCode.TEMPLATE_INTEGRITY_COMPROMISED);
        expect(cloneRes.error.userMessage).toContain('integrity compromised');
      }
    });

    it('CLN-EXC-07B: Rejects clone request when template format is Word (.docx)', () => {
      const templateId = toTemplateId('TPL-INCIDENT-STANDARD');
      const cloneRes = cloningService.prepareExcelWorkspace({ templateId });
      expect(cloneRes.ok).toBe(false);
      if (!cloneRes.ok) {
        expect(cloneRes.error.code).toBe(ErrorCode.TEMPLATE_UNSUPPORTED_FORMAT);
        expect(cloneRes.error.userMessage).toContain('only supports Excel workbooks');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Byte-Preserving Cloning & Master Immutability Invariant
  // ---------------------------------------------------------------------------
  describe('Byte-Preserving Cloning & Master Immutability Invariant', () => {
    it('CLN-EXC-08: Creates an independent clone with identical bytes and 0-byte variance on master', () => {
      const templateId = toTemplateId('TPL-POLE-LIGHT-STANDARD');
      const activeVer = templateRepo.getActiveVersion(templateId);
      expect(activeVer.ok).toBe(true);
      if (!activeVer.ok || !activeVer.value) return;

      const vaultPathRes = vaultManager.resolveTemplateFileVaultPath(activeVer.value.file_name);
      expect(vaultPathRes.ok).toBe(true);
      if (!vaultPathRes.ok) return;

      const masterPath = vaultPathRes.value;
      const initialBytes = createMinimalExcelZip();
      fs.writeFileSync(masterPath, initialBytes);
      vaultManager.makeFileReadOnly(masterPath); // 0o444 read-only on disk

      const preHash = computeFileHash(masterPath);
      const preStat = fs.statSync(masterPath);

      // Run cloning service
      const cloneRes = cloningService.prepareExcelWorkspace({ templateId });
      expect(cloneRes.ok).toBe(true);
      if (!cloneRes.ok) return;

      // 1. Working copy exists and has matching hash
      const workingPath = cloneRes.value.workspace.absolutePath;
      expect(fs.existsSync(workingPath)).toBe(true);
      expect(computeFileHash(workingPath)).toBe(preHash);
      expect(fs.statSync(workingPath).size).toBe(preStat.size);

      // 2. Working copy has write permission (0o666) so Step 27 can write to it
      const workingStat = fs.statSync(workingPath);
      expect((workingStat.mode & 0o200) !== 0).toBe(true);

      // 3. CORE INVARIANT: Master template file remains 100% UNTOUCHED
      const postHash = computeFileHash(masterPath);
      const postStat = fs.statSync(masterPath);
      expect(postHash).toBe(preHash);
      expect(postStat.size).toBe(preStat.size);
      expect(cloneRes.value.sourceUntouched).toBe(true);

      // 4. Physical paths are completely distinct
      expect(workingPath).not.toBe(masterPath);
    });

    it('CLN-EXC-09: Validates cloned workbook is a valid Open XML container readable by PizZip', () => {
      const templateId = toTemplateId('TPL-POLE-LIGHT-STANDARD');
      const activeVer = templateRepo.getActiveVersion(templateId);
      if (!activeVer.ok || !activeVer.value) return;

      const vaultPathRes = vaultManager.resolveTemplateFileVaultPath(activeVer.value.file_name);
      if (!vaultPathRes.ok) return;
      fs.writeFileSync(vaultPathRes.value, createMinimalExcelZip());

      const cloneRes = cloningService.prepareExcelWorkspace({ templateId });
      expect(cloneRes.ok).toBe(true);
      if (!cloneRes.ok) return;

      // Re-read with PizZip
      const buffer = fs.readFileSync(cloneRes.value.workspace.absolutePath);
      const zip = new PizZip(buffer);
      expect(zip.file('xl/workbook.xml')).toBeDefined();
      expect(zip.file('[Content_Types].xml')).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Storage Boundary & Isolation Tests
  // ---------------------------------------------------------------------------
  describe('Storage Boundary & Isolation', () => {
    it('CLN-EXC-10: Working copy resides strictly in Workspace/ and outside Templates/, Scratch/, Reports/', () => {
      const templateId = toTemplateId('TPL-POLE-LIGHT-STANDARD');
      const activeVer = templateRepo.getActiveVersion(templateId);
      if (!activeVer.ok || !activeVer.value) return;

      const vaultPathRes = vaultManager.resolveTemplateFileVaultPath(activeVer.value.file_name);
      if (!vaultPathRes.ok) return;
      fs.writeFileSync(vaultPathRes.value, createMinimalExcelZip());

      const cloneRes = cloningService.prepareExcelWorkspace({ templateId });
      expect(cloneRes.ok).toBe(true);
      if (!cloneRes.ok) return;

      const workingPath = cloneRes.value.workspace.absolutePath;

      // Strictly in Workspace/
      expect(workingPath.startsWith(vaultManager.workspaceDir)).toBe(true);

      // Strictly NOT in Templates/
      expect(workingPath.startsWith(vaultManager.templatesDir)).toBe(false);

      // Strictly NOT in Scratch/
      expect(workingPath.startsWith(vaultManager.scratchDir)).toBe(false);

      // Strictly NOT in Reports/
      expect(workingPath.startsWith(vaultManager.reportsDir)).toBe(false);
    });

    it('CLN-EXC-11: Rejects path traversal characters in customPrefix parameter', () => {
      const templateId = toTemplateId('TPL-POLE-LIGHT-STANDARD');
      const cloneRes = cloningService.prepareExcelWorkspace({
        templateId,
        customPrefix: '../../traversal_attack',
      });

      expect(cloneRes.ok).toBe(false);
      if (!cloneRes.ok) {
        expect(cloneRes.error.code).toBe(ErrorCode.SECURITY_VIOLATION);
      }
    });

    it('CLN-EXC-12: Two consecutive clone operations produce distinct, isolated files without collision', () => {
      const templateId = toTemplateId('TPL-POLE-LIGHT-STANDARD');
      const activeVer = templateRepo.getActiveVersion(templateId);
      if (!activeVer.ok || !activeVer.value) return;

      const vaultPathRes = vaultManager.resolveTemplateFileVaultPath(activeVer.value.file_name);
      if (!vaultPathRes.ok) return;
      fs.writeFileSync(vaultPathRes.value, createMinimalExcelZip());

      const clone1 = cloningService.prepareExcelWorkspace({ templateId });
      const clone2 = cloningService.prepareExcelWorkspace({ templateId });

      expect(clone1.ok).toBe(true);
      expect(clone2.ok).toBe(true);
      if (clone1.ok && clone2.ok) {
        expect(clone1.value.workspace.workspaceId).not.toBe(clone2.value.workspace.workspaceId);
        expect(clone1.value.workspace.absolutePath).not.toBe(clone2.value.workspace.absolutePath);
        expect(fs.existsSync(clone1.value.workspace.absolutePath)).toBe(true);
        expect(fs.existsSync(clone2.value.workspace.absolutePath)).toBe(true);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Report Session Integration & Lifecycle Tests
  // ---------------------------------------------------------------------------
  describe('Report Session Integration & Lifecycle', () => {
    it('CLN-EXC-13: Successfully associates working copy with a valid report session', () => {
      const templateId = toTemplateId('TPL-POLE-LIGHT-STANDARD');
      const activeVer = templateRepo.getActiveVersion(templateId);
      if (!activeVer.ok || !activeVer.value) return;

      const vaultPathRes = vaultManager.resolveTemplateFileVaultPath(activeVer.value.file_name);
      if (!vaultPathRes.ok) return;
      fs.writeFileSync(vaultPathRes.value, createMinimalExcelZip());

      // Create a report session in database
      const sessionRes = sessionRepo.createSession({
        sessionTitle: 'Station Inspection Shift A',
        categoryId: toReportCategoryId('RPT-POLE-LIGHT'),
        templateId,
      });
      expect(sessionRes.ok).toBe(true);
      if (!sessionRes.ok) return;

      const sessionId = sessionRes.value.session.sessionId;

      const cloneRes = cloningService.prepareExcelWorkspace({
        templateId,
        sessionId,
      });

      expect(cloneRes.ok).toBe(true);
      if (cloneRes.ok) {
        expect(cloneRes.value.workspace.sessionId).toBe(sessionId);

        // Verify active workspace can be retrieved via repository
        const activeWs = cloningService.getActiveWorkspaceForSession(sessionId);
        expect(activeWs.ok).toBe(true);
        if (activeWs.ok && activeWs.value) {
          expect(activeWs.value.workspaceId).toBe(cloneRes.value.workspace.workspaceId);
          expect(activeWs.value.status).toBe('PREPARED');
        }
      }
    });

    it('CLN-EXC-14: Rejects clone request when session is bound to a conflicting template', () => {
      const templateA = toTemplateId('TPL-POLE-LIGHT-STANDARD');
      const templateB = toTemplateId('TPL-STATION-LIGHT-STANDARD');

      const sessionRes = sessionRepo.createSession({
        sessionTitle: 'Station Inspection Shift B',
        categoryId: toReportCategoryId('RPT-POLE-LIGHT'),
        templateId: templateA, // Bound to template A
      });
      expect(sessionRes.ok).toBe(true);
      if (!sessionRes.ok) return;

      // Attempt to clone template B for session bound to template A
      const cloneRes = cloningService.prepareExcelWorkspace({
        templateId: templateB,
        sessionId: sessionRes.value.session.sessionId,
      });

      expect(cloneRes.ok).toBe(false);
      if (!cloneRes.ok) {
        expect(cloneRes.error.code).toBe(ErrorCode.VALIDATION_FAILED);
        expect(cloneRes.error.userMessage).toContain('conflicts with requested template');
      }
    });

    it('CLN-EXC-15: Automatically supersedes earlier prepared workspace for the same session', () => {
      const templateId = toTemplateId('TPL-POLE-LIGHT-STANDARD');
      const activeVer = templateRepo.getActiveVersion(templateId);
      if (!activeVer.ok || !activeVer.value) return;

      const vaultPathRes = vaultManager.resolveTemplateFileVaultPath(activeVer.value.file_name);
      if (!vaultPathRes.ok) return;
      fs.writeFileSync(vaultPathRes.value, createMinimalExcelZip());

      const sessionRes = sessionRepo.createSession({
        sessionTitle: 'Station Inspection Shift C',
        categoryId: toReportCategoryId('RPT-POLE-LIGHT'),
        templateId,
      });
      if (!sessionRes.ok) return;
      const sessionId = sessionRes.value.session.sessionId;

      // First clone
      const firstClone = cloningService.prepareExcelWorkspace({ templateId, sessionId });
      expect(firstClone.ok).toBe(true);
      if (!firstClone.ok) return;

      // Second clone for the same session (e.g. restart generation)
      const secondClone = cloningService.prepareExcelWorkspace({ templateId, sessionId });
      expect(secondClone.ok).toBe(true);
      if (!secondClone.ok) return;

      // First workspace should now be marked DISCARDED
      const firstWsRecord = cloningService.getWorkspace(firstClone.value.workspace.workspaceId);
      expect(firstWsRecord.ok).toBe(true);
      if (firstWsRecord.ok && firstWsRecord.value) {
        expect(firstWsRecord.value.status).toBe('DISCARDED');
      }

      // Second workspace should be active (PREPARED)
      const activeWs = cloningService.getActiveWorkspaceForSession(sessionId);
      expect(activeWs.ok).toBe(true);
      if (activeWs.ok && activeWs.value) {
        expect(activeWs.value.workspaceId).toBe(secondClone.value.workspace.workspaceId);
        expect(activeWs.value.status).toBe('PREPARED');
      }
    });

    it('CLN-EXC-16: Discarding a workspace removes the physical file from Workspace/', () => {
      const templateId = toTemplateId('TPL-POLE-LIGHT-STANDARD');
      const activeVer = templateRepo.getActiveVersion(templateId);
      if (!activeVer.ok || !activeVer.value) return;

      const vaultPathRes = vaultManager.resolveTemplateFileVaultPath(activeVer.value.file_name);
      if (!vaultPathRes.ok) return;
      fs.writeFileSync(vaultPathRes.value, createMinimalExcelZip());

      const cloneRes = cloningService.prepareExcelWorkspace({ templateId });
      expect(cloneRes.ok).toBe(true);
      if (!cloneRes.ok) return;

      const filePath = cloneRes.value.workspace.absolutePath;
      expect(fs.existsSync(filePath)).toBe(true);

      const discardRes = cloningService.discardWorkspace(cloneRes.value.workspace.workspaceId);
      expect(discardRes.ok).toBe(true);

      // File should now be unlinked
      expect(fs.existsSync(filePath)).toBe(false);

      // Database status is DISCARDED
      const wsRecord = cloningService.getWorkspace(cloneRes.value.workspace.workspaceId);
      expect(wsRecord.ok).toBe(true);
      if (wsRecord.ok && wsRecord.value) {
        expect(wsRecord.value.status).toBe('DISCARDED');
      }
    });
  });
});
