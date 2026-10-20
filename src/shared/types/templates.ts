/**
 * OpsReport Studio — Shared Template Metadata Domain Contracts
 *
 * Defines template metadata entity records, input models, and operations
 * establishing the relationship between reusable template descriptors and report categories.
 *
 * @module shared/types/templates
 */

import type { TemplateId, ReportCategoryId } from './identifiers.ts';
import type { ReportDocumentFormat } from './categories.ts';

export type TemplateStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';

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
