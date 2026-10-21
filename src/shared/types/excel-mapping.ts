/**
 * OpsReport Studio — Shared Excel Field Mapping Domain Contracts
 *
 * Defines data structures and validation contracts for associating approved
 * report fields with Excel worksheet targets (fixed cells or table columns)
 * in Step 22.
 *
 * @module shared/types/excel-mapping
 */

import type { TemplateId, TemplateVersionId } from './identifiers.ts';

export type ExcelMappingTargetType = 'FIXED_CELL' | 'TABLE_COLUMN';

/**
 * Persisted record representing an approved report field mapped to an Excel destination.
 */
export interface ExcelFieldMappingRecord {
  /** Unique mapping record identifier (UUID) */
  readonly mappingId: string;
  /** Associated master template reference */
  readonly templateId: TemplateId;
  /** Exact template version reference for structural integrity */
  readonly versionId: TemplateVersionId;
  /** Selected worksheet name */
  readonly worksheetName: string;
  /** Designated header row number for tabular mappings (1-based, null for fixed-only) */
  readonly headerRowNumber: number | null;
  /** Destination mapping type: fixed cell coordinate vs table column */
  readonly mappingType: ExcelMappingTargetType;
  /** Stable authoritative field identifier (e.g. 'FLD-COM-DATE', 'FLD-SLT-STATUS') */
  readonly fieldId: string;
  /** Human-readable field label at configuration time */
  readonly fieldLabel: string;
  /** Physical destination coordinate: cell address like 'B2' or column letter like 'C' */
  readonly targetCoordinate: string;
  /** Extracted column heading text if mapped to a table column */
  readonly columnHeader?: string | null;
  /** ISO 8601 creation timestamp */
  readonly createdAt: string;
  /** ISO 8601 update timestamp */
  readonly updatedAt: string;
}

/**
 * Complete mapping configuration for a specific template version and worksheet.
 */
export interface ExcelTemplateMappingConfig {
  readonly templateId: TemplateId;
  readonly versionId: TemplateVersionId;
  readonly worksheetName: string;
  readonly headerRowNumber: number | null;
  readonly mappings: ExcelFieldMappingRecord[];
}

/**
 * Input for saving an individual field mapping.
 */
export interface SaveExcelMappingItemInput {
  readonly mappingType: ExcelMappingTargetType;
  readonly fieldId: string;
  readonly fieldLabel: string;
  readonly targetCoordinate: string;
  readonly columnHeader?: string | null;
}

/**
 * Input for saving/updating a complete worksheet mapping configuration atomically.
 */
export interface SaveExcelMappingsInput {
  readonly templateId: TemplateId;
  readonly versionId: TemplateVersionId;
  readonly worksheetName: string;
  readonly headerRowNumber?: number | null;
  readonly mappings: SaveExcelMappingItemInput[];
}

/**
 * Column destination definition extracted from a worksheet header row.
 */
export interface ExtractedColumnHeader {
  readonly colRef: string;
  readonly colIndex: number;
  readonly headerText: string;
  readonly isBlank: boolean;
}

/**
 * Validation error details for mapping conflicts or coordinate syntax errors.
 */
export interface MappingValidationError {
  readonly fieldId?: string;
  readonly targetCoordinate?: string;
  readonly message: string;
  readonly severity: 'error' | 'warning';
}
