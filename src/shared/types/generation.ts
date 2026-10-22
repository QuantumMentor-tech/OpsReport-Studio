/**
 * OpsReport Studio — Shared Generation Domain Types (Step 26 Baseline)
 *
 * Defines contracts, statuses, options, and result structures for
 * isolated report generation workspaces and Excel workbook cloning.
 *
 * @module shared/types/generation
 */

import type {
  GenerationWorkspaceId,
  ReportSessionId,
  TemplateId,
  TemplateVersionId,
  MappingProfileId,
  StationId,
} from './identifiers.ts';
import type { ReportDocumentFormat } from './categories.ts';
import type { TemplateMetadataRecord, TemplateVersionRecord } from './templates.ts';

/**
 * Valid lifecycle states for a report generation workspace.
 * - PREPARED: Pristine clone created from verified master template; ready for field injection.
 * - IN_USE: Actively undergoing data injection or row expansion.
 * - COMPLETED: Generation finalized and exported to final destination.
 * - DISCARDED: Cancelled, superseded by newer operation, or marked for purge.
 */
export type GenerationWorkspaceStatus = 'PREPARED' | 'IN_USE' | 'COMPLETED' | 'DISCARDED';

export const GENERATION_WORKSPACE_STATUSES: readonly GenerationWorkspaceStatus[] = [
  'PREPARED',
  'IN_USE',
  'COMPLETED',
  'DISCARDED',
] as const;

/**
 * Authoritative record of an isolated generation workspace.
 */
export interface GenerationWorkspaceRecord {
  /** Unique workspace identifier (e.g., 'ws_...') */
  readonly workspaceId: GenerationWorkspaceId;
  /** Optional associated report session ID */
  readonly sessionId: ReportSessionId | null;
  /** Logical parent template identifier */
  readonly templateId: TemplateId;
  /** Specific immutable version identifier */
  readonly versionId: TemplateVersionId;
  /** Sequential version number */
  readonly versionNumber: number;
  /** Document format: 'EXCEL' or 'WORD' */
  readonly documentType: ReportDocumentFormat;
  /** Working file name inside Workspace/ */
  readonly fileName: string;
  /** Relative path from Workspace/ directory */
  readonly relativePath: string;
  /** Absolute filesystem path of the working copy */
  readonly absolutePath: string;
  /** Verified cryptographic SHA-256 hash of the working copy */
  readonly sha256Hash: string;
  /** Working file size in bytes */
  readonly fileSizeBytes: number;
  /** Workspace lifecycle status */
  readonly status: GenerationWorkspaceStatus;
  /** ISO 8601 UTC creation timestamp */
  readonly createdAt: string;
  /** ISO 8601 UTC last-modified timestamp */
  readonly updatedAt: string;
}

/**
 * Options for creating an independent Excel workbook clone in the Generation Workspace.
 */
export interface CreateExcelCloneOptions {
  /** Target template identifier (required) */
  readonly templateId: TemplateId;
  /** Target version identifier (optional; defaults to active version if omitted) */
  readonly versionId?: TemplateVersionId;
  /** Associated report session identifier (optional) */
  readonly sessionId?: ReportSessionId;
  /** Optional custom operation tag or identifier */
  readonly operationId?: string;
  /** Optional custom filename prefix (must be safe alphanumeric without traversal) */
  readonly customPrefix?: string;
  /** Whether to discard any previously prepared workspace for the same session (default: true) */
  readonly replaceExistingSessionWorkspace?: boolean;
}

/**
 * Structured result returned upon successful Excel workbook clone creation.
 */
export interface ExcelCloneResult {
  /** The created and verified generation workspace record */
  readonly workspace: GenerationWorkspaceRecord;
  /** Authoritative metadata of the source master template */
  readonly sourceTemplate: TemplateMetadataRecord;
  /** Authoritative record of the source master template version */
  readonly sourceVersion: TemplateVersionRecord;
  /** Whether copy completeness and hash verification succeeded */
  readonly isVerified: boolean;
  /** Confirmation that source master template was 100% untouched */
  readonly sourceUntouched: boolean;
}

/**
 * Filter options for querying generation workspaces.
 */
export interface GenerationWorkspaceFilter {
  readonly sessionId?: ReportSessionId;
  readonly templateId?: TemplateId;
  readonly status?: GenerationWorkspaceStatus | readonly GenerationWorkspaceStatus[];
  readonly limit?: number;
  readonly offset?: number;
}

// -----------------------------------------------------------------------------
// Step 27: Structured Data Injection Contracts
// -----------------------------------------------------------------------------

/**
 * Status of an individual field assignment in the write plan.
 */
export type FieldWriteStatus = 'PLANNED' | 'WRITTEN' | 'DEFERRED' | 'SKIPPED' | 'FAILED';

/**
 * Detailed description of an individual planned or executed cell write.
 */
export interface CellWriteOperation {
  readonly fieldId: string;
  readonly fieldLabel: string;
  readonly mappingType: 'FIXED_CELL' | 'TABLE_COLUMN';
  readonly worksheetName: string;
  readonly targetCoordinate: string;
  readonly value: string | number | boolean | null;
  readonly rawValue: unknown;
  readonly dataType?: string;
  readonly status: FieldWriteStatus;
  readonly note?: string;
  readonly stationId?: StationId;
  readonly stationName?: string;
  readonly sequenceOrder?: number;
  readonly rowIndex?: number;
}

/**
 * Options for injecting report session data into an Excel working workbook.
 */
export interface InjectExcelDataOptions {
  /** Target generation workspace ID (identifying the isolated working workbook from Step 26) */
  readonly workspaceId: GenerationWorkspaceId;
  /** Authoritative report session ID */
  readonly sessionId: ReportSessionId;
  /** Optional specific mapping profile ID (if omitted, uses active/direct mappings) */
  readonly profileId?: MappingProfileId;
  /** Optional override for session payload (useful for validation or headless runs) */
  readonly overrideFormData?: Record<string, unknown>;
}

/**
 * Structured result returned upon completing Excel data injection.
 */
export interface ExcelDataInjectionResult {
  /** Updated generation workspace record */
  readonly workspace: GenerationWorkspaceRecord;
  /** Associated report session ID */
  readonly sessionId: ReportSessionId;
  /** Applied template ID */
  readonly templateId: TemplateId;
  /** Applied template version ID */
  readonly versionId: TemplateVersionId;
  /** Mapping profile ID if one was used */
  readonly profileId?: MappingProfileId;
  /** Total mapped fields evaluated */
  readonly totalMappingsEvaluated: number;
  /** Count of scalar fixed cells successfully written */
  readonly fixedCellsWrittenCount: number;
  /** Count of table column mappings deferred to Step 28 (if any) */
  readonly tableColumnsDeferredCount: number;
  /** Count of table column cells successfully written */
  readonly tableColumnsWrittenCount?: number;
  /** Count of distinct station rows generated */
  readonly stationRowsGeneratedCount?: number;
  /** Total stations evaluated */
  readonly stationsEvaluatedCount?: number;
  /** List of individual cell write operations executed */
  readonly executedWrites: readonly CellWriteOperation[];
  /** List of mappings deferred (if any) */
  readonly deferredWrites: readonly CellWriteOperation[];
  /** Execution timestamp (ISO 8601 UTC) */
  readonly injectedAt: string;
  /** Whether the resulting workbook was verified */
  readonly isVerified: boolean;
  /** Confirmation that source master template was 100% untouched */
  readonly masterUntouched: boolean;
  /** Step 29: Structural preservation and verification report */
  readonly structuralIntegrityReport?: StructuralVerificationReport;
}

// -----------------------------------------------------------------------------
// Step 29: Formatting, Formulas, Merged Cells, Images & Print Layout Preservation
// -----------------------------------------------------------------------------

/**
 * Geometric representation of an Excel merged cell range (e.g. A1:C1).
 */
export interface MergedCellRange {
  /** Range coordinate string as declared in worksheet XML, e.g. "A1:C1" */
  readonly ref: string;
  /** 1-based start column index (inclusive) */
  readonly startCol: number;
  /** 1-based start row index (inclusive) */
  readonly startRow: number;
  /** 1-based end column index (inclusive) */
  readonly endCol: number;
  /** 1-based end row index (inclusive) */
  readonly endRow: number;
  /** Authoritative top-left anchor cell address, e.g. "A1" */
  readonly anchorCell: string;
  /** List of covered/non-anchor cell addresses, e.g. ["B1", "C1"] */
  readonly coveredCells: readonly string[];
}

/**
 * Record of a preserved or inspected formula cell in a worksheet.
 */
export interface FormulaCellRecord {
  /** Target cell reference e.g. "B5" */
  readonly cellRef: string;
  /** Formula expression string without leading '=' */
  readonly formula: string;
  /** Cached evaluated value if present in XML */
  readonly value?: string | number | boolean | null;
}

/**
 * Structural snapshot of worksheet page setup, margins, and print layout.
 */
export interface PageSetupSnapshot {
  readonly sheetName: string;
  readonly paperSize?: string;
  readonly orientation?: string;
  readonly fitToWidth?: string;
  readonly fitToHeight?: string;
  readonly scale?: string;
  readonly margins?: {
    readonly left?: string;
    readonly right?: string;
    readonly top?: string;
    readonly bottom?: string;
    readonly header?: string;
    readonly footer?: string;
  };
  readonly printOptions?: {
    readonly gridLines?: boolean;
    readonly headings?: boolean;
    readonly horizontalCentered?: boolean;
    readonly verticalCentered?: boolean;
  };
  readonly headerFooter?: {
    readonly oddHeader?: string;
    readonly oddFooter?: string;
    readonly evenHeader?: string;
    readonly evenFooter?: string;
  };
  readonly manualRowBreaksCount: number;
  readonly manualColBreaksCount: number;
}

/**
 * Structural snapshot of drawing elements, relationships, and embedded media.
 */
export interface DrawingMediaSnapshot {
  /** Number of drawing parts found in xl/drawings/ */
  readonly drawingPartCount: number;
  /** List of embedded binary media files in xl/media/ */
  readonly mediaFiles: readonly {
    readonly name: string;
    readonly sizeBytes: number;
    readonly sha256Hash: string;
  }[];
  /** Number of worksheet-to-drawing relationships */
  readonly sheetDrawingRelCount: number;
}

/**
 * Per-sheet structural inspection snapshot.
 */
export interface SheetStructuralSnapshot {
  readonly sheetName: string;
  readonly sheetId: number;
  readonly state: 'visible' | 'hidden';
  readonly mergedCells: readonly MergedCellRange[];
  readonly formulaCells: readonly FormulaCellRecord[];
  readonly pageSetup?: PageSetupSnapshot;
  readonly colStylesCount: number;
  readonly conditionalFormattingCount: number;
  readonly dataValidationCount: number;
  readonly hasDrawing: boolean;
}

/**
 * Complete structural snapshot of an Excel workbook container before or after mutation.
 */
export interface WorkbookStructuralSnapshot {
  readonly sheetNames: readonly string[];
  readonly sheets: readonly SheetStructuralSnapshot[];
  readonly drawingMedia: DrawingMediaSnapshot;
  readonly printAreas: ReadonlyMap<string, string>;
  readonly printTitles: ReadonlyMap<string, string>;
  readonly totalFormulaCount: number;
  readonly totalMergedCellCount: number;
}

/**
 * Severity level of a structural verification finding.
 */
export type StructuralVerificationFindingSeverity = 'BLOCKING' | 'WARNING' | 'INFO';

/**
 * Detailed diagnostic finding from structural comparison between baseline and candidate.
 */
export interface StructuralVerificationFinding {
  readonly code: string;
  readonly severity: StructuralVerificationFindingSeverity;
  readonly worksheetName?: string;
  readonly target?: string;
  readonly message: string;
}

/**
 * Verification report summarizing structural integrity preservation.
 */
export interface StructuralVerificationReport {
  /** Overall verification status (true if no blocking findings) */
  readonly isPreserved: boolean;
  /** Total count of preserved formula cells outside write targets */
  readonly totalFormulasPreserved: number;
  /** Total count of verified merged cell ranges */
  readonly totalMergedCellsPreserved: number;
  /** Count of preserved binary image files in xl/media/ */
  readonly imagesPreservedCount: number;
  /** Count of preserved sheet page setup configurations */
  readonly pageSetupsPreservedCount: number;
  /** Comprehensive diagnostic findings */
  readonly findings: readonly StructuralVerificationFinding[];
  /** Verification ISO 8601 UTC timestamp */
  readonly verifiedAt: string;
}

// -----------------------------------------------------------------------------
// Step 30: Excel Export, Naming Rules & Generated Workbook Validation
// -----------------------------------------------------------------------------

/**
 * File collision policy for final report export. Existing reports are never replaced
 * (no overwrite policy is approved; see NFR-REL-03 and DEC-052).
 * - FAIL_IF_EXISTS: Reject export if a file with the target name already exists.
 * - INCREMENT_SUFFIX: Append a sequential numerical suffix (e.g. "_1.xlsx", "_2.xlsx").
 */
export type CollisionPolicy = 'FAIL_IF_EXISTS' | 'INCREMENT_SUFFIX';

export const COLLISION_POLICIES: readonly CollisionPolicy[] = [
  'FAIL_IF_EXISTS',
  'INCREMENT_SUFFIX',
] as const;

/**
 * Parameters for resolving and formatting standardized export filenames (DEC-011).
 */
export interface ExportFilenameOptions {
  /** Functional category code or display name slug (e.g. 'RPT-INCIDENT', 'StationAudit') */
  readonly categoryCode?: string;
  /** Report date in YYYY-MM-DD or YYYYMMDD format */
  readonly reportDate?: string;
  /** Optional station code or facility name for single-station reports */
  readonly stationCodeOrName?: string;
  /** Operational shift identifier (e.g. 'Morning', 'Night', 'Shift1') */
  readonly shift?: string;
  /** Session identifier or short sequence ID */
  readonly sessionOrSequenceId?: string;
  /** Explicit custom filename override (will be sanitized and enforced .xlsx) */
  readonly customFilename?: string;
  /** Custom prefix prepended to generated filename */
  readonly customPrefix?: string;
}

/**
 * Options for finalizing and exporting an Excel report to its destination directory.
 */
export interface ExportExcelReportOptions {
  /** Target report session identifier (required) */
  readonly sessionId: ReportSessionId;
  /** Specific generation workspace identifier (optional; defaults to active workspace for session) */
  readonly workspaceId?: GenerationWorkspaceId;
  /** Custom output directory (optional; defaults to VaultManager reportsDir) */
  readonly destinationDir?: string;
  /** Naming parameters for deterministic export filename generation */
  readonly namingOptions?: ExportFilenameOptions;
  /** Target file collision policy (defaults to 'INCREMENT_SUFFIX') */
  readonly collisionPolicy?: CollisionPolicy;
  /** Whether to bypass content validation (not recommended; defaults to false) */
  readonly skipContentValidation?: boolean;
  /** Whether to mark the report session as COMPLETED in the database upon successful export */
  readonly markSessionCompleted?: boolean;
}

/**
 * Comprehensive verification summary validating the exported final workbook on disk.
 */
export interface ExportValidationSummary {
  /** Whether the file physically exists at confirmed final destination */
  readonly fileExists: boolean;
  /** Physical byte length of finalized file */
  readonly fileSizeBytes: number;
  /** Cryptographic SHA-256 hash of finalized file */
  readonly sha256Hash: string;
  /** Whether file passed Open XML archive and MIME validation */
  readonly isOpenXmlCompliant: boolean;
  /** Names of worksheets verified in final workbook */
  readonly sheetsVerified: readonly string[];
  /** Count of scalar mapped fields verified matching session data */
  readonly scalarFieldsVerifiedCount: number;
  /** Count of station rows verified matching session sequence */
  readonly stationRowsVerifiedCount: number;
  /** Station IDs in the worksheet row order confirmed to match the session sequence */
  readonly verifiedStationOrder: readonly string[];
  /** Step 29 structural preservation report (if verified against master template) */
  readonly preservationReport?: StructuralVerificationReport;
  /** Invariant INV-DAT-006: Master template 0-byte variance confirmed */
  readonly masterUntouched: boolean;
}

/**
 * Structured result returned upon successful Excel report export and validation.
 */
export interface ExportExcelReportResult {
  /** Absolute filesystem path of finalized export file */
  readonly finalPath: string;
  /** Final sanitized filename with .xlsx extension */
  readonly fileName: string;
  /** Physical byte length of finalized file */
  readonly fileSizeBytes: number;
  /** Cryptographic SHA-256 hash of finalized file */
  readonly sha256Hash: string;
  /** Associated report session identifier */
  readonly sessionId: ReportSessionId;
  /** Generation workspace identifier */
  readonly workspaceId: GenerationWorkspaceId;
  /** Template identifier applied */
  readonly templateId: TemplateId;
  /** Template version identifier applied */
  readonly versionId: TemplateVersionId;
  /** ISO 8601 UTC export timestamp */
  readonly exportedAt: string;
  /** False when the file was saved and verified but a database state update failed (see warnings) */
  readonly persistenceComplete: boolean;
  /** Non-sensitive warnings about partial outcomes (e.g. metadata update failure) */
  readonly warnings: readonly string[];
  /** Post-finalization validation summary */
  readonly validationSummary: ExportValidationSummary;
}
