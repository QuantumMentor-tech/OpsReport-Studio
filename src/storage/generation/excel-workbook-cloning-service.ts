/**
 * OpsReport Studio — Authoritative Excel Workbook Cloning & Generation Workspace Service
 *
 * Implements Step 26 of the approved roadmap:
 * - Version-aware master template resolution and eligibility validation
 * - Cryptographic source integrity checks against recorded vault baseline
 * - Byte-preserving cloning into the isolated Generation Workspace (%LOCALAPPDATA%\OpsReportStudio\Workspace\)
 * - Strict physical separation from master vault, import staging, database, and final outputs
 * - Invariant: Master template is 100% byte-for-byte untouched (0-byte variance)
 * - Copy completeness and cryptographic SHA-256 hash verification
 * - Generation workspace persistence (Migration 009) and session context binding
 * - Atomic rollback on failure with safe cleanup of operation-owned artifacts
 *
 * @module storage/generation/excel-workbook-cloning-service
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type {
  CreateExcelCloneOptions,
  ExcelCloneResult,
  GenerationWorkspaceRecord,
} from '../../shared/types/generation.ts';
import type { TemplateVersionRecord } from '../../shared/types/templates.ts';
import {
  GenerationWorkspaceId,
  toGenerationWorkspaceId,
  ReportSessionId,
} from '../../shared/types/identifiers.ts';
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

export class ExcelWorkbookCloningService {
  private readonly vaultManager: VaultManager;

  constructor(
    private readonly templateRepo: TemplateMetadataRepository,
    vaultManager?: VaultManager,
    private readonly sessionRepo?: SessionRepository,
    private readonly workspaceRepo?: GenerationWorkspaceRepository
  ) {
    this.vaultManager = vaultManager ?? VaultManager.getInstance();
  }

  /**
   * Selects an approved Excel master template version, verifies its availability and integrity,
   * allocates an isolated working destination in the Generation Workspace, and creates an
   * independent, byte-verified working copy.
   */
  public prepareExcelWorkspace(
    options: CreateExcelCloneOptions
  ): Result<ExcelCloneResult, AppError> {
    let allocatedDestPath: string | null = null;

    try {
      // -----------------------------------------------------------------------
      // 1. Validate Input Identifiers & Parameters
      // -----------------------------------------------------------------------
      if (!options.templateId || !validateInternalIdentifier(options.templateId)) {
        return Err(
          new AppError({
            code: ErrorCode.VALIDATION_FAILED,
            userMessage: `Invalid template identifier: "${options.templateId}". Identifiers must be safe alphanumeric strings.`,
            isOperational: true,
          })
        );
      }

      if (options.versionId && !validateInternalIdentifier(options.versionId)) {
        return Err(
          new AppError({
            code: ErrorCode.VALIDATION_FAILED,
            userMessage: `Invalid version identifier: "${options.versionId}".`,
            isOperational: true,
          })
        );
      }

      if (options.sessionId && !validateInternalIdentifier(options.sessionId)) {
        return Err(
          new AppError({
            code: ErrorCode.VALIDATION_FAILED,
            userMessage: `Invalid report session identifier: "${options.sessionId}".`,
            isOperational: true,
          })
        );
      }

      if (options.customPrefix) {
        assertNoNullBytes(options.customPrefix);
        if (
          options.customPrefix.includes('..') ||
          options.customPrefix.includes('/') ||
          options.customPrefix.includes('\\')
        ) {
          return Err(
            new AppError({
              code: ErrorCode.SECURITY_VIOLATION,
              userMessage: 'Custom filename prefix must not contain path traversal characters.',
              isOperational: true,
            })
          );
        }
      }

      // -----------------------------------------------------------------------
      // 2. Resolve Master Template Metadata & Verify Document Format
      // -----------------------------------------------------------------------
      const templateRes = this.templateRepo.getTemplateById(options.templateId);
      if (!templateRes.ok) {
        return templateRes;
      }
      const sourceTemplate = templateRes.value;
      if (!sourceTemplate) {
        return Err(
          new AppError({
            code: ErrorCode.TEMPLATE_NOT_FOUND,
            userMessage: `Master template "${options.templateId}" was not found in the registry.`,
            isOperational: true,
          })
        );
      }

      // Guard: Strictly require EXCEL format
      const isExcel = sourceTemplate.document_type === 'EXCEL_XLSX';
      if (!isExcel) {
        return Err(
          new AppError({
            code: ErrorCode.TEMPLATE_UNSUPPORTED_FORMAT,
            userMessage: `Template "${options.templateId}" is a Word document (${sourceTemplate.document_type}). The Excel generation service only supports Excel workbooks (.xlsx).`,
            isOperational: true,
          })
        );
      }

      // Guard: Lifecycle eligibility — archived templates cannot be used for new generation
      if (sourceTemplate.status === 'ARCHIVED') {
        return Err(
          new AppError({
            code: ErrorCode.VALIDATION_FAILED,
            userMessage: `Master template "${options.templateId}" is archived and ineligible for new report generation.`,
            isOperational: true,
          })
        );
      }

      // -----------------------------------------------------------------------
      // 3. Resolve Session Context (if provided)
      // -----------------------------------------------------------------------
      if (options.sessionId && this.sessionRepo) {
        const sessionRes = this.sessionRepo.getSessionById(options.sessionId);
        if (!sessionRes.ok) {
          return sessionRes;
        }
        const sessionDetail = sessionRes.value;
        if (!sessionDetail) {
          return Err(
            new AppError({
              code: ErrorCode.DRAFT_NOT_FOUND,
              userMessage: `Associated report session "${options.sessionId}" does not exist.`,
              isOperational: true,
            })
          );
        }

        const sessionRecord = sessionDetail.session;

        // Verify template consistency if session is already associated with a template
        if (sessionRecord.templateId && sessionRecord.templateId !== options.templateId) {
          return Err(
            new AppError({
              code: ErrorCode.VALIDATION_FAILED,
              userMessage: `Session "${options.sessionId}" is bound to template "${sessionRecord.templateId}", which conflicts with requested template "${options.templateId}".`,
              isOperational: true,
            })
          );
        }

        // Discard any existing prepared/in-use workspace for this session if requested
        if (options.replaceExistingSessionWorkspace !== false && this.workspaceRepo) {
          this.workspaceRepo.discardActiveSessionWorkspaces(options.sessionId);
        }
      }

      // -----------------------------------------------------------------------
      // 4. Resolve Authoritative Master Template Version Record
      // -----------------------------------------------------------------------
      let sourceVersion: TemplateVersionRecord | null = null;

      if (options.versionId) {
        const verRes = this.templateRepo.getVersionById(options.versionId);
        if (!verRes.ok) {
          return verRes;
        }
        if (!verRes.value) {
          return Err(
            new AppError({
              code: ErrorCode.TEMPLATE_NOT_FOUND,
              userMessage: `Requested template version "${options.versionId}" does not exist.`,
              isOperational: true,
            })
          );
        }
        // Ensure version belongs to the requested template
        if (verRes.value.template_id !== options.templateId) {
          return Err(
            new AppError({
              code: ErrorCode.SECURITY_VIOLATION,
              userMessage: `Version "${options.versionId}" belongs to template "${verRes.value.template_id}", not "${options.templateId}".`,
              isOperational: true,
            })
          );
        }
        sourceVersion = verRes.value;
      } else {
        const activeRes = this.templateRepo.getActiveVersion(options.templateId);
        if (!activeRes.ok) {
          return activeRes;
        }
        if (!activeRes.value) {
          return Err(
            new AppError({
              code: ErrorCode.TEMPLATE_NOT_FOUND,
              userMessage: `No active version available for template "${options.templateId}".`,
              isOperational: true,
            })
          );
        }
        sourceVersion = activeRes.value;
      }

      // -----------------------------------------------------------------------
      // 5. Resolve Canonical Source Path in Master Vault & Verify Integrity
      // -----------------------------------------------------------------------
      const sourcePathRes = this.vaultManager.resolveTemplateFileVaultPath(sourceVersion.file_name);
      if (!sourcePathRes.ok) {
        return sourcePathRes;
      }
      const sourcePath = sourcePathRes.value;

      // Verify physical existence
      if (!fs.existsSync(sourcePath)) {
        return Err(
          new AppError({
            code: ErrorCode.TEMPLATE_NOT_FOUND,
            userMessage: `Physical master template file "${sourceVersion.file_name}" is missing from vault.`,
            isOperational: true,
          })
        );
      }

      const sourceStat = fs.statSync(sourcePath);
      if (!sourceStat.isFile()) {
        return Err(
          new AppError({
            code: ErrorCode.TEMPLATE_MALFORMED,
            userMessage: `Vault path "${sourcePath}" is not a regular file.`,
            isOperational: true,
          })
        );
      }

      // Compute cryptographic hash of source master prior to copy
      const sourceHashRes = this.vaultManager.computeFileHash(sourcePath);
      if (!sourceHashRes.ok) {
        return sourceHashRes;
      }
      const baselineSourceHash = sourceHashRes.value;

      // Verify integrity against database version record (unless placeholder hash)
      const isPlaceholder = sourceVersion.sha256_hash === '0'.repeat(64);
      if (
        !isPlaceholder &&
        baselineSourceHash.toLowerCase() !== sourceVersion.sha256_hash.toLowerCase()
      ) {
        return Err(
          new AppError({
            code: ErrorCode.TEMPLATE_INTEGRITY_COMPROMISED,
            userMessage: `Master template integrity compromised. Expected SHA-256 ${sourceVersion.sha256_hash}, computed ${baselineSourceHash}.`,
            isOperational: true,
          })
        );
      }

      // -----------------------------------------------------------------------
      // 6. Allocate Unique Destination in Generation Workspace
      // -----------------------------------------------------------------------
      const workspaceId = toGenerationWorkspaceId(`ws_${crypto.randomUUID()}`);
      const randomSuffix = crypto.randomBytes(6).toString('hex');
      const sanitizedPrefix = options.customPrefix
        ? options.customPrefix.replace(/[^A-Za-z0-9_-]/g, '_')
        : `excel_work_${sourceVersion.template_id}_v${sourceVersion.version_number}`;

      const cloneFileName = `${sanitizedPrefix}_${Date.now()}_${randomSuffix}.xlsx`;

      const workspacePathRes = this.vaultManager.resolveWorkspacePath(cloneFileName);
      if (!workspacePathRes.ok) {
        return workspacePathRes;
      }
      allocatedDestPath = workspacePathRes.value;

      // Invariants:
      // - Must reside inside Workspace/
      // - Must NOT reside inside Templates/ vault
      // - Must NOT collide with an existing file
      assertPathInsideRoot(
        allocatedDestPath,
        this.vaultManager.workspaceDir,
        'Generation Workspace'
      );
      assertTargetNotInsideVault(allocatedDestPath, this.vaultManager.templatesDir);

      if (fs.existsSync(allocatedDestPath)) {
        return Err(
          new AppError({
            code: ErrorCode.OUTPUT_DESTINATION_COLLISION,
            userMessage: `Destination collision: working copy "${allocatedDestPath}" already exists.`,
            isOperational: true,
          })
        );
      }

      // Prevent destination from resolving or symlinking to source master
      if (path.resolve(allocatedDestPath) === path.resolve(sourcePath)) {
        return Err(
          new AppError({
            code: ErrorCode.SECURITY_VIOLATION,
            userMessage: 'Destination path resolves directly to the master template path.',
            isOperational: false,
          })
        );
      }

      // -----------------------------------------------------------------------
      // 7. Perform Direct Byte-Preserving Copy
      // -----------------------------------------------------------------------
      fs.copyFileSync(sourcePath, allocatedDestPath);

      // Grant write permission to the working copy (source master may be 0o444 read-only)
      try {
        fs.chmodSync(allocatedDestPath, 0o666);
      } catch {
        // Best-effort permission change
      }

      // -----------------------------------------------------------------------
      // 8. Verify Copy Completeness & Independence
      // -----------------------------------------------------------------------
      const destStat = fs.statSync(allocatedDestPath);
      if (destStat.size !== sourceStat.size) {
        throw new AppError({
          code: ErrorCode.TEMPLATE_INTEGRITY_COMPROMISED,
          userMessage: `Copy size mismatch: expected ${sourceStat.size} bytes, got ${destStat.size} bytes.`,
          isOperational: true,
        });
      }

      const destHashRes = this.vaultManager.computeFileHash(allocatedDestPath);
      if (!destHashRes.ok) {
        throw destHashRes.error;
      }
      const destHash = destHashRes.value;

      if (destHash.toLowerCase() !== baselineSourceHash.toLowerCase()) {
        throw new AppError({
          code: ErrorCode.TEMPLATE_INTEGRITY_COMPROMISED,
          userMessage: 'Cloned working copy hash does not match source master template hash.',
          isOperational: true,
        });
      }

      // -----------------------------------------------------------------------
      // 9. Confirm Source Master Was 100% Untouched (Core Invariant)
      // -----------------------------------------------------------------------
      const postCopySourceHashRes = this.vaultManager.computeFileHash(sourcePath);
      if (!postCopySourceHashRes.ok) {
        throw postCopySourceHashRes.error;
      }
      if (postCopySourceHashRes.value.toLowerCase() !== baselineSourceHash.toLowerCase()) {
        throw new AppError({
          code: ErrorCode.TEMPLATE_READONLY_VIOLATION,
          userMessage:
            'CRITICAL INVARIANT VIOLATION: Master template bytes changed during cloning operation.',
          isOperational: false,
        });
      }

      // -----------------------------------------------------------------------
      // 10. Open XML Container Integrity Sanity Check
      // -----------------------------------------------------------------------
      const containerCheck = validateDocumentFile(allocatedDestPath);
      if (!containerCheck.ok) {
        throw containerCheck.error;
      }

      // -----------------------------------------------------------------------
      // 11. Persist Generation Workspace Record (if repository available)
      // -----------------------------------------------------------------------
      let workspaceRecord: GenerationWorkspaceRecord;

      if (this.workspaceRepo) {
        const createRecordRes = this.workspaceRepo.createWorkspace({
          workspaceId,
          sessionId: options.sessionId ?? null,
          templateId: sourceVersion.template_id,
          versionId: sourceVersion.version_id,
          versionNumber: sourceVersion.version_number,
          documentType: 'EXCEL_XLSX',
          fileName: cloneFileName,
          relativePath: cloneFileName,
          sha256Hash: destHash,
          fileSizeBytes: destStat.size,
          status: 'PREPARED',
        });

        if (!createRecordRes.ok) {
          throw createRecordRes.error;
        }
        workspaceRecord = createRecordRes.value;
      } else {
        // In-memory record fallback if running without database
        const now = new Date().toISOString();
        workspaceRecord = {
          workspaceId,
          sessionId: options.sessionId ?? null,
          templateId: sourceVersion.template_id,
          versionId: sourceVersion.version_id,
          versionNumber: sourceVersion.version_number,
          documentType: 'EXCEL_XLSX',
          fileName: cloneFileName,
          relativePath: cloneFileName,
          absolutePath: allocatedDestPath,
          sha256Hash: destHash,
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
      // Rollback: Unlink allocated destination copy on failure
      if (allocatedDestPath && fs.existsSync(allocatedDestPath)) {
        try {
          fs.unlinkSync(allocatedDestPath);
        } catch {
          // Ignore unlink failure during error rollback
        }
      }

      if (err instanceof AppError) {
        return Err(err);
      }
      return Err(
        new AppError({
          code: ErrorCode.FILE_ACCESS_DENIED,
          userMessage: 'Failed to create isolated Excel workbook clone.',
          details: { developerMessage: String(err) },
          isOperational: true,
          cause: err,
        })
      );
    }
  }

  /**
   * Retrieves a generation workspace record by identifier.
   */
  public getWorkspace(
    workspaceId: GenerationWorkspaceId
  ): Result<GenerationWorkspaceRecord | null, AppError> {
    if (!this.workspaceRepo) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: 'Workspace repository is not configured.',
          isOperational: true,
        })
      );
    }
    return this.workspaceRepo.getWorkspaceById(workspaceId);
  }

  /**
   * Discards an active workspace and removes its working file from the Generation Workspace.
   */
  public discardWorkspace(workspaceId: GenerationWorkspaceId): Result<boolean, AppError> {
    if (!this.workspaceRepo) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: 'Workspace repository is not configured.',
          isOperational: true,
        })
      );
    }

    const wsRes = this.workspaceRepo.getWorkspaceById(workspaceId);
    if (!wsRes.ok) {
      return wsRes;
    }
    if (!wsRes.value) {
      return Ok(false);
    }

    const ws = wsRes.value;
    // Remove working file if it still exists
    if (ws.fileName) {
      this.vaultManager.deleteWorkspaceFile(ws.fileName);
    }

    return this.workspaceRepo.updateWorkspaceStatus(workspaceId, 'DISCARDED');
  }

  /**
   * Retrieves the current active generation workspace for a report session.
   */
  public getActiveWorkspaceForSession(
    sessionId: ReportSessionId
  ): Result<GenerationWorkspaceRecord | null, AppError> {
    if (!this.workspaceRepo) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: 'Workspace repository is not configured.',
          isOperational: true,
        })
      );
    }
    return this.workspaceRepo.getActiveWorkspaceBySessionId(sessionId);
  }
}
