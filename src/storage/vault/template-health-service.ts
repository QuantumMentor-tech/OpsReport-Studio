/**
 * OpsReport Studio — Template Health & Recovery Service (Step 21)
 *
 * Implements authoritative detection and user-directed recovery workflows for template problems:
 * - Detects missing master files in the vault (MISSING_FILE)
 * - Detects cryptographic SHA-256 integrity mismatches (INTEGRITY_MISMATCH)
 * - Detects templates with missing active versions (NO_ACTIVE_VERSION)
 * - Discovers verified, intact historical versions eligible for rollback
 * - Safely restores verified historical versions as active
 *
 * Invariant: Never reports recovery success without verifying file and metadata consistency.
 *
 * @module storage/vault/template-health-service
 */

import fs from 'node:fs';
import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import type {
  TemplateHealthRecord,
  HistoricalVersionSummary,
  TemplateVersionRecord,
} from '../../shared/types/templates.ts';
import { TemplateId, TemplateVersionId } from '../../shared/types/identifiers.ts';
import { Result, Ok, Err } from '../../shared/types/result.ts';
import { AppError } from '../../shared/errors/app-error.ts';
import { ErrorCode } from '../../shared/errors/error-codes.ts';
import { VaultManager } from './vault-manager.ts';
import { TemplateMetadataRepository } from '../database/repositories/template-metadata-repository.ts';

export class TemplateHealthService {
  private static instance: TemplateHealthService | null = null;
  private readonly templateRepo: TemplateMetadataRepository;
  private readonly vaultManager: VaultManager;

  public constructor(
    db?: Database.Database,
    vaultManager?: VaultManager,
    templateRepo?: TemplateMetadataRepository
  ) {
    if (templateRepo) {
      this.templateRepo = templateRepo;
    } else if (db) {
      this.templateRepo = new TemplateMetadataRepository(db);
    } else {
      throw new Error(
        'TemplateHealthService requires either a Database or TemplateMetadataRepository instance.'
      );
    }
    this.vaultManager = vaultManager ?? VaultManager.getInstance();
  }

  public static getInstance(
    db?: Database.Database,
    vaultManager?: VaultManager,
    templateRepo?: TemplateMetadataRepository
  ): TemplateHealthService {
    if (!TemplateHealthService.instance || db || vaultManager || templateRepo) {
      TemplateHealthService.instance = new TemplateHealthService(db, vaultManager, templateRepo);
    }
    return TemplateHealthService.instance;
  }

  public static resetInstance(): void {
    TemplateHealthService.instance = null;
  }

  /**
   * Evaluates the physical vault file existence and cryptographic SHA-256 integrity
   * for a specific template and its active version.
   */
  public checkTemplateHealth(templateId: TemplateId): Result<TemplateHealthRecord, AppError> {
    try {
      const tplRes = this.templateRepo.getTemplateById(templateId);
      if (!tplRes.ok) {
        return tplRes;
      }
      if (!tplRes.value) {
        return Err(
          new AppError({
            code: ErrorCode.TEMPLATE_NOT_FOUND,
            userMessage: `Template with identifier "${templateId}" was not found.`,
            isOperational: true,
          })
        );
      }
      const template = tplRes.value;

      // Retrieve all historical versions
      const allVersionsRes = this.templateRepo.getVersionsByTemplateId(templateId);
      const allVersions = allVersionsRes.ok ? allVersionsRes.value : [];

      // Resolve active version
      let activeVersion: TemplateVersionRecord | null = null;
      if (template.active_version_id) {
        const vRes = this.templateRepo.getVersionById(template.active_version_id);
        activeVersion = vRes.ok ? vRes.value : null;
      }
      if (!activeVersion) {
        const vRes = this.templateRepo.getActiveVersion(templateId);
        activeVersion = vRes.ok ? vRes.value : null;
      }

      // Check intact historical versions eligible for safe rollback
      const intactHistoricalVersions: HistoricalVersionSummary[] = [];
      for (const ver of allVersions) {
        // Skip currently active version in historical candidates list
        if (activeVersion && ver.version_id === activeVersion.version_id) {
          continue;
        }

        const filePathRes = this.vaultManager.resolveTemplateFileVaultPath(ver.file_name);
        if (filePathRes.ok && fs.existsSync(filePathRes.value)) {
          try {
            const buf = fs.readFileSync(filePathRes.value);
            const actualHash = crypto.createHash('sha256').update(buf).digest('hex');
            const isIntact = actualHash === ver.sha256_hash;
            if (isIntact) {
              intactHistoricalVersions.push({
                versionId: ver.version_id,
                versionNumber: ver.version_number,
                fileName: ver.file_name,
                fileSizeBytes: ver.file_size_bytes,
                sha256Hash: ver.sha256_hash,
                isIntact: true,
                createdAt: ver.created_at,
              });
            }
          } catch {
            // Unreadable file
          }
        }
      }

      if (!activeVersion) {
        return Ok({
          templateId: template.template_id,
          templateName: template.template_name,
          status: 'NO_ACTIVE_VERSION',
          activeVersionId: null,
          versionNumber: null,
          fileName: null,
          expectedHash: null,
          actualHash: null,
          isReadOnly: false,
          message: 'No active version designated for this template.',
          availableHistoricalVersionsCount: intactHistoricalVersions.length,
          intactHistoricalVersions,
        });
      }

      // Check active physical vault file
      const vaultPathRes = this.vaultManager.resolveTemplateFileVaultPath(activeVersion.file_name);
      if (!vaultPathRes.ok) {
        return Ok({
          templateId: template.template_id,
          templateName: template.template_name,
          status: 'MISSING_FILE',
          activeVersionId: activeVersion.version_id,
          versionNumber: activeVersion.version_number,
          fileName: activeVersion.file_name,
          expectedHash: activeVersion.sha256_hash,
          actualHash: null,
          isReadOnly: false,
          message: vaultPathRes.error.userMessage,
          availableHistoricalVersionsCount: intactHistoricalVersions.length,
          intactHistoricalVersions,
        });
      }

      const managedPath = vaultPathRes.value;
      if (!fs.existsSync(managedPath)) {
        return Ok({
          templateId: template.template_id,
          templateName: template.template_name,
          status: 'MISSING_FILE',
          activeVersionId: activeVersion.version_id,
          versionNumber: activeVersion.version_number,
          fileName: activeVersion.file_name,
          expectedHash: activeVersion.sha256_hash,
          actualHash: null,
          isReadOnly: false,
          message: `The physical master template file "${activeVersion.file_name}" is missing from the Master Template Vault.`,
          availableHistoricalVersionsCount: intactHistoricalVersions.length,
          intactHistoricalVersions,
        });
      }

      // Check SHA-256 hash & read-only attribute
      const buffer = fs.readFileSync(managedPath);
      const actualHash = crypto.createHash('sha256').update(buffer).digest('hex');
      const stat = fs.statSync(managedPath);
      const isReadOnly = (stat.mode & 0o200) === 0;

      if (actualHash !== activeVersion.sha256_hash) {
        return Ok({
          templateId: template.template_id,
          templateName: template.template_name,
          status: 'INTEGRITY_MISMATCH',
          activeVersionId: activeVersion.version_id,
          versionNumber: activeVersion.version_number,
          fileName: activeVersion.file_name,
          expectedHash: activeVersion.sha256_hash,
          actualHash,
          isReadOnly,
          message: `Cryptographic SHA-256 mismatch detected: expected ${activeVersion.sha256_hash.slice(0, 12)}..., found ${actualHash.slice(0, 12)}... The physical file may have been tampered with or modified.`,
          availableHistoricalVersionsCount: intactHistoricalVersions.length,
          intactHistoricalVersions,
        });
      }

      return Ok({
        templateId: template.template_id,
        templateName: template.template_name,
        status: 'OK',
        activeVersionId: activeVersion.version_id,
        versionNumber: activeVersion.version_number,
        fileName: activeVersion.file_name,
        expectedHash: activeVersion.sha256_hash,
        actualHash,
        isReadOnly,
        message: 'Master template asset is intact, cryptographically verified, and protected.',
        availableHistoricalVersionsCount: intactHistoricalVersions.length,
        intactHistoricalVersions,
      });
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: `Failed to evaluate template health for "${templateId}".`,
          details: { developerMessage: String(err) },
          isOperational: true,
          cause: err,
        })
      );
    }
  }

  /**
   * Checks the health and integrity status for all registered templates in the library.
   */
  public checkAllTemplatesHealth(): Result<TemplateHealthRecord[], AppError> {
    try {
      const allTemplatesRes = this.templateRepo.getAllTemplates();
      if (!allTemplatesRes.ok) {
        return allTemplatesRes;
      }

      const results: TemplateHealthRecord[] = [];
      for (const tpl of allTemplatesRes.value) {
        const healthRes = this.checkTemplateHealth(tpl.template_id);
        if (healthRes.ok) {
          results.push(healthRes.value);
        }
      }

      return Ok(results);
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: 'Failed to evaluate template library health status.',
          details: { developerMessage: String(err) },
          isOperational: true,
          cause: err,
        })
      );
    }
  }

  /**
   * Restores an intact historical version as the preferred/active version for a template (Step 21 Objective F).
   * Verifies that the historical version exists, belongs to the template, and its physical vault file is intact.
   */
  public restoreHistoricalVersion(
    templateId: TemplateId,
    versionId: TemplateVersionId
  ): Result<TemplateVersionRecord, AppError> {
    try {
      // 1. Retrieve target historical version
      const vRes = this.templateRepo.getVersionById(versionId);
      if (!vRes.ok) {
        return vRes;
      }
      if (!vRes.value || vRes.value.template_id !== templateId) {
        return Err(
          new AppError({
            code: ErrorCode.TEMPLATE_NOT_FOUND,
            userMessage: `Version "${versionId}" does not belong to template "${templateId}".`,
            isOperational: true,
          })
        );
      }
      const targetVersion = vRes.value;

      // 2. Cryptographic verification of historical asset
      const filePathRes = this.vaultManager.resolveTemplateFileVaultPath(targetVersion.file_name);
      if (!filePathRes.ok) {
        return filePathRes;
      }
      const filePath = filePathRes.value;
      if (!fs.existsSync(filePath)) {
        return Err(
          new AppError({
            code: ErrorCode.FILE_NOT_FOUND,
            userMessage: `Cannot restore version v${targetVersion.version_number}: Physical file "${targetVersion.file_name}" is missing from vault.`,
            isOperational: true,
          })
        );
      }

      const buf = fs.readFileSync(filePath);
      const actualHash = crypto.createHash('sha256').update(buf).digest('hex');
      if (actualHash !== targetVersion.sha256_hash) {
        return Err(
          new AppError({
            code: ErrorCode.TEMPLATE_INTEGRITY_COMPROMISED,
            userMessage: `Cannot restore version v${targetVersion.version_number}: Cryptographic hash mismatch in historical asset.`,
            isOperational: true,
          })
        );
      }

      // 3. Promote historical version to active in atomic transaction
      const setActiveRes = this.templateRepo.setActiveVersion(templateId, versionId);
      if (!setActiveRes.ok) {
        return setActiveRes;
      }

      return Ok(setActiveRes.value);
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: `Failed to restore historical version "${versionId}".`,
          details: { developerMessage: String(err) },
          isOperational: true,
          cause: err,
        })
      );
    }
  }
}
