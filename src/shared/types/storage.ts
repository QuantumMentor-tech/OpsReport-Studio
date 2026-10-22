/**
 * OpsReport Studio — Shared Storage & Vault Types
 *
 * Defines contracts for storage directory status, vault health,
 * and template file descriptors across desktop IPC and renderer boundaries.
 *
 * @module shared/types/storage
 */

import type { TemplateId } from './identifiers.ts';

/**
 * Health and accessibility status for a single application storage directory.
 */
export interface StorageDirectoryStatus {
  readonly path: string;
  readonly exists: boolean;
  readonly isWritable: boolean;
}

/**
 * Comprehensive health status of the application-managed storage root and subdirectories.
 */
export interface VaultStorageStatus {
  readonly isReady: boolean;
  readonly appDataRoot: string;
  readonly templatesDir: StorageDirectoryStatus;
  readonly scratchDir: StorageDirectoryStatus;
  readonly reportsDir: StorageDirectoryStatus;
  readonly databaseDir: StorageDirectoryStatus;
  readonly workspaceDir?: StorageDirectoryStatus;
  readonly totalTemplatesInVault: number;
  readonly statusMessage: string;
}

/**
 * Physical template file descriptor in the master template vault.
 */
export interface TemplateFileDescriptor {
  readonly templateId: TemplateId;
  readonly fileName: string;
  readonly extension: string;
  readonly relativeVaultPath: string;
  readonly absolutePath: string;
  readonly fileSizeBytes: number;
  readonly modifiedAt: string;
  readonly isReadOnly: boolean;
}
