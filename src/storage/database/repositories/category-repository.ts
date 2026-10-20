/**
 * OpsReport Studio — Authoritative Report Category Persistence Repository
 *
 * Implements centralized relational persistence for report categories with:
 * - Deterministic retrieval (all or active-only for workflows)
 * - Retrieval by stable nominal identifier
 * - Validated creation of custom categories
 * - Safe updating of editable metadata without changing stable IDs
 * - Lifecycle state transitions (activation / deactivation)
 * - Safe deletion restriction (blocking deletion of built-in categories or categories referenced by templates)
 *
 * @module storage/database/repositories/category-repository
 */

import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import type {
  ReportCategoryRecord,
  CreateCategoryInput,
  UpdateCategoryInput,
  ReportDocumentFormat,
} from '../types.ts';
import { ReportCategoryId, toReportCategoryId } from '../../../shared/types/identifiers.ts';
import { Result, Ok, Err } from '../../../shared/types/result.ts';
import { AppError } from '../../../shared/errors/app-error.ts';
import { ErrorCode } from '../../../shared/errors/error-codes.ts';

/**
 * The confirmed 7 initial built-in operational report category identifiers.
 * Built-in categories cannot be deleted, but may have display metadata updated or be deactivated.
 */
export const BUILTIN_CATEGORY_IDS: ReadonlySet<string> = new Set([
  'RPT-INCIDENT',
  'RPT-STATION-LIGHT',
  'RPT-FAN',
  'RPT-POLE-LIGHT',
  'RPT-FIRE-EXTINGUISHER',
  'RPT-PILLAR',
  'RPT-FENCE',
]);

const VALID_FORMATS: ReadonlySet<ReportDocumentFormat> = new Set(['EXCEL_XLSX', 'WORD_DOCX']);

export class CategoryRepository {
  constructor(private readonly db: Database.Database) {}

  /**
   * Retrieves all registered report categories, optionally filtered by active status.
   */
  public getAllCategories(options?: {
    activeOnly?: boolean;
  }): Result<ReportCategoryRecord[], AppError> {
    try {
      const activeFilter = options?.activeOnly ? 'WHERE is_active = 1' : '';
      const stmt = this.db.prepare(`
        SELECT category_id, display_name, default_format, is_multi_station, description,
               COALESCE(is_active, 1) as is_active, created_at, COALESCE(updated_at, created_at) as updated_at
        FROM report_categories
        ${activeFilter}
        ORDER BY display_name ASC
      `);

      const rows = stmt.all() as ReportCategoryRecord[];
      const typed = rows.map(r => ({
        ...r,
        category_id: toReportCategoryId(r.category_id),
      }));

      return Ok(typed);
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: 'Failed to retrieve report categories from database.',
          details: {
            developerMessage: `Category query failed: ${err instanceof Error ? err.message : String(err)}`,
          },
          isOperational: true,
          cause: err,
        })
      );
    }
  }

  /**
   * Retrieves a single report category by its stable identifier.
   */
  public getCategoryById(
    categoryId: ReportCategoryId
  ): Result<ReportCategoryRecord | null, AppError> {
    try {
      const stmt = this.db.prepare(`
        SELECT category_id, display_name, default_format, is_multi_station, description,
               COALESCE(is_active, 1) as is_active, created_at, COALESCE(updated_at, created_at) as updated_at
        FROM report_categories
        WHERE category_id = ?
      `);

      const row = stmt.get(categoryId) as ReportCategoryRecord | undefined;
      return Ok(row ? { ...row, category_id: toReportCategoryId(row.category_id) } : null);
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: 'Failed to retrieve category by identifier.',
          details: {
            developerMessage: `Category lookup failed for ${categoryId}: ${err instanceof Error ? err.message : String(err)}`,
          },
          isOperational: true,
          cause: err,
        })
      );
    }
  }

  /**
   * Creates a new report category with validation and uniqueness enforcement.
   */
  public createCategory(input: CreateCategoryInput): Result<ReportCategoryRecord, AppError> {
    try {
      const trimmedName = input.displayName?.trim();
      if (!trimmedName || trimmedName.length > 150) {
        return Err(
          new AppError({
            code: ErrorCode.VALIDATION_FAILED,
            userMessage: 'Category display name must be between 1 and 150 characters.',
            isOperational: true,
          })
        );
      }

      if (!VALID_FORMATS.has(input.defaultFormat)) {
        return Err(
          new AppError({
            code: ErrorCode.VALIDATION_FAILED,
            userMessage: 'Default document format must be either EXCEL_XLSX or WORD_DOCX.',
            isOperational: true,
          })
        );
      }

      const trimmedDescription = input.description?.trim();
      if (!trimmedDescription) {
        return Err(
          new AppError({
            code: ErrorCode.VALIDATION_FAILED,
            userMessage: 'Category description must not be empty.',
            isOperational: true,
          })
        );
      }

      // Check case-insensitive display name uniqueness
      const existingName = this.db
        .prepare(
          'SELECT category_id FROM report_categories WHERE LOWER(TRIM(display_name)) = LOWER(?)'
        )
        .get(trimmedName) as { category_id: string } | undefined;
      if (existingName) {
        return Err(
          new AppError({
            code: ErrorCode.VALIDATION_FAILED,
            userMessage: `A report category named "${trimmedName}" already exists. Category names must be unique.`,
            isOperational: true,
          })
        );
      }

      // Generate or normalize stable category identifier
      let categoryId = input.categoryId;
      if (!categoryId) {
        const slug = trimmedName
          .toUpperCase()
          .replace(/[^A-Z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 30);
        categoryId = toReportCategoryId(
          `RPT-${slug}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`
        );
      }

      // Verify category_id uniqueness
      const existingId = this.db
        .prepare('SELECT category_id FROM report_categories WHERE category_id = ?')
        .get(categoryId) as { category_id: string } | undefined;
      if (existingId) {
        return Err(
          new AppError({
            code: ErrorCode.VALIDATION_FAILED,
            userMessage: `Category identifier "${categoryId}" is already in use.`,
            isOperational: true,
          })
        );
      }

      const now = new Date().toISOString();
      const isMultiStation = input.isMultiStation !== false ? 1 : 0;
      const isActive = input.isActive !== false ? 1 : 0;

      const stmt = this.db.prepare(`
        INSERT INTO report_categories (
          category_id,
          display_name,
          default_format,
          is_multi_station,
          description,
          is_active,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        categoryId,
        trimmedName,
        input.defaultFormat,
        isMultiStation,
        trimmedDescription,
        isActive,
        now,
        now
      );

      return Ok({
        category_id: categoryId,
        display_name: trimmedName,
        default_format: input.defaultFormat,
        is_multi_station: isMultiStation,
        description: trimmedDescription,
        is_active: isActive,
        created_at: now,
        updated_at: now,
      });
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: 'Failed to create report category in database.',
          details: {
            developerMessage: `Category creation failed: ${err instanceof Error ? err.message : String(err)}`,
          },
          isOperational: true,
          cause: err,
        })
      );
    }
  }

  /**
   * Updates editable metadata of an existing report category without modifying stable ID.
   */
  public updateCategory(
    categoryId: ReportCategoryId,
    input: UpdateCategoryInput
  ): Result<ReportCategoryRecord, AppError> {
    try {
      const existing = this.getCategoryById(categoryId);
      if (!existing.ok) {
        return existing;
      }
      if (!existing.value) {
        return Err(
          new AppError({
            code: ErrorCode.VALIDATION_FAILED,
            userMessage: `Report category "${categoryId}" does not exist.`,
            isOperational: true,
          })
        );
      }

      const current = existing.value;

      let displayName = current.display_name;
      if (input.displayName !== undefined) {
        const trimmed = input.displayName.trim();
        if (!trimmed || trimmed.length > 150) {
          return Err(
            new AppError({
              code: ErrorCode.VALIDATION_FAILED,
              userMessage: 'Category display name must be between 1 and 150 characters.',
              isOperational: true,
            })
          );
        }

        // Uniqueness check if display name changed
        if (trimmed.toLowerCase() !== current.display_name.toLowerCase()) {
          const duplicate = this.db
            .prepare(
              'SELECT category_id FROM report_categories WHERE LOWER(TRIM(display_name)) = LOWER(?) AND category_id != ?'
            )
            .get(trimmed, categoryId) as { category_id: string } | undefined;

          if (duplicate) {
            return Err(
              new AppError({
                code: ErrorCode.VALIDATION_FAILED,
                userMessage: `A report category named "${trimmed}" already exists. Category names must be unique.`,
                isOperational: true,
              })
            );
          }
        }
        displayName = trimmed;
      }

      let defaultFormat = current.default_format;
      if (input.defaultFormat !== undefined) {
        if (!VALID_FORMATS.has(input.defaultFormat)) {
          return Err(
            new AppError({
              code: ErrorCode.VALIDATION_FAILED,
              userMessage: 'Default document format must be either EXCEL_XLSX or WORD_DOCX.',
              isOperational: true,
            })
          );
        }
        defaultFormat = input.defaultFormat;
      }

      let description = current.description;
      if (input.description !== undefined) {
        const trimmedDesc = input.description.trim();
        if (!trimmedDesc) {
          return Err(
            new AppError({
              code: ErrorCode.VALIDATION_FAILED,
              userMessage: 'Category description must not be empty.',
              isOperational: true,
            })
          );
        }
        description = trimmedDesc;
      }

      const isMultiStation =
        input.isMultiStation !== undefined
          ? input.isMultiStation
            ? 1
            : 0
          : current.is_multi_station;
      const isActive = input.isActive !== undefined ? (input.isActive ? 1 : 0) : current.is_active;
      const now = new Date().toISOString();

      const stmt = this.db.prepare(`
        UPDATE report_categories
        SET display_name = ?,
            default_format = ?,
            is_multi_station = ?,
            description = ?,
            is_active = ?,
            updated_at = ?
        WHERE category_id = ?
      `);

      stmt.run(displayName, defaultFormat, isMultiStation, description, isActive, now, categoryId);

      return Ok({
        category_id: categoryId,
        display_name: displayName,
        default_format: defaultFormat,
        is_multi_station: isMultiStation,
        description,
        is_active: isActive,
        created_at: current.created_at,
        updated_at: now,
      });
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: 'Failed to update report category in database.',
          details: {
            developerMessage: `Category update failed for ${categoryId}: ${err instanceof Error ? err.message : String(err)}`,
          },
          isOperational: true,
          cause: err,
        })
      );
    }
  }

  /**
   * Sets the active lifecycle status of a report category.
   */
  public setCategoryActiveStatus(
    categoryId: ReportCategoryId,
    isActive: boolean
  ): Result<ReportCategoryRecord, AppError> {
    return this.updateCategory(categoryId, { isActive });
  }

  /**
   * Safely deletes a custom category if it is not built-in and not referenced by any templates.
   */
  public deleteCategory(categoryId: ReportCategoryId): Result<boolean, AppError> {
    try {
      // Rule 1: Built-in categories cannot be deleted
      if (BUILTIN_CATEGORY_IDS.has(categoryId)) {
        return Err(
          new AppError({
            code: ErrorCode.VALIDATION_FAILED,
            userMessage:
              'Built-in system report categories cannot be deleted. You may deactivate the category instead.',
            isOperational: true,
          })
        );
      }

      // Rule 2: Verify category exists
      const existing = this.getCategoryById(categoryId);
      if (!existing.ok) {
        return existing;
      }
      if (!existing.value) {
        return Err(
          new AppError({
            code: ErrorCode.VALIDATION_FAILED,
            userMessage: `Report category "${categoryId}" does not exist.`,
            isOperational: true,
          })
        );
      }

      // Rule 3: Check if any template_metadata references this category
      const templateCountRow = this.db
        .prepare('SELECT count(*) as count FROM template_metadata WHERE category_id = ?')
        .get(categoryId) as { count: number } | undefined;

      const templateCount = templateCountRow?.count ?? 0;
      if (templateCount > 0) {
        return Err(
          new AppError({
            code: ErrorCode.VALIDATION_FAILED,
            userMessage: `Category cannot be deleted because it is referenced by ${templateCount} template(s). Remove or reassign the templates first, or deactivate the category.`,
            isOperational: true,
          })
        );
      }

      // Rule 4: Check if any report_sessions references this category
      const sessionCountRow = this.db
        .prepare('SELECT count(*) as count FROM report_sessions WHERE category_id = ?')
        .get(categoryId) as { count: number } | undefined;

      const sessionCount = sessionCountRow?.count ?? 0;
      if (sessionCount > 0) {
        return Err(
          new AppError({
            code: ErrorCode.VALIDATION_FAILED,
            userMessage: `Category cannot be deleted because it is referenced by ${sessionCount} report session(s). Deactivate the category instead to preserve historical records.`,
            isOperational: true,
          })
        );
      }

      const stmt = this.db.prepare('DELETE FROM report_categories WHERE category_id = ?');
      const info = stmt.run(categoryId);

      return Ok(info.changes > 0);
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: 'Failed to delete report category from database.',
          details: {
            developerMessage: `Category delete failed for ${categoryId}: ${err instanceof Error ? err.message : String(err)}`,
          },
          isOperational: true,
          cause: err,
        })
      );
    }
  }

  /**
   * Returns total registered categories count, optionally filtered by active status.
   */
  public getCategoryCount(activeOnly?: boolean): Result<number, AppError> {
    try {
      const activeFilter = activeOnly ? 'WHERE is_active = 1' : '';
      const row = this.db
        .prepare(`SELECT count(*) as count FROM report_categories ${activeFilter}`)
        .get() as {
        count: number;
      };
      return Ok(row.count);
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: 'Failed to count report categories.',
          isOperational: true,
          cause: err,
        })
      );
    }
  }
}
