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
import crypto from 'node:crypto';
import type { TemplateId } from '../../shared/types/identifiers.ts';
import type {
  VaultStorageStatus,
  StorageDirectoryStatus,
  TemplateFileDescriptor,
} from '../../shared/types/storage.ts';
import type {
  TemplateVersionRecord,
  CloneMasterTemplateOptions,
  CloneMasterTemplateResult,
  TemplateIntegrityCheckResult,
} from '../../shared/types/templates.ts';
import { Result, Ok, Err } from '../../shared/types/result.ts';
import { AppError } from '../../shared/errors/app-error.ts';
import { ErrorCode } from '../../shared/errors/error-codes.ts';
import {
  resolveAppDataRoot,
  resolveTemplatesDirectory,
  resolveScratchDirectory,
  resolveWorkspaceDirectory,
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
  public readonly workspaceDir: string;
  public readonly reportsDir: string;
  public readonly databaseDir: string;
  public readonly logsDir: string;
  public readonly backupsDir: string;

  constructor(customRoot?: string) {
    this.appDataRoot = resolveAppDataRoot(customRoot);
    this.templatesDir = resolveTemplatesDirectory(customRoot);
    this.scratchDir = resolveScratchDirectory(customRoot);
    this.workspaceDir = resolveWorkspaceDirectory(customRoot);
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
      const workspaceStatus = this.checkDirectoryStatus(this.workspaceDir);
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
        workspaceDir: workspaceStatus,
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
        this.workspaceDir,
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
   * Resolves the canonical, managed filesystem path for a specific version of a master template.
   * Path format: Templates/{templateId}_v{versionNumber}.{xlsx|docx}
   */
  public resolveTemplateVersionVaultPath(
    templateId: TemplateId,
    versionNumber: number,
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

      if (!Number.isInteger(versionNumber) || versionNumber < 1) {
        return Err(
          new AppError({
            code: ErrorCode.VALIDATION_FAILED,
            userMessage: `Invalid version number "${versionNumber}". Version must be an integer >= 1.`,
            isOperational: true,
          })
        );
      }

      const extension = normalizeTemplateExtension(rawExtension);
      const filename = `${templateId}_v${versionNumber}${extension}`;
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
          userMessage: 'Failed to resolve template version vault path safely.',
          details: { developerMessage: String(err) },
          isOperational: true,
        })
      );
    }
  }

  /**
   * Resolves the canonical vault path for a managed filename (e.g. from template_versions.file_name).
   */
  public resolveTemplateFileVaultPath(fileName: string): Result<string, AppError> {
    try {
      assertNoNullBytes(fileName);

      if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
        return Err(
          new AppError({
            code: ErrorCode.SECURITY_VIOLATION,
            userMessage:
              'Invalid template filename: path separators and traversal sequences are prohibited.',
            isOperational: true,
          })
        );
      }

      const resolved = path.join(this.templatesDir, fileName);
      assertPathInsideRoot(resolved, this.templatesDir, 'Master Template Vault');

      return Ok(resolved);
    } catch (err) {
      if (err instanceof AppError) {
        return Err(err);
      }
      return Err(
        new AppError({
          code: ErrorCode.SECURITY_VIOLATION,
          userMessage: 'Failed to resolve template file vault path safely.',
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
   * Resolves a working file path within the Generation Workspace (%LOCALAPPDATA%\OpsReportStudio\Workspace\).
   * Prevents directory traversal, verifies containment, and ensures path does not resolve into vault.
   */
  public resolveWorkspacePath(filenameOrPrefix: string): Result<string, AppError> {
    try {
      assertNoNullBytes(filenameOrPrefix);

      if (
        filenameOrPrefix.includes('..') ||
        filenameOrPrefix.includes('/') ||
        filenameOrPrefix.includes('\\')
      ) {
        return Err(
          new AppError({
            code: ErrorCode.SECURITY_VIOLATION,
            userMessage:
              'Invalid workspace filename: path separators and traversal sequences are prohibited.',
            isOperational: true,
          })
        );
      }

      const resolved = path.join(this.workspaceDir, filenameOrPrefix);
      assertPathInsideRoot(resolved, this.workspaceDir, 'Generation Workspace');
      assertTargetNotInsideVault(resolved, this.templatesDir);

      return Ok(resolved);
    } catch (err) {
      if (err instanceof AppError) {
        return Err(err);
      }
      return Err(
        new AppError({
          code: ErrorCode.SECURITY_VIOLATION,
          userMessage: 'Failed to resolve generation workspace path safely.',
          isOperational: true,
        })
      );
    }
  }

  /**
   * Safely deletes a working file from the Generation Workspace.
   * Only deletes files physically confirmed to reside inside Workspace/.
   */
  public deleteWorkspaceFile(fileName: string): Result<boolean, AppError> {
    try {
      const pathRes = this.resolveWorkspacePath(fileName);
      if (!pathRes.ok) {
        return pathRes;
      }
      const filePath = pathRes.value;
      if (!fs.existsSync(filePath)) {
        return Ok(false);
      }
      fs.unlinkSync(filePath);
      return Ok(true);
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.FILE_ACCESS_DENIED,
          userMessage: `Failed to remove workspace file "${fileName}".`,
          details: { developerMessage: String(err) },
          isOperational: true,
          cause: err,
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

  // ---------------------------------------------------------------------------
  // Master Immutability, Cloning & Integrity Operations (Step 19)
  // ---------------------------------------------------------------------------

  /**
   * Sets the filesystem read-only attribute on an accepted master template file (0o444).
   * Defense-in-depth complement to application service-level write protections.
   */
  public makeFileReadOnly(filePath: string): Result<boolean, AppError> {
    try {
      assertPathInsideRoot(filePath, this.templatesDir, 'Master Template Vault');
      if (!fs.existsSync(filePath)) {
        return Err(
          new AppError({
            code: ErrorCode.FILE_NOT_FOUND,
            userMessage: `Master template file not found: "${filePath}".`,
            isOperational: true,
          })
        );
      }

      // Windows/POSIX read-only mode: r--r--r-- (0o444)
      fs.chmodSync(filePath, 0o444);
      return Ok(true);
    } catch (err) {
      // Best-effort defense-in-depth: do not crash if platform filesystem forbids chmod
      return Err(
        new AppError({
          code: ErrorCode.FILE_ACCESS_DENIED,
          userMessage: `Failed to set read-only attribute on master file: ${filePath}`,
          details: { developerMessage: String(err) },
          isOperational: true,
          cause: err,
        })
      );
    }
  }

  /**
   * Safely deletes a template master file from the vault (e.g. during authorized permanent template removal).
   * Restores write permission (0o666) if file is read-only before unlinking.
   */
  public deleteTemplateFile(fileName: string): Result<boolean, AppError> {
    try {
      const pathRes = this.resolveTemplateFileVaultPath(fileName);
      if (!pathRes.ok) {
        return pathRes;
      }
      const filePath = pathRes.value;
      if (!fs.existsSync(filePath)) {
        return Ok(false);
      }
      // On Windows/POSIX, read-only files cannot be unlinked without granting write permission first
      try {
        fs.chmodSync(filePath, 0o666);
      } catch {
        // ignore chmod failure if unlinking succeeds
      }
      fs.unlinkSync(filePath);
      return Ok(true);
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.FILE_ACCESS_DENIED,
          userMessage: `Failed to remove template file "${fileName}" from Master Template Vault.`,
          details: { developerMessage: String(err) },
          isOperational: true,
          cause: err,
        })
      );
    }
  }

  /**
   * Computes the SHA-256 hash of a file on disk.
   */
  public computeFileHash(filePath: string): Result<string, AppError> {
    try {
      if (!fs.existsSync(filePath)) {
        return Err(
          new AppError({
            code: ErrorCode.FILE_NOT_FOUND,
            userMessage: `File not found: "${filePath}".`,
            isOperational: true,
          })
        );
      }
      const buffer = fs.readFileSync(filePath);
      const hash = crypto.createHash('sha256').update(buffer).digest('hex');
      return Ok(hash);
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.FILE_ACCESS_DENIED,
          userMessage: `Failed to compute hash for file: "${filePath}".`,
          details: { developerMessage: String(err) },
          isOperational: true,
          cause: err,
        })
      );
    }
  }

  /**
   * Verifies the physical presence, read-only status, and cryptographic integrity
   * of a master template version file against its persisted record.
   */
  public verifyVersionIntegrity(
    versionRecord: TemplateVersionRecord
  ): Result<TemplateIntegrityCheckResult, AppError> {
    try {
      const pathRes = this.resolveTemplateFileVaultPath(versionRecord.file_name);
      if (!pathRes.ok) {
        return pathRes;
      }
      const filePath = pathRes.value;

      if (!fs.existsSync(filePath)) {
        return Ok({
          versionId: versionRecord.version_id,
          templateId: versionRecord.template_id,
          versionNumber: versionRecord.version_number,
          expectedHash: versionRecord.sha256_hash,
          actualHash: null,
          isIntact: false,
          isReadOnly: false,
          statusMessage: `Physical master file "${versionRecord.file_name}" is missing from vault.`,
        });
      }

      const stat = fs.statSync(filePath);
      const isReadOnly = (stat.mode & 0o222) === 0;

      const hashRes = this.computeFileHash(filePath);
      if (!hashRes.ok) {
        return hashRes;
      }
      const actualHash = hashRes.value;

      // Handle placeholder hash for pre-seeded templates before initial import
      const isPlaceholder = versionRecord.sha256_hash === '0'.repeat(64);
      const matches =
        isPlaceholder || actualHash.toLowerCase() === versionRecord.sha256_hash.toLowerCase();

      const statusMessage = matches
        ? 'Master template version is intact and verified.'
        : `Integrity check failed: Expected SHA-256 ${versionRecord.sha256_hash}, but computed ${actualHash}. Master file may have been modified externally.`;

      return Ok({
        versionId: versionRecord.version_id,
        templateId: versionRecord.template_id,
        versionNumber: versionRecord.version_number,
        expectedHash: versionRecord.sha256_hash,
        actualHash,
        isIntact: matches,
        isReadOnly,
        statusMessage,
      });
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.TEMPLATE_INTEGRITY_COMPROMISED,
          userMessage: 'Failed to complete master template integrity verification.',
          details: { developerMessage: String(err) },
          isOperational: true,
          cause: err,
        })
      );
    }
  }

  /**
   * Produces an independent copy of an accepted master template version:
   * - Resolves master version source inside Templates/
   * - Verifies source is intact
   * - Allocates a unique destination in Scratch/ (sandbox) or designated work path
   * - Enforces destination does NOT resolve into the Templates/ vault
   * - Copies original bytes without mutation
   * - Verifies destination SHA-256 hash matches source SHA-256 hash
   * - Ensures source master remains untouched and unmodified
   */
  public cloneMasterTemplate(
    versionRecord: TemplateVersionRecord,
    options: CloneMasterTemplateOptions
  ): Result<CloneMasterTemplateResult, AppError> {
    let allocatedDestPath: string | null = null;
    try {
      // 1. Resolve source master path
      const sourcePathRes = this.resolveTemplateFileVaultPath(versionRecord.file_name);
      if (!sourcePathRes.ok) {
        return sourcePathRes;
      }
      const sourcePath = sourcePathRes.value;

      if (!fs.existsSync(sourcePath)) {
        return Err(
          new AppError({
            code: ErrorCode.TEMPLATE_NOT_FOUND,
            userMessage: `Master template file "${versionRecord.file_name}" does not exist in vault.`,
            isOperational: true,
          })
        );
      }

      // 2. Hash source file before copy
      const sourceHashRes = this.computeFileHash(sourcePath);
      if (!sourceHashRes.ok) {
        return sourceHashRes;
      }
      const sourceHash = sourceHashRes.value;

      // 3. Resolve destination path based on purpose
      const ext = path.extname(sourcePath);
      const randomSuffix = crypto.randomBytes(6).toString('hex');
      const basePrefix = options.customFilename
        ? options.customFilename.replace(/[^A-Za-z0-9_-]/g, '_')
        : `${versionRecord.template_id}_v${versionRecord.version_number}`;

      const cloneFileName = `${options.purpose.toLowerCase()}_${basePrefix}_${Date.now()}_${randomSuffix}${ext}`;

      const scratchRes = this.resolveScratchPath(cloneFileName);
      if (!scratchRes.ok) {
        return scratchRes;
      }
      allocatedDestPath = scratchRes.value;

      // Invariant: Destination must NOT point into the Master Template Vault (INV-DAT-006)
      assertTargetNotInsideVault(allocatedDestPath, this.templatesDir);

      if (fs.existsSync(allocatedDestPath)) {
        return Err(
          new AppError({
            code: ErrorCode.OUTPUT_DESTINATION_COLLISION,
            userMessage: `Clone destination collision: "${allocatedDestPath}" already exists.`,
            isOperational: true,
          })
        );
      }

      // 4. Perform byte-preserving copy
      fs.copyFileSync(sourcePath, allocatedDestPath);

      // Ensure write permissions on the newly created working copy
      try {
        fs.chmodSync(allocatedDestPath, 0o666);
      } catch {
        // Safe fallback
      }

      // 5. Verify copy completeness and integrity
      const destStat = fs.statSync(allocatedDestPath);
      const destHashRes = this.computeFileHash(allocatedDestPath);
      if (!destHashRes.ok) {
        throw destHashRes.error;
      }
      const destHash = destHashRes.value;

      if (destHash !== sourceHash) {
        throw new AppError({
          code: ErrorCode.TEMPLATE_INTEGRITY_COMPROMISED,
          userMessage: 'Cloned working copy hash does not match source master template hash.',
          isOperational: true,
        });
      }

      // 6. Confirm source master is unchanged
      const afterSourceHashRes = this.computeFileHash(sourcePath);
      if (afterSourceHashRes.ok && afterSourceHashRes.value !== sourceHash) {
        throw new AppError({
          code: ErrorCode.TEMPLATE_READONLY_VIOLATION,
          userMessage: 'Critical invariant violation: Master template was modified during cloning.',
          isOperational: false,
        });
      }

      return Ok({
        sourceVersion: versionRecord,
        clonedPath: allocatedDestPath,
        fileName: cloneFileName,
        fileSizeBytes: destStat.size,
        sha256Hash: destHash,
        clonedAt: new Date().toISOString(),
      });
    } catch (err) {
      // Rollback: unlink allocated destination copy if verification or copy failed
      if (allocatedDestPath && fs.existsSync(allocatedDestPath)) {
        try {
          fs.unlinkSync(allocatedDestPath);
        } catch {
          // Ignore cleanup error
        }
      }

      if (err instanceof AppError) {
        return Err(err);
      }
      return Err(
        new AppError({
          code: ErrorCode.FILE_ACCESS_DENIED,
          userMessage: 'Failed to clone master template version.',
          details: { developerMessage: String(err) },
          isOperational: true,
          cause: err,
        })
      );
    }
  }
}
