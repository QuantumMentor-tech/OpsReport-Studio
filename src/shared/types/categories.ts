/**
 * OpsReport Studio — Shared Report Category Domain Contracts
 *
 * Defines report category reference entity records, input models, and operations
 * used across main, preload, persistence, and renderer components.
 *
 * @module shared/types/categories
 */

import type { ReportCategoryId } from './identifiers.ts';

export type ReportDocumentFormat = 'EXCEL_XLSX' | 'WORD_DOCX';

export interface ReportCategoryRecord {
  /** Authoritative category identifier (e.g. 'RPT-INCIDENT') */
  readonly category_id: ReportCategoryId;
  /** Human-readable category display title */
  readonly display_name: string;
  /** Primary Open XML document template format */
  readonly default_format: ReportDocumentFormat;
  /** Whether the category requires multi-station inspection rows (1 or 0) */
  readonly is_multi_station: number;
  /** Functional description of the report purpose */
  readonly description: string;
  /** Active status flag (1 = active, 0 = inactive/retired) */
  readonly is_active: number;
  /** ISO 8601 UTC registration timestamp */
  readonly created_at: string;
  /** ISO 8601 UTC last-modified timestamp */
  readonly updated_at: string;
}

export interface CreateCategoryInput {
  /** Optional identifier; generated or canonical slug if omitted */
  readonly categoryId?: ReportCategoryId;
  /** Human-readable display title (1..150 characters) */
  readonly displayName: string;
  /** Primary document format */
  readonly defaultFormat: ReportDocumentFormat;
  /** Multi-station reporting flag (default: true) */
  readonly isMultiStation?: boolean;
  /** Functional purpose description */
  readonly description: string;
  /** Active status flag (default: true) */
  readonly isActive?: boolean;
}

export interface UpdateCategoryInput {
  /** Updated human-readable display title */
  readonly displayName?: string;
  /** Updated primary document format */
  readonly defaultFormat?: ReportDocumentFormat;
  /** Updated multi-station flag */
  readonly isMultiStation?: boolean;
  /** Updated description */
  readonly description?: string;
  /** Updated active status flag */
  readonly isActive?: boolean;
}
