/**
 * OpsReport Studio — Word Template Mapping Repository
 *
 * Provides transactional persistence operations for Word document field-to-target mappings:
 * - Querying mappings by template and exact version
 * - Atomic persistence of Word mapping configurations
 * - Strict destination and field uniqueness enforcement
 * - Placeholder token, paragraph, table cell, and repeating row coordinate syntax validation
 * - Preserving database consistency without touching master Word documents
 *
 * @module storage/database/repositories/word-mapping-repository
 */

import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import type {
  TemplateId,
  TemplateVersionId,
  WordFieldMappingRecord,
  WordTemplateMappingConfig,
  SaveWordMappingsInput,
  SaveWordMappingItemInput,
  WordMappingTargetType,
} from '../../../shared/types/index.ts';
import { Result, Ok, Err } from '../../../shared/types/result.ts';
import { AppError } from '../../../shared/errors/app-error.ts';
import { ErrorCode } from '../../../shared/errors/error-codes.ts';
import { DatabaseManager } from '../connection.ts';

export const WORD_PLACEHOLDER_REGEX = /^\{?[a-zA-Z0-9_#/-]+\}?$/;
export const WORD_PARAGRAPH_REGEX = /^P:?([1-9][0-9]*)$/i;
export const WORD_TABLE_CELL_REGEX = /^T([1-9][0-9]*):R([1-9][0-9]*):C([1-9][0-9]*)$/i;
export const WORD_REPEATING_ROW_REGEX =
  /^T([1-9][0-9]*):R([1-9][0-9]*):(LOOP|LOOP_ROW|\{[a-zA-Z0-9_#/-]+\})$/i;

interface WordMappingRow {
  mapping_id: string;
  template_id: string;
  version_id: string;
  mapping_type: WordMappingTargetType;
  field_id: string;
  field_label: string;
  target_coordinate: string;
  placeholder_token: string | null;
  paragraph_index: number | null;
  table_index: number | null;
  row_index: number | null;
  col_index: number | null;
  created_at: string;
  updated_at: string;
}

function rowToRecord(row: WordMappingRow): WordFieldMappingRecord {
  return {
    mappingId: row.mapping_id,
    templateId: row.template_id as TemplateId,
    versionId: row.version_id as TemplateVersionId,
    mappingType: row.mapping_type,
    fieldId: row.field_id,
    fieldLabel: row.field_label,
    targetCoordinate: row.target_coordinate,
    placeholderToken: row.placeholder_token ?? null,
    paragraphIndex: row.paragraph_index ?? null,
    tableIndex: row.table_index ?? null,
    rowIndex: row.row_index ?? null,
    colIndex: row.col_index ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class WordMappingRepository {
  private readonly db: Database.Database;

  public constructor(db?: Database.Database) {
    this.db = db ?? DatabaseManager.getInstance().getDatabase();
  }

  /**
   * Retrieves all field mappings for a specific template version.
   */
  public getMappings(
    templateId: TemplateId,
    versionId: TemplateVersionId
  ): Result<WordFieldMappingRecord[], AppError> {
    try {
      const query = `
        SELECT * FROM word_template_mappings
        WHERE template_id = ? AND version_id = ?
        ORDER BY mapping_type ASC, target_coordinate ASC
      `;

      const stmt = this.db.prepare(query);
      const rows = stmt.all(templateId, versionId) as WordMappingRow[];
      return Ok(rows.map(rowToRecord));
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: `Failed to retrieve Word mappings for template "${templateId}".`,
          cause: err,
        })
      );
    }
  }

  /**
   * Retrieves structured configuration for a specific template version.
   */
  public getMappingConfig(
    templateId: TemplateId,
    versionId: TemplateVersionId
  ): Result<WordTemplateMappingConfig | null, AppError> {
    try {
      const mappingsRes = this.getMappings(templateId, versionId);
      if (!mappingsRes.ok) {
        return Err(mappingsRes.error);
      }

      const mappings = mappingsRes.value;
      if (mappings.length === 0) {
        return Ok(null);
      }

      return Ok({
        templateId,
        versionId,
        mappings,
      });
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: `Failed to load Word mapping configuration for template "${templateId}".`,
          cause: err,
        })
      );
    }
  }

  /**
   * Validates mapping items for syntax, uniqueness, and structural conflicts.
   */
  public validateMappingItems(items: SaveWordMappingItemInput[]): Result<void, AppError> {
    const fieldSet = new Set<string>();
    const targetCoordSet = new Set<string>();

    for (const item of items) {
      if (!item.fieldId || item.fieldId.trim().length === 0) {
        return Err(
          new AppError({
            code: ErrorCode.VALIDATION_FAILED,
            userMessage: 'Field identifier cannot be blank.',
          })
        );
      }

      if (fieldSet.has(item.fieldId)) {
        return Err(
          new AppError({
            code: ErrorCode.MAPPING_INCOMPATIBLE,
            userMessage: `Duplicate field mapping: Field "${item.fieldLabel || item.fieldId}" is mapped more than once in this Word template version.`,
          })
        );
      }
      fieldSet.add(item.fieldId);

      const normCoord = item.targetCoordinate.trim();

      if (item.mappingType === 'PLACEHOLDER') {
        if (!WORD_PLACEHOLDER_REGEX.test(normCoord)) {
          return Err(
            new AppError({
              code: ErrorCode.VALIDATION_FAILED,
              userMessage: `Invalid placeholder token "${item.targetCoordinate}" for field "${item.fieldLabel}". Expected token format like "{report_date}" or "report_date".`,
            })
          );
        }
      } else if (item.mappingType === 'PARAGRAPH') {
        if (!WORD_PARAGRAPH_REGEX.test(normCoord)) {
          return Err(
            new AppError({
              code: ErrorCode.VALIDATION_FAILED,
              userMessage: `Invalid paragraph coordinate "${item.targetCoordinate}" for field "${item.fieldLabel}". Expected format like "P:1" or "P:2".`,
            })
          );
        }
      } else if (item.mappingType === 'TABLE_CELL') {
        if (!WORD_TABLE_CELL_REGEX.test(normCoord)) {
          return Err(
            new AppError({
              code: ErrorCode.VALIDATION_FAILED,
              userMessage: `Invalid table cell coordinate "${item.targetCoordinate}" for field "${item.fieldLabel}". Expected format like "T1:R2:C3".`,
            })
          );
        }
      } else if (item.mappingType === 'REPEATING_ROW') {
        if (!WORD_REPEATING_ROW_REGEX.test(normCoord)) {
          return Err(
            new AppError({
              code: ErrorCode.VALIDATION_FAILED,
              userMessage: `Invalid repeating row coordinate "${item.targetCoordinate}" for field "${item.fieldLabel}". Expected format like "T1:R2:LOOP" or "T1:R2:{#station_rows}".`,
            })
          );
        }
      } else {
        return Err(
          new AppError({
            code: ErrorCode.VALIDATION_FAILED,
            userMessage: `Unsupported mapping type "${item.mappingType}". Expected "PLACEHOLDER", "PARAGRAPH", "TABLE_CELL", or "REPEATING_ROW".`,
          })
        );
      }

      const coordKey = `${item.mappingType}:${normCoord.toUpperCase()}`;
      if (targetCoordSet.has(coordKey)) {
        return Err(
          new AppError({
            code: ErrorCode.MAPPING_INCOMPATIBLE,
            userMessage: `Conflict detected: Destination target "${normCoord}" is assigned to multiple fields.`,
          })
        );
      }
      targetCoordSet.add(coordKey);
    }

    return Ok(undefined);
  }

  /**
   * Saves or replaces mapping configurations for a specific Word template version atomically.
   */
  public saveMappings(input: SaveWordMappingsInput): Result<WordTemplateMappingConfig, AppError> {
    const valRes = this.validateMappingItems(input.mappings);
    if (!valRes.ok) {
      return Err(valRes.error);
    }

    try {
      const now = new Date().toISOString();

      const saveTx = this.db.transaction(() => {
        // 1. Delete existing mappings for this template version
        this.db
          .prepare(`DELETE FROM word_template_mappings WHERE template_id = ? AND version_id = ?`)
          .run(input.templateId, input.versionId);

        // 2. Insert new mappings
        const insertStmt = this.db.prepare(`
          INSERT INTO word_template_mappings (
            mapping_id, template_id, version_id, mapping_type,
            field_id, field_label, target_coordinate, placeholder_token,
            paragraph_index, table_index, row_index, col_index,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const m of input.mappings) {
          const mappingId = `WMAP-${crypto.randomUUID()}`;
          let pIndex: number | null = m.paragraphIndex ?? null;
          let tIndex: number | null = m.tableIndex ?? null;
          let rIndex: number | null = m.rowIndex ?? null;
          let cIndex: number | null = m.colIndex ?? null;
          let pToken: string | null = m.placeholderToken ?? null;

          // Parse coordinates if not explicitly set
          if (m.mappingType === 'PARAGRAPH') {
            const match = m.targetCoordinate.match(WORD_PARAGRAPH_REGEX);
            if (match) pIndex = parseInt(match[1], 10);
          } else if (m.mappingType === 'TABLE_CELL') {
            const match = m.targetCoordinate.match(WORD_TABLE_CELL_REGEX);
            if (match) {
              tIndex = parseInt(match[1], 10);
              rIndex = parseInt(match[2], 10);
              cIndex = parseInt(match[3], 10);
            }
          } else if (m.mappingType === 'REPEATING_ROW') {
            const match = m.targetCoordinate.match(WORD_REPEATING_ROW_REGEX);
            if (match) {
              tIndex = parseInt(match[1], 10);
              rIndex = parseInt(match[2], 10);
            }
          } else if (m.mappingType === 'PLACEHOLDER') {
            pToken = m.targetCoordinate.startsWith('{')
              ? m.targetCoordinate
              : `{${m.targetCoordinate}}`;
          }

          insertStmt.run(
            mappingId,
            input.templateId,
            input.versionId,
            m.mappingType,
            m.fieldId.trim(),
            m.fieldLabel.trim(),
            m.targetCoordinate.trim(),
            pToken,
            pIndex,
            tIndex,
            rIndex,
            cIndex,
            now,
            now
          );
        }
      });

      saveTx();

      const savedRes = this.getMappings(input.templateId, input.versionId);
      if (!savedRes.ok) {
        return Err(savedRes.error);
      }

      return Ok({
        templateId: input.templateId,
        versionId: input.versionId,
        mappings: savedRes.value,
      });
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: `Failed to save Word mapping configuration for template "${input.templateId}".`,
          cause: err,
        })
      );
    }
  }

  /**
   * Deletes all mappings for a specific template version.
   */
  public deleteMappings(
    templateId: TemplateId,
    versionId: TemplateVersionId
  ): Result<void, AppError> {
    try {
      this.db
        .prepare(`DELETE FROM word_template_mappings WHERE template_id = ? AND version_id = ?`)
        .run(templateId, versionId);

      return Ok(undefined);
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: `Failed to delete Word mappings for template "${templateId}".`,
          cause: err,
        })
      );
    }
  }
}
