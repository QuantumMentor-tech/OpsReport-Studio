/**
 * OpsReport Studio — Application Settings Repository
 *
 * Implements key-value persistence in the app_settings table.
 *
 * @module storage/database/repositories/settings-repository
 */

import type Database from 'better-sqlite3';
import { Result, Ok, Err } from '../../../shared/types/result.ts';
import { AppError } from '../../../shared/errors/app-error.ts';
import { ErrorCode } from '../../../shared/errors/error-codes.ts';

export class SettingsRepository {
  constructor(private readonly db: Database.Database) {}

  /**
   * Retrieves a setting value by key. Returns null if not found.
   */
  public getSetting(key: string): Result<string | null, AppError> {
    try {
      const stmt = this.db.prepare('SELECT setting_value FROM app_settings WHERE setting_key = ?');
      const row = stmt.get(key) as { setting_value: string } | undefined;
      return Ok(row ? row.setting_value : null);
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: 'Failed to retrieve application setting.',
          details: {
            developerMessage: `Setting lookup failed for key "${key}": ${err instanceof Error ? err.message : String(err)}`,
          },
          isOperational: true,
          cause: err,
        })
      );
    }
  }

  /**
   * Inserts or updates a setting key-value pair.
   */
  public setSetting(key: string, value: string): Result<void, AppError> {
    try {
      const now = new Date().toISOString();
      const stmt = this.db.prepare(`
        INSERT INTO app_settings (setting_key, setting_value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(setting_key) DO UPDATE SET
          setting_value = excluded.setting_value,
          updated_at = excluded.updated_at
      `);

      stmt.run(key, value, now);
      return Ok(undefined);
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: 'Failed to persist application setting.',
          details: {
            developerMessage: `Setting write failed for key "${key}": ${err instanceof Error ? err.message : String(err)}`,
          },
          isOperational: true,
          cause: err,
        })
      );
    }
  }

  /**
   * Deletes a setting key. Returns true if row was deleted.
   */
  public deleteSetting(key: string): Result<boolean, AppError> {
    try {
      const stmt = this.db.prepare('DELETE FROM app_settings WHERE setting_key = ?');
      const info = stmt.run(key);
      return Ok(info.changes > 0);
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: 'Failed to delete application setting.',
          isOperational: true,
          cause: err,
        })
      );
    }
  }

  /**
   * Retrieves all stored settings as a key-value dictionary.
   */
  public getAllSettings(): Result<Record<string, string>, AppError> {
    try {
      const rows = this.db
        .prepare('SELECT setting_key, setting_value FROM app_settings ORDER BY setting_key ASC')
        .all() as Array<{ setting_key: string; setting_value: string }>;

      const dict: Record<string, string> = {};
      for (const row of rows) {
        dict[row.setting_key] = row.setting_value;
      }
      return Ok(dict);
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: 'Failed to retrieve settings collection.',
          isOperational: true,
          cause: err,
        })
      );
    }
  }
}
