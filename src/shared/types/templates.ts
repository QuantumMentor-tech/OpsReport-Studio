/**
 * OpsReport Studio — Shared Template Metadata Domain Contracts
 *
 * Defines template metadata entity records, input models, and operations
 * establishing the relationship between reusable template descriptors and report categories.
 *
 * @module shared/types/templates
 */

import type { TemplateId, TemplateVersionId, ReportCategoryId } from './identifiers.ts';
import type { ReportDocumentFormat } from './categories.ts';

export type TemplateStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
export type DocumentType = ReportDocumentFormat;

export interface TemplateMetadataRecord {
  /** Stable master template identifier (e.g. 'TPL-INCIDENT-STANDARD') */
  readonly template_id: TemplateId;
  /** Human-readable template display title */
  readonly template_name: string;
  /** Associated report category foreign key reference */
  readonly category_id: ReportCategoryId;
  /** Open XML template document format */
  readonly document_type: ReportDocumentFormat;
  /** Functional or administrative description */
  readonly description: string | null;
  /** Lifecycle status */
  readonly status: TemplateStatus;
  /** Master template filename reference in local vault */
  readonly file_name: string | null;
  /** Active or preferred immutable version identifier */
  readonly active_version_id?: TemplateVersionId | null;
  /** Total count of registered versions for this template */
  readonly total_versions?: number;
  /** ISO 8601 UTC creation timestamp */
  readonly created_at: string;
  /** ISO 8601 UTC last-modified timestamp */
  readonly updated_at: string;
}

export interface CreateTemplateMetadataInput {
  /** Optional identifier; generated automatically if omitted */
  readonly templateId?: TemplateId;
  /** Human-readable template display title (1..150 characters) */
  readonly templateName: string;
  /** Associated report category reference */
  readonly categoryId: ReportCategoryId;
  /** Open XML template document format */
  readonly documentType: ReportDocumentFormat;
  /** Optional functional description */
  readonly description?: string | null;
  /** Lifecycle status (defaults to ACTIVE) */
  readonly status?: TemplateStatus;
  /** Master template filename reference */
  readonly fileName?: string | null;
}

export interface UpdateTemplateMetadataInput {
  /** Updated template display title */
  readonly templateName?: string;
  /** Updated associated report category */
  readonly categoryId?: ReportCategoryId;
  /** Updated document format */
  readonly documentType?: ReportDocumentFormat;
  /** Updated description */
  readonly description?: string | null;
  /** Updated lifecycle status */
  readonly status?: TemplateStatus;
  /** Updated master template filename reference */
  readonly fileName?: string | null;
}

export interface TemplateFileSelection {
  /** Absolute source path selected by user */
  readonly filePath: string;
  /** Original filename including extension */
  readonly fileName: string;
  /** File size in bytes */
  readonly fileSize: number;
}

export interface TemplateValidationDetails {
  /** Whether the file is a valid, supported Open XML document */
  readonly isValid: boolean;
  /** Detected format: EXCEL_XLSX or WORD_DOCX */
  readonly detectedFormat: ReportDocumentFormat;
  /** Size of the file in bytes */
  readonly fileSizeBytes: number;
  /** Total uncompressed byte size of all archive entries */
  readonly uncompressedBytes: number;
  /** Count of entries inside the Open XML ZIP package */
  readonly entryCount: number;
  /** Cryptographic SHA-256 hash of file contents */
  readonly sha256Hash: string;
  /** Whether macros were detected */
  readonly hasMacros: boolean;
  /** Diagnostic validation notes or non-fatal observations */
  readonly issues: string[];
}

export interface ImportTemplateOptions {
  /** Absolute source path of the selected template file */
  readonly sourceFilePath: string;
  /** Human-readable template display title (1..150 characters) */
  readonly templateName: string;
  /** Associated report category identifier */
  readonly categoryId: ReportCategoryId;
  /** Expected Open XML document format */
  readonly documentType: ReportDocumentFormat;
  /** Optional custom or existing template ID to associate/update */
  readonly templateId?: TemplateId;
  /** Optional functional description */
  readonly description?: string | null;
}

export interface TemplateImportResult {
  /** The registered/updated template metadata record */
  readonly template: TemplateMetadataRecord;
  /** Absolute path of the promoted template file in the Master Vault */
  readonly vaultPath: string;
  /** Stored template file size in bytes */
  readonly fileSizeBytes: number;
  /** Cryptographic SHA-256 hash of the stored master template */
  readonly sha256Hash: string;
  /** ISO 8601 UTC import timestamp */
  readonly importedAt: string;
}

/**
 * Immutable master template version record (Step 19)
 */
export interface TemplateVersionRecord {
  /** Stable version identifier (e.g. 'VER-TPL-FAN-V1') */
  readonly version_id: TemplateVersionId;
  /** Logical parent template identifier */
  readonly template_id: TemplateId;
  /** 1-based sequential version number */
  readonly version_number: number;
  /** Managed master template filename in local vault */
  readonly file_name: string;
  /** Cryptographic SHA-256 hash of the master template version */
  readonly sha256_hash: string;
  /** Stored template file size in bytes */
  readonly file_size_bytes: number;
  /** Optional change summary or revision notes */
  readonly change_summary: string | null;
  /** Active status flag (1 = active/preferred, 0 = retired) */
  readonly is_active: number;
  /** ISO 8601 UTC creation timestamp */
  readonly created_at: string;
}

export interface CreateTemplateVersionInput {
  /** Logical parent template identifier */
  readonly templateId: TemplateId;
  /** Source file path of the validated template to promote as a new version */
  readonly sourceFilePath: string;
  /** Optional change summary or revision notes */
  readonly changeSummary?: string | null;
  /** Whether this new version should automatically become the active/preferred version (default: true) */
  readonly setActive?: boolean;
}

export interface CloneMasterTemplateOptions {
  /** Master template version identifier to clone */
  readonly versionId?: TemplateVersionId;
  /** Master template identifier (will clone active version if versionId is omitted) */
  readonly templateId?: TemplateId;
  /** Purpose of the clone: 'WORKING_COPY' | 'REPORT_GENERATION' */
  readonly purpose: 'WORKING_COPY' | 'REPORT_GENERATION';
  /** Optional custom scratch filename or prefix (must not contain path traversal) */
  readonly customFilename?: string;
}

export interface CloneMasterTemplateResult {
  /** Source master template version that was cloned */
  readonly sourceVersion: TemplateVersionRecord;
  /** Absolute filesystem path of the created independent clone */
  readonly clonedPath: string;
  /** Filename of the clone */
  readonly fileName: string;
  /** File size in bytes of the cloned document */
  readonly fileSizeBytes: number;
  /** Verified cryptographic SHA-256 hash matching source */
  readonly sha256Hash: string;
  /** Timestamp when clone was created */
  readonly clonedAt: string;
}

export interface TemplateIntegrityCheckResult {
  /** Master template version identifier checked */
  readonly versionId: TemplateVersionId;
  /** Logical parent template identifier */
  readonly templateId: TemplateId;
  /** Version number */
  readonly versionNumber: number;
  /** Expected SHA-256 hash from database */
  readonly expectedHash: string;
  /** Computed SHA-256 hash from physical vault file */
  readonly actualHash: string | null;
  /** Whether the physical file exists and matches the expected hash */
  readonly isIntact: boolean;
  /** Whether the file is marked read-only on the filesystem */
  readonly isReadOnly: boolean;
  /** Diagnostic status message */
  readonly statusMessage: string;
}

/**
 * Excel worksheet summary from template inspection (Step 20)
 */
export interface ExcelSheetSummary {
  readonly name: string;
  readonly sheetId: number;
  readonly index: number;
  readonly state: 'visible' | 'hidden' | 'veryHidden';
  readonly dimension: string | null;
  readonly rowCount: number;
  readonly colCount: number;
  readonly hasFormulas: boolean;
  readonly mergedCellCount: number;
}

/**
 * Excel cell preview data (Step 20)
 */
export interface ExcelCellPreview {
  readonly row: number;
  readonly col: number;
  readonly colRef: string;
  readonly address: string;
  readonly value: string;
  readonly rawType: string;
  readonly isFormula: boolean;
  readonly formula?: string;
  readonly isMerged?: boolean;
}

/**
 * Excel worksheet preview with bounded rows and candidate headers (Step 20)
 */
export interface ExcelWorksheetPreview {
  readonly sheetSummary: ExcelSheetSummary;
  readonly candidateHeaderRow?: {
    readonly rowNumber: number;
    readonly headers: Array<{ readonly colRef: string; readonly text: string }>;
  };
  readonly previewRows: Array<{
    readonly rowNumber: number;
    readonly cells: ExcelCellPreview[];
  }>;
  readonly totalRowsInSheet: number;
  readonly totalColsInSheet: number;
  readonly isTruncated: boolean;
  readonly truncationReason?: string;
}

/**
 * Word paragraph preview (Step 20)
 */
export interface WordParagraphPreview {
  readonly index: number;
  readonly text: string;
  readonly hasCandidateTokens: boolean;
  readonly candidateTokens: string[];
}

/**
 * Word table preview with bounded grid (Step 20)
 */
export interface WordTablePreview {
  readonly tableIndex: number;
  readonly rowCount: number;
  readonly colCount: number;
  readonly hasMergedCells: boolean;
  readonly rows: Array<{
    readonly rowIndex: number;
    readonly cells: string[];
  }>;
  readonly isTruncated: boolean;
}

/**
 * Word document structure preview (Step 20)
 */
export interface WordDocumentPreview {
  readonly paragraphCount: number;
  readonly tableCount: number;
  readonly sectionCount: number;
  readonly hasHeaders: boolean;
  readonly hasFooters: boolean;
  readonly hasImages: boolean;
  readonly paragraphs: WordParagraphPreview[];
  readonly tables: WordTablePreview[];
  readonly candidateTokens: string[];
  readonly isTruncated: boolean;
  readonly truncationReason?: string;
}

/**
 * Comprehensive read-only template metadata and structure inspection result (Step 20)
 */
export interface TemplateInspectionResult {
  readonly templateId: TemplateId;
  readonly templateName: string;
  readonly versionId: TemplateVersionId;
  readonly versionNumber: number;
  readonly categoryId: ReportCategoryId;
  readonly categoryName?: string;
  readonly documentType: ReportDocumentFormat;
  readonly fileName: string;
  readonly fileSizeBytes: number;
  readonly sha256Hash: string;
  readonly integrityVerified: boolean;
  readonly integrityMessage?: string;
  readonly inspectedAt: string;
  readonly excelPreview?: {
    readonly sheets: ExcelSheetSummary[];
    readonly activeSheetPreview?: ExcelWorksheetPreview;
  };
  readonly wordPreview?: WordDocumentPreview;
  readonly readinessNotes: string[];
  readonly unsupportedFeatures: string[];
}

/**
 * Options for inspecting a template version (Step 20)
 */
export interface InspectTemplateOptions {
  readonly templateId: TemplateId;
  readonly versionId?: TemplateVersionId;
  readonly worksheetName?: string;
}

// -----------------------------------------------------------------------------
// Step 21: Template Replacement, Recovery & Library Management Contracts
// -----------------------------------------------------------------------------

/**
 * Options for replacing a template with a new version (Step 21)
 */
export interface ReplaceTemplateOptions {
  readonly templateId: TemplateId;
  readonly sourceFilePath: string;
  readonly changeSummary?: string;
}

/**
 * Result of a template replacement operation (Step 21)
 */
export interface ReplaceTemplateResult {
  readonly template: TemplateMetadataRecord;
  readonly newVersion: TemplateVersionRecord;
  readonly previousVersionId: TemplateVersionId | null;
}

/**
 * Physical template asset health status
 */
export type TemplateHealthStatus =
  'OK' | 'MISSING_FILE' | 'INTEGRITY_MISMATCH' | 'NO_ACTIVE_VERSION';

/**
 * Historical version descriptor for recovery operations
 */
export interface HistoricalVersionSummary {
  readonly versionId: TemplateVersionId;
  readonly versionNumber: number;
  readonly fileName: string;
  readonly fileSizeBytes: number;
  readonly sha256Hash: string;
  readonly isIntact: boolean;
  readonly createdAt: string;
}

/**
 * Authoritative template health record (Step 21)
 */
export interface TemplateHealthRecord {
  readonly templateId: TemplateId;
  readonly templateName: string;
  readonly status: TemplateHealthStatus;
  readonly activeVersionId: TemplateVersionId | null;
  readonly versionNumber: number | null;
  readonly fileName: string | null;
  readonly expectedHash: string | null;
  readonly actualHash: string | null;
  readonly isReadOnly: boolean;
  readonly message: string;
  readonly availableHistoricalVersionsCount: number;
  readonly intactHistoricalVersions: HistoricalVersionSummary[];
}

/**
 * Deterministic sorting options for template library
 */
export type TemplateSortOption =
  'NAME_ASC' | 'NAME_DESC' | 'CATEGORY_ASC' | 'FORMAT_ASC' | 'UPDATED_DESC' | 'CREATED_DESC';
