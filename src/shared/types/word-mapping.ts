/**
 * OpsReport Studio — Shared Word Field Mapping Domain Contracts
 *
 * Defines data structures and validation contracts for associating approved
 * report fields with Word document targets (placeholders, structural paragraphs,
 * table cells, and repeating table rows) in Step 23.
 *
 * @module shared/types/word-mapping
 */

import type { TemplateId, TemplateVersionId } from './identifiers.ts';

export type WordMappingTargetType = 'PLACEHOLDER' | 'PARAGRAPH' | 'TABLE_CELL' | 'REPEATING_ROW';

/**
 * Persisted record representing an approved report field mapped to a Word destination.
 */
export interface WordFieldMappingRecord {
  /** Unique mapping record identifier (UUID) */
  readonly mappingId: string;
  /** Associated master template reference */
  readonly templateId: TemplateId;
  /** Exact template version reference for structural integrity */
  readonly versionId: TemplateVersionId;
  /** Destination mapping target kind */
  readonly mappingType: WordMappingTargetType;
  /** Stable authoritative field identifier (e.g. 'FLD-COM-DATE', 'FLD-INC-NARRATIVE') */
  readonly fieldId: string;
  /** Human-readable field label at configuration time */
  readonly fieldLabel: string;
  /**
   * Canonical target coordinate string:
   * - PLACEHOLDER: token name like '{report_date}' or '{incident_narrative}'
   * - PARAGRAPH: 'P:1', 'P:2'
   * - TABLE_CELL: 'T1:R2:C3'
   * - REPEATING_ROW: 'T1:R2:LOOP'
   */
  readonly targetCoordinate: string;
  /** Extracted placeholder token string if mapped to a placeholder */
  readonly placeholderToken?: string | null;
  /** 1-based structural paragraph index if mapped to a paragraph */
  readonly paragraphIndex?: number | null;
  /** 1-based table index if mapped to a table element */
  readonly tableIndex?: number | null;
  /** 1-based row index if mapped to a table row or cell */
  readonly rowIndex?: number | null;
  /** 1-based column index if mapped to an individual table cell */
  readonly colIndex?: number | null;
  /** ISO 8601 creation timestamp */
  readonly createdAt: string;
  /** ISO 8601 update timestamp */
  readonly updatedAt: string;
}

/**
 * Complete Word mapping configuration for a specific template version.
 */
export interface WordTemplateMappingConfig {
  readonly templateId: TemplateId;
  readonly versionId: TemplateVersionId;
  readonly mappings: WordFieldMappingRecord[];
}

/**
 * Input for saving an individual Word field mapping.
 */
export interface SaveWordMappingItemInput {
  readonly mappingType: WordMappingTargetType;
  readonly fieldId: string;
  readonly fieldLabel: string;
  readonly targetCoordinate: string;
  readonly placeholderToken?: string | null;
  readonly paragraphIndex?: number | null;
  readonly tableIndex?: number | null;
  readonly rowIndex?: number | null;
  readonly colIndex?: number | null;
}

/**
 * Input for saving/updating a complete Word template mapping configuration atomically.
 */
export interface SaveWordMappingsInput {
  readonly templateId: TemplateId;
  readonly versionId: TemplateVersionId;
  readonly mappings: SaveWordMappingItemInput[];
}

/**
 * Validation error details for Word mapping conflicts or coordinate syntax errors.
 */
export interface WordMappingValidationError {
  readonly fieldId?: string;
  readonly targetCoordinate?: string;
  readonly message: string;
  readonly severity: 'error' | 'warning';
}
