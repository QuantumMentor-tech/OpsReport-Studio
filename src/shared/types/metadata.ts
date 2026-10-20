/**
 * OpsReport Studio — Foundation Runtime Metadata & Desktop IPC Contracts
 *
 * @module shared/types/metadata
 */

import type { StationRecord, CreateStationInput, UpdateStationInput } from './stations.ts';
import type {
  ReportCategoryRecord,
  CreateCategoryInput,
  UpdateCategoryInput,
} from './categories.ts';
import type {
  TemplateMetadataRecord,
  CreateTemplateMetadataInput,
  UpdateTemplateMetadataInput,
  TemplateStatus,
  TemplateFileSelection,
  ImportTemplateOptions,
  TemplateImportResult,
} from './templates.ts';
import type {
  ReportSessionRecord,
  ReportSessionDetail,
  CreateReportSessionInput,
  UpdateReportSessionInput,
  SessionListFilter,
  SessionStatus,
} from './sessions.ts';
import type { VaultStorageStatus } from './storage.ts';
import type { Result } from './result.ts';
import type { SerializableError } from '../errors/app-error.ts';

export interface AppMetadata {
  readonly name: string;
  readonly id: string;
  readonly version: string;
  readonly environment: 'development' | 'production' | 'test';
  readonly platform: string;
  readonly electronVersion: string;
  readonly nodeVersion: string;
}

export interface FoundationPingResponse {
  readonly status: 'ok';
  readonly initializedAt: string;
  readonly message: string;
}

export interface StationBridgeAPI {
  readonly getAll: (options?: {
    activeOnly?: boolean;
  }) => Promise<Result<StationRecord[], SerializableError>>;
  readonly getById: (stationId: string) => Promise<Result<StationRecord | null, SerializableError>>;
  readonly create: (input: CreateStationInput) => Promise<Result<StationRecord, SerializableError>>;
  readonly update: (
    stationId: string,
    input: UpdateStationInput
  ) => Promise<Result<StationRecord, SerializableError>>;
  readonly delete: (stationId: string) => Promise<Result<boolean, SerializableError>>;
  readonly reorder: (orderedIds: string[]) => Promise<Result<StationRecord[], SerializableError>>;
  readonly getCount: (activeOnly?: boolean) => Promise<Result<number, SerializableError>>;
}

export interface CategoryBridgeAPI {
  readonly getAll: (options?: {
    activeOnly?: boolean;
  }) => Promise<Result<ReportCategoryRecord[], SerializableError>>;
  readonly getById: (
    categoryId: string
  ) => Promise<Result<ReportCategoryRecord | null, SerializableError>>;
  readonly create: (
    input: CreateCategoryInput
  ) => Promise<Result<ReportCategoryRecord, SerializableError>>;
  readonly update: (
    categoryId: string,
    input: UpdateCategoryInput
  ) => Promise<Result<ReportCategoryRecord, SerializableError>>;
  readonly setStatus: (
    categoryId: string,
    isActive: boolean
  ) => Promise<Result<ReportCategoryRecord, SerializableError>>;
  readonly delete: (categoryId: string) => Promise<Result<boolean, SerializableError>>;
  readonly getCount: (activeOnly?: boolean) => Promise<Result<number, SerializableError>>;
}

export interface TemplateBridgeAPI {
  readonly getAll: (options?: {
    categoryId?: string;
    status?: TemplateStatus;
  }) => Promise<Result<TemplateMetadataRecord[], SerializableError>>;
  readonly getById: (
    templateId: string
  ) => Promise<Result<TemplateMetadataRecord | null, SerializableError>>;
  readonly getByCategory: (
    categoryId: string
  ) => Promise<Result<TemplateMetadataRecord[], SerializableError>>;
  readonly create: (
    input: CreateTemplateMetadataInput
  ) => Promise<Result<TemplateMetadataRecord, SerializableError>>;
  readonly update: (
    templateId: string,
    input: UpdateTemplateMetadataInput
  ) => Promise<Result<TemplateMetadataRecord, SerializableError>>;
  readonly setStatus: (
    templateId: string,
    status: TemplateStatus
  ) => Promise<Result<TemplateMetadataRecord, SerializableError>>;
  readonly delete: (templateId: string) => Promise<Result<boolean, SerializableError>>;
  readonly getCount: (options?: {
    categoryId?: string;
    status?: TemplateStatus;
  }) => Promise<Result<number, SerializableError>>;
  readonly selectFile: () => Promise<Result<TemplateFileSelection | null, SerializableError>>;
  readonly importTemplate: (
    options: ImportTemplateOptions
  ) => Promise<Result<TemplateImportResult, SerializableError>>;
}

export interface SessionBridgeAPI {
  readonly create: (
    input: CreateReportSessionInput
  ) => Promise<Result<ReportSessionDetail, SerializableError>>;
  readonly getById: (
    sessionId: string
  ) => Promise<Result<ReportSessionDetail | null, SerializableError>>;
  readonly updateDraft: (
    sessionId: string,
    input: UpdateReportSessionInput
  ) => Promise<Result<ReportSessionDetail, SerializableError>>;
  readonly getResumable: () => Promise<Result<ReportSessionRecord[], SerializableError>>;
  readonly getAll: (
    filter?: SessionListFilter
  ) => Promise<Result<ReportSessionRecord[], SerializableError>>;
  readonly setStatus: (
    sessionId: string,
    status: SessionStatus
  ) => Promise<Result<ReportSessionDetail, SerializableError>>;
  readonly delete: (sessionId: string) => Promise<Result<boolean, SerializableError>>;
  readonly getCount: (filter?: SessionListFilter) => Promise<Result<number, SerializableError>>;
}

export interface VaultBridgeAPI {
  readonly getStatus: () => Promise<Result<VaultStorageStatus, SerializableError>>;
  readonly initialize: () => Promise<Result<VaultStorageStatus, SerializableError>>;
  readonly checkTemplateExists: (
    templateId: string,
    extension?: string
  ) => Promise<Result<boolean, SerializableError>>;
}

export interface OpsReportBridgeAPI {
  readonly getAppMetadata: () => Promise<AppMetadata>;
  readonly ping: () => Promise<FoundationPingResponse>;
  readonly stations?: StationBridgeAPI;
  readonly categories?: CategoryBridgeAPI;
  readonly templates?: TemplateBridgeAPI;
  readonly sessions?: SessionBridgeAPI;
  readonly vault?: VaultBridgeAPI;
}
