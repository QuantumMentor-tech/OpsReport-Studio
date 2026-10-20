/**
 * OpsReport Studio — Local Database & Persistence Types
 *
 * Defines relational entity contracts, input structures, and configuration
 * options for the SQLite persistence layer.
 *
 * @module storage/database/types
 */

import type { StationId } from '../../shared/types/identifiers.ts';
import type {
  ReportDocumentFormat,
  ReportCategoryRecord,
  CreateCategoryInput,
  UpdateCategoryInput,
} from '../../shared/types/categories.ts';
import type {
  TemplateStatus,
  TemplateMetadataRecord,
  CreateTemplateMetadataInput,
  UpdateTemplateMetadataInput,
} from '../../shared/types/templates.ts';
import type {
  SessionStatus,
  SessionStationSnapshot,
  ReportSessionPayload,
  ReportSessionRecord,
  ReportSessionDetail,
  SessionStationInput,
  CreateReportSessionInput,
  UpdateReportSessionInput,
  SessionListFilter,
} from '../../shared/types/sessions.ts';

// Re-export domain contracts
export type {
  ReportDocumentFormat,
  ReportCategoryRecord,
  CreateCategoryInput,
  UpdateCategoryInput,
  TemplateStatus,
  TemplateMetadataRecord,
  CreateTemplateMetadataInput,
  UpdateTemplateMetadataInput,
  SessionStatus,
  SessionStationSnapshot,
  ReportSessionPayload,
  ReportSessionRecord,
  ReportSessionDetail,
  SessionStationInput,
  CreateReportSessionInput,
  UpdateReportSessionInput,
  SessionListFilter,
};

// ---------------------------------------------------------------------------
// 1. Station Relational Entity Types (Step 3 & Step 8 Baseline)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// 2. Application Settings Entity Types
// ---------------------------------------------------------------------------

export interface AppSettingRecord {
  /** Unique setting key */
  readonly setting_key: string;
  /** Serialized setting value */
  readonly setting_value: string;
  /** ISO 8601 UTC last-updated timestamp */
  readonly updated_at: string;
}

// ---------------------------------------------------------------------------
// 3. Migration & Schema Versioning Types
// ---------------------------------------------------------------------------

export interface MigrationRecord {
  /** 1-based sequential integer schema version */
  readonly version: number;
  /** Descriptive migration name */
  readonly name: string;
  /** ISO 8601 UTC application timestamp */
  readonly applied_at: string;
  /** SHA-256 fingerprint of the migration payload */
  readonly checksum: string;
}

// ---------------------------------------------------------------------------
// 4. Database Connection & Manager Options
// ---------------------------------------------------------------------------

export interface DatabaseOptions {
  /** Filesystem path to SQLite file or ':memory:' */
  readonly databasePath?: string;
  /** Open database in read-only mode (default: false) */
  readonly readonly?: boolean;
  /** Require that database file already exists (default: false) */
  readonly fileMustExist?: boolean;
  /** Lock wait timeout in milliseconds (default: 5000) */
  readonly timeout?: number;
  /** Optional verbose SQL execution logger */
  readonly verbose?: (message?: unknown, ...additionalArgs: unknown[]) => void;
  /** Skip automatic migration execution during connection (default: false) */
  readonly skipMigrations?: boolean;
}
