/**
 * OpsReport Studio — Shared Station Domain Contracts
 *
 * Defines station entity records, input models, and operations used across
 * main, preload, persistence, and renderer components.
 *
 * @module shared/types/stations
 */

import type { StationId } from './identifiers.ts';

export interface StationRecord {
  /** Stable nominal station identifier (e.g. 'STN-001' or UUIDv4) */
  readonly station_id: StationId;
  /** Official human-readable station name */
  readonly station_name: string;
  /** Authoritative 1-based ordinal sequence index */
  readonly display_order: number;
  /** Optional operational telegraphic or inventory code */
  readonly station_code: string | null;
  /** Active status flag (1 = active, 0 = inactive/decommissioned) */
  readonly is_active: number;
  /** ISO 8601 UTC creation timestamp */
  readonly created_at: string;
  /** ISO 8601 UTC last-modified timestamp */
  readonly updated_at: string;
}

export interface CreateStationInput {
  /** Optional identifier; generated automatically if not supplied */
  readonly stationId?: StationId;
  /** Official station display name (1..150 characters, trimmed) */
  readonly stationName: string;
  /** Optional 1-based display order; defaults to next position if omitted */
  readonly displayOrder?: number;
  /** Optional operational code */
  readonly stationCode?: string | null;
  /** Active status flag (defaults to true) */
  readonly isActive?: boolean;
}

export interface UpdateStationInput {
  /** Updated station display name */
  readonly stationName?: string;
  /** Updated display order */
  readonly displayOrder?: number;
  /** Updated operational code */
  readonly stationCode?: string | null;
  /** Updated active status flag */
  readonly isActive?: boolean;
}
