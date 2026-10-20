/**
 * OpsReport Studio — Database Connection & Lifecycle Manager
 *
 * Implements the centralized SQLite connection manager, applies authoritative
 * PRAGMA directives (WAL mode, foreign keys, timeouts), runs versioned schema
 * migrations, and guarantees clean error propagation.
 *
 * @module storage/database/connection
 */

import Database from 'better-sqlite3';
import type { DatabaseOptions } from './types.ts';
import { resolveDatabasePath, ensureDatabaseDirectoryExists, PRAGMA_CONFIG } from './config.ts';
import { runMigrations } from './migrations/migrator.ts';
import { Result, Ok, Err } from '../../shared/types/result.ts';
import { AppError } from '../../shared/errors/app-error.ts';
import { ErrorCode } from '../../shared/errors/error-codes.ts';

export class DatabaseManager {
  private static instance: DatabaseManager | null = null;
  private db: Database.Database | null = null;
  private readonly dbPath: string;
  private isInitialized = false;

  constructor(private readonly options: DatabaseOptions = {}) {
    this.dbPath = resolveDatabasePath(options.databasePath);
  }

  public static getInstance(options?: DatabaseOptions): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager(options);
    }
    return DatabaseManager.instance;
  }

  /**
   * Initializes the database connection, applies PRAGMAs, and runs pending migrations.
   *
   * @returns Result with DatabaseManager instance or AppError on failure
   */
  public initialize(): Result<DatabaseManager, AppError> {
    if (this.isInitialized && this.db && this.db.open) {
      return Ok(this);
    }

    try {
      // Step 1: Ensure directory exists on filesystem for file-backed databases
      ensureDatabaseDirectoryExists(this.dbPath);

      // Step 2: Open SQLite connection with configured options
      this.db = new Database(this.dbPath, {
        readonly: this.options.readonly ?? false,
        fileMustExist: this.options.fileMustExist ?? false,
        timeout: this.options.timeout ?? PRAGMA_CONFIG.busy_timeout,
        verbose: this.options.verbose,
      });

      // Step 3: Apply Authoritative PRAGMA Settings (Section 2 & 8)
      // Foreign keys must be explicitly enabled for every SQLite connection
      this.db.pragma(`foreign_keys = ${PRAGMA_CONFIG.foreign_keys}`);
      this.db.pragma(`busy_timeout = ${PRAGMA_CONFIG.busy_timeout}`);
      this.db.pragma(`synchronous = ${PRAGMA_CONFIG.synchronous}`);
      this.db.pragma(`temp_store = ${PRAGMA_CONFIG.temp_store}`);
      this.db.pragma(`cache_size = ${PRAGMA_CONFIG.cache_size}`);

      // Apply WAL mode for disk-backed databases (WAL not supported in :memory:)
      if (this.dbPath !== ':memory:') {
        this.db.pragma(`journal_mode = ${PRAGMA_CONFIG.journal_mode}`);
      }

      // Step 4: Run Versioned Migrations (unless explicitly skipped)
      if (!this.options.skipMigrations && !this.options.readonly) {
        const migrationResult = runMigrations(this.db);
        if (!migrationResult.ok) {
          // Close connection if migration fails to prevent operating on invalid schema
          this.close();
          return Err(migrationResult.error);
        }
      }

      this.isInitialized = true;
      return Ok(this);
    } catch (err) {
      this.close();
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: 'Failed to initialize the local operational database.',
          details: {
            developerMessage: `Database connection initialization failed for path "${this.dbPath}": ${err instanceof Error ? err.message : String(err)}`,
          },
          isOperational: true,
          cause: err,
        })
      );
    }
  }

  /**
   * Returns the underlying better-sqlite3 database instance.
   * Throws an AppError if the connection is not initialized.
   */
  public getDatabase(): Database.Database {
    if (!this.db || !this.db.open || !this.isInitialized) {
      throw new AppError({
        code: ErrorCode.PERSISTENCE_FAILED,
        userMessage: 'The local database is currently closed or uninitialized.',
        details: {
          developerMessage:
            'Attempted to access database instance prior to successful initialize().',
        },
        isOperational: true,
      });
    }
    return this.db;
  }

  /**
   * Checks whether the database connection is open and ready.
   */
  public isOpen(): boolean {
    return Boolean(this.db && this.db.open && this.isInitialized);
  }

  /**
   * Returns the resolved filesystem path for this database.
   */
  public getPath(): string {
    return this.dbPath;
  }

  /**
   * Executes a callback within a managed database transaction.
   *
   * @param fn Function to execute atomically
   * @returns Return value of the callback
   */
  public transaction<T>(fn: () => T): T {
    const db = this.getDatabase();
    const tx = db.transaction(fn);
    return tx();
  }

  /**
   * Safely closes the database connection.
   */
  public close(): void {
    if (this.db && this.db.open) {
      try {
        this.db.close();
      } catch {
        // Safe ignore on shutdown
      }
    }
    this.db = null;
    this.isInitialized = false;
  }
}
