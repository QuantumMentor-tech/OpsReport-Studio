/**
 * OpsReport Studio — Shared Semantic Identifiers
 *
 * Defines strongly-typed branded string identifiers to eliminate primitive obsession
 * and prevent accidental transposition of IDs across domains (e.g., passing a StationId
 * where a TemplateId or ReportSessionId is expected).
 *
 * @module shared/types/identifiers
 */

declare const __brand: unique symbol;

/**
 * Generic branded type wrapper creating a nominal type on top of a primitive.
 */
export type Brand<T, B> = T & { readonly [__brand]: B };

/** Authoritative Station identifier (e.g., 'STN-001', 'CP-04') */
export type StationId = Brand<string, 'StationId'>;

/** Standardized operational report category code (e.g., 'STATION_LIGHTING', 'ALARM_SYSTEM') */
export type ReportCategoryId = Brand<string, 'ReportCategoryId'>;

/** Master template identifier in the local template vault */
export type TemplateId = Brand<string, 'TemplateId'>;

/** Immutable revision identifier for a specific version of a master template */
export type TemplateVersionId = Brand<string, 'TemplateVersionId'>;

/** Template mapping profile identifier linking fields to Open XML targets */
export type MappingProfileId = Brand<string, 'MappingProfileId'>;

/** Active or saved report-entry session identifier */
export type ReportSessionId = Brand<string, 'ReportSessionId'>;

/** Unique identifier for an in-flight document-generation operation */
export type GenerationOperationId = Brand<string, 'GenerationOperationId'>;

/** Identifier for a generated report output file artifact */
export type GeneratedArtifactId = Brand<string, 'GeneratedArtifactId'>;

// ---------------------------------------------------------------------------
// Type-safe Constructor / Cast Helpers
// ---------------------------------------------------------------------------

/** Safely cast a validated string into a StationId */
export const toStationId = (id: string): StationId => id as StationId;

/** Safely cast a validated string into a ReportCategoryId */
export const toReportCategoryId = (id: string): ReportCategoryId => id as ReportCategoryId;

/** Safely cast a validated string into a TemplateId */
export const toTemplateId = (id: string): TemplateId => id as TemplateId;

/** Safely cast a validated string into a TemplateVersionId */
export const toTemplateVersionId = (id: string): TemplateVersionId => id as TemplateVersionId;

/** Safely cast a validated string into a MappingProfileId */
export const toMappingProfileId = (id: string): MappingProfileId => id as MappingProfileId;

/** Safely cast a validated string into a ReportSessionId */
export const toReportSessionId = (id: string): ReportSessionId => id as ReportSessionId;

/** Safely cast a validated string into a GenerationOperationId */
export const toGenerationOperationId = (id: string): GenerationOperationId =>
  id as GenerationOperationId;

/** Safely cast a validated string into a GeneratedArtifactId */
export const toGeneratedArtifactId = (id: string): GeneratedArtifactId => id as GeneratedArtifactId;
