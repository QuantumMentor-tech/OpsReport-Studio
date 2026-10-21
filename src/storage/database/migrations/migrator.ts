/**
 * OpsReport Studio — Authoritative Database Migration Engine
 *
 * Coordinates versioned schema migrations, enforces deterministic forward-only
 * updates, tracks execution audit history in schema_migrations, and synchronizes
 * SQLite's internal PRAGMA user_version register.
 *
 * Implements strict downgrade prevention and transaction rollback safeguards.
 *
 * @module storage/database/migrations/migrator
 */

import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import type { Migration, MigrationResult } from './types.ts';
import type { MigrationRecord } from '../types.ts';
import { migration001 } from './001_initial_schema.ts';
import { migration002 } from './002_category_lifecycle_and_template_metadata.ts';
import { migration003 } from './003_report_session_and_draft_persistence.ts';
import { migration004 } from './004_template_versioning_and_immutability.ts';
import { migration005 } from './005_excel_template_mappings.ts';
import { migration006 } from './006_word_template_mappings.ts';
import { migration007 } from './007_mapping_profiles.ts';
import { migration008 } from './008_template_designer_drafts.ts';
import { Result, Ok, Err } from '../../../shared/types/result.ts';
import { AppError } from '../../../shared/errors/app-error.ts';
import { ErrorCode } from '../../../shared/errors/error-codes.ts';

export const CURRENT_SCHEMA_VERSION = 8;

/**
 * Ordered list of all registered schema migrations.
 */
export const ALL_MIGRATIONS: readonly Migration[] = [
  migration001,
  migration002,
  migration003,
  migration004,
  migration005,
  migration006,
  migration007,
  migration008,
];

/**
 * Computes a deterministic SHA-256 checksum for a migration payload.
 */
function computeMigrationChecksum(migration: Migration): string {
  const hash = crypto.createHash('sha256');
  hash.update(`${migration.version}:${migration.name}:${migration.description}`);
  return hash.digest('hex');
}

/**
 * Reads the current SQLite user_version pragma value.
 */
export function getSchemaVersion(db: Database.Database): number {
  const row = db.pragma('user_version', { simple: true });
  return typeof row === 'number' ? row : 0;
}

/**
 * Retrieves all applied migration records from the schema_migrations table.
 * Returns empty array if schema_migrations table does not yet exist.
 */
export function getAppliedMigrations(db: Database.Database): MigrationRecord[] {
  try {
    const tableExists = db
      .prepare(
        "SELECT count(*) as count FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'"
      )
      .get() as { count: number };

    if (!tableExists || tableExists.count === 0) {
      return [];
    }

    return db
      .prepare(
        'SELECT version, name, applied_at, checksum FROM schema_migrations ORDER BY version ASC'
      )
      .all() as MigrationRecord[];
  } catch {
    return [];
  }
}

/**
 * Executes all pending schema migrations in strict deterministic order.
 *
 * Guarantees:
 * 1. Each migration runs inside an isolated atomic transaction.
 * 2. On failure, transaction rolls back cleanly without partially updated schemas.
 * 3. Future versions throw an explicit migration error without modifying data.
 *
 * @param db Active SQLite database connection
 * @returns Result with MigrationResult or AppError on failure
 */
export function runMigrations(db: Database.Database): Result<MigrationResult, AppError> {
  try {
    const currentVersion = getSchemaVersion(db);

    // Safeguard 1: Downgrade protection (Section 13.1)
    if (currentVersion > CURRENT_SCHEMA_VERSION) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_MIGRATION_ERROR,
          userMessage:
            'The database was created by a newer version of OpsReport Studio and cannot be opened safely.',
          details: {
            developerMessage: `Database schema user_version (${currentVersion}) exceeds current application supported version (${CURRENT_SCHEMA_VERSION}).`,
            currentVersion,
            maxSupportedVersion: CURRENT_SCHEMA_VERSION,
          },
          isOperational: true,
        })
      );
    }

    // Filter pending migrations that have not yet been applied
    const pendingMigrations = ALL_MIGRATIONS.filter(
      migration => migration.version > currentVersion
    ).sort((a, b) => a.version - b.version);

    // If up to date, return early (idempotent repeat startup)
    if (pendingMigrations.length === 0) {
      const records = getAppliedMigrations(db);
      return Ok({
        appliedCount: 0,
        currentVersion,
        migrations: records,
      });
    }

    let appliedCount = 0;

    for (const migration of pendingMigrations) {
      // Execute each migration inside an atomic transaction
      const applyMigrationTx = db.transaction(() => {
        // Execute the migration SQL / operations
        migration.up(db);

        // Compute checksum and audit entry
        const checksum = computeMigrationChecksum(migration);
        const appliedAt = new Date().toISOString();

        db.prepare(
          `INSERT INTO schema_migrations (version, name, applied_at, checksum)
           VALUES (?, ?, ?, ?)`
        ).run(migration.version, migration.name, appliedAt, checksum);

        // Update the user_version pragma to mark migration complete
        db.pragma(`user_version = ${migration.version}`);
      });

      try {
        applyMigrationTx();
        appliedCount++;
      } catch (err) {
        return Err(
          new AppError({
            code: ErrorCode.PERSISTENCE_MIGRATION_ERROR,
            userMessage: `Failed to upgrade database schema during migration: ${migration.name}.`,
            details: {
              developerMessage: `Error executing migration ${migration.version} (${migration.name}): ${err instanceof Error ? err.message : String(err)}`,
              failedMigration: migration.name,
              failedVersion: migration.version,
            },
            isOperational: true,
            cause: err,
          })
        );
      }
    }

    const newVersion = getSchemaVersion(db);
    const updatedRecords = getAppliedMigrations(db);

    return Ok({
      appliedCount,
      currentVersion: newVersion,
      migrations: updatedRecords,
    });
  } catch (err) {
    return Err(
      new AppError({
        code: ErrorCode.PERSISTENCE_MIGRATION_ERROR,
        userMessage: 'A database migration failure occurred.',
        details: {
          developerMessage: `Unexpected error during migration execution: ${err instanceof Error ? err.message : String(err)}`,
        },
        isOperational: true,
        cause: err,
      })
    );
  }
}
