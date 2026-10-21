/**
 * OpsReport Studio — Excel Template Mapping Repository
 *
 * Provides transactional persistence operations for Excel field-to-target mappings:
 * - Querying mappings by template, version, and worksheet
 * - Atomic persistence of worksheet mapping configurations
 * - Strict destination and field uniqueness enforcement
 * - Cell address and column coordinate syntax validation
 * - Preserving database consistency without touching master workbook files
 *
 * @module storage/database/repositories/excel-mapping-repository
 */

import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import type {
  TemplateId,
  TemplateVersionId,
  ExcelFieldMappingRecord,
  ExcelTemplateMappingConfig,
  SaveExcelMappingsInput,
  SaveExcelMappingItemInput,
} from '../../../shared/types/index.ts';
import { Result, Ok, Err } from '../../../shared/types/result.ts';
import { AppError } from '../../../shared/errors/app-error.ts';
import { ErrorCode } from '../../../shared/errors/error-codes.ts';
import { DatabaseManager } from '../connection.ts';

export const CELL_ADDRESS_REGEX = /^[A-Z]+[1-9][0-9]*$/;
export const COLUMN_REF_REGEX = /^[A-Z]+$/;

interface ExcelMappingRow {
  mapping_id: string;
  template_id: string;
  version_id: string;
  worksheet_name: string;
  header_row_number: number | null;
  mapping_type: 'FIXED_CELL' | 'TABLE_COLUMN';
  field_id: string;
  field_label: string;
  target_coordinate: string;
  column_header: string | null;
  created_at: string;
  updated_at: string;
}

function rowToRecord(row: ExcelMappingRow): ExcelFieldMappingRecord {
  return {
    mappingId: row.mapping_id,
    templateId: row.template_id as TemplateId,
    versionId: row.version_id as TemplateVersionId,
    worksheetName: row.worksheet_name,
    headerRowNumber: row.header_row_number,
    mappingType: row.mapping_type,
    fieldId: row.field_id,
    fieldLabel: row.field_label,
    targetCoordinate: row.target_coordinate,
    columnHeader: row.column_header ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class ExcelMappingRepository {
  private readonly db: Database.Database;

  public constructor(db?: Database.Database) {
    this.db = db ?? DatabaseManager.getInstance().getDatabase();
  }

  /**
   * Retrieves all field mappings for a specific template version and optional worksheet.
   */
  public getMappings(
    templateId: TemplateId,
    versionId: TemplateVersionId,
    worksheetName?: string
  ): Result<ExcelFieldMappingRecord[], AppError> {
    try {
      let query = `
        SELECT * FROM excel_template_mappings
        WHERE template_id = ? AND version_id = ?
      `;
      const params: unknown[] = [templateId, versionId];

      if (worksheetName) {
        query += ' AND worksheet_name = ?';
        params.push(worksheetName);
      }

      query += ' ORDER BY mapping_type ASC, target_coordinate ASC';

      const stmt = this.db.prepare(query);
      const rows = stmt.all(...params) as ExcelMappingRow[];
      return Ok(rows.map(rowToRecord));
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: `Failed to retrieve Excel mappings for template "${templateId}".`,
          cause: err,
        })
      );
    }
  }

  /**
   * Retrieves a structured configuration for a specific worksheet.
   */
  public getMappingConfig(
    templateId: TemplateId,
    versionId: TemplateVersionId,
    worksheetName: string
  ): Result<ExcelTemplateMappingConfig | null, AppError> {
    try {
      const mappingsRes = this.getMappings(templateId, versionId, worksheetName);
      if (!mappingsRes.ok) {
        return Err(mappingsRes.error);
      }

      const mappings = mappingsRes.value;
      if (mappings.length === 0) {
        return Ok(null);
      }

      const headerRow = mappings[0]?.headerRowNumber ?? null;
      return Ok({
        templateId,
        versionId,
        worksheetName,
        headerRowNumber: headerRow,
        mappings,
      });
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: `Failed to load mapping configuration for worksheet "${worksheetName}".`,
          cause: err,
        })
      );
    }
  }

  /**
   * Validates mapping items for syntax, uniqueness, and structural conflicts.
   */
  public validateMappingItems(items: SaveExcelMappingItemInput[]): Result<void, AppError> {
    const fieldSet = new Set<string>();
    const fixedCoordSet = new Set<string>();
    const tableCoordSet = new Set<string>();

    for (const item of items) {
      const normCoord = item.targetCoordinate.trim().toUpperCase();

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
            userMessage: `Duplicate field mapping: Field "${item.fieldLabel || item.fieldId}" is mapped more than once in this worksheet.`,
          })
        );
      }
      fieldSet.add(item.fieldId);

      if (item.mappingType === 'FIXED_CELL') {
        if (!CELL_ADDRESS_REGEX.test(normCoord)) {
          return Err(
            new AppError({
              code: ErrorCode.VALIDATION_FAILED,
              userMessage: `Invalid cell coordinate "${item.targetCoordinate}" for field "${item.fieldLabel}". Expected standard Excel address format like "B2" or "C10".`,
            })
          );
        }
        if (fixedCoordSet.has(normCoord)) {
          return Err(
            new AppError({
              code: ErrorCode.MAPPING_INCOMPATIBLE,
              userMessage: `Conflict detected: Destination cell "${normCoord}" is assigned to multiple fields.`,
            })
          );
        }
        fixedCoordSet.add(normCoord);
      } else if (item.mappingType === 'TABLE_COLUMN') {
        if (!COLUMN_REF_REGEX.test(normCoord)) {
          return Err(
            new AppError({
              code: ErrorCode.VALIDATION_FAILED,
              userMessage: `Invalid column reference "${item.targetCoordinate}" for field "${item.fieldLabel}". Expected column letter like "A", "B", or "AA".`,
            })
          );
        }
        if (tableCoordSet.has(normCoord)) {
          return Err(
            new AppError({
              code: ErrorCode.MAPPING_INCOMPATIBLE,
              userMessage: `Conflict detected: Destination column "${normCoord}" is assigned to multiple fields.`,
            })
          );
        }
        tableCoordSet.add(normCoord);
      } else {
        return Err(
          new AppError({
            code: ErrorCode.VALIDATION_FAILED,
            userMessage: `Unsupported mapping type "${item.mappingType}". Expected "FIXED_CELL" or "TABLE_COLUMN".`,
          })
        );
      }
    }

    return Ok(undefined);
  }

  /**
   * Atomically saves or updates mappings for a specific template version and worksheet.
   * Replaces existing mappings for the worksheet within an atomic SQLite transaction.
   */
  public saveMappings(input: SaveExcelMappingsInput): Result<ExcelTemplateMappingConfig, AppError> {
    try {
      const worksheet = input.worksheetName.trim();
      if (!worksheet) {
        return Err(
          new AppError({
            code: ErrorCode.VALIDATION_FAILED,
            userMessage: 'Worksheet name must be specified.',
          })
        );
      }

      // Check template and version existence
      const tplCheck = this.db
        .prepare('SELECT template_id FROM template_metadata WHERE template_id = ?')
        .get(input.templateId);
      if (!tplCheck) {
        return Err(
          new AppError({
            code: ErrorCode.TEMPLATE_NOT_FOUND,
            userMessage: `Template "${input.templateId}" does not exist in catalog.`,
          })
        );
      }

      const verCheck = this.db
        .prepare(
          'SELECT version_id FROM template_versions WHERE version_id = ? AND template_id = ?'
        )
        .get(input.versionId, input.templateId);
      if (!verCheck) {
        return Err(
          new AppError({
            code: ErrorCode.TEMPLATE_NOT_FOUND,
            userMessage: `Version "${input.versionId}" does not belong to template "${input.templateId}".`,
          })
        );
      }

      // Validate mapping items
      const valRes = this.validateMappingItems(input.mappings);
      if (!valRes.ok) {
        return Err(valRes.error);
      }

      const headerRowNumber =
        input.headerRowNumber !== undefined &&
        input.headerRowNumber !== null &&
        input.headerRowNumber >= 1
          ? Math.floor(input.headerRowNumber)
          : null;

      const now = new Date().toISOString();

      const insertStmt = this.db.prepare(`
        INSERT INTO excel_template_mappings (
          mapping_id,
          template_id,
          version_id,
          worksheet_name,
          header_row_number,
          mapping_type,
          field_id,
          field_label,
          target_coordinate,
          column_header,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const deleteStmt = this.db.prepare(`
        DELETE FROM excel_template_mappings
        WHERE template_id = ? AND version_id = ? AND worksheet_name = ?
      `);

      // Execute transaction atomically
      const tx = this.db.transaction(() => {
        deleteStmt.run(input.templateId, input.versionId, worksheet);

        for (const item of input.mappings) {
          const mappingId = `MAP-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
          const normCoord = item.targetCoordinate.trim().toUpperCase();
          insertStmt.run(
            mappingId,
            input.templateId,
            input.versionId,
            worksheet,
            headerRowNumber,
            item.mappingType,
            item.fieldId.trim(),
            item.fieldLabel.trim(),
            normCoord,
            item.columnHeader ? item.columnHeader.trim() : null,
            now,
            now
          );
        }
      });

      tx();

      // Retrieve persisted configuration
      const savedRes = this.getMappingConfig(input.templateId, input.versionId, worksheet);
      if (!savedRes.ok) {
        return Err(savedRes.error);
      }

      return Ok(
        savedRes.value ?? {
          templateId: input.templateId,
          versionId: input.versionId,
          worksheetName: worksheet,
          headerRowNumber,
          mappings: [],
        }
      );
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: `Failed to save Excel mappings: ${err instanceof Error ? err.message : String(err)}`,
          cause: err,
        })
      );
    }
  }

  /**
   * Deletes mappings for a specific template, version, and optional worksheet.
   */
  public deleteMappings(
    templateId: TemplateId,
    versionId: TemplateVersionId,
    worksheetName?: string
  ): Result<boolean, AppError> {
    try {
      let query = 'DELETE FROM excel_template_mappings WHERE template_id = ? AND version_id = ?';
      const params: unknown[] = [templateId, versionId];

      if (worksheetName) {
        query += ' AND worksheet_name = ?';
        params.push(worksheetName);
      }

      const stmt = this.db.prepare(query);
      const res = stmt.run(...params);
      return Ok(res.changes > 0);
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: `Failed to remove Excel mappings for template "${templateId}".`,
          cause: err,
        })
      );
    }
  }
}
