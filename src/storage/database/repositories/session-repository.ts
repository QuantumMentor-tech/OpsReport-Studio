/**
 * OpsReport Studio — Authoritative Report Session & Draft Persistence Repository
 *
 * Implements centralized relational persistence for operational report sessions with:
 * - Stable session identity (ReportSessionId)
 * - Association to verified report categories (ON DELETE RESTRICT)
 * - Association to template metadata (ON DELETE SET NULL)
 * - Atomic station sequence snapshots preserving historical ordering (DEC-025)
 * - Incomplete draft payload persistence and versioning
 * - Atomic draft updates with updated_at timestamp maintenance
 * - Resumable session retrieval (DRAFT and IN_PROGRESS)
 * - Lifecycle state transitions and completion timestamps
 * - Safe rollback on failure and non-destructive failure guarantees
 *
 * @module storage/database/repositories/session-repository
 */

import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import type {
  ReportSessionRecord,
  ReportSessionDetail,
  SessionStationSnapshot,
  ReportSessionPayload,
  CreateReportSessionInput,
  UpdateReportSessionInput,
  SessionListFilter,
  SessionStatus,
} from '../types.ts';
import {
  ReportSessionId,
  toReportSessionId,
  toReportCategoryId,
  toTemplateId,
  toStationId,
} from '../../../shared/types/identifiers.ts';
import { Result, Ok, Err } from '../../../shared/types/result.ts';
import { AppError } from '../../../shared/errors/app-error.ts';
import { ErrorCode } from '../../../shared/errors/error-codes.ts';

const VALID_STATUSES: ReadonlySet<SessionStatus> = new Set([
  'DRAFT',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
]);

interface RawSessionRow {
  session_id: string;
  session_title: string;
  category_id: string;
  template_id: string | null;
  status: SessionStatus;
  payload_version: number;
  form_data: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

interface RawStationSnapshotRow {
  session_id: string;
  station_id: string;
  sequence_order: number;
  station_name_snapshot: string;
  station_code_snapshot: string | null;
}

export class SessionRepository {
  constructor(private readonly db: Database.Database) {}

  /**
   * Transforms a database row into a strongly typed ReportSessionRecord.
   */
  private mapRowToRecord(row: RawSessionRow): ReportSessionRecord {
    return {
      sessionId: toReportSessionId(row.session_id),
      sessionTitle: row.session_title,
      categoryId: toReportCategoryId(row.category_id),
      templateId: row.template_id ? toTemplateId(row.template_id) : null,
      status: row.status,
      payloadVersion: row.payload_version,
      formData: row.form_data,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at ?? null,
    };
  }

  /**
   * Safely parses form_data JSON into a ReportSessionPayload.
   */
  private parsePayload(rawFormData: string, payloadVersion: number): ReportSessionPayload {
    try {
      const parsed = JSON.parse(rawFormData);
      if (typeof parsed === 'object' && parsed !== null) {
        return {
          version: typeof parsed.version === 'number' ? parsed.version : payloadVersion,
          data: parsed.data && typeof parsed.data === 'object' ? parsed.data : parsed,
        };
      }
      return { version: payloadVersion, data: {} };
    } catch {
      return { version: payloadVersion, data: {} };
    }
  }

  /**
   * Creates a new report session and freezes its station sequence snapshot in an atomic transaction.
   */
  public createSession(input: CreateReportSessionInput): Result<ReportSessionDetail, AppError> {
    try {
      // 1. Validate session title
      const trimmedTitle = input.sessionTitle.trim();
      if (!trimmedTitle) {
        return Err(
          new AppError({
            code: ErrorCode.VALIDATION_FAILED,
            userMessage: 'Session title is required and cannot be empty.',
            isOperational: true,
          })
        );
      }

      // 2. Validate category exists and is valid
      const categoryExists = this.db
        .prepare('SELECT count(*) as count FROM report_categories WHERE category_id = ?')
        .get(input.categoryId) as { count: number } | undefined;

      if (!categoryExists || categoryExists.count === 0) {
        return Err(
          new AppError({
            code: ErrorCode.VALIDATION_FAILED,
            userMessage: `Referenced report category "${input.categoryId}" does not exist.`,
            isOperational: true,
          })
        );
      }

      // 3. Validate template if provided
      if (input.templateId) {
        const templateExists = this.db
          .prepare('SELECT count(*) as count FROM template_metadata WHERE template_id = ?')
          .get(input.templateId) as { count: number } | undefined;

        if (!templateExists || templateExists.count === 0) {
          return Err(
            new AppError({
              code: ErrorCode.VALIDATION_FAILED,
              userMessage: `Referenced template "${input.templateId}" does not exist.`,
              isOperational: true,
            })
          );
        }
      }

      // 4. Validate status
      const status: SessionStatus = input.status ?? 'DRAFT';
      if (!VALID_STATUSES.has(status)) {
        return Err(
          new AppError({
            code: ErrorCode.VALIDATION_FAILED,
            userMessage: `Invalid session status: ${status}. Must be DRAFT, IN_PROGRESS, COMPLETED, or CANCELLED.`,
            isOperational: true,
          })
        );
      }

      const sessionId: ReportSessionId =
        input.sessionId ?? toReportSessionId(`SES-${crypto.randomUUID()}`);
      const payloadVersion = input.payloadVersion ?? 1;

      // 5. Serialize form payload
      const payloadObject: ReportSessionPayload = {
        version: payloadVersion,
        data: input.payload ?? {},
      };
      const formData = JSON.stringify(payloadObject);

      const now = new Date().toISOString();
      const completedAt = status === 'COMPLETED' ? now : null;

      // 6. Execute atomic insertion
      const createTx = this.db.transaction(() => {
        // Insert report session record
        const insertSessionStmt = this.db.prepare(`
          INSERT INTO report_sessions (
            session_id,
            session_title,
            category_id,
            template_id,
            status,
            payload_version,
            form_data,
            created_at,
            updated_at,
            completed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        insertSessionStmt.run(
          sessionId,
          trimmedTitle,
          input.categoryId,
          input.templateId ?? null,
          status,
          payloadVersion,
          formData,
          now,
          now,
          completedAt
        );

        // Insert station snapshots if provided (DEC-025)
        const snapshots: SessionStationSnapshot[] = [];
        if (input.stations && input.stations.length > 0) {
          const insertStationStmt = this.db.prepare(`
            INSERT INTO report_session_stations (
              session_id,
              station_id,
              sequence_order,
              station_name_snapshot,
              station_code_snapshot
            ) VALUES (?, ?, ?, ?, ?)
          `);

          // Validate station existence and uniqueness within session
          const seenStationIds = new Set<string>();
          for (const stn of input.stations) {
            if (seenStationIds.has(stn.stationId)) {
              throw new AppError({
                code: ErrorCode.VALIDATION_FAILED,
                userMessage: `Duplicate station association for "${stn.stationId}" in session.`,
                isOperational: true,
              });
            }
            seenStationIds.add(stn.stationId);

            // Verify station exists in canonical stations table
            const stnExists = this.db
              .prepare('SELECT count(*) as count FROM stations WHERE station_id = ?')
              .get(stn.stationId) as { count: number } | undefined;

            if (!stnExists || stnExists.count === 0) {
              throw new AppError({
                code: ErrorCode.VALIDATION_FAILED,
                userMessage: `Station "${stn.stationId}" does not exist in canonical station registry.`,
                isOperational: true,
              });
            }

            insertStationStmt.run(
              sessionId,
              stn.stationId,
              stn.sequenceOrder,
              stn.stationNameSnapshot.trim(),
              stn.stationCodeSnapshot ? stn.stationCodeSnapshot.trim() : null
            );

            snapshots.push({
              sessionId,
              stationId: stn.stationId,
              sequenceOrder: stn.sequenceOrder,
              stationNameSnapshot: stn.stationNameSnapshot.trim(),
              stationCodeSnapshot: stn.stationCodeSnapshot ? stn.stationCodeSnapshot.trim() : null,
            });
          }
        }

        return snapshots;
      });

      const snapshots = createTx();

      const sessionRecord: ReportSessionRecord = {
        sessionId,
        sessionTitle: trimmedTitle,
        categoryId: input.categoryId,
        templateId: input.templateId ?? null,
        status,
        payloadVersion,
        formData,
        createdAt: now,
        updatedAt: now,
        completedAt,
      };

      return Ok({
        session: sessionRecord,
        stations: snapshots.sort((a, b) => a.sequenceOrder - b.sequenceOrder),
        parsedPayload: payloadObject,
      });
    } catch (err) {
      if (err instanceof AppError) {
        return Err(err);
      }
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: 'Failed to create report session in database.',
          details: {
            developerMessage: `Create session error: ${err instanceof Error ? err.message : String(err)}`,
          },
          isOperational: true,
          cause: err,
        })
      );
    }
  }

  /**
   * Retrieves a report session by its stable identifier with station snapshots and parsed payload.
   */
  public getSessionById(sessionId: ReportSessionId): Result<ReportSessionDetail | null, AppError> {
    try {
      const sessionRow = this.db
        .prepare(
          `
          SELECT session_id, session_title, category_id, template_id, status,
                 payload_version, form_data, created_at, updated_at, completed_at
          FROM report_sessions
          WHERE session_id = ?
        `
        )
        .get(sessionId) as RawSessionRow | undefined;

      if (!sessionRow) {
        return Ok(null);
      }

      const stationRows = this.db
        .prepare(
          `
          SELECT session_id, station_id, sequence_order, station_name_snapshot, station_code_snapshot
          FROM report_session_stations
          WHERE session_id = ?
          ORDER BY sequence_order ASC
        `
        )
        .all(sessionId) as RawStationSnapshotRow[];

      const record = this.mapRowToRecord(sessionRow);
      const stations: SessionStationSnapshot[] = stationRows.map(row => ({
        sessionId: toReportSessionId(row.session_id),
        stationId: toStationId(row.station_id),
        sequenceOrder: row.sequence_order,
        stationNameSnapshot: row.station_name_snapshot,
        stationCodeSnapshot: row.station_code_snapshot,
      }));

      const parsedPayload = this.parsePayload(record.formData, record.payloadVersion);

      return Ok({
        session: record,
        stations,
        parsedPayload,
      });
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: 'Failed to retrieve report session from database.',
          details: {
            developerMessage: `Get session error for ${sessionId}: ${err instanceof Error ? err.message : String(err)}`,
          },
          isOperational: true,
          cause: err,
        })
      );
    }
  }

  /**
   * Updates an existing report session draft atomically.
   * Modifies session metadata, draft payload, and optional stations snapshot.
   * If any step fails, the entire transaction rolls back and previous data is preserved.
   */
  public updateSessionDraft(
    sessionId: ReportSessionId,
    input: UpdateReportSessionInput
  ): Result<ReportSessionDetail, AppError> {
    try {
      // 1. Retrieve current record
      const currentResult = this.getSessionById(sessionId);
      if (!currentResult.ok) {
        return currentResult;
      }
      if (!currentResult.value) {
        return Err(
          new AppError({
            code: ErrorCode.VALIDATION_FAILED,
            userMessage: `Report session "${sessionId}" does not exist.`,
            isOperational: true,
          })
        );
      }

      const current = currentResult.value.session;

      // 2. Validate session title if updated
      let sessionTitle = current.sessionTitle;
      if (input.sessionTitle !== undefined) {
        const trimmed = input.sessionTitle.trim();
        if (!trimmed) {
          return Err(
            new AppError({
              code: ErrorCode.VALIDATION_FAILED,
              userMessage: 'Session title cannot be empty.',
              isOperational: true,
            })
          );
        }
        sessionTitle = trimmed;
      }

      // 3. Validate template if updated
      let templateId = current.templateId;
      if (input.templateId !== undefined) {
        if (input.templateId !== null) {
          const templateExists = this.db
            .prepare('SELECT count(*) as count FROM template_metadata WHERE template_id = ?')
            .get(input.templateId) as { count: number } | undefined;

          if (!templateExists || templateExists.count === 0) {
            return Err(
              new AppError({
                code: ErrorCode.VALIDATION_FAILED,
                userMessage: `Referenced template "${input.templateId}" does not exist.`,
                isOperational: true,
              })
            );
          }
        }
        templateId = input.templateId;
      }

      // 4. Validate status if updated
      let status = current.status;
      if (input.status !== undefined) {
        if (!VALID_STATUSES.has(input.status)) {
          return Err(
            new AppError({
              code: ErrorCode.VALIDATION_FAILED,
              userMessage: `Invalid status: ${input.status}. Must be DRAFT, IN_PROGRESS, COMPLETED, or CANCELLED.`,
              isOperational: true,
            })
          );
        }
        status = input.status;
      }

      // 5. Update payload if provided
      let payloadVersion = current.payloadVersion;
      if (input.payloadVersion !== undefined) {
        payloadVersion = input.payloadVersion;
      }

      let formData = current.formData;
      let parsedPayload = currentResult.value.parsedPayload;
      if (input.payload !== undefined) {
        parsedPayload = {
          version: payloadVersion,
          data: input.payload,
        };
        formData = JSON.stringify(parsedPayload);
      }

      const now = new Date().toISOString();
      let completedAt = current.completedAt;
      if (status === 'COMPLETED' && !completedAt) {
        completedAt = now;
      } else if (status !== 'COMPLETED') {
        completedAt = null;
      }

      // 6. Execute atomic update
      const updateTx = this.db.transaction(() => {
        const updateStmt = this.db.prepare(`
          UPDATE report_sessions
          SET session_title = ?,
              template_id = ?,
              status = ?,
              payload_version = ?,
              form_data = ?,
              updated_at = ?,
              completed_at = ?
          WHERE session_id = ?
        `);

        updateStmt.run(
          sessionTitle,
          templateId,
          status,
          payloadVersion,
          formData,
          now,
          completedAt,
          sessionId
        );

        // Update station snapshots if supplied
        let updatedStations = [...currentResult.value!.stations];
        if (input.stations !== undefined) {
          this.db
            .prepare('DELETE FROM report_session_stations WHERE session_id = ?')
            .run(sessionId);

          const insertStationStmt = this.db.prepare(`
            INSERT INTO report_session_stations (
              session_id,
              station_id,
              sequence_order,
              station_name_snapshot,
              station_code_snapshot
            ) VALUES (?, ?, ?, ?, ?)
          `);

          updatedStations = [];
          const seenStationIds = new Set<string>();

          for (const stn of input.stations) {
            if (seenStationIds.has(stn.stationId)) {
              throw new AppError({
                code: ErrorCode.VALIDATION_FAILED,
                userMessage: `Duplicate station association for "${stn.stationId}" in session.`,
                isOperational: true,
              });
            }
            seenStationIds.add(stn.stationId);

            const stnExists = this.db
              .prepare('SELECT count(*) as count FROM stations WHERE station_id = ?')
              .get(stn.stationId) as { count: number } | undefined;

            if (!stnExists || stnExists.count === 0) {
              throw new AppError({
                code: ErrorCode.VALIDATION_FAILED,
                userMessage: `Station "${stn.stationId}" does not exist in canonical station registry.`,
                isOperational: true,
              });
            }

            insertStationStmt.run(
              sessionId,
              stn.stationId,
              stn.sequenceOrder,
              stn.stationNameSnapshot.trim(),
              stn.stationCodeSnapshot ? stn.stationCodeSnapshot.trim() : null
            );

            updatedStations.push({
              sessionId,
              stationId: stn.stationId,
              sequenceOrder: stn.sequenceOrder,
              stationNameSnapshot: stn.stationNameSnapshot.trim(),
              stationCodeSnapshot: stn.stationCodeSnapshot ? stn.stationCodeSnapshot.trim() : null,
            });
          }
        }

        return updatedStations;
      });

      const updatedStations = updateTx();

      const updatedRecord: ReportSessionRecord = {
        sessionId,
        sessionTitle,
        categoryId: current.categoryId,
        templateId,
        status,
        payloadVersion,
        formData,
        createdAt: current.createdAt,
        updatedAt: now,
        completedAt,
      };

      return Ok({
        session: updatedRecord,
        stations: updatedStations.sort((a, b) => a.sequenceOrder - b.sequenceOrder),
        parsedPayload,
      });
    } catch (err) {
      if (err instanceof AppError) {
        return Err(err);
      }
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: 'Failed to update report session draft.',
          details: {
            developerMessage: `Update draft error for ${sessionId}: ${err instanceof Error ? err.message : String(err)}`,
          },
          isOperational: true,
          cause: err,
        })
      );
    }
  }

  /**
   * Retrieves all sessions eligible for resumption/recovery.
   * Resumable states are DRAFT and IN_PROGRESS, ordered by most recently modified first.
   */
  public getResumableSessions(): Result<ReportSessionRecord[], AppError> {
    try {
      const rows = this.db
        .prepare(
          `
          SELECT session_id, session_title, category_id, template_id, status,
                 payload_version, form_data, created_at, updated_at, completed_at
          FROM report_sessions
          WHERE status IN ('DRAFT', 'IN_PROGRESS')
          ORDER BY updated_at DESC
        `
        )
        .all() as RawSessionRow[];

      return Ok(rows.map(r => this.mapRowToRecord(r)));
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: 'Failed to retrieve resumable report sessions.',
          isOperational: true,
          cause: err,
        })
      );
    }
  }

  /**
   * Lists report sessions according to optional filter criteria.
   */
  public getAllSessions(filter?: SessionListFilter): Result<ReportSessionRecord[], AppError> {
    try {
      const conditions: string[] = [];
      const params: unknown[] = [];

      if (filter?.categoryId) {
        conditions.push('category_id = ?');
        params.push(filter.categoryId);
      }

      if (filter?.status) {
        if (Array.isArray(filter.status)) {
          const placeholders = filter.status.map(() => '?').join(', ');
          conditions.push(`status IN (${placeholders})`);
          params.push(...filter.status);
        } else {
          conditions.push('status = ?');
          params.push(filter.status);
        }
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const limitClause = filter?.limit ? `LIMIT ${filter.limit}` : '';
      const offsetClause = filter?.offset ? `OFFSET ${filter.offset}` : '';

      const sql = `
        SELECT session_id, session_title, category_id, template_id, status,
               payload_version, form_data, created_at, updated_at, completed_at
        FROM report_sessions
        ${whereClause}
        ORDER BY updated_at DESC
        ${limitClause}
        ${offsetClause}
      `;

      const rows = this.db.prepare(sql).all(...params) as RawSessionRow[];
      return Ok(rows.map(r => this.mapRowToRecord(r)));
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: 'Failed to list report sessions.',
          isOperational: true,
          cause: err,
        })
      );
    }
  }

  /**
   * Transitions a session to a new lifecycle status.
   */
  public setSessionStatus(
    sessionId: ReportSessionId,
    status: SessionStatus
  ): Result<ReportSessionDetail, AppError> {
    return this.updateSessionDraft(sessionId, { status });
  }

  /**
   * Deletes a report session and cascades deletion to associated station snapshots.
   */
  public deleteSession(sessionId: ReportSessionId): Result<boolean, AppError> {
    try {
      const existing = this.getSessionById(sessionId);
      if (!existing.ok) {
        return existing;
      }
      if (!existing.value) {
        return Err(
          new AppError({
            code: ErrorCode.VALIDATION_FAILED,
            userMessage: `Report session "${sessionId}" does not exist.`,
            isOperational: true,
          })
        );
      }

      const stmt = this.db.prepare('DELETE FROM report_sessions WHERE session_id = ?');
      const info = stmt.run(sessionId);

      return Ok(info.changes > 0);
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: 'Failed to delete report session.',
          details: {
            developerMessage: `Delete session error for ${sessionId}: ${err instanceof Error ? err.message : String(err)}`,
          },
          isOperational: true,
          cause: err,
        })
      );
    }
  }

  /**
   * Returns total session count, optionally filtered by status or category.
   */
  public getSessionCount(filter?: SessionListFilter): Result<number, AppError> {
    try {
      const conditions: string[] = [];
      const params: unknown[] = [];

      if (filter?.categoryId) {
        conditions.push('category_id = ?');
        params.push(filter.categoryId);
      }

      if (filter?.status) {
        if (Array.isArray(filter.status)) {
          const placeholders = filter.status.map(() => '?').join(', ');
          conditions.push(`status IN (${placeholders})`);
          params.push(...filter.status);
        } else {
          conditions.push('status = ?');
          params.push(filter.status);
        }
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const sql = `SELECT count(*) as count FROM report_sessions ${whereClause}`;

      const row = this.db.prepare(sql).get(...params) as { count: number };
      return Ok(row.count);
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: 'Failed to count report sessions.',
          isOperational: true,
          cause: err,
        })
      );
    }
  }
}
