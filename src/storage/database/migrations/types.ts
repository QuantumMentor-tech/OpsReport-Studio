/**
 * OpsReport Studio — Database Migration Types & Contracts
 *
 * @module storage/database/migrations/types
 */

import type Database from 'better-sqlite3';
import type { MigrationRecord } from '../types.ts';

export interface Migration {
  /** Sequential integer schema version (1, 2, 3...) */
  readonly version: number;
  /** Unique semantic migration identifier */
  readonly name: string;
  /** Summary of changes applied by this migration */
  readonly description: string;
  /** Forward migration execution routine */
  readonly up: (db: Database.Database) => void;
}

export interface MigrationResult {
  /** Number of newly applied migrations in this execution */
  readonly appliedCount: number;
  /** Current active schema version */
  readonly currentVersion: number;
  /** All migration records currently tracked in the database */
  readonly migrations: readonly MigrationRecord[];
}
