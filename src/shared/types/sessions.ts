/**
 * OPSREPORT STUDIO — SHARED DOMAIN TYPES
 * Report Sessions & Draft Persistence (Step 16)
 *
 * Defines domain entities, lifecycle states, station associations,
 * input contracts, and query filters for operational report sessions.
 */

import type { ReportSessionId, ReportCategoryId, TemplateId, StationId } from './identifiers';

/**
 * Valid lifecycle states for an operational report session.
 * - DRAFT: Initial creation or early in-progress state.
 * - IN_PROGRESS: Active drafting with partial or progressive station data.
 * - COMPLETED: Marked finished by operator; ready for generation / export.
 * - CANCELLED: Explicitly discarded or cancelled by operator.
 */
export type SessionStatus = 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export const SESSION_STATUSES: readonly SessionStatus[] = [
  'DRAFT',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
] as const;

/**
 * Station sequence snapshot associated with a report session (DEC-025).
 * Freezes the station identity, ordering, and names at the time of drafting
 * so subsequent station renamings/reorderings in global config do not mutate historical records.
 */
export interface SessionStationSnapshot {
  readonly sessionId: ReportSessionId;
  readonly stationId: StationId;
  readonly sequenceOrder: number;
  readonly stationNameSnapshot: string;
  readonly stationCodeSnapshot: string | null;
}

/**
 * Report payload structure stored as validated JSON.
 * Flexible enough for dynamic category fields and partial station entries
 * while versioned for forward compatibility.
 */
export interface ReportSessionPayload {
  readonly version: number;
  readonly data: Record<string, unknown>;
}

/**
 * Complete report session record as stored in the persistent database.
 */
export interface ReportSessionRecord {
  readonly sessionId: ReportSessionId;
  readonly sessionTitle: string;
  readonly categoryId: ReportCategoryId;
  readonly templateId: TemplateId | null;
  readonly status: SessionStatus;
  readonly payloadVersion: number;
  readonly formData: string; // Serialized JSON of ReportSessionPayload
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt: string | null;
}

/**
 * Rich report session detail object including parsed payload and associated station sequence snapshot.
 */
export interface ReportSessionDetail {
  readonly session: ReportSessionRecord;
  readonly stations: readonly SessionStationSnapshot[];
  readonly parsedPayload: ReportSessionPayload;
}

/**
 * Station entry specification when creating or updating a report session.
 */
export interface SessionStationInput {
  readonly stationId: StationId;
  readonly sequenceOrder: number;
  readonly stationNameSnapshot: string;
  readonly stationCodeSnapshot?: string | null;
}

/**
 * Input contract for creating a new report session.
 */
export interface CreateReportSessionInput {
  readonly sessionId?: ReportSessionId; // Auto-generated if omitted
  readonly sessionTitle: string;
  readonly categoryId: ReportCategoryId;
  readonly templateId?: TemplateId | null;
  readonly status?: SessionStatus; // Defaults to 'DRAFT'
  readonly payloadVersion?: number; // Defaults to 1
  readonly payload?: Record<string, unknown>; // Parsed data or serialized
  readonly stations?: readonly SessionStationInput[];
}

/**
 * Input contract for updating an existing report session draft.
 */
export interface UpdateReportSessionInput {
  readonly sessionTitle?: string;
  readonly templateId?: TemplateId | null;
  readonly status?: SessionStatus;
  readonly payloadVersion?: number;
  readonly payload?: Record<string, unknown>;
  readonly stations?: readonly SessionStationInput[];
}

/**
 * Filter options for listing report sessions.
 */
export interface SessionListFilter {
  readonly categoryId?: ReportCategoryId;
  readonly status?: SessionStatus | readonly SessionStatus[];
  readonly limit?: number;
  readonly offset?: number;
}
