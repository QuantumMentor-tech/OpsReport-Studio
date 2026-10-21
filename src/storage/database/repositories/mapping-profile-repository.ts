/**
 * OpsReport Studio — Mapping Profile Repository
 *
 * Implements Step 24 of the 45-step roadmap:
 * - Persistent CRUD and lifecycle operations for reusable mapping profiles.
 * - Multi-criteria listing, filtering, and template/version association.
 * - Deep profile retrieval including joined metadata and child Excel/Word field mappings.
 * - Transactional profile duplication cloning associated mappings into a new profile scope.
 * - Diagnostic validation status persistence.
 *
 * @module storage/database/repositories/mapping-profile-repository
 */

import type Database from 'better-sqlite3';
import crypto from 'node:crypto';
import type {
  MappingProfileId,
  TemplateId,
  TemplateVersionId,
  ReportCategoryId,
} from '../../../shared/types/identifiers.ts';
import {
  toMappingProfileId,
  toTemplateId,
  toTemplateVersionId,
  toReportCategoryId,
} from '../../../shared/types/identifiers.ts';
import type {
  MappingProfileRecord,
  MappingProfileWithDetails,
  CreateMappingProfileInput,
  UpdateMappingProfileInput,
  MappingProfileStatus,
  MappingValidationStatus,
} from '../../../shared/types/mapping-profile.ts';
import { Result, Ok, Err } from '../../../shared/types/result.ts';
import { AppError } from '../../../shared/errors/app-error.ts';
import { ErrorCode } from '../../../shared/errors/error-codes.ts';

interface ProfileRow {
  profile_id: string;
  profile_name: string;
  description: string | null;
  category_id: string;
  template_id: string;
  version_id: string;
  document_type: 'EXCEL_XLSX' | 'WORD_DOCX';
  status: MappingProfileStatus;
  validation_status: MappingValidationStatus;
  last_validated_at: string | null;
  validation_summary: string | null;
  created_at: string;
  updated_at: string;
  template_name?: string | null;
  category_name?: string | null;
}

export class MappingProfileRepository {
  constructor(private readonly db: Database.Database) {}

  /**
   * Transforms a database row into a strongly-typed MappingProfileRecord.
   */
  private rowToRecord(row: ProfileRow): MappingProfileRecord {
    return {
      profileId: toMappingProfileId(row.profile_id),
      profileName: row.profile_name,
      description: row.description,
      categoryId: toReportCategoryId(row.category_id),
      templateId: toTemplateId(row.template_id),
      versionId: toTemplateVersionId(row.version_id),
      documentType: row.document_type,
      status: row.status,
      validationStatus: row.validation_status,
      lastValidatedAt: row.last_validated_at,
      validationSummary: row.validation_summary,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Creates a new mapping profile.
   */
  public createProfile(input: CreateMappingProfileInput): Result<MappingProfileRecord, AppError> {
    const trimmedName = input.profileName.trim();
    if (!trimmedName) {
      return Err(
        new AppError({
          code: ErrorCode.VALIDATION_FAILED,
          userMessage: 'Please enter a valid descriptive profile name.',
        })
      );
    }

    const profileId = toMappingProfileId(
      `PRF-${input.templateId.replace(/[^a-zA-Z0-9_-]/g, '')}-${crypto.randomBytes(4).toString('hex')}`
    );
    const now = new Date().toISOString();
    const status: MappingProfileStatus = input.status || 'ACTIVE';

    try {
      this.db
        .prepare(
          `
        INSERT INTO mapping_profiles (
          profile_id, profile_name, description, category_id, template_id, version_id,
          document_type, status, validation_status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'UNCHECKED', ?, ?)
      `
        )
        .run(
          profileId,
          trimmedName,
          input.description?.trim() || null,
          input.categoryId,
          input.templateId,
          input.versionId,
          input.documentType,
          status,
          now,
          now
        );

      const row = this.db
        .prepare(`SELECT * FROM mapping_profiles WHERE profile_id = ?`)
        .get(profileId) as ProfileRow;

      return Ok(this.rowToRecord(row));
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage:
            'Unable to save the mapping profile. A profile with this name may already exist for this template version.',
          cause: err,
        })
      );
    }
  }

  /**
   * Retrieves a single mapping profile with joined template name, category name, and child mappings.
   */
  public getProfile(
    profileId: MappingProfileId
  ): Result<MappingProfileWithDetails | null, AppError> {
    try {
      const row = this.db
        .prepare(
          `
        SELECT p.*, t.template_name, c.display_name as category_name
        FROM mapping_profiles p
        LEFT JOIN template_metadata t ON p.template_id = t.template_id
        LEFT JOIN report_categories c ON p.category_id = c.category_id
        WHERE p.profile_id = ?
      `
        )
        .get(profileId) as ProfileRow | undefined;

      if (!row) {
        return Ok(null);
      }

      const record = this.rowToRecord(row);
      const details: MappingProfileWithDetails = {
        ...record,
        templateName: row.template_name || undefined,
        categoryName: row.category_name || undefined,
      };

      if (row.document_type === 'EXCEL_XLSX') {
        const excelRows = this.db
          .prepare(
            `
          SELECT * FROM excel_template_mappings
          WHERE profile_id = ? OR (profile_id IS NULL AND template_id = ? AND version_id = ?)
          ORDER BY worksheet_name ASC, mapping_type ASC, target_coordinate ASC
        `
          )
          .all(profileId, row.template_id, row.version_id) as Array<{
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
        }>;

        details.excelMappings = excelRows.map(r => ({
          mappingId: r.mapping_id,
          templateId: toTemplateId(r.template_id),
          versionId: toTemplateVersionId(r.version_id),
          worksheetName: r.worksheet_name,
          headerRowNumber: r.header_row_number ?? null,
          mappingType: r.mapping_type,
          fieldId: r.field_id,
          fieldLabel: r.field_label,
          targetCoordinate: r.target_coordinate,
          columnHeader: r.column_header ?? null,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        }));
      } else {
        const wordRows = this.db
          .prepare(
            `
          SELECT * FROM word_template_mappings
          WHERE profile_id = ? OR (profile_id IS NULL AND template_id = ? AND version_id = ?)
          ORDER BY mapping_type ASC, target_coordinate ASC
        `
          )
          .all(profileId, row.template_id, row.version_id) as Array<{
          mapping_id: string;
          template_id: string;
          version_id: string;
          mapping_type: 'PLACEHOLDER' | 'PARAGRAPH' | 'TABLE_CELL' | 'REPEATING_ROW';
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
        }>;

        details.wordMappings = wordRows.map(r => ({
          mappingId: r.mapping_id,
          templateId: toTemplateId(r.template_id),
          versionId: toTemplateVersionId(r.version_id),
          mappingType: r.mapping_type,
          fieldId: r.field_id,
          fieldLabel: r.field_label,
          targetCoordinate: r.target_coordinate,
          placeholderToken: r.placeholder_token ?? undefined,
          paragraphIndex: r.paragraph_index ?? undefined,
          tableIndex: r.table_index ?? undefined,
          rowIndex: r.row_index ?? undefined,
          colIndex: r.col_index ?? undefined,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        }));
      }

      return Ok(details);
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: `Unable to load mapping profile ${profileId}.`,
          cause: err,
        })
      );
    }
  }

  /**
   * Retrieves the active profile for a specific template version.
   */
  public getProfileByTemplateVersion(
    templateId: TemplateId,
    versionId: TemplateVersionId
  ): Result<MappingProfileWithDetails | null, AppError> {
    try {
      const row = this.db
        .prepare(
          `
        SELECT profile_id FROM mapping_profiles
        WHERE template_id = ? AND version_id = ? AND status = 'ACTIVE'
        ORDER BY created_at ASC LIMIT 1
      `
        )
        .get(templateId, versionId) as { profile_id: string } | undefined;

      if (!row) {
        return Ok(null);
      }

      return this.getProfile(toMappingProfileId(row.profile_id));
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: 'Unable to find an active profile for this template version.',
          cause: err,
        })
      );
    }
  }

  /**
   * Lists mapping profiles matching optional criteria.
   */
  public listProfiles(filter?: {
    categoryId?: ReportCategoryId;
    templateId?: TemplateId;
    versionId?: TemplateVersionId;
    status?: MappingProfileStatus;
  }): Result<MappingProfileWithDetails[], AppError> {
    try {
      const clauses: string[] = [];
      const params: unknown[] = [];

      if (filter?.categoryId) {
        clauses.push('p.category_id = ?');
        params.push(filter.categoryId);
      }
      if (filter?.templateId) {
        clauses.push('p.template_id = ?');
        params.push(filter.templateId);
      }
      if (filter?.versionId) {
        clauses.push('p.version_id = ?');
        params.push(filter.versionId);
      }
      if (filter?.status) {
        clauses.push('p.status = ?');
        params.push(filter.status);
      }

      const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
      const rows = this.db
        .prepare(
          `
        SELECT p.*, t.template_name, c.display_name as category_name
        FROM mapping_profiles p
        LEFT JOIN template_metadata t ON p.template_id = t.template_id
        LEFT JOIN report_categories c ON p.category_id = c.category_id
        ${whereClause}
        ORDER BY p.created_at DESC
      `
        )
        .all(...params) as ProfileRow[];

      const results = rows.map(r => {
        const record = this.rowToRecord(r);
        return {
          ...record,
          templateName: r.template_name || undefined,
          categoryName: r.category_name || undefined,
        };
      });

      return Ok(results);
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: 'Unable to retrieve mapping profiles.',
          cause: err,
        })
      );
    }
  }

  /**
   * Updates an existing profile's metadata.
   */
  public updateProfile(
    profileId: MappingProfileId,
    updates: UpdateMappingProfileInput
  ): Result<MappingProfileRecord, AppError> {
    const existing = this.getProfile(profileId);
    if (!existing.ok) return existing;
    if (!existing.value) {
      return Err(
        new AppError({
          code: ErrorCode.MAPPING_PROFILE_NOT_FOUND,
          userMessage: 'The specified mapping profile does not exist.',
        })
      );
    }

    const now = new Date().toISOString();
    const newName = updates.profileName?.trim() || existing.value.profileName;
    const newDesc =
      updates.description !== undefined
        ? updates.description?.trim() || null
        : existing.value.description;
    const newStatus = updates.status || existing.value.status;

    try {
      this.db
        .prepare(
          `
        UPDATE mapping_profiles
        SET profile_name = ?,
            description = ?,
            status = ?,
            updated_at = ?
        WHERE profile_id = ?
      `
        )
        .run(newName, newDesc, newStatus, now, profileId);

      const updated = this.db
        .prepare(`SELECT * FROM mapping_profiles WHERE profile_id = ?`)
        .get(profileId) as ProfileRow;

      return Ok(this.rowToRecord(updated));
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: 'Unable to update profile details.',
          cause: err,
        })
      );
    }
  }

  /**
   * Persists the diagnostic validation status and summary for a profile.
   */
  public updateValidationStatus(
    profileId: MappingProfileId,
    status: MappingValidationStatus,
    summary: string
  ): Result<void, AppError> {
    try {
      const now = new Date().toISOString();
      this.db
        .prepare(
          `
        UPDATE mapping_profiles
        SET validation_status = ?,
            last_validated_at = ?,
            validation_summary = ?,
            updated_at = ?
        WHERE profile_id = ?
      `
        )
        .run(status, now, summary, now, profileId);

      return Ok(undefined);
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: 'Unable to record validation results.',
          cause: err,
        })
      );
    }
  }

  /**
   * Duplicates an existing profile and clones all associated mappings inside an atomic transaction.
   */
  public duplicateProfile(
    profileId: MappingProfileId,
    newProfileName: string
  ): Result<MappingProfileWithDetails, AppError> {
    const existingRes = this.getProfile(profileId);
    if (!existingRes.ok) return existingRes;
    const existing = existingRes.value;
    if (!existing) {
      return Err(
        new AppError({
          code: ErrorCode.MAPPING_PROFILE_NOT_FOUND,
          userMessage: 'The source profile does not exist.',
        })
      );
    }

    const trimmedName = newProfileName.trim();
    if (!trimmedName) {
      return Err(
        new AppError({
          code: ErrorCode.VALIDATION_FAILED,
          userMessage: 'Please provide a name for the duplicated profile.',
        })
      );
    }

    const newProfileId = toMappingProfileId(
      `PRF-${existing.templateId.replace(/[^a-zA-Z0-9_-]/g, '')}-${crypto.randomBytes(4).toString('hex')}`
    );
    const now = new Date().toISOString();

    const tx = this.db.transaction(() => {
      // 1. Insert new profile
      this.db
        .prepare(
          `
        INSERT INTO mapping_profiles (
          profile_id, profile_name, description, category_id, template_id, version_id,
          document_type, status, validation_status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 'UNCHECKED', ?, ?)
      `
        )
        .run(
          newProfileId,
          trimmedName,
          `Cloned from ${existing.profileName}`,
          existing.categoryId,
          existing.templateId,
          existing.versionId,
          existing.documentType,
          now,
          now
        );

      // 2. Clone Excel mappings if applicable
      if (existing.documentType === 'EXCEL_XLSX' && existing.excelMappings) {
        const insertExcel = this.db.prepare(`
          INSERT INTO excel_template_mappings (
            mapping_id, template_id, version_id, worksheet_name, header_row_number,
            mapping_type, field_id, field_label, target_coordinate, column_header,
            profile_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const m of existing.excelMappings) {
          const newMappingId = `MAP-${existing.templateId}-${crypto.randomBytes(4).toString('hex')}`;
          insertExcel.run(
            newMappingId,
            existing.templateId,
            existing.versionId,
            m.worksheetName,
            m.headerRowNumber ?? null,
            m.mappingType,
            m.fieldId,
            m.fieldLabel,
            m.targetCoordinate,
            m.columnHeader ?? null,
            newProfileId,
            now,
            now
          );
        }
      }

      // 3. Clone Word mappings if applicable
      if (existing.documentType === 'WORD_DOCX' && existing.wordMappings) {
        const insertWord = this.db.prepare(`
          INSERT INTO word_template_mappings (
            mapping_id, template_id, version_id, mapping_type, field_id,
            field_label, target_coordinate, placeholder_token, paragraph_index,
            table_index, row_index, col_index, profile_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const m of existing.wordMappings) {
          const newMappingId = `WMAP-${existing.templateId}-${crypto.randomBytes(4).toString('hex')}`;
          insertWord.run(
            newMappingId,
            existing.templateId,
            existing.versionId,
            m.mappingType,
            m.fieldId,
            m.fieldLabel,
            m.targetCoordinate,
            m.placeholderToken ?? null,
            m.paragraphIndex ?? null,
            m.tableIndex ?? null,
            m.rowIndex ?? null,
            m.colIndex ?? null,
            newProfileId,
            now,
            now
          );
        }
      }
    });

    try {
      tx();
      return this.getProfile(newProfileId) as Result<MappingProfileWithDetails, AppError>;
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: 'Unable to duplicate profile configuration.',
          cause: err,
        })
      );
    }
  }

  /**
   * Deletes a mapping profile and its associated mappings inside an atomic transaction.
   */
  public deleteProfile(profileId: MappingProfileId): Result<void, AppError> {
    const tx = this.db.transaction(() => {
      this.db.prepare(`DELETE FROM excel_template_mappings WHERE profile_id = ?`).run(profileId);
      this.db.prepare(`DELETE FROM word_template_mappings WHERE profile_id = ?`).run(profileId);
      this.db.prepare(`DELETE FROM mapping_profiles WHERE profile_id = ?`).run(profileId);
    });

    try {
      tx();
      return Ok(undefined);
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.PERSISTENCE_FAILED,
          userMessage: 'Unable to delete mapping profile.',
          cause: err,
        })
      );
    }
  }
}
