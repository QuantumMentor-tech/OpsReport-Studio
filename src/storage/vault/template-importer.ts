/**
 * OpsReport Studio — Authoritative Template Import Pipeline (Step 18)
 *
 * Orchestrates the multi-stage, transactional template import pipeline:
 * 1. Source file inspection & security assertion (never alters source)
 * 2. Controlled scratch staging
 * 3. Bounded Open XML document structure & container validation
 * 4. Master Template Vault destination resolution & promotion
 * 5. Metadata registration with automatic rollback on database failure
 * 6. Guaranteed staging cleanup
 *
 * @module storage/vault/template-importer
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import type {
  ImportTemplateOptions,
  TemplateImportResult,
  TemplateMetadataRecord,
} from '../../shared/types/templates.ts';
import { toTemplateId, toReportCategoryId } from '../../shared/types/identifiers.ts';
import { Result, Ok, Err } from '../../shared/types/result.ts';
import { AppError } from '../../shared/errors/app-error.ts';
import { ErrorCode } from '../../shared/errors/error-codes.ts';
import { VaultManager } from './vault-manager.ts';
import { validateDocumentFile } from './document-validator.ts';
import {
  assertTargetNotInsideVault,
  validateInternalIdentifier,
  normalizeTemplateExtension,
} from './path-security.ts';
import { TemplateMetadataRepository } from '../database/repositories/template-metadata-repository.ts';
import { CategoryRepository } from '../database/repositories/category-repository.ts';

export class TemplateImporter {
  private readonly templateRepo: TemplateMetadataRepository;
  private readonly categoryRepo: CategoryRepository;
  private readonly vaultManager: VaultManager;

  constructor(
    db: Database.Database,
    vaultManager?: VaultManager,
    templateRepo?: TemplateMetadataRepository,
    categoryRepo?: CategoryRepository
  ) {
    this.vaultManager = vaultManager ?? VaultManager.getInstance();
    this.templateRepo = templateRepo ?? new TemplateMetadataRepository(db);
    this.categoryRepo = categoryRepo ?? new CategoryRepository(db);
  }

  /**
   * Imports an Excel or Word template through the verified 8-stage pipeline.
   * Preserves the source file, validates the container, promotes into the vault,
   * registers metadata, and rolls back cleanly on any failure.
   */
  public async importTemplate(
    options: ImportTemplateOptions
  ): Promise<Result<TemplateImportResult, AppError>> {
    const { sourceFilePath, templateName, categoryId, documentType } = options;

    // Stage 1: Validate input fields
    if (!templateName || templateName.trim().length === 0) {
      return Err(
        new AppError({
          code: ErrorCode.VALIDATION_FAILED,
          userMessage: 'Template display name is required.',
          isOperational: true,
        })
      );
    }

    if (templateName.trim().length > 150) {
      return Err(
        new AppError({
          code: ErrorCode.VALIDATION_FAILED,
          userMessage: 'Template display name must not exceed 150 characters.',
          isOperational: true,
        })
      );
    }

    if (options.templateId && !validateInternalIdentifier(options.templateId)) {
      return Err(
        new AppError({
          code: ErrorCode.VALIDATION_FAILED,
          userMessage: `Invalid template identifier: "${options.templateId}". Identifiers must be safe alphanumeric strings.`,
          isOperational: true,
        })
      );
    }

    // Stage 2: Validate category association
    const catRes = this.categoryRepo.getCategoryById(toReportCategoryId(categoryId));
    if (!catRes.ok) {
      return catRes;
    }
    if (!catRes.value) {
      return Err(
        new AppError({
          code: ErrorCode.VALIDATION_FAILED,
          userMessage: `Referenced report category "${categoryId}" does not exist.`,
          isOperational: true,
        })
      );
    }

    const category = catRes.value;
    if (category.default_format !== documentType) {
      return Err(
        new AppError({
          code: ErrorCode.VALIDATION_FAILED,
          userMessage: `Document format mismatch: Category "${category.display_name}" mandates ${category.default_format}, but imported file is ${documentType}.`,
          isOperational: true,
        })
      );
    }

    // Stage 3: Source file inspection & security assertion
    if (!fs.existsSync(sourceFilePath)) {
      return Err(
        new AppError({
          code: ErrorCode.FILE_NOT_FOUND,
          userMessage: `Source template file was not found at path: "${sourceFilePath}".`,
          isOperational: true,
        })
      );
    }

    const stat = fs.statSync(sourceFilePath);
    if (!stat.isFile()) {
      return Err(
        new AppError({
          code: ErrorCode.VALIDATION_FAILED,
          userMessage: `Source path "${sourceFilePath}" is not a regular file.`,
          isOperational: true,
        })
      );
    }

    // Invariant INV-DAT-006: Source must not reside inside the master template vault
    try {
      assertTargetNotInsideVault(sourceFilePath, this.vaultManager.templatesDir);
    } catch (err) {
      if (err instanceof AppError) {
        return Err(err);
      }
      return Err(
        new AppError({
          code: ErrorCode.SECURITY_VIOLATION,
          userMessage:
            'Security violation: Source file cannot be inside the Master Template Vault.',
          isOperational: true,
        })
      );
    }

    // Stage 4: Staging into ephemeral scratch sandbox
    const randomSuffix = crypto.randomBytes(6).toString('hex');
    const stagingFileName = `import_${Date.now()}_${randomSuffix}.tmp`;
    const scratchRes = this.vaultManager.resolveScratchPath(stagingFileName);
    if (!scratchRes.ok) {
      return scratchRes;
    }
    const stagedPath = scratchRes.value;

    let targetVaultPath: string | null = null;

    try {
      // Copy source bytes into staging without modifying or locking the original source
      fs.copyFileSync(sourceFilePath, stagedPath);

      // Stage 5: Validate staged copy
      const ext = path.extname(sourceFilePath);
      const expectedExt = normalizeTemplateExtension(ext);
      const validationRes = validateDocumentFile(stagedPath, expectedExt);

      if (!validationRes.ok) {
        return validationRes;
      }

      const validation = validationRes.value;
      if (validation.detectedFormat !== documentType) {
        return Err(
          new AppError({
            code: ErrorCode.TEMPLATE_UNSUPPORTED_FORMAT,
            userMessage: `Detected file structure is ${validation.detectedFormat}, but expected format is ${documentType}.`,
            isOperational: true,
          })
        );
      }

      // Stage 6: Resolve managed vault storage identity & path
      const templateId =
        options.templateId ??
        toTemplateId(
          `TPL-${categoryId.replace(/^RPT-/, '')}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`
        );

      const targetExt = documentType === 'EXCEL_XLSX' ? '.xlsx' : '.docx';
      const vaultPathRes = this.vaultManager.resolveTemplateVaultPath(templateId, targetExt);
      if (!vaultPathRes.ok) {
        return vaultPathRes;
      }
      targetVaultPath = vaultPathRes.value;

      // Stage 7: Promote staged file into Master Template Vault
      fs.copyFileSync(stagedPath, targetVaultPath);

      // Stage 8: Register or update metadata in SQLite
      const existingTplRes = this.templateRepo.getTemplateById(templateId);
      let metadataRecord: TemplateMetadataRecord;

      if (existingTplRes.ok && existingTplRes.value) {
        // Update existing metadata record
        const updateRes = this.templateRepo.updateTemplate(templateId, {
          templateName: templateName.trim(),
          categoryId: toReportCategoryId(categoryId),
          documentType,
          description: options.description ?? null,
          fileName: path.basename(targetVaultPath),
          status: 'ACTIVE',
        });
        if (!updateRes.ok) {
          throw updateRes.error;
        }
        metadataRecord = updateRes.value;
      } else {
        // Insert new metadata record
        const createRes = this.templateRepo.createTemplate({
          templateId,
          templateName: templateName.trim(),
          categoryId: toReportCategoryId(categoryId),
          documentType,
          description: options.description ?? null,
          fileName: path.basename(targetVaultPath),
          status: 'ACTIVE',
        });
        if (!createRes.ok) {
          throw createRes.error;
        }
        metadataRecord = createRes.value;
      }

      return Ok({
        template: metadataRecord,
        vaultPath: targetVaultPath,
        fileSizeBytes: validation.fileSizeBytes,
        sha256Hash: validation.sha256Hash,
        importedAt: new Date().toISOString(),
      });
    } catch (err) {
      // Rollback safety: If promotion succeeded but database registration failed,
      // unlink the promoted vault file so no orphaned file is left behind.
      if (targetVaultPath && fs.existsSync(targetVaultPath)) {
        try {
          fs.unlinkSync(targetVaultPath);
        } catch {
          // Best effort rollback
        }
      }

      if (err instanceof AppError) {
        return Err(err);
      }
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: 'Failed to complete template import transaction.',
          details: { developerMessage: String(err) },
          isOperational: true,
          cause: err,
        })
      );
    } finally {
      // Guaranteed staging cleanup: remove temporary file from Scratch sandbox
      if (fs.existsSync(stagedPath)) {
        try {
          fs.unlinkSync(stagedPath);
        } catch {
          // Staging sweep will clean up on next startup
        }
      }
    }
  }
}
