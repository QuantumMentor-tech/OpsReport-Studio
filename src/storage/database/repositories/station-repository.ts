/**
 * OpsReport Studio — Authoritative Station Persistence Repository
 *
 * Implements low-level relational persistence for stations and strict sequence
 * ordering. Enforces parameterized queries, contiguous ordinal sequence
 * reassignment inside atomic transactions, and domain validation.
 *
 * @module storage/database/repositories/station-repository
 */

import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import type { StationRecord, CreateStationInput, UpdateStationInput } from '../types.ts';
import { StationId, toStationId } from '../../../shared/types/identifiers.ts';
import { Result, Ok, Err } from '../../../shared/types/result.ts';
import { AppError } from '../../../shared/errors/app-error.ts';
import { ErrorCode } from '../../../shared/errors/error-codes.ts';

export class StationRepository {
  constructor(private readonly db: Database.Database) {}

  /**
   * Creates a new station record in the database.
   *
   * @param input Station creation properties
   * @returns Created StationRecord or AppError on validation / constraint failure
   */
  public createStation(input: CreateStationInput): Result<StationRecord, AppError> {
    try {
      // Validation: Non-empty name up to 150 characters
      const trimmedName = input.stationName.trim();
      if (!trimmedName || trimmedName.length > 150) {
        return Err(
          new AppError({
            code: ErrorCode.VALIDATION_FAILED,
            userMessage: 'Station name must be between 1 and 150 characters.',
            isOperational: true,
          })
        );
      }

      // Invariant: Station name must be case-insensitively unique
      const existingName = this.db
        .prepare('SELECT station_id FROM stations WHERE LOWER(TRIM(station_name)) = LOWER(?)')
        .get(trimmedName) as { station_id: string } | undefined;
      if (existingName) {
        return Err(
          new AppError({
            code: ErrorCode.VALIDATION_FAILED,
            userMessage: `A station named "${trimmedName}" already exists. Station names must be unique.`,
            isOperational: true,
          })
        );
      }

      // Generate stable identifier if not provided
      const stationId =
        input.stationId ?? toStationId(`STN-${crypto.randomUUID().slice(0, 8).toUpperCase()}`);

      // Calculate next contiguous display order if not specified
      let displayOrder = input.displayOrder;
      if (displayOrder === undefined || displayOrder === null) {
        const maxRow = this.db
          .prepare('SELECT COALESCE(MAX(display_order), 0) as maxOrder FROM stations')
          .get() as { maxOrder: number };
        displayOrder = maxRow.maxOrder + 1;
      } else if (displayOrder < 1) {
        return Err(
          new AppError({
            code: ErrorCode.VALIDATION_FAILED,
            userMessage: 'Station display order must be a positive integer (>= 1).',
            isOperational: true,
          })
        );
      }

      const now = new Date().toISOString();
      const isActive = input.isActive !== false ? 1 : 0;
      const stationCode = input.stationCode?.trim() || null;

      const stmt = this.db.prepare(`
        INSERT INTO stations (
          station_id,
          station_name,
          display_order,
          station_code,
          is_active,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(stationId, trimmedName, displayOrder, stationCode, isActive, now, now);

      const created = this.getStationById(stationId);
      if (!created.ok || !created.value) {
        return Err(
          new AppError({
            code: ErrorCode.PERSISTENCE_FAILED,
            userMessage: 'Failed to verify created station record.',
            isOperational: true,
          })
        );
      }

      return Ok(created.value);
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: 'Failed to insert station record into the database.',
          details: {
            developerMessage: `Station creation failed: ${err instanceof Error ? err.message : String(err)}`,
          },
          isOperational: true,
          cause: err,
        })
      );
    }
  }

  /**
   * Retrieves a station record by its unique stable identifier.
   */
  public getStationById(stationId: StationId): Result<StationRecord | null, AppError> {
    try {
      const stmt = this.db.prepare(`
        SELECT station_id, station_name, display_order, station_code, is_active, created_at, updated_at
        FROM stations
        WHERE station_id = ?
      `);

      const row = stmt.get(stationId) as StationRecord | undefined;
      return Ok(row ? { ...row, station_id: toStationId(row.station_id) } : null);
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: 'Failed to retrieve station by identifier.',
          details: {
            developerMessage: `Error querying station ${stationId}: ${err instanceof Error ? err.message : String(err)}`,
          },
          isOperational: true,
          cause: err,
        })
      );
    }
  }

  /**
   * Retrieves all stations strictly ordered by display_order ASC, created_at ASC.
   *
   * @param options Optional filter flags (e.g. activeOnly)
   */
  public getStationsOrdered(options?: { activeOnly?: boolean }): Result<StationRecord[], AppError> {
    try {
      let query = `
        SELECT station_id, station_name, display_order, station_code, is_active, created_at, updated_at
        FROM stations
      `;

      if (options?.activeOnly) {
        query += ' WHERE is_active = 1 ';
      }

      query += ' ORDER BY display_order ASC, created_at ASC ';

      const rows = this.db.prepare(query).all() as StationRecord[];
      const typedRows = rows.map(r => ({ ...r, station_id: toStationId(r.station_id) }));
      return Ok(typedRows);
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: 'Failed to retrieve ordered station sequence.',
          details: {
            developerMessage: `Error querying stations: ${err instanceof Error ? err.message : String(err)}`,
          },
          isOperational: true,
          cause: err,
        })
      );
    }
  }

  /**
   * Updates an existing station's attributes.
   */
  public updateStation(
    stationId: StationId,
    input: UpdateStationInput
  ): Result<StationRecord, AppError> {
    try {
      const existingResult = this.getStationById(stationId);
      if (!existingResult.ok) {
        return existingResult;
      }
      if (!existingResult.value) {
        return Err(
          new AppError({
            code: ErrorCode.INVALID_STATION_REFERENCE,
            userMessage: 'The station to update was not found.',
            isOperational: true,
          })
        );
      }

      const current = existingResult.value;
      const updatedName =
        input.stationName !== undefined ? input.stationName.trim() : current.station_name;

      if (!updatedName || updatedName.length > 150) {
        return Err(
          new AppError({
            code: ErrorCode.VALIDATION_FAILED,
            userMessage: 'Station name must be between 1 and 150 characters.',
            isOperational: true,
          })
        );
      }

      // Invariant: Station name must be case-insensitively unique among other stations
      if (input.stationName !== undefined) {
        const existingName = this.db
          .prepare(
            'SELECT station_id FROM stations WHERE LOWER(TRIM(station_name)) = LOWER(?) AND station_id != ?'
          )
          .get(updatedName, stationId) as { station_id: string } | undefined;
        if (existingName) {
          return Err(
            new AppError({
              code: ErrorCode.VALIDATION_FAILED,
              userMessage: `A station named "${updatedName}" already exists. Station names must be unique.`,
              isOperational: true,
            })
          );
        }
      }

      const updatedOrder =
        input.displayOrder !== undefined ? input.displayOrder : current.display_order;
      if (updatedOrder < 1) {
        return Err(
          new AppError({
            code: ErrorCode.VALIDATION_FAILED,
            userMessage: 'Station display order must be greater than or equal to 1.',
            isOperational: true,
          })
        );
      }

      const updatedCode =
        input.stationCode !== undefined ? input.stationCode?.trim() || null : current.station_code;
      const updatedActive =
        input.isActive !== undefined ? (input.isActive ? 1 : 0) : current.is_active;
      const now = new Date().toISOString();

      const stmt = this.db.prepare(`
        UPDATE stations
        SET station_name = ?,
            display_order = ?,
            station_code = ?,
            is_active = ?,
            updated_at = ?
        WHERE station_id = ?
      `);

      stmt.run(updatedName, updatedOrder, updatedCode, updatedActive, now, stationId);

      const refreshed = this.getStationById(stationId);
      if (!refreshed.ok || !refreshed.value) {
        return Err(
          new AppError({
            code: ErrorCode.PERSISTENCE_FAILED,
            userMessage: 'Failed to retrieve refreshed station after update.',
            isOperational: true,
          })
        );
      }

      return Ok(refreshed.value);
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: 'Failed to update station record.',
          details: {
            developerMessage: `Station update failed: ${err instanceof Error ? err.message : String(err)}`,
          },
          isOperational: true,
          cause: err,
        })
      );
    }
  }

  /**
   * Deletes a station by stable identifier and re-sequences remaining stations
   * to guarantee contiguous 1..N order.
   */
  public deleteStation(stationId: StationId): Result<boolean, AppError> {
    try {
      // Check if station is referenced by any report session snapshots
      const sessionCountRow = this.db
        .prepare('SELECT count(*) as count FROM report_session_stations WHERE station_id = ?')
        .get(stationId) as { count: number } | undefined;

      const sessionCount = sessionCountRow?.count ?? 0;
      if (sessionCount > 0) {
        return Err(
          new AppError({
            code: ErrorCode.VALIDATION_FAILED,
            userMessage: `Station cannot be deleted because it is referenced in ${sessionCount} report session(s). Deactivate the station instead to preserve historical reporting data.`,
            isOperational: true,
          })
        );
      }

      const deleteTx = this.db.transaction(() => {
        const stmt = this.db.prepare('DELETE FROM stations WHERE station_id = ?');
        const info = stmt.run(stationId);
        if (info.changes > 0) {
          // Re-sequence remaining stations to preserve contiguous 1..N sequence
          const remaining = this.db
            .prepare('SELECT station_id FROM stations ORDER BY display_order ASC, created_at ASC')
            .all() as { station_id: string }[];
          const updateStmt = this.db.prepare(`
            UPDATE stations
            SET display_order = ?, updated_at = ?
            WHERE station_id = ?
          `);
          const now = new Date().toISOString();
          for (let i = 0; i < remaining.length; i++) {
            updateStmt.run(i + 1, now, remaining[i].station_id);
          }
        }
        return info.changes > 0;
      });

      const deleted = deleteTx();
      return Ok(deleted);
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: 'Failed to delete station record.',
          details: {
            developerMessage: `Station deletion failed: ${err instanceof Error ? err.message : String(err)}`,
          },
          isOperational: true,
          cause: err,
        })
      );
    }
  }

  /**
   * Atomically updates the display order for an ordered array of station IDs.
   *
   * Assigns contiguous positions (1, 2, ..., N) in an explicit database transaction.
   * Guarantees rollback on failure and prevents partial or broken order states.
   *
   * @param orderedIds Station IDs in their desired sequence
   */
  public updateStationOrder(orderedIds: StationId[]): Result<StationRecord[], AppError> {
    try {
      if (orderedIds.length === 0) {
        return this.getStationsOrdered();
      }

      // Validate all IDs are unique in the input
      const idSet = new Set(orderedIds);
      if (idSet.size !== orderedIds.length) {
        return Err(
          new AppError({
            code: ErrorCode.VALIDATION_FAILED,
            userMessage: 'Reorder payload contains duplicate station identifiers.',
            isOperational: true,
          })
        );
      }

      const reorderTx = this.db.transaction(() => {
        const updateStmt = this.db.prepare(`
          UPDATE stations
          SET display_order = ?, updated_at = ?
          WHERE station_id = ?
        `);

        const now = new Date().toISOString();

        // Set authoritative contiguous 1..N order
        for (let i = 0; i < orderedIds.length; i++) {
          const authoritativeOrder = i + 1;
          updateStmt.run(authoritativeOrder, now, orderedIds[i]);
        }
      });

      reorderTx();

      return this.getStationsOrdered();
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: 'Failed to update station order sequence.',
          details: {
            developerMessage: `Station reorder transaction failed: ${err instanceof Error ? err.message : String(err)}`,
          },
          isOperational: true,
          cause: err,
        })
      );
    }
  }

  /**
   * Returns the count of stations in the database.
   */
  public getStationCount(activeOnly = false): Result<number, AppError> {
    try {
      const query = activeOnly
        ? 'SELECT count(*) as count FROM stations WHERE is_active = 1'
        : 'SELECT count(*) as count FROM stations';
      const row = this.db.prepare(query).get() as { count: number };
      return Ok(row.count);
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: 'Failed to count station records.',
          isOperational: true,
          cause: err,
        })
      );
    }
  }
}
