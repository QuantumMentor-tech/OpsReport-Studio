/**
 * OpsReport Studio — Storage Vault Configuration & Directory Constants
 *
 * Defines the canonical application-managed storage layout across
 * master templates, scratch sandbox, generated outputs, database, and backups.
 *
 * Follows Windows standard %LOCALAPPDATA%\OpsReportStudio\
 * with seamless fallbacks for test and non-Windows environments.
 *
 * @module storage/vault/vault-config
 */

import path from 'node:path';
import os from 'node:os';

export const APP_FOLDER_NAME = 'OpsReportStudio';
export const TEMPLATES_SUBDIR = 'Templates';
export const SCRATCH_SUBDIR = 'Scratch';
export const WORKSPACE_SUBDIR = 'Workspace';
export const REPORTS_SUBDIR = 'Reports';
export const DATABASE_SUBDIR = 'Database';
export const LOGS_SUBDIR = 'Logs';
export const BACKUPS_SUBDIR = 'Backups';

/**
 * Resolves the root application data directory.
 * Priority:
 * 1. customRoot parameter (if provided)
 * 2. OPSREPORT_DATA_ROOT environment variable (if provided)
 * 3. %LOCALAPPDATA%\OpsReportStudio (Windows) or ~/.local/share/OpsReportStudio (POSIX)
 */
export function resolveAppDataRoot(customRoot?: string): string {
  if (customRoot) {
    return path.resolve(customRoot);
  }
  if (process.env.OPSREPORT_DATA_ROOT) {
    return path.resolve(process.env.OPSREPORT_DATA_ROOT);
  }

  const baseDir =
    process.env.LOCALAPPDATA ||
    (process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Application Support')
      : path.join(os.homedir(), 'AppData', 'Local'));

  return path.join(baseDir, APP_FOLDER_NAME);
}

/**
 * Resolves the canonical Master Template Vault directory path (%LOCALAPPDATA%\OpsReportStudio\Templates).
 */
export function resolveTemplatesDirectory(customRoot?: string): string {
  return path.join(resolveAppDataRoot(customRoot), TEMPLATES_SUBDIR);
}

/**
 * Resolves the canonical Ephemeral Scratch Sandbox directory path (%LOCALAPPDATA%\OpsReportStudio\Scratch).
 */
export function resolveScratchDirectory(customRoot?: string): string {
  return path.join(resolveAppDataRoot(customRoot), SCRATCH_SUBDIR);
}

/**
 * Resolves the canonical Generation Workspace directory path (%LOCALAPPDATA%\OpsReportStudio\Workspace).
 */
export function resolveWorkspaceDirectory(customRoot?: string): string {
  return path.join(resolveAppDataRoot(customRoot), WORKSPACE_SUBDIR);
}

/**
 * Resolves the canonical Generated Reports directory path (%LOCALAPPDATA%\OpsReportStudio\Reports).
 */
export function resolveReportsDirectory(customRoot?: string): string {
  return path.join(resolveAppDataRoot(customRoot), REPORTS_SUBDIR);
}

/**
 * Resolves the canonical Database directory path (%LOCALAPPDATA%\OpsReportStudio\Database).
 */
export function resolveDatabaseDirectory(customRoot?: string): string {
  return path.join(resolveAppDataRoot(customRoot), DATABASE_SUBDIR);
}

/**
 * Resolves the canonical Logs directory path (%LOCALAPPDATA%\OpsReportStudio\Logs).
 */
export function resolveLogsDirectory(customRoot?: string): string {
  return path.join(resolveAppDataRoot(customRoot), LOGS_SUBDIR);
}

/**
 * Resolves the canonical Backups directory path (%LOCALAPPDATA%\OpsReportStudio\Backups).
 */
export function resolveBackupsDirectory(customRoot?: string): string {
  return path.join(resolveAppDataRoot(customRoot), BACKUPS_SUBDIR);
}
