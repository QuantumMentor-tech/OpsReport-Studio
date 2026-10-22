/**
 * OpsReport Studio — Template Designer Draft Repository (Step 25)
 *
 * Implements persistent SQLite storage and lifecycle management for in-app template
 * designer drafts:
 * - Creates, retrieves, lists, updates, and deletes recoverable design drafts
 * - Serializes and deserializes versioned structured design models
 * - Links drafts optionally to report categories and target template IDs
 * - Ensures complete isolation from protected master templates in the vault
 *
 * @module storage/database/repositories/template-designer-repository
 */

import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import type {
  DesignerDocumentType,
  DesignerDraftRecord,
  DesignerDraftSummary,
  CreateDesignerDraftInput,
  UpdateDesignerDraftInput,
} from '../../../shared/types/template-designer.ts';
import { CURRENT_DESIGN_SCHEMA_VERSION } from '../../../shared/types/template-designer.ts';
import { Result, Ok, Err } from '../../../shared/types/result.ts';
import { AppError } from '../../../shared/errors/app-error.ts';
import { ErrorCode } from '../../../shared/errors/error-codes.ts';

export class TemplateDesignerRepository {
  private readonly db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Creates a new recoverable template designer draft.
   */
  public createDraft(input: CreateDesignerDraftInput): Result<DesignerDraftRecord, AppError> {
    try {
      const name = input.name?.trim();
      if (!name) {
        return Err(
          new AppError({
            code: ErrorCode.VALIDATION_FAILED,
            userMessage: 'Draft template name cannot be empty.',
            isOperational: true,
          })
        );
      }

      if (name.length > 150) {
        return Err(
          new AppError({
            code: ErrorCode.VALIDATION_FAILED,
            userMessage: 'Draft template name cannot exceed 150 characters.',
            isOperational: true,
          })
        );
      }

      if (input.documentType !== 'EXCEL_WORKBOOK' && input.documentType !== 'WORD_DOCUMENT') {
        return Err(
          new AppError({
            code: ErrorCode.VALIDATION_FAILED,
            userMessage: `Unsupported draft document type: "${input.documentType}".`,
            isOperational: true,
          })
        );
      }

      if (input.categoryId) {
        const catRow = this.db
          .prepare(`SELECT category_id FROM report_categories WHERE category_id = ?`)
          .get(input.categoryId);
        if (!catRow) {
          return Err(
            new AppError({
              code: ErrorCode.VALIDATION_FAILED,
              userMessage: `Referenced category "${input.categoryId}" does not exist.`,
              isOperational: true,
            })
          );
        }
      }

      if (input.targetTemplateId) {
        const tplRow = this.db
          .prepare(`SELECT template_id FROM template_metadata WHERE template_id = ?`)
          .get(input.targetTemplateId);
        if (!tplRow) {
          return Err(
            new AppError({
              code: ErrorCode.VALIDATION_FAILED,
              userMessage: `Referenced target template "${input.targetTemplateId}" does not exist.`,
              isOperational: true,
            })
          );
        }
      }

      const draftId = crypto.randomUUID();
      const now = new Date().toISOString();
      const serializedDefinition = JSON.stringify(input.designDefinition);

      const stmt = this.db.prepare(`
        INSERT INTO template_design_drafts (
          draft_id,
          name,
          description,
          document_type,
          category_id,
          target_template_id,
          design_schema_version,
          design_definition,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        draftId,
        name,
        input.description ? input.description.trim() : null,
        input.documentType,
        input.categoryId || null,
        input.targetTemplateId || null,
        CURRENT_DESIGN_SCHEMA_VERSION,
        serializedDefinition,
        now,
        now
      );

      const created = this.getDraft(draftId);
      if (!created.ok || !created.value) {
        return Err(
          new AppError({
            code: ErrorCode.PERSISTENCE_FAILED,
            userMessage: 'Failed to retrieve draft immediately after creation.',
            isOperational: true,
          })
        );
      }

      return Ok(created.value);
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: 'Failed to create template designer draft.',
          details: { error: String(err) },
          cause: err,
        })
      );
    }
  }

  /**
   * Retrieves a single designer draft by ID.
   */
  public getDraft(draftId: string): Result<DesignerDraftRecord | null, AppError> {
    try {
      const stmt = this.db.prepare(`
        SELECT
          draft_id,
          name,
          description,
          document_type,
          category_id,
          target_template_id,
          design_schema_version,
          design_definition,
          created_at,
          updated_at
        FROM template_design_drafts
        WHERE draft_id = ?
      `);

      const row = stmt.get(draftId) as DesignerDraftRecord | undefined;
      return Ok(row ?? null);
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: 'Failed to fetch template designer draft.',
          details: { draftId, error: String(err) },
          cause: err,
        })
      );
    }
  }

  /**
   * Lists designer draft summaries with optional documentType and categoryId filters.
   */
  public listDrafts(
    documentType?: DesignerDocumentType,
    categoryId?: string
  ): Result<DesignerDraftSummary[], AppError> {
    try {
      let sql = `
        SELECT
          d.draft_id as draftId,
          d.name,
          d.description,
          d.document_type as documentType,
          d.category_id as categoryId,
          c.display_name as categoryName,
          d.target_template_id as targetTemplateId,
          d.updated_at as updatedAt,
          d.created_at as createdAt
        FROM template_design_drafts d
        LEFT JOIN report_categories c ON d.category_id = c.category_id
        WHERE 1=1
      `;
      const params: unknown[] = [];

      if (documentType) {
        sql += ` AND d.document_type = ?`;
        params.push(documentType);
      }

      if (categoryId) {
        sql += ` AND d.category_id = ?`;
        params.push(categoryId);
      }

      sql += ` ORDER BY d.updated_at DESC`;

      const stmt = this.db.prepare(sql);
      const rows = stmt.all(...params) as DesignerDraftSummary[];
      return Ok(rows);
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: 'Failed to list template designer drafts.',
          details: { error: String(err) },
          cause: err,
        })
      );
    }
  }

  /**
   * Updates an existing template designer draft.
   */
  public updateDraft(
    draftId: string,
    input: UpdateDesignerDraftInput
  ): Result<DesignerDraftRecord, AppError> {
    try {
      const existing = this.getDraft(draftId);
      if (!existing.ok) {
        return existing;
      }
      if (!existing.value) {
        return Err(
          new AppError({
            code: ErrorCode.TEMPLATE_NOT_FOUND,
            userMessage: `Template designer draft "${draftId}" not found.`,
            isOperational: true,
          })
        );
      }

      const updates: string[] = [];
      const params: unknown[] = [];

      if (input.name !== undefined) {
        const trimmed = input.name.trim();
        if (trimmed.length === 0) {
          return Err(
            new AppError({
              code: ErrorCode.VALIDATION_FAILED,
              userMessage: 'Draft name cannot be empty.',
              isOperational: true,
            })
          );
        }
        if (trimmed.length > 150) {
          return Err(
            new AppError({
              code: ErrorCode.VALIDATION_FAILED,
              userMessage: 'Draft name cannot exceed 150 characters.',
              isOperational: true,
            })
          );
        }
        updates.push('name = ?');
        params.push(trimmed);
      }

      if (input.description !== undefined) {
        updates.push('description = ?');
        params.push(input.description ? input.description.trim() : null);
      }

      if (input.categoryId !== undefined) {
        if (input.categoryId) {
          const catRow = this.db
            .prepare(`SELECT category_id FROM report_categories WHERE category_id = ?`)
            .get(input.categoryId);
          if (!catRow) {
            return Err(
              new AppError({
                code: ErrorCode.VALIDATION_FAILED,
                userMessage: `Referenced category "${input.categoryId}" does not exist.`,
                isOperational: true,
              })
            );
          }
        }
        updates.push('category_id = ?');
        params.push(input.categoryId || null);
      }

      if (input.targetTemplateId !== undefined) {
        if (input.targetTemplateId) {
          const tplRow = this.db
            .prepare(`SELECT template_id FROM template_metadata WHERE template_id = ?`)
            .get(input.targetTemplateId);
          if (!tplRow) {
            return Err(
              new AppError({
                code: ErrorCode.VALIDATION_FAILED,
                userMessage: `Referenced target template "${input.targetTemplateId}" does not exist.`,
                isOperational: true,
              })
            );
          }
        }
        updates.push('target_template_id = ?');
        params.push(input.targetTemplateId || null);
      }

      if (input.designDefinition !== undefined) {
        updates.push('design_definition = ?');
        params.push(JSON.stringify(input.designDefinition));
      }

      if (updates.length === 0) {
        return Ok(existing.value);
      }

      updates.push("updated_at = datetime('now')");
      params.push(draftId);

      const sql = `UPDATE template_design_drafts SET ${updates.join(', ')} WHERE draft_id = ?`;
      this.db.prepare(sql).run(...params);

      const updated = this.getDraft(draftId);
      if (!updated.ok || !updated.value) {
        return Err(
          new AppError({
            code: ErrorCode.PERSISTENCE_FAILED,
            userMessage: 'Failed to retrieve draft after update.',
            isOperational: true,
          })
        );
      }

      return Ok(updated.value);
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: 'Failed to update template designer draft.',
          details: { draftId, error: String(err) },
          cause: err,
        })
      );
    }
  }

  /**
   * Deletes a template designer draft by ID.
   */
  public deleteDraft(draftId: string): Result<boolean, AppError> {
    try {
      const stmt = this.db.prepare(`DELETE FROM template_design_drafts WHERE draft_id = ?`);
      const info = stmt.run(draftId);
      return Ok(info.changes > 0);
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: 'Failed to delete template designer draft.',
          details: { draftId, error: String(err) },
          cause: err,
        })
      );
    }
  }
}
