/**
 * OpsReport Studio — Word Document Cloning Service (Step 31)
 *
 * Resolves an approved `.docx` master template version, verifies its integrity against the
 * registry baseline and creates an isolated, byte-verified working copy in the Generation
 * Workspace. The master file is only ever read. Mirrors the Step 26 Excel cloning contract
 * (same workspace table, vault boundary checks and rollback rules) without sharing Excel APIs.
 *
 * @module storage/generation/word-document-cloning-service
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { GenerationWorkspaceRecord } from '../../shared/types/generation.ts';
import type {
  CreateWordCloneOptions,
  WordCloneResult,
} from '../../shared/types/word-generation.ts';
import type { TemplateVersionRecord } from '../../shared/types/templates.ts';
import { toGenerationWorkspaceId } from '../../shared/types/identifiers.ts';
import { VaultManager } from '../vault/vault-manager.ts';
import { TemplateMetadataRepository } from '../database/repositories/template-metadata-repository.ts';
import { SessionRepository } from '../database/repositories/session-repository.ts';
import { GenerationWorkspaceRepository } from '../database/repositories/generation-workspace-repository.ts';
import { validateDocumentFile } from '../vault/document-validator.ts';
import {
  validateInternalIdentifier,
  assertNoNullBytes,
  assertPathInsideRoot,
  assertTargetNotInsideVault,
} from '../vault/path-security.ts';
import { Result, Ok, Err } from '../../shared/types/result.ts';
import { AppError } from '../../shared/errors/app-error.ts';
import { ErrorCode } from '../../shared/errors/error-codes.ts';

function fail(code: keyof typeof ErrorCode, userMessage: string, operational = true) {
  return Err(new AppError({ code: ErrorCode[code], userMessage, isOperational: operational }));
}

export class WordDocumentCloningService {
  private readonly vaultManager: VaultManager;

  constructor(
    private readonly templateRepo: TemplateMetadataRepository,
    vaultManager?: VaultManager,
    private readonly sessionRepo?: SessionRepository,
    private readonly workspaceRepo?: GenerationWorkspaceRepository
  ) {
    this.vaultManager = vaultManager ?? VaultManager.getInstance();
  }

  public prepareWordWorkspace(options: CreateWordCloneOptions): Result<WordCloneResult, AppError> {
    let allocatedDestPath: string | null = null;

    try {
      if (!options.templateId || !validateInternalIdentifier(options.templateId)) {
        return fail('VALIDATION_FAILED', `Invalid template identifier: "${options.templateId}".`);
      }
      if (options.versionId && !validateInternalIdentifier(options.versionId)) {
        return fail('VALIDATION_FAILED', `Invalid version identifier: "${options.versionId}".`);
      }
      if (options.sessionId && !validateInternalIdentifier(options.sessionId)) {
        return fail(
          'VALIDATION_FAILED',
          `Invalid report session identifier: "${options.sessionId}".`
        );
      }
      if (options.customPrefix) {
        assertNoNullBytes(options.customPrefix);
        if (/\.\.|[\\/]/.test(options.customPrefix)) {
          return fail(
            'SECURITY_VIOLATION',
            'Custom filename prefix must not contain path traversal characters.'
          );
        }
      }

      const templateRes = this.templateRepo.getTemplateById(options.templateId);
      if (!templateRes.ok) return templateRes;
      const sourceTemplate = templateRes.value;
      if (!sourceTemplate) {
        return fail(
          'TEMPLATE_NOT_FOUND',
          `Master template "${options.templateId}" was not found in the registry.`
        );
      }
      if (sourceTemplate.document_type !== 'WORD_DOCX') {
        return fail(
          'TEMPLATE_UNSUPPORTED_FORMAT',
          `Template "${options.templateId}" is not a Word (.docx) template (${sourceTemplate.document_type}).`
        );
      }
      if (sourceTemplate.status === 'ARCHIVED') {
        return fail(
          'VALIDATION_FAILED',
          `Master template "${options.templateId}" is archived and ineligible for new report generation.`
        );
      }

      if (options.sessionId && this.sessionRepo) {
        const sessionRes = this.sessionRepo.getSessionById(options.sessionId);
        if (!sessionRes.ok) return sessionRes;
        if (!sessionRes.value) {
          return fail(
            'DRAFT_NOT_FOUND',
            `Associated report session "${options.sessionId}" does not exist.`
          );
        }
        const rec = sessionRes.value.session;
        if (rec.templateId && rec.templateId !== options.templateId) {
          return fail(
            'VALIDATION_FAILED',
            `Session "${options.sessionId}" is bound to template "${rec.templateId}", which conflicts with requested template "${options.templateId}".`
          );
        }
        if (options.replaceExistingSessionWorkspace !== false && this.workspaceRepo) {
          this.workspaceRepo.discardActiveSessionWorkspaces(options.sessionId);
        }
      }

      let sourceVersion: TemplateVersionRecord;
      if (options.versionId) {
        const verRes = this.templateRepo.getVersionById(options.versionId);
        if (!verRes.ok) return verRes;
        if (!verRes.value) {
          return fail(
            'TEMPLATE_NOT_FOUND',
            `Requested template version "${options.versionId}" does not exist.`
          );
        }
        if (verRes.value.template_id !== options.templateId) {
          return fail(
            'SECURITY_VIOLATION',
            `Version "${options.versionId}" belongs to template "${verRes.value.template_id}", not "${options.templateId}".`
          );
        }
        sourceVersion = verRes.value;
      } else {
        const activeRes = this.templateRepo.getActiveVersion(options.templateId);
        if (!activeRes.ok) return activeRes;
        if (!activeRes.value) {
          return fail(
            'TEMPLATE_NOT_FOUND',
            `No active version available for template "${options.templateId}".`
          );
        }
        sourceVersion = activeRes.value;
      }

      const sourcePathRes = this.vaultManager.resolveTemplateFileVaultPath(sourceVersion.file_name);
      if (!sourcePathRes.ok) return sourcePathRes;
      const sourcePath = sourcePathRes.value;

      if (path.extname(sourcePath).toLowerCase() !== '.docx') {
        return fail(
          'TEMPLATE_UNSUPPORTED_FORMAT',
          'Only .docx master templates are supported for Word generation.'
        );
      }
      if (!fs.existsSync(sourcePath)) {
        return fail(
          'TEMPLATE_NOT_FOUND',
          `Physical master template file "${sourceVersion.file_name}" is missing from vault.`
        );
      }
      const sourceStat = fs.statSync(sourcePath);
      if (!sourceStat.isFile()) {
        return fail('TEMPLATE_MALFORMED', 'Vault template path is not a regular file.');
      }

      const baselineRes = this.vaultManager.computeFileHash(sourcePath);
      if (!baselineRes.ok) return baselineRes;
      const baselineSourceHash = baselineRes.value;
      const isPlaceholderHash = sourceVersion.sha256_hash === '0'.repeat(64);
      if (
        !isPlaceholderHash &&
        baselineSourceHash.toLowerCase() !== sourceVersion.sha256_hash.toLowerCase()
      ) {
        return fail(
          'TEMPLATE_INTEGRITY_COMPROMISED',
          `Master template integrity compromised. Expected SHA-256 ${sourceVersion.sha256_hash}, computed ${baselineSourceHash}.`
        );
      }

      const sourceCheck = validateDocumentFile(sourcePath, '.docx');
      if (!sourceCheck.ok) return sourceCheck;
      if (!sourceCheck.value.isValid) {
        return fail(
          'TEMPLATE_MALFORMED',
          'The master Word template failed package validation and cannot be used for generation.'
        );
      }

      const workspaceId = toGenerationWorkspaceId(`ws_${crypto.randomUUID()}`);
      const prefix = options.customPrefix
        ? options.customPrefix.replace(/[^A-Za-z0-9_-]/g, '_')
        : `word_work_${sourceVersion.template_id}_v${sourceVersion.version_number}`;
      const cloneFileName = `${prefix}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}.docx`;

      const destRes = this.vaultManager.resolveWorkspacePath(cloneFileName);
      if (!destRes.ok) return destRes;
      allocatedDestPath = destRes.value;
      assertPathInsideRoot(
        allocatedDestPath,
        this.vaultManager.workspaceDir,
        'Generation Workspace'
      );
      assertTargetNotInsideVault(allocatedDestPath, this.vaultManager.templatesDir);

      if (path.resolve(allocatedDestPath) === path.resolve(sourcePath)) {
        return fail(
          'SECURITY_VIOLATION',
          'Destination path resolves directly to the master template path.',
          false
        );
      }
      if (fs.existsSync(allocatedDestPath)) {
        return fail(
          'OUTPUT_DESTINATION_COLLISION',
          'Destination collision: the working copy already exists.'
        );
      }

      // COPYFILE_EXCL guarantees an existing artifact is never overwritten.
      fs.copyFileSync(sourcePath, allocatedDestPath, fs.constants.COPYFILE_EXCL);
      try {
        fs.chmodSync(allocatedDestPath, 0o666);
      } catch {
        // Best-effort permission change
      }

      const destStat = fs.statSync(allocatedDestPath);
      const destHashRes = this.vaultManager.computeFileHash(allocatedDestPath);
      if (!destHashRes.ok) throw destHashRes.error;
      if (
        destStat.size !== sourceStat.size ||
        destHashRes.value.toLowerCase() !== baselineSourceHash.toLowerCase()
      ) {
        throw new AppError({
          code: ErrorCode.TEMPLATE_INTEGRITY_COMPROMISED,
          userMessage: 'Cloned working copy does not match the master template bytes.',
          isOperational: true,
        });
      }

      const postRes = this.vaultManager.computeFileHash(sourcePath);
      if (!postRes.ok) throw postRes.error;
      if (postRes.value.toLowerCase() !== baselineSourceHash.toLowerCase()) {
        throw new AppError({
          code: ErrorCode.TEMPLATE_READONLY_VIOLATION,
          userMessage:
            'CRITICAL INVARIANT VIOLATION: Master template bytes changed during cloning operation.',
          isOperational: false,
        });
      }

      let workspaceRecord: GenerationWorkspaceRecord;
      if (this.workspaceRepo) {
        const created = this.workspaceRepo.createWorkspace({
          workspaceId,
          sessionId: options.sessionId ?? null,
          templateId: sourceVersion.template_id,
          versionId: sourceVersion.version_id,
          versionNumber: sourceVersion.version_number,
          documentType: 'WORD_DOCX',
          fileName: cloneFileName,
          relativePath: cloneFileName,
          sha256Hash: destHashRes.value,
          fileSizeBytes: destStat.size,
          status: 'PREPARED',
        });
        if (!created.ok) throw created.error;
        workspaceRecord = created.value;
      } else {
        const now = new Date().toISOString();
        workspaceRecord = {
          workspaceId,
          sessionId: options.sessionId ?? null,
          templateId: sourceVersion.template_id,
          versionId: sourceVersion.version_id,
          versionNumber: sourceVersion.version_number,
          documentType: 'WORD_DOCX',
          fileName: cloneFileName,
          relativePath: cloneFileName,
          absolutePath: allocatedDestPath,
          sha256Hash: destHashRes.value,
          fileSizeBytes: destStat.size,
          status: 'PREPARED',
          createdAt: now,
          updatedAt: now,
        };
      }

      return Ok({
        workspace: workspaceRecord,
        sourceTemplate,
        sourceVersion,
        isVerified: true,
        sourceUntouched: true,
      });
    } catch (err) {
      if (allocatedDestPath && fs.existsSync(allocatedDestPath)) {
        try {
          fs.unlinkSync(allocatedDestPath);
        } catch {
          // Ignore unlink failure during error rollback
        }
      }
      if (err instanceof AppError) return Err(err);
      return Err(
        new AppError({
          code: ErrorCode.FILE_ACCESS_DENIED,
          userMessage: 'Failed to create isolated Word document clone.',
          details: { developerMessage: String(err) },
          isOperational: true,
          cause: err,
        })
      );
    }
  }
}
