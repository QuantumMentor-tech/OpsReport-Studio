/**
 * OpsReport Studio — Local Database Configuration & Path Resolution
 *
 * Resolves the application database directory according to Step 8 storage
 * specifications (%LOCALAPPDATA%\OpsReportStudio\Database\opsreport.db)
 * and defines authoritative SQLite PRAGMA connection defaults.
 *
 * @module storage/database/config
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

export const DATABASE_FILENAME = 'opsreport.db';
export const APP_FOLDER_NAME = 'OpsReportStudio';
export const DATABASE_SUBDIR = 'Database';

/**
 * Authoritative PRAGMA directives for high-concurrency desktop operations.
 * Specified in PERSIST-SPEC-001 Section 2.
 */
export const PRAGMA_CONFIG = {
  /** Write-Ahead Logging for non-blocking concurrent reads during writes */
  journal_mode: 'WAL',
  /** Strict relational foreign key constraint enforcement */
  foreign_keys: 'ON',
  /** Safe write durability balancing speed and power-loss resilience */
  synchronous: 'NORMAL',
  /** Wait up to 5,000 ms on transient locks before throwing SQLITE_BUSY */
  busy_timeout: 5000,
  /** Store temporary tables and indices in RAM */
  temp_store: 'MEMORY',
  /** Allocate 2,000 KB (2 MB) page cache memory (negative value = KB) */
  cache_size: -2000,
} as const;

/**
 * Resolves the authoritative application database directory path.
 *
 * Follows Windows standard: %LOCALAPPDATA%\OpsReportStudio\Database\
 * Falls back safely to user home directory in test or non-Windows environments.
 */
export function resolveDatabaseDirectory(): string {
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  return path.join(localAppData, APP_FOLDER_NAME, DATABASE_SUBDIR);
}

/**
 * Resolves the full filesystem path for the SQLite database file.
 *
 * @param customPath Optional explicit path (or ':memory:') override
 * @returns Fully qualified file path or ':memory:'
 */
export function resolveDatabasePath(customPath?: string): string {
  // If caller explicitly passes ':memory:' or custom path, honor it directly
  if (customPath) {
    if (customPath === ':memory:') {
      return ':memory:';
    }
    return path.resolve(customPath);
  }

  // Check for environment variable override
  if (process.env.OPSREPORT_DB_PATH) {
    return path.resolve(process.env.OPSREPORT_DB_PATH);
  }

  // Default production location
  const dbDir = resolveDatabaseDirectory();
  return path.join(dbDir, DATABASE_FILENAME);
}

/**
 * Ensures the target database directory exists on the filesystem.
 * No-op if target is ':memory:'.
 *
 * @param dbPath The target database file path
 */
export function ensureDatabaseDirectoryExists(dbPath: string): void {
  if (dbPath === ':memory:') {
    return;
  }

  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
