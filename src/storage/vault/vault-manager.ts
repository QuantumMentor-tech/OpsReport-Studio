/**
 * OpsReport Studio — Authoritative Master Template Vault Manager
 *
 * Implements the centralized application-managed storage service (MOD-10) for:
 * - Deterministic directory initialization and verification
 * - Master template path resolution by stable nominal identifier
 * - Strict filesystem boundary enforcement and traversal rejection
 * - Ephemeral scratch sandbox management and startup stale file purging
 * - Generation output storage reservation and protection of master templates
 * - Clear distinction between metadata records and physical files
 *
 * @module storage/vault/vault-manager
 */

import fs from 'node:fs';
import path from 'node:path';
import type { TemplateId } from '../../shared/types/identifiers.ts';
import type {
  VaultStorageStatus,
  StorageDirectoryStatus,
  TemplateFileDescriptor,
} from '../../shared/types/storage.ts';
import { Result, Ok, Err } from '../../shared/types/result.ts';
import { AppError } from '../../shared/errors/app-error.ts';
import { ErrorCode } from '../../shared/errors/error-codes.ts';
import {
  resolveAppDataRoot,
  resolveTemplatesDirectory,
  resolveScratchDirectory,
  resolveReportsDirectory,
  resolveDatabaseDirectory,
  resolveLogsDirectory,
  resolveBackupsDirectory,
} from './vault-config.ts';
import {
  validateInternalIdentifier,
  assertNoNullBytes,
  assertPathInsideRoot,
  assertTargetNotInsideVault,
  normalizeTemplateExtension,
} from './path-security.ts';

/** Default scratch stale file threshold (15 minutes = 900,000 ms per Storage Spec Section 7) */
export const DEFAULT_STALE_SCRATCH_AGE_MS = 15 * 60 * 1000;

export interface VaultInitOptions {
  readonly skipScratchPurge?: boolean;
  readonly staleScratchThresholdMs?: number;
}

export class VaultManager {
  private static instance: VaultManager | null = null;

  public readonly appDataRoot: string;
  public readonly templatesDir: string;
  public readonly scratchDir: string;
  public readonly reportsDir: string;
  public readonly databaseDir: string;
  public readonly logsDir: string;
  public readonly backupsDir: string;

  constructor(customRoot?: string) {
    this.appDataRoot = resolveAppDataRoot(customRoot);
    this.templatesDir = resolveTemplatesDirectory(customRoot);
    this.scratchDir = resolveScratchDirectory(customRoot);
    this.reportsDir = resolveReportsDirectory(customRoot);
    this.databaseDir = resolveDatabaseDirectory(customRoot);
    this.logsDir = resolveLogsDirectory(customRoot);
    this.backupsDir = resolveBackupsDirectory(customRoot);
  }

  /**
   * Retrieves or initializes the singleton instance.
   */
  public static getInstance(customRoot?: string): VaultManager {
    if (!VaultManager.instance || customRoot) {
      VaultManager.instance = new VaultManager(customRoot);
    }
    return VaultManager.instance;
  }

  /**
   * Replaces or clears the singleton instance (useful for test isolation).
   */
  public static setInstance(instance: VaultManager | null): void {
    VaultManager.instance = instance;
  }

  /**
   * Checks if a directory exists and is writable.
   */
  private checkDirectoryStatus(dirPath: string): StorageDirectoryStatus {
    const exists = fs.existsSync(dirPath);
    let isWritable = false;

    if (exists) {
      try {
        // Test writability by testing access for write mode
        fs.accessSync(dirPath, fs.constants.W_OK);
        isWritable = true;
      } catch {
        isWritable = false;
      }
    }

    return {
      path: dirPath,
      exists,
      isWritable,
    };
  }

  /**
   * Counts the physical template files currently residing in the templates vault directory.
   */
  public getVaultFileCount(): number {
    try {
      if (!fs.existsSync(this.templatesDir)) {
        return 0;
      }
      const entries = fs.readdirSync(this.templatesDir, { withFileTypes: true });
      return entries.filter(
        e => e.isFile() && (e.name.endsWith('.xlsx') || e.name.endsWith('.docx'))
      ).length;
    } catch {
      return 0;
    }
  }

  /**
   * Returns a complete health and status report of the managed storage system.
   */
  public getStorageStatus(): Result<VaultStorageStatus, AppError> {
    try {
      const templatesStatus = this.checkDirectoryStatus(this.templatesDir);
      const scratchStatus = this.checkDirectoryStatus(this.scratchDir);
      const reportsStatus = this.checkDirectoryStatus(this.reportsDir);
      const databaseStatus = this.checkDirectoryStatus(this.databaseDir);

      const isReady =
        templatesStatus.exists &&
        templatesStatus.isWritable &&
        scratchStatus.exists &&
        scratchStatus.isWritable &&
        reportsStatus.exists &&
        reportsStatus.isWritable;

      const fileCount = this.getVaultFileCount();

      const statusMessage = isReady
        ? `Storage vault ready. ${fileCount} master template file(s) in vault.`
        : 'Storage directories require initialization or write permissions.';

      return Ok({
        isReady,
        appDataRoot: this.appDataRoot,
        templatesDir: templatesStatus,
        scratchDir: scratchStatus,
        reportsDir: reportsStatus,
        databaseDir: databaseStatus,
        totalTemplatesInVault: fileCount,
        statusMessage,
      });
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.FILE_ACCESS_DENIED,
          userMessage: 'Failed to inspect application storage directory status.',
          details: {
            developerMessage: `getStorageStatus failed: ${err instanceof Error ? err.message : String(err)}`,
          },
          isOperational: true,
          cause: err,
        })
      );
    }
  }

  /**
   * Initializes all application-managed storage directories idempotently.
   * Creates required directories if missing and sweeps stale scratch artifacts.
   */
  public initializeVault(options?: VaultInitOptions): Result<VaultStorageStatus, AppError> {
    try {
      const requiredDirs = [
        this.appDataRoot,
        this.templatesDir,
        this.scratchDir,
        this.reportsDir,
        this.databaseDir,
        this.logsDir,
        this.backupsDir,
      ];

      for (const dir of requiredDirs) {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        } else {
          // If a regular file occupies the path, fail explicitly
          const stat = fs.statSync(dir);
          if (!stat.isDirectory()) {
            return Err(
              new AppError({
                code: ErrorCode.FILE_ACCESS_DENIED,
                userMessage: `Storage path "${dir}" exists but is not a directory.`,
                isOperational: true,
              })
            );
          }
        }
      }

      // Perform automated startup sweep of stale scratch files unless disabled
      if (!options?.skipScratchPurge) {
        const threshold = options?.staleScratchThresholdMs ?? DEFAULT_STALE_SCRATCH_AGE_MS;
        this.purgeStaleScratch(threshold);
      }

      return this.getStorageStatus();
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.FILE_ACCESS_DENIED,
          userMessage: 'Failed to initialize application storage vault directories.',
          details: {
            developerMessage: `Vault initialization error: ${err instanceof Error ? err.message : String(err)}`,
          },
          isOperational: true,
          cause: err,
        })
      );
    }
  }

  /**
   * Resolves the canonical, managed filesystem path for a master template in the vault.
   * Enforces stable identifier validation and boundary confinement.
   */
  public resolveTemplateVaultPath(
    templateId: TemplateId,
    rawExtension?: string
  ): Result<string, AppError> {
    try {
      if (!validateInternalIdentifier(templateId)) {
        return Err(
          new AppError({
            code: ErrorCode.VALIDATION_FAILED,
            userMessage: `Invalid template identifier: "${templateId}". Identifiers must be safe alphanumeric strings.`,
            isOperational: true,
          })
        );
      }

      const extension = normalizeTemplateExtension(rawExtension);
      const filename = `${templateId}${extension}`;
      const resolved = path.join(this.templatesDir, filename);

      assertPathInsideRoot(resolved, this.templatesDir, 'Master Template Vault');

      return Ok(resolved);
    } catch (err) {
      if (err instanceof AppError) {
        return Err(err);
      }
      return Err(
        new AppError({
          code: ErrorCode.SECURITY_VIOLATION,
          userMessage: 'Failed to resolve template vault path safely.',
          details: { developerMessage: String(err) },
          isOperational: true,
        })
      );
    }
  }

  /**
   * Resolves an ephemeral scratch file path within the scratch sandbox (%LOCALAPPDATA%\OpsReportStudio\Scratch\).
   */
  public resolveScratchPath(filenameOrPrefix: string): Result<string, AppError> {
    try {
      assertNoNullBytes(filenameOrPrefix);

      // Prevent directory traversal characters in scratch filename
      if (
        filenameOrPrefix.includes('..') ||
        filenameOrPrefix.includes('/') ||
        filenameOrPrefix.includes('\\')
      ) {
        return Err(
          new AppError({
            code: ErrorCode.SECURITY_VIOLATION,
            userMessage:
              'Invalid scratch filename: path separators and traversal sequences are prohibited.',
            isOperational: true,
          })
        );
      }

      const resolved = path.join(this.scratchDir, filenameOrPrefix);
      assertPathInsideRoot(resolved, this.scratchDir, 'Scratch Sandbox');

      return Ok(resolved);
    } catch (err) {
      if (err instanceof AppError) {
        return Err(err);
      }
      return Err(
        new AppError({
          code: ErrorCode.SECURITY_VIOLATION,
          userMessage: 'Failed to resolve scratch path safely.',
          isOperational: true,
        })
      );
    }
  }

  /**
   * Resolves a destination report file path ensuring it does NOT violate vault immutability.
   */
  public resolveReportOutputPath(
    reportFilename: string,
    customOutputDir?: string
  ): Result<string, AppError> {
    try {
      assertNoNullBytes(reportFilename);

      if (
        reportFilename.includes('..') ||
        reportFilename.includes('/') ||
        reportFilename.includes('\\')
      ) {
        return Err(
          new AppError({
            code: ErrorCode.SECURITY_VIOLATION,
            userMessage: 'Invalid report output filename.',
            isOperational: true,
          })
        );
      }

      const targetDir = customOutputDir ? path.resolve(customOutputDir) : this.reportsDir;
      const targetPath = path.join(targetDir, reportFilename);

      // Guard: Never allow writing directly into the Master Template Vault (INV-DAT-006)
      assertTargetNotInsideVault(targetPath, this.templatesDir);

      return Ok(targetPath);
    } catch (err) {
      if (err instanceof AppError) {
        return Err(err);
      }
      return Err(
        new AppError({
          code: ErrorCode.SECURITY_VIOLATION,
          userMessage: 'Failed to resolve safe report output path.',
          isOperational: true,
        })
      );
    }
  }

  /**
   * Checks whether a master template file physically exists in the vault.
   */
  public checkTemplateFileExists(
    templateId: TemplateId,
    extension?: string
  ): Result<boolean, AppError> {
    const pathResult = this.resolveTemplateVaultPath(templateId, extension);
    if (!pathResult.ok) {
      return pathResult;
    }
    return Ok(fs.existsSync(pathResult.value));
  }

  /**
   * Returns a physical template file descriptor if the file is present in the vault.
   */
  public getTemplateFileDescriptor(
    templateId: TemplateId,
    rawExtension?: string
  ): Result<TemplateFileDescriptor | null, AppError> {
    const pathResult = this.resolveTemplateVaultPath(templateId, rawExtension);
    if (!pathResult.ok) {
      return pathResult;
    }

    const filePath = pathResult.value;
    if (!fs.existsSync(filePath)) {
      return Ok(null);
    }

    try {
      const stat = fs.statSync(filePath);
      const ext = path.extname(filePath);
      const fileName = path.basename(filePath);
      const relativeVaultPath = path.relative(this.templatesDir, filePath);

      // Check read-only status (mode has write bits turned off)
      const isReadOnly = (stat.mode & 0o222) === 0;

      return Ok({
        templateId,
        fileName,
        extension: ext,
        relativeVaultPath,
        absolutePath: filePath,
        fileSizeBytes: stat.size,
        modifiedAt: stat.mtime.toISOString(),
        isReadOnly,
      });
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.FILE_ACCESS_DENIED,
          userMessage: `Failed to inspect master template file "${filePath}".`,
          isOperational: true,
          cause: err,
        })
      );
    }
  }

  /**
   * Sweeps the scratch sandbox and purges temporary .tmp files older than maxAgeMs.
   * Safely handles open/locked files without halting execution.
   */
  public purgeStaleScratch(maxAgeMs = DEFAULT_STALE_SCRATCH_AGE_MS): Result<number, AppError> {
    try {
      if (!fs.existsSync(this.scratchDir)) {
        return Ok(0);
      }

      const now = Date.now();
      let purgedCount = 0;
      const files = fs.readdirSync(this.scratchDir);

      for (const file of files) {
        if (!file.endsWith('.tmp')) {
          continue;
        }

        const fullPath = path.join(this.scratchDir, file);
        try {
          const stat = fs.statSync(fullPath);
          const age = now - stat.mtimeMs;
          if (age > maxAgeMs) {
            fs.unlinkSync(fullPath);
            purgedCount++;
          }
        } catch {
          // File might be temporarily locked or unlinked by worker, skip safely
        }
      }

      return Ok(purgedCount);
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.FILE_ACCESS_DENIED,
          userMessage: 'Failed during scratch directory purge.',
          isOperational: true,
          cause: err,
        })
      );
    }
  }
}
