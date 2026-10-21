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
  TemplateVersionRecord,
  TemplateStatus,
  ReportDocumentFormat,
} from '../types.ts';
import {
  TemplateId,
  toTemplateId,
  TemplateVersionId,
  toTemplateVersionId,
  ReportCategoryId,
  toReportCategoryId,
} from '../../../shared/types/identifiers.ts';
import { Result, Ok, Err } from '../../../shared/types/result.ts';
import { AppError } from '../../../shared/errors/app-error.ts';
import { ErrorCode } from '../../../shared/errors/error-codes.ts';
import { VaultManager } from '../../vault/vault-manager.ts';

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
               status, file_name, active_version_id, total_versions, created_at, updated_at
        FROM template_metadata
        ${whereClause}
        ORDER BY template_name ASC
      `);

      const rows = stmt.all(...params) as Array<
        TemplateMetadataRecord & { active_version_id?: string | null; total_versions?: number }
      >;
      const typed = rows.map(r => ({
        ...r,
        template_id: toTemplateId(r.template_id),
        category_id: toReportCategoryId(r.category_id),
        active_version_id: r.active_version_id ? toTemplateVersionId(r.active_version_id) : null,
        total_versions: r.total_versions ?? 1,
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
               status, file_name, active_version_id, total_versions, created_at, updated_at
        FROM template_metadata
        WHERE template_id = ?
      `);

      const row = stmt.get(templateId) as
        | (TemplateMetadataRecord & { active_version_id?: string | null; total_versions?: number })
        | undefined;
      return Ok(
        row
          ? {
              ...row,
              template_id: toTemplateId(row.template_id),
              category_id: toReportCategoryId(row.category_id),
              active_version_id: row.active_version_id
                ? toTemplateVersionId(row.active_version_id)
                : null,
              total_versions: row.total_versions ?? 1,
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
        const categoryRow = this.db
          .prepare(
            'SELECT category_id, display_name, default_format, is_active FROM report_categories WHERE category_id = ?'
          )
          .get(input.categoryId) as
          | {
              category_id: string;
              display_name: string;
              default_format: string;
              is_active: number;
            }
          | undefined;

        if (!categoryRow) {
          return Err(
            new AppError({
              code: ErrorCode.VALIDATION_FAILED,
              userMessage: `Referenced report category "${input.categoryId}" does not exist.`,
              isOperational: true,
            })
          );
        }

        // Validate format compatibility
        const docTypeToCheck = input.documentType ?? current.document_type;
        if (categoryRow.default_format !== docTypeToCheck) {
          return Err(
            new AppError({
              code: ErrorCode.VALIDATION_FAILED,
              userMessage: `Category format mismatch: Category "${categoryRow.display_name}" mandates ${categoryRow.default_format}, but template format is ${docTypeToCheck}.`,
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
  /**
   * Checks whether any historical report sessions reference this template.
   */
  public getTemplateReferenceCount(
    templateId: TemplateId
  ): Result<{ sessionCount: number }, AppError> {
    try {
      const row = this.db
        .prepare('SELECT count(*) as count FROM report_sessions WHERE template_id = ?')
        .get(templateId) as { count: number };
      return Ok({ sessionCount: row?.count ?? 0 });
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: `Failed to check session references for template "${templateId}".`,
          details: { developerMessage: String(err) },
          isOperational: true,
          cause: err,
        })
      );
    }
  }

  /**
   * Safely deletes a template metadata record:
   * 1. Inspects report session dependencies; strictly blocks deletion if referenced (Section 8.2).
   * 2. Safely unlinks associated physical master vault files for all versions.
   * 3. Removes metadata record and cascades deletion to template_versions.
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

      // Safety Invariant (Section 8.2): Check dependencies before deletion
      const refCheck = this.getTemplateReferenceCount(templateId);
      if (!refCheck.ok) {
        return refCheck;
      }
      if (refCheck.value.sessionCount > 0) {
        return Err(
          new AppError({
            code: ErrorCode.VALIDATION_FAILED,
            userMessage: `Cannot delete template "${existing.value.template_name}": It is referenced by ${refCheck.value.sessionCount} historical report session(s). Please archive or retire this template instead to preserve report history.`,
            isOperational: true,
          })
        );
      }

      // Safe cleanup of physical master files for unreferenced template
      const versionsRes = this.getVersionsByTemplateId(templateId);
      if (versionsRes.ok && versionsRes.value.length > 0) {
        for (const ver of versionsRes.value) {
          try {
            const vault = VaultManager.getInstance();
            vault.deleteTemplateFile(ver.file_name);
          } catch {
            // best-effort file cleanup
          }
        }
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

  // ---------------------------------------------------------------------------
  // Template Versions Persistence Operations (Step 19)
  // ---------------------------------------------------------------------------

  /**
   * Retrieves all immutable versions of a logical template ordered by version_number descending.
   */
  public getVersionsByTemplateId(
    templateId: TemplateId
  ): Result<TemplateVersionRecord[], AppError> {
    try {
      const stmt = this.db.prepare(`
        SELECT version_id, template_id, version_number, file_name,
               sha256_hash, file_size_bytes, change_summary, is_active, created_at
        FROM template_versions
        WHERE template_id = ?
        ORDER BY version_number DESC
      `);

      const rows = stmt.all(templateId) as TemplateVersionRecord[];
      const typed = rows.map(r => ({
        ...r,
        version_id: toTemplateVersionId(r.version_id),
        template_id: toTemplateId(r.template_id),
      }));

      return Ok(typed);
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: `Failed to retrieve version history for template "${templateId}".`,
          details: { developerMessage: String(err) },
          isOperational: true,
          cause: err,
        })
      );
    }
  }

  /**
   * Retrieves a specific template version by its stable version identifier.
   */
  public getVersionById(
    versionId: TemplateVersionId
  ): Result<TemplateVersionRecord | null, AppError> {
    try {
      const stmt = this.db.prepare(`
        SELECT version_id, template_id, version_number, file_name,
               sha256_hash, file_size_bytes, change_summary, is_active, created_at
        FROM template_versions
        WHERE version_id = ?
      `);

      const row = stmt.get(versionId) as TemplateVersionRecord | undefined;
      return Ok(
        row
          ? {
              ...row,
              version_id: toTemplateVersionId(row.version_id),
              template_id: toTemplateId(row.template_id),
            }
          : null
      );
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: `Failed to retrieve template version "${versionId}".`,
          details: { developerMessage: String(err) },
          isOperational: true,
          cause: err,
        })
      );
    }
  }

  /**
   * Resolves the current active (preferred) version for a given template.
   */
  public getActiveVersion(templateId: TemplateId): Result<TemplateVersionRecord | null, AppError> {
    try {
      // First check active_version_id on template_metadata
      const tplRes = this.getTemplateById(templateId);
      if (!tplRes.ok) {
        return tplRes;
      }
      if (!tplRes.value) {
        return Ok(null);
      }

      if (tplRes.value.active_version_id) {
        return this.getVersionById(tplRes.value.active_version_id);
      }

      // Fallback: highest version_number with is_active = 1
      const stmt = this.db.prepare(`
        SELECT version_id, template_id, version_number, file_name,
               sha256_hash, file_size_bytes, change_summary, is_active, created_at
        FROM template_versions
        WHERE template_id = ? AND is_active = 1
        ORDER BY version_number DESC
        LIMIT 1
      `);

      const row = stmt.get(templateId) as TemplateVersionRecord | undefined;
      return Ok(
        row
          ? {
              ...row,
              version_id: toTemplateVersionId(row.version_id),
              template_id: toTemplateId(row.template_id),
            }
          : null
      );
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: `Failed to resolve active version for template "${templateId}".`,
          details: { developerMessage: String(err) },
          isOperational: true,
          cause: err,
        })
      );
    }
  }

  /**
   * Registers a new immutable version in an atomic transaction:
   * 1. Allocates next sequential version number: MAX(version_number) + 1
   * 2. Inserts new template_versions record
   * 3. Updates template_metadata (active_version_id, total_versions, file_name, updated_at) if setActive is true
   */
  public registerNewVersion(input: {
    templateId: TemplateId;
    fileName: string;
    sha256Hash: string;
    fileSizeBytes: number;
    changeSummary?: string | null;
    setActive?: boolean;
  }): Result<TemplateVersionRecord, AppError> {
    try {
      const templateRes = this.getTemplateById(input.templateId);
      if (!templateRes.ok) {
        return templateRes;
      }
      if (!templateRes.value) {
        return Err(
          new AppError({
            code: ErrorCode.TEMPLATE_NOT_FOUND,
            userMessage: `Cannot register version: Template "${input.templateId}" does not exist.`,
            isOperational: true,
          })
        );
      }

      const shouldSetActive = input.setActive ?? true;
      const now = new Date().toISOString();

      const tx = this.db.transaction(() => {
        // Safe sequential version allocation
        const maxRow = this.db
          .prepare(
            'SELECT COALESCE(MAX(version_number), 0) as max_ver FROM template_versions WHERE template_id = ?'
          )
          .get(input.templateId) as { max_ver: number };

        const nextVersionNumber = maxRow.max_ver + 1;
        const versionId = toTemplateVersionId(`VER-${input.templateId}-V${nextVersionNumber}`);

        // If setting active, deactivate existing active flags
        if (shouldSetActive) {
          this.db
            .prepare('UPDATE template_versions SET is_active = 0 WHERE template_id = ?')
            .run(input.templateId);
        }

        const insertStmt = this.db.prepare(`
          INSERT INTO template_versions (
            version_id,
            template_id,
            version_number,
            file_name,
            sha256_hash,
            file_size_bytes,
            change_summary,
            is_active,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        insertStmt.run(
          versionId,
          input.templateId,
          nextVersionNumber,
          input.fileName,
          input.sha256Hash,
          input.fileSizeBytes,
          input.changeSummary?.trim() || null,
          shouldSetActive ? 1 : 0,
          now
        );

        // Update template_metadata
        if (shouldSetActive) {
          this.db
            .prepare(
              `
              UPDATE template_metadata
              SET active_version_id = ?,
                  file_name = ?,
                  total_versions = (SELECT count(*) FROM template_versions WHERE template_id = ?),
                  updated_at = ?
              WHERE template_id = ?
            `
            )
            .run(versionId, input.fileName, input.templateId, now, input.templateId);
        } else {
          this.db
            .prepare(
              `
              UPDATE template_metadata
              SET total_versions = (SELECT count(*) FROM template_versions WHERE template_id = ?),
                  updated_at = ?
              WHERE template_id = ?
            `
            )
            .run(input.templateId, now, input.templateId);
        }

        return {
          version_id: versionId,
          template_id: input.templateId,
          version_number: nextVersionNumber,
          file_name: input.fileName,
          sha256_hash: input.sha256Hash,
          file_size_bytes: input.fileSizeBytes,
          change_summary: input.changeSummary?.trim() || null,
          is_active: shouldSetActive ? 1 : 0,
          created_at: now,
        };
      });

      const newVersion = tx();
      return Ok(newVersion);
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: `Failed to register new version for template "${input.templateId}".`,
          details: { developerMessage: String(err) },
          isOperational: true,
          cause: err,
        })
      );
    }
  }

  /**
   * Designates a specific version as active/preferred for a logical template.
   */
  public setActiveVersion(
    templateId: TemplateId,
    versionId: TemplateVersionId
  ): Result<TemplateVersionRecord, AppError> {
    try {
      const versionRes = this.getVersionById(versionId);
      if (!versionRes.ok) {
        return versionRes;
      }
      if (!versionRes.value || versionRes.value.template_id !== templateId) {
        return Err(
          new AppError({
            code: ErrorCode.TEMPLATE_NOT_FOUND,
            userMessage: `Version "${versionId}" does not belong to template "${templateId}".`,
            isOperational: true,
          })
        );
      }

      const version = versionRes.value;
      const now = new Date().toISOString();

      const tx = this.db.transaction(() => {
        this.db
          .prepare('UPDATE template_versions SET is_active = 0 WHERE template_id = ?')
          .run(templateId);

        this.db
          .prepare('UPDATE template_versions SET is_active = 1 WHERE version_id = ?')
          .run(versionId);

        this.db
          .prepare(
            `
            UPDATE template_metadata
            SET active_version_id = ?,
                file_name = ?,
                updated_at = ?
            WHERE template_id = ?
          `
          )
          .run(versionId, version.file_name, now, templateId);
      });

      tx();

      return Ok({
        ...version,
        is_active: 1,
      });
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: `Failed to set active version "${versionId}" for template "${templateId}".`,
          details: { developerMessage: String(err) },
          isOperational: true,
          cause: err,
        })
      );
    }
  }
}
