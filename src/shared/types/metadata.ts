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
  TemplateVersionRecord,
  CloneMasterTemplateOptions,
  CloneMasterTemplateResult,
  TemplateIntegrityCheckResult,
  TemplateInspectionResult,
  InspectTemplateOptions,
  ReplaceTemplateOptions,
  ReplaceTemplateResult,
  TemplateHealthRecord,
} from './templates.ts';
import type {
  ExcelFieldMappingRecord,
  ExcelTemplateMappingConfig,
  SaveExcelMappingsInput,
} from './excel-mapping.ts';
import type {
  WordFieldMappingRecord,
  WordTemplateMappingConfig,
  SaveWordMappingsInput,
} from './word-mapping.ts';
import type {
  MappingProfileRecord,
  MappingProfileWithDetails,
  CreateMappingProfileInput,
  UpdateMappingProfileInput,
  MappingValidationResult,
} from './mapping-profile.ts';
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
  readonly getVersions: (
    templateId: string
  ) => Promise<Result<TemplateVersionRecord[], SerializableError>>;
  readonly getVersionById: (
    versionId: string
  ) => Promise<Result<TemplateVersionRecord | null, SerializableError>>;
  readonly getActiveVersion: (
    templateId: string
  ) => Promise<Result<TemplateVersionRecord | null, SerializableError>>;
  readonly setActiveVersion: (
    templateId: string,
    versionId: string
  ) => Promise<Result<TemplateVersionRecord, SerializableError>>;
  readonly cloneMaster: (
    options: CloneMasterTemplateOptions
  ) => Promise<Result<CloneMasterTemplateResult, SerializableError>>;
  readonly verifyIntegrity: (
    versionId: string
  ) => Promise<Result<TemplateIntegrityCheckResult, SerializableError>>;
  readonly inspectTemplate: (
    options: InspectTemplateOptions
  ) => Promise<Result<TemplateInspectionResult, SerializableError>>;
  readonly replaceTemplate: (
    options: ReplaceTemplateOptions
  ) => Promise<Result<ReplaceTemplateResult, SerializableError>>;
  readonly checkHealth: (
    templateId: string
  ) => Promise<Result<TemplateHealthRecord, SerializableError>>;
  readonly checkAllHealth: () => Promise<Result<TemplateHealthRecord[], SerializableError>>;
  readonly getDependencyCount: (
    templateId: string
  ) => Promise<Result<{ sessionCount: number }, SerializableError>>;
  readonly getExcelMappings: (
    templateId: string,
    versionId: string,
    worksheetName?: string
  ) => Promise<Result<ExcelFieldMappingRecord[], SerializableError>>;
  readonly saveExcelMappings: (
    input: SaveExcelMappingsInput
  ) => Promise<Result<ExcelTemplateMappingConfig, SerializableError>>;
  readonly deleteExcelMappings: (
    templateId: string,
    versionId: string,
    worksheetName?: string
  ) => Promise<Result<boolean, SerializableError>>;
  readonly getWordMappings: (
    templateId: string,
    versionId: string
  ) => Promise<Result<WordFieldMappingRecord[], SerializableError>>;
  readonly saveWordMappings: (
    input: SaveWordMappingsInput
  ) => Promise<Result<WordTemplateMappingConfig, SerializableError>>;
  readonly deleteWordMappings: (
    templateId: string,
    versionId: string
  ) => Promise<Result<boolean, SerializableError>>;
  readonly listProfiles: (filter?: {
    categoryId?: string;
    templateId?: string;
    versionId?: string;
    status?: string;
  }) => Promise<Result<MappingProfileWithDetails[], SerializableError>>;
  readonly getProfile: (
    profileId: string
  ) => Promise<Result<MappingProfileWithDetails | null, SerializableError>>;
  readonly createProfile: (
    input: CreateMappingProfileInput
  ) => Promise<Result<MappingProfileRecord, SerializableError>>;
  readonly updateProfile: (
    profileId: string,
    updates: UpdateMappingProfileInput
  ) => Promise<Result<MappingProfileRecord, SerializableError>>;
  readonly deleteProfile: (profileId: string) => Promise<Result<boolean, SerializableError>>;
  readonly duplicateProfile: (
    profileId: string,
    newProfileName: string
  ) => Promise<Result<MappingProfileWithDetails, SerializableError>>;
  readonly validateProfile: (input: {
    profileId?: string;
    templateId: string;
    versionId: string;
    categoryId?: string;
    documentType?: string;
  }) => Promise<Result<MappingValidationResult, SerializableError>>;
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
  readonly cloneMaster: (
    options: CloneMasterTemplateOptions
  ) => Promise<Result<CloneMasterTemplateResult, SerializableError>>;
  readonly verifyIntegrity: (
    versionId: string
  ) => Promise<Result<TemplateIntegrityCheckResult, SerializableError>>;
}

export interface DesignerBridgeAPI {
  readonly listDrafts: (
    documentType?: import('./template-designer.ts').DesignerDocumentType,
    categoryId?: string
  ) => Promise<Result<import('./template-designer.ts').DesignerDraftSummary[], SerializableError>>;
  readonly getDraft: (
    draftId: string
  ) => Promise<Result<import('./template-designer.ts').DesignerDraftRecord | null, SerializableError>>;
  readonly createDraft: (
    input: import('./template-designer.ts').CreateDesignerDraftInput
  ) => Promise<Result<import('./template-designer.ts').DesignerDraftRecord, SerializableError>>;
  readonly updateDraft: (
    draftId: string,
    input: import('./template-designer.ts').UpdateDesignerDraftInput
  ) => Promise<Result<import('./template-designer.ts').DesignerDraftRecord, SerializableError>>;
  readonly deleteDraft: (
    draftId: string
  ) => Promise<Result<boolean, SerializableError>>;
  readonly validateDesign: (
    definition: import('./template-designer.ts').TemplateDesignDefinition,
    categoryId?: string
  ) => Promise<Result<import('./template-designer.ts').DesignerValidationResult, SerializableError>>;
  readonly compileAndRegister: (
    input: import('./template-designer.ts').CompileAndRegisterInput
  ) => Promise<Result<import('./template-designer.ts').CompileAndRegisterResult, SerializableError>>;
}

export interface OpsReportBridgeAPI {
  readonly getAppMetadata: () => Promise<AppMetadata>;
  readonly ping: () => Promise<FoundationPingResponse>;
  readonly stations?: StationBridgeAPI;
  readonly categories?: CategoryBridgeAPI;
  readonly templates?: TemplateBridgeAPI;
  readonly sessions?: SessionBridgeAPI;
  readonly vault?: VaultBridgeAPI;
  readonly designer?: DesignerBridgeAPI;
}
