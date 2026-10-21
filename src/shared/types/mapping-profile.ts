/**
 * OpsReport Studio — Mapping Profiles, Validation & Compatibility Types
 *
 * Implements Step 24 of the 45-step roadmap:
 * - Domain contracts for reusable mapping profiles (grouping field mappings).
 * - Centralized validation findings, severities, and compatibility status.
 * - Excel and Word template structural compatibility report structures.
 *
 * @module shared/types/mapping-profile
 */

import type {
  MappingProfileId,
  TemplateId,
  TemplateVersionId,
  ReportCategoryId,
} from './identifiers.ts';
import type { DocumentType } from './templates.ts';
import type { ExcelFieldMappingRecord } from './excel-mapping.ts';
import type { WordFieldMappingRecord } from './word-mapping.ts';

/**
 * Lifecycle status of a mapping profile.
 */
export type MappingProfileStatus = 'ACTIVE' | 'DRAFT' | 'ARCHIVED';

/**
 * Diagnostic validation outcome of a mapping profile against its template version.
 */
export type MappingValidationStatus =
  'VALID' | 'INVALID' | 'INCOMPLETE' | 'REQUIRES_REVIEW' | 'UNCHECKED' | 'UNABLE_TO_VALIDATE';

/**
 * Finding severity classification.
 */
export type ValidationFindingSeverity = 'ERROR' | 'WARNING' | 'INFO';

/**
 * Individual actionable finding emitted by the validation engine.
 */
export interface MappingValidationFinding {
  /** Stable diagnostic error or warning code (e.g., 'VAL_FIELD_UNKNOWN', 'VAL_WORKSHEET_NOT_FOUND') */
  code: string;
  /** Severity level determining whether this finding blocks profile usability */
  severity: ValidationFindingSeverity;
  /** Related report field identifier if applicable */
  fieldId?: string;
  /** Related human-readable field label */
  fieldLabel?: string;
  /** Related document target coordinate (e.g., 'B2', 'C', '{report_date}', 'P:1', 'T1:R2:C1') */
  targetCoordinate?: string;
  /** Related mapping target kind */
  mappingType?: string;
  /** Clear human-readable description of the problem */
  message: string;
  /** Recommended operator action to resolve the issue */
  correctiveAction?: string;
}

/**
 * Comprehensive compatibility report produced by the validation engine.
 */
export interface MappingValidationResult {
  /** Target profile ID if validating an existing persisted profile */
  profileId?: MappingProfileId;
  /** Target logical template ID */
  templateId: TemplateId;
  /** Target managed template version ID */
  versionId: TemplateVersionId;
  /** Document type of the template */
  documentType: DocumentType;
  /** Overall computed validation status */
  overallStatus: MappingValidationStatus;
  /** Boolean shorthand indicating whether the profile has 0 blocking errors */
  isValid: boolean;
  /** ISO-8601 timestamp of validation run */
  validatedAt: string;
  /** Total count of all findings */
  totalFindings: number;
  /** Count of blocking errors (blocks profile validity) */
  errorCount: number;
  /** Count of warnings (requires operator review) */
  warningCount: number;
  /** Count of informational notes */
  infoCount: number;
  /** Ordered list of diagnostic findings */
  findings: MappingValidationFinding[];
  /** High-level summary of the validation outcome */
  summary: string;
  /** Record of explicit check suites executed */
  checksPerformed: {
    fieldExistence: boolean;
    categoryApplicability: boolean;
    requiredFields: boolean;
    typeCompatibility: boolean;
    duplicateCollision: boolean;
    structuralResolution: boolean;
    assetIntegrity: boolean;
  };
}

/**
 * Relational entity record representing a persistent mapping profile in SQLite.
 */
export interface MappingProfileRecord {
  /** Stable branded profile identifier */
  profileId: MappingProfileId;
  /** Human-readable display name (e.g. 'Station Light Standard Platform Profile') */
  profileName: string;
  /** Optional contextual description */
  description?: string | null;
  /** Associated report category */
  categoryId: ReportCategoryId;
  /** Associated master template ID */
  templateId: TemplateId;
  /** Associated template version ID */
  versionId: TemplateVersionId;
  /** Template document format */
  documentType: DocumentType;
  /** Lifecycle status */
  status: MappingProfileStatus;
  /** Cached diagnostic validation status */
  validationStatus: MappingValidationStatus;
  /** Timestamp of most recent validation check */
  lastValidatedAt: string | null;
  /** Summary message of last validation */
  validationSummary: string | null;
  /** Creation timestamp (ISO-8601) */
  createdAt: string;
  /** Last update timestamp (ISO-8601) */
  updatedAt: string;
}

/**
 * Expanded profile record including joined metadata and child mapping records.
 */
export interface MappingProfileWithDetails extends MappingProfileRecord {
  /** Resolved template display name */
  templateName?: string;
  /** Resolved category display name */
  categoryName?: string;
  /** Child Excel mapping records if documentType is EXCEL_XLSX */
  excelMappings?: ExcelFieldMappingRecord[];
  /** Child Word mapping records if documentType is WORD_DOCX */
  wordMappings?: WordFieldMappingRecord[];
}

/**
 * Input for creating a new mapping profile.
 */
export interface CreateMappingProfileInput {
  profileName: string;
  description?: string;
  categoryId: ReportCategoryId;
  templateId: TemplateId;
  versionId: TemplateVersionId;
  documentType: DocumentType;
  status?: MappingProfileStatus;
}

/**
 * Input for updating an existing mapping profile.
 */
export interface UpdateMappingProfileInput {
  profileName?: string;
  description?: string;
  status?: MappingProfileStatus;
}

/**
 * Input for validating a mapping profile.
 */
export interface ValidateProfileInput {
  profileId?: MappingProfileId;
  templateId: TemplateId;
  versionId: TemplateVersionId;
}
