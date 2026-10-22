/**
 * OpsReport Studio — Storage Module Barrel Export
 *
 * @module storage
 */

export * from './database/index.ts';
export {
  TEMPLATES_SUBDIR,
  SCRATCH_SUBDIR,
  WORKSPACE_SUBDIR,
  REPORTS_SUBDIR,
  LOGS_SUBDIR,
  BACKUPS_SUBDIR,
  resolveAppDataRoot,
  resolveTemplatesDirectory,
  resolveScratchDirectory,
  resolveWorkspaceDirectory,
  resolveReportsDirectory,
  resolveLogsDirectory,
  resolveBackupsDirectory,
  validateInternalIdentifier,
  assertNoNullBytes,
  isPathInsideRoot,
  assertPathInsideRoot,
  assertTargetNotInsideVault,
  normalizeTemplateExtension,
  DEFAULT_STALE_SCRATCH_AGE_MS,
  VaultManager,
  type VaultInitOptions,
  validateDocumentBuffer,
  validateDocumentFile,
  TemplateImporter,
} from './vault/index.ts';
export * from './generation/index.ts';
