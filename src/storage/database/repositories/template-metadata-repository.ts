/**
 * OpsReport Studio — Authoritative Template Metadata Persistence Repository
 *
 * Implements centralized relational persistence for template metadata descriptors:
 * - Deterministic retrieval (all, filtered by category, or filtered by lifecycle status)
 * - Retrieval by stable nominal template identifier
 * - Association verification with existing report categories
 * - Safe updating of editable metadata without changing stable IDs
 * - Lifecycle status transitions (DRAFT, ACTIVE, ARCHIVED)
 * - Safe deletion
 *
 * @module storage/database/repositories/template-metadata-repository
 */

import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import type {
  TemplateMetadataRecord,
  CreateTemplateMetadataInput,
  UpdateTemplateMetadataInput,
  TemplateStatus,
  ReportDocumentFormat,
} from '../types.ts';
import {
  TemplateId,
  toTemplateId,
  ReportCategoryId,
  toReportCategoryId,
} from '../../../shared/types/identifiers.ts';
import { Result, Ok, Err } from '../../../shared/types/result.ts';
import { AppError } from '../../../shared/errors/app-error.ts';
import { ErrorCode } from '../../../shared/errors/error-codes.ts';

const VALID_STATUSES: ReadonlySet<TemplateStatus> = new Set(['DRAFT', 'ACTIVE', 'ARCHIVED']);
const VALID_FORMATS: ReadonlySet<ReportDocumentFormat> = new Set(['EXCEL_XLSX', 'WORD_DOCX']);

export class TemplateMetadataRepository {
  constructor(private readonly db: Database.Database) {}

  /**
   * Retrieves template metadata records with optional filtering by category or lifecycle status.
   */
  public getAllTemplates(options?: {
    categoryId?: ReportCategoryId;
    status?: TemplateStatus;
  }): Result<TemplateMetadataRecord[], AppError> {
    try {
      const conditions: string[] = [];
      const params: unknown[] = [];

      if (options?.categoryId) {
        conditions.push('category_id = ?');
        params.push(options.categoryId);
      }

      if (options?.status) {
        conditions.push('status = ?');
        params.push(options.status);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const stmt = this.db.prepare(`
        SELECT template_id, template_name, category_id, document_type, description,
               status, file_name, created_at, updated_at
        FROM template_metadata
        ${whereClause}
        ORDER BY template_name ASC
      `);

      const rows = stmt.all(...params) as TemplateMetadataRecord[];
      const typed = rows.map(r => ({
        ...r,
        template_id: toTemplateId(r.template_id),
        category_id: toReportCategoryId(r.category_id),
      }));

      return Ok(typed);
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: 'Failed to retrieve template metadata records from database.',
          details: {
            developerMessage: `Template query failed: ${err instanceof Error ? err.message : String(err)}`,
          },
          isOperational: true,
          cause: err,
        })
      );
    }
  }

  /**
   * Retrieves a single template metadata record by its stable identifier.
   */
  public getTemplateById(templateId: TemplateId): Result<TemplateMetadataRecord | null, AppError> {
    try {
      const stmt = this.db.prepare(`
        SELECT template_id, template_name, category_id, document_type, description,
               status, file_name, created_at, updated_at
        FROM template_metadata
        WHERE template_id = ?
      `);

      const row = stmt.get(templateId) as TemplateMetadataRecord | undefined;
      return Ok(
        row
          ? {
              ...row,
              template_id: toTemplateId(row.template_id),
              category_id: toReportCategoryId(row.category_id),
            }
          : null
      );
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: 'Failed to retrieve template metadata by identifier.',
          details: {
            developerMessage: `Template lookup failed for ${templateId}: ${err instanceof Error ? err.message : String(err)}`,
          },
          isOperational: true,
          cause: err,
        })
      );
    }
  }

  /**
   * Retrieves all template metadata records associated with a specific report category.
   */
  public getTemplatesByCategory(
    categoryId: ReportCategoryId
  ): Result<TemplateMetadataRecord[], AppError> {
    return this.getAllTemplates({ categoryId });
  }

  /**
   * Creates a new template metadata record associated with an existing report category.
   */
  public createTemplate(
    input: CreateTemplateMetadataInput
  ): Result<TemplateMetadataRecord, AppError> {
    try {
      const trimmedName = input.templateName?.trim();
      if (!trimmedName || trimmedName.length > 150) {
        return Err(
          new AppError({
            code: ErrorCode.VALIDATION_FAILED,
            userMessage: 'Template name must be between 1 and 150 characters.',
            isOperational: true,
          })
        );
      }

      // Foreign Key Invariant: Associated category must exist
      const categoryExists = this.db
        .prepare('SELECT category_id FROM report_categories WHERE category_id = ?')
        .get(input.categoryId) as { category_id: string } | undefined;

      if (!categoryExists) {
        return Err(
          new AppError({
            code: ErrorCode.VALIDATION_FAILED,
            userMessage: `Referenced report category "${input.categoryId}" does not exist.`,
            isOperational: true,
          })
        );
      }

      if (!VALID_FORMATS.has(input.documentType)) {
        return Err(
          new AppError({
            code: ErrorCode.VALIDATION_FAILED,
            userMessage: 'Document type must be either EXCEL_XLSX or WORD_DOCX.',
            isOperational: true,
          })
        );
      }

      const status = input.status ?? 'ACTIVE';
      if (!VALID_STATUSES.has(status)) {
        return Err(
          new AppError({
            code: ErrorCode.VALIDATION_FAILED,
            userMessage: 'Template status must be DRAFT, ACTIVE, or ARCHIVED.',
            isOperational: true,
          })
        );
      }

      // Name uniqueness within the same category
      const existingName = this.db
        .prepare(
          'SELECT template_id FROM template_metadata WHERE LOWER(TRIM(template_name)) = LOWER(?) AND category_id = ?'
        )
        .get(trimmedName, input.categoryId) as { template_id: string } | undefined;

      if (existingName) {
        return Err(
          new AppError({
            code: ErrorCode.VALIDATION_FAILED,
            userMessage: `A template named "${trimmedName}" already exists for this category.`,
            isOperational: true,
          })
        );
      }

      // Generate or normalize stable template identifier
      let templateId = input.templateId;
      if (!templateId) {
        const slug = trimmedName
          .toUpperCase()
          .replace(/[^A-Z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 30);
        templateId = toTemplateId(`TPL-${slug}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`);
      }

      // Verify template_id uniqueness
      const existingId = this.db
        .prepare('SELECT template_id FROM template_metadata WHERE template_id = ?')
        .get(templateId) as { template_id: string } | undefined;

      if (existingId) {
        return Err(
          new AppError({
            code: ErrorCode.VALIDATION_FAILED,
            userMessage: `Template identifier "${templateId}" is already in use.`,
            isOperational: true,
          })
        );
      }

      const now = new Date().toISOString();
      const description = input.description?.trim() || null;
      const fileName = input.fileName?.trim() || null;

      const stmt = this.db.prepare(`
        INSERT INTO template_metadata (
          template_id,
          template_name,
          category_id,
          document_type,
          description,
          status,
          file_name,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        templateId,
        trimmedName,
        input.categoryId,
        input.documentType,
        description,
        status,
        fileName,
        now,
        now
      );

      return Ok({
        template_id: templateId,
        template_name: trimmedName,
        category_id: input.categoryId,
        document_type: input.documentType,
        description,
        status,
        file_name: fileName,
        created_at: now,
        updated_at: now,
      });
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: 'Failed to create template metadata in database.',
          details: {
            developerMessage: `Template creation failed: ${err instanceof Error ? err.message : String(err)}`,
          },
          isOperational: true,
          cause: err,
        })
      );
    }
  }

  /**
   * Updates editable metadata of an existing template record.
   */
  public updateTemplate(
    templateId: TemplateId,
    input: UpdateTemplateMetadataInput
  ): Result<TemplateMetadataRecord, AppError> {
    try {
      const existing = this.getTemplateById(templateId);
      if (!existing.ok) {
        return existing;
      }
      if (!existing.value) {
        return Err(
          new AppError({
            code: ErrorCode.VALIDATION_FAILED,
            userMessage: `Template "${templateId}" does not exist.`,
            isOperational: true,
          })
        );
      }

      const current = existing.value;

      let categoryId = current.category_id;
      if (input.categoryId !== undefined) {
        const categoryExists = this.db
          .prepare('SELECT category_id FROM report_categories WHERE category_id = ?')
          .get(input.categoryId) as { category_id: string } | undefined;

        if (!categoryExists) {
          return Err(
            new AppError({
              code: ErrorCode.VALIDATION_FAILED,
              userMessage: `Referenced report category "${input.categoryId}" does not exist.`,
              isOperational: true,
            })
          );
        }
        categoryId = input.categoryId;
      }

      let templateName = current.template_name;
      if (input.templateName !== undefined) {
        const trimmed = input.templateName.trim();
        if (!trimmed || trimmed.length > 150) {
          return Err(
            new AppError({
              code: ErrorCode.VALIDATION_FAILED,
              userMessage: 'Template name must be between 1 and 150 characters.',
              isOperational: true,
            })
          );
        }

        // Uniqueness within category
        if (
          trimmed.toLowerCase() !== current.template_name.toLowerCase() ||
          categoryId !== current.category_id
        ) {
          const duplicate = this.db
            .prepare(
              'SELECT template_id FROM template_metadata WHERE LOWER(TRIM(template_name)) = LOWER(?) AND category_id = ? AND template_id != ?'
            )
            .get(trimmed, categoryId, templateId) as { template_id: string } | undefined;

          if (duplicate) {
            return Err(
              new AppError({
                code: ErrorCode.VALIDATION_FAILED,
                userMessage: `A template named "${trimmed}" already exists for this category.`,
                isOperational: true,
              })
            );
          }
        }
        templateName = trimmed;
      }

      let documentType = current.document_type;
      if (input.documentType !== undefined) {
        if (!VALID_FORMATS.has(input.documentType)) {
          return Err(
            new AppError({
              code: ErrorCode.VALIDATION_FAILED,
              userMessage: 'Document type must be either EXCEL_XLSX or WORD_DOCX.',
              isOperational: true,
            })
          );
        }
        documentType = input.documentType;
      }

      let status = current.status;
      if (input.status !== undefined) {
        if (!VALID_STATUSES.has(input.status)) {
          return Err(
            new AppError({
              code: ErrorCode.VALIDATION_FAILED,
              userMessage: 'Template status must be DRAFT, ACTIVE, or ARCHIVED.',
              isOperational: true,
            })
          );
        }
        status = input.status;
      }

      const description =
        input.description !== undefined ? input.description?.trim() || null : current.description;
      const fileName =
        input.fileName !== undefined ? input.fileName?.trim() || null : current.file_name;
      const now = new Date().toISOString();

      const stmt = this.db.prepare(`
        UPDATE template_metadata
        SET template_name = ?,
            category_id = ?,
            document_type = ?,
            description = ?,
            status = ?,
            file_name = ?,
            updated_at = ?
        WHERE template_id = ?
      `);

      stmt.run(
        templateName,
        categoryId,
        documentType,
        description,
        status,
        fileName,
        now,
        templateId
      );

      return Ok({
        template_id: templateId,
        template_name: templateName,
        category_id: categoryId,
        document_type: documentType,
        description,
        status,
        file_name: fileName,
        created_at: current.created_at,
        updated_at: now,
      });
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: 'Failed to update template metadata in database.',
          details: {
            developerMessage: `Template update failed for ${templateId}: ${err instanceof Error ? err.message : String(err)}`,
          },
          isOperational: true,
          cause: err,
        })
      );
    }
  }

  /**
   * Updates lifecycle status of a template metadata record.
   */
  public setTemplateStatus(
    templateId: TemplateId,
    status: TemplateStatus
  ): Result<TemplateMetadataRecord, AppError> {
    return this.updateTemplate(templateId, { status });
  }

  /**
   * Deletes a template metadata record.
   */
  public deleteTemplate(templateId: TemplateId): Result<boolean, AppError> {
    try {
      const existing = this.getTemplateById(templateId);
      if (!existing.ok) {
        return existing;
      }
      if (!existing.value) {
        return Err(
          new AppError({
            code: ErrorCode.VALIDATION_FAILED,
            userMessage: `Template "${templateId}" does not exist.`,
            isOperational: true,
          })
        );
      }

      const stmt = this.db.prepare('DELETE FROM template_metadata WHERE template_id = ?');
      const info = stmt.run(templateId);
      return Ok(info.changes > 0);
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: 'Failed to delete template metadata from database.',
          details: {
            developerMessage: `Template delete failed for ${templateId}: ${err instanceof Error ? err.message : String(err)}`,
          },
          isOperational: true,
          cause: err,
        })
      );
    }
  }

  /**
   * Returns total registered templates count, optionally filtered by category or status.
   */
  public getTemplateCount(options?: {
    categoryId?: ReportCategoryId;
    status?: TemplateStatus;
  }): Result<number, AppError> {
    try {
      const conditions: string[] = [];
      const params: unknown[] = [];

      if (options?.categoryId) {
        conditions.push('category_id = ?');
        params.push(options.categoryId);
      }

      if (options?.status) {
        conditions.push('status = ?');
        params.push(options.status);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const row = this.db
        .prepare(`SELECT count(*) as count FROM template_metadata ${whereClause}`)
        .get(...params) as { count: number };

      return Ok(row.count);
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: 'Failed to count template metadata records.',
          isOperational: true,
          cause: err,
        })
      );
    }
  }
}
