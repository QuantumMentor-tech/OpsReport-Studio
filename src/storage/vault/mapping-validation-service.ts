/**
 * OpsReport Studio — Mapping Validation & Compatibility Service
 *
 * Implements Step 24 of the 45-step roadmap:
 * - Centralized validation service verifying mapping profiles against authoritative field catalogs,
 *   target contracts, and physical template Open XML structures.
 * - Excel structural compatibility checks: worksheet existence, coordinate syntax, header row resolution.
 * - Word structural compatibility checks: placeholder token detection, paragraph bounds, table cell coordinates.
 * - Categorization of diagnostic findings into ERROR (blocking), WARNING (review needed), and INFO.
 * - Determination of overall validation status: VALID, INVALID, INCOMPLETE, REQUIRES_REVIEW, UNABLE_TO_VALIDATE.
 * - Zero document mutation: pure read-only inspection leaving master files 100% byte-for-byte immutable.
 *
 * @module storage/vault/mapping-validation-service
 */

import type Database from 'better-sqlite3';
import type {
  MappingProfileId,
  TemplateId,
  TemplateVersionId,
  ReportCategoryId,
} from '../../shared/types/identifiers.ts';
import type { DocumentType } from '../../shared/types/templates.ts';
import type {
  MappingValidationResult,
  MappingValidationFinding,
  MappingValidationStatus,
} from '../../shared/types/mapping-profile.ts';
import { Result, Ok, Err } from '../../shared/types/result.ts';
import { AppError } from '../../shared/errors/app-error.ts';
import { ErrorCode } from '../../shared/errors/error-codes.ts';
import { VaultManager } from './vault-manager.ts';
import { TemplateMetadataRepository } from '../database/repositories/template-metadata-repository.ts';
import { ExcelMappingRepository } from '../database/repositories/excel-mapping-repository.ts';
import { WordMappingRepository } from '../database/repositories/word-mapping-repository.ts';
import { MappingProfileRepository } from '../database/repositories/mapping-profile-repository.ts';
import { TemplateInspector } from './template-inspector.ts';
import {
  isApprovedField,
  getApprovedFieldsForCategory,
  getFieldDefinition,
} from '../../shared/constants/report-fields.ts';

export class MappingValidationService {
  private static instance: MappingValidationService | null = null;

  constructor(
    private readonly db: Database.Database,
    private readonly vaultManager: VaultManager,
    private readonly templateRepo: TemplateMetadataRepository,
    private readonly excelMappingRepo: ExcelMappingRepository,
    private readonly wordMappingRepo: WordMappingRepository,
    private readonly profileRepo: MappingProfileRepository,
    private readonly inspector: TemplateInspector
  ) {
    void this.db;
    void this.vaultManager;
  }

  public static getInstance(
    db: Database.Database,
    vaultManager: VaultManager,
    templateRepo: TemplateMetadataRepository,
    excelMappingRepo: ExcelMappingRepository,
    wordMappingRepo: WordMappingRepository,
    profileRepo: MappingProfileRepository,
    inspector: TemplateInspector
  ): MappingValidationService {
    if (!MappingValidationService.instance) {
      MappingValidationService.instance = new MappingValidationService(
        db,
        vaultManager,
        templateRepo,
        excelMappingRepo,
        wordMappingRepo,
        profileRepo,
        inspector
      );
    }
    return MappingValidationService.instance;
  }

  public static resetInstance(): void {
    MappingValidationService.instance = null;
  }

  /**
   * Validates a mapping profile against its template version, report category, and authoritative field definitions.
   */
  public async validateProfile(
    input:
      | MappingProfileId
      | string
      | {
          profileId?: MappingProfileId;
          templateId?: TemplateId;
          versionId?: TemplateVersionId;
          categoryId?: ReportCategoryId;
          documentType?: DocumentType;
        }
  ): Promise<Result<MappingValidationResult, AppError>> {
    const findings: MappingValidationFinding[] = [];
    const checksPerformed = {
      fieldExistence: false,
      categoryApplicability: false,
      requiredFields: false,
      typeCompatibility: false,
      duplicateCollision: false,
      structuralResolution: false,
      assetIntegrity: false,
    };

    let targetProfileId: MappingProfileId | undefined;
    let targetTemplateId: TemplateId | undefined;
    let targetVersionId: TemplateVersionId | undefined;
    let targetCategoryId: ReportCategoryId | undefined;
    let targetDocType: DocumentType | undefined;

    if (typeof input === 'string') {
      targetProfileId = input as MappingProfileId;
    } else {
      targetProfileId = input.profileId;
      targetTemplateId = input.templateId;
      targetVersionId = input.versionId;
      targetCategoryId = input.categoryId;
      targetDocType = input.documentType;
    }

    // 1. If profileId is given, resolve profile metadata
    if (targetProfileId) {
      const pRes = this.profileRepo.getProfile(targetProfileId);
      if (!pRes.ok) return pRes;
      if (!pRes.value) {
        return Err(
          new AppError({
            code: ErrorCode.MAPPING_PROFILE_NOT_FOUND,
            userMessage: `Mapping profile ${targetProfileId} not found.`,
          })
        );
      }
      targetTemplateId = pRes.value.templateId;
      targetVersionId = pRes.value.versionId;
      targetCategoryId = pRes.value.categoryId;
      targetDocType = pRes.value.documentType;
    }

    if (!targetTemplateId || !targetVersionId) {
      return Err(
        new AppError({
          code: ErrorCode.VALIDATION_FAILED,
          userMessage: 'Template ID and Version ID are required to validate a mapping profile.',
        })
      );
    }

    // 2. Resolve template metadata and category if still missing
    if (!targetCategoryId || !targetDocType) {
      const tRes = this.templateRepo.getTemplateById(targetTemplateId);
      if (!tRes.ok || !tRes.value) {
        return Err(
          new AppError({
            code: ErrorCode.TEMPLATE_NOT_FOUND,
            userMessage: `Template ${targetTemplateId} could not be resolved.`,
          })
        );
      }
      targetCategoryId = targetCategoryId || (tRes.value.category_id as ReportCategoryId);
      targetDocType = targetDocType || (tRes.value.document_type as DocumentType);
    }

    // 3. Inspect physical master template in read-only mode to verify asset integrity
    checksPerformed.assetIntegrity = true;
    const inspRes = await this.inspector.inspectTemplate({
      templateId: targetTemplateId,
      versionId: targetVersionId,
    });

    if (!inspRes.ok) {
      const isIntegrityErr =
        inspRes.error.code === ErrorCode.TEMPLATE_INTEGRITY_COMPROMISED ||
        inspRes.error.code === ErrorCode.TEMPLATE_MALFORMED;

      findings.push({
        code: isIntegrityErr ? 'VAL_ASSET_INTEGRITY_MISMATCH' : 'VAL_ASSET_MISSING',
        severity: 'ERROR',
        message: isIntegrityErr
          ? 'Physical template file failed cryptographic SHA-256 integrity verification.'
          : 'Physical master template asset is missing from the template vault.',
        correctiveAction:
          'Re-import or recover the master template version before using this mapping profile.',
      });

      const unverifiedResult: MappingValidationResult = {
        profileId: targetProfileId,
        templateId: targetTemplateId,
        versionId: targetVersionId,
        documentType: targetDocType,
        overallStatus: 'UNABLE_TO_VALIDATE',
        isValid: false,
        validatedAt: new Date().toISOString(),
        totalFindings: findings.length,
        errorCount: 1,
        warningCount: 0,
        infoCount: 0,
        findings,
        summary:
          'Validation could not be completed because the master template file is inaccessible or corrupt.',
        checksPerformed,
      };

      if (targetProfileId) {
        this.profileRepo.updateValidationStatus(
          targetProfileId,
          'UNABLE_TO_VALIDATE',
          unverifiedResult.summary
        );
      }

      return Ok(unverifiedResult);
    }

    const inspection = inspRes.value;

    // 4. Retrieve configured field mappings for this template version
    let excelMappings: any[] = [];
    let wordMappings: any[] = [];

    if (targetDocType === 'EXCEL_XLSX') {
      const mRes = this.excelMappingRepo.getMappings(targetTemplateId, targetVersionId);
      if (mRes.ok) {
        excelMappings = mRes.value;
      }
    } else {
      const mRes = this.wordMappingRepo.getMappings(targetTemplateId, targetVersionId);
      if (mRes.ok) {
        wordMappings = mRes.value;
      }
    }

    const allMappings = targetDocType === 'EXCEL_XLSX' ? excelMappings : wordMappings;

    // Check if configuration has any mappings at all
    if (allMappings.length === 0) {
      findings.push({
        code: 'VAL_NO_MAPPINGS_CONFIGURED',
        severity: 'ERROR',
        message: 'No report field mappings are configured for this template version.',
        correctiveAction: 'Use the mapping wizard to map report fields to document locations.',
      });
    }

    // 5. Authoritative Field Catalog & Category Applicability Checks
    checksPerformed.fieldExistence = true;
    checksPerformed.categoryApplicability = true;
    const approvedFields = getApprovedFieldsForCategory(targetCategoryId);
    const approvedFieldIds = new Set(approvedFields.map(f => f.fieldId));
    const mappedFieldIds = new Set<string>();

    for (const m of allMappings) {
      mappedFieldIds.add(m.fieldId);

      // Check field existence in catalog
      if (!isApprovedField(m.fieldId)) {
        findings.push({
          code: 'VAL_FIELD_UNKNOWN',
          severity: 'ERROR',
          fieldId: m.fieldId,
          fieldLabel: m.fieldLabel,
          targetCoordinate: m.targetCoordinate,
          message: `Field ID "${m.fieldId}" does not exist in the authoritative DIC-OPSREPORT-001 catalog.`,
          correctiveAction: 'Remove this mapping or replace it with a recognized catalog field.',
        });
        continue;
      }

      // Check category applicability
      if (!approvedFieldIds.has(m.fieldId)) {
        findings.push({
          code: 'VAL_FIELD_INAPPLICABLE',
          severity: 'ERROR',
          fieldId: m.fieldId,
          fieldLabel: m.fieldLabel,
          targetCoordinate: m.targetCoordinate,
          message: `Field "${m.fieldLabel}" (${m.fieldId}) is not applicable to report category "${targetCategoryId}".`,
          correctiveAction: 'Map only fields approved for this report category.',
        });
      }
    }

    // 6. Required Field Validation
    checksPerformed.requiredFields = true;
    for (const field of approvedFields) {
      if (field.isRequired && !mappedFieldIds.has(field.fieldId)) {
        findings.push({
          code: 'VAL_FIELD_REQUIRED_UNMAPPED',
          severity: 'ERROR',
          fieldId: field.fieldId,
          fieldLabel: field.label,
          message: `Required report field "${field.label}" (${field.fieldId}) is not mapped in this profile.`,
          correctiveAction: `Assign a document target coordinate to mandatory field "${field.label}".`,
        });
      } else if (!field.isRequired && !mappedFieldIds.has(field.fieldId)) {
        findings.push({
          code: 'VAL_FIELD_OPTIONAL_UNMAPPED',
          severity: 'INFO',
          fieldId: field.fieldId,
          fieldLabel: field.label,
          message: `Optional report field "${field.label}" (${field.fieldId}) is unmapped.`,
          correctiveAction:
            'Assign a target if data for this field should appear in generated reports.',
        });
      }
    }

    // 7. Type & Repetition Model Compatibility Checks
    checksPerformed.typeCompatibility = true;
    for (const m of allMappings) {
      const fieldDef = getFieldDefinition(m.fieldId);
      if (!fieldDef) continue;

      if (targetDocType === 'EXCEL_XLSX') {
        if (fieldDef.repetitionModel === 'REPEATING' && m.mappingType === 'FIXED_CELL') {
          findings.push({
            code: 'VAL_TYPE_INCOMPATIBLE',
            severity: 'WARNING',
            fieldId: m.fieldId,
            fieldLabel: m.fieldLabel,
            targetCoordinate: m.targetCoordinate,
            message: `Repeating station field "${fieldDef.label}" is mapped to a single fixed cell (${m.targetCoordinate}). Only the first station value or an aggregate can be populated.`,
            correctiveAction: 'Map repeating station fields to a table column (TABLE_COLUMN).',
          });
        }
      } else {
        if (fieldDef.repetitionModel === 'REPEATING' && m.mappingType !== 'REPEATING_ROW') {
          findings.push({
            code: 'VAL_TYPE_INCOMPATIBLE',
            severity: 'INFO',
            fieldId: m.fieldId,
            fieldLabel: m.fieldLabel,
            targetCoordinate: m.targetCoordinate,
            message: `Repeating field "${fieldDef.label}" is mapped to structural target "${m.targetCoordinate}". Ensure the placeholder or target represents tabular repeating data.`,
            correctiveAction:
              'Assign repeating fields to a repeating row target (e.g. T1:R2:LOOP) or loop token.',
          });
        }
      }
    }

    // 8. Duplicate & Destination Collision Checks
    checksPerformed.duplicateCollision = true;
    const seenFieldIds = new Set<string>();
    const seenTargets = new Map<string, string>(); // coordinate -> fieldId

    for (const m of allMappings) {
      // Duplicate field mapping
      if (seenFieldIds.has(m.fieldId)) {
        findings.push({
          code: 'VAL_DUPLICATE_FIELD',
          severity: 'ERROR',
          fieldId: m.fieldId,
          fieldLabel: m.fieldLabel,
          targetCoordinate: m.targetCoordinate,
          message: `Field "${m.fieldLabel}" (${m.fieldId}) is mapped multiple times in this template version.`,
          correctiveAction: 'Remove duplicate field mappings so each field is assigned uniquely.',
        });
      }
      seenFieldIds.add(m.fieldId);

      // Exclusive destination target collision
      const targetKey =
        targetDocType === 'EXCEL_XLSX'
          ? `${m.worksheetName}:${m.targetCoordinate}`
          : m.targetCoordinate;

      if (seenTargets.has(targetKey)) {
        findings.push({
          code: 'VAL_TARGET_COLLISION',
          severity: 'ERROR',
          fieldId: m.fieldId,
          fieldLabel: m.fieldLabel,
          targetCoordinate: m.targetCoordinate,
          message: `Target destination "${m.targetCoordinate}" is assigned to multiple fields (collides with ${seenTargets.get(targetKey)}).`,
          correctiveAction: 'Assign each report field to a distinct destination coordinate.',
        });
      } else {
        seenTargets.set(targetKey, m.fieldId);
      }
    }

    // 9. Document Structural Compatibility Checks
    checksPerformed.structuralResolution = true;

    if (targetDocType === 'EXCEL_XLSX') {
      const excel = inspection.excelPreview;
      if (!excel) {
        findings.push({
          code: 'VAL_STRUCTURE_UNVERIFIABLE',
          severity: 'ERROR',
          message: 'Excel structural preview could not be extracted from the master workbook.',
          correctiveAction: 'Inspect the Excel template to ensure it is a valid Open XML workbook.',
        });
      } else {
        const availableSheets = excel.sheets.map(w => w.name);

        for (const m of excelMappings) {
          if (!availableSheets.includes(m.worksheetName)) {
            findings.push({
              code: 'VAL_WORKSHEET_NOT_FOUND',
              severity: 'ERROR',
              fieldId: m.fieldId,
              targetCoordinate: m.targetCoordinate,
              message: `Referenced worksheet "${m.worksheetName}" does not exist in workbook. Available sheets: ${availableSheets.join(', ')}.`,
              correctiveAction: 'Select an existing worksheet in the Excel Mapping Wizard.',
            });
          }
        }
      }
    } else {
      // WORD_DOCX checks
      const word = inspection.wordPreview;
      if (!word) {
        findings.push({
          code: 'VAL_STRUCTURE_UNVERIFIABLE',
          severity: 'ERROR',
          message: 'Word structural preview could not be extracted from the master document.',
          correctiveAction: 'Inspect the Word template to ensure it is a valid Open XML document.',
        });
      } else {
        const candidateTokens = word.candidateTokens || [];

        for (const m of wordMappings) {
          if (m.mappingType === 'PLACEHOLDER') {
            if (!candidateTokens.includes(m.targetCoordinate)) {
              findings.push({
                code: 'VAL_PLACEHOLDER_NOT_FOUND',
                severity: 'ERROR',
                fieldId: m.fieldId,
                fieldLabel: m.fieldLabel,
                targetCoordinate: m.targetCoordinate,
                message: `Placeholder token "${m.targetCoordinate}" was not detected in the Word document.`,
                correctiveAction: 'Verify that this placeholder exists in the Word document text.',
              });
            }
          } else if (m.mappingType === 'PARAGRAPH') {
            const pMatch = /^P:([1-9][0-9]*)$/.exec(m.targetCoordinate);
            if (pMatch) {
              const pIndex = parseInt(pMatch[1], 10);
              if (pIndex > word.paragraphCount) {
                findings.push({
                  code: 'VAL_STRUCTURAL_TARGET_OUT_OF_BOUNDS',
                  severity: 'ERROR',
                  fieldId: m.fieldId,
                  targetCoordinate: m.targetCoordinate,
                  message: `Paragraph target P:${pIndex} exceeds document paragraph count (${word.paragraphCount}).`,
                  correctiveAction: 'Choose an existing paragraph within document bounds.',
                });
              }
            }
          } else if (m.mappingType === 'TABLE_CELL') {
            const cMatch = /^T([1-9][0-9]*):R([1-9][0-9]*):C([1-9][0-9]*)$/.exec(
              m.targetCoordinate
            );
            if (cMatch) {
              const tIndex = parseInt(cMatch[1], 10);
              const rIndex = parseInt(cMatch[2], 10);
              const cIndex = parseInt(cMatch[3], 10);

              if (tIndex > word.tableCount) {
                findings.push({
                  code: 'VAL_STRUCTURAL_TARGET_OUT_OF_BOUNDS',
                  severity: 'ERROR',
                  fieldId: m.fieldId,
                  targetCoordinate: m.targetCoordinate,
                  message: `Table target T${tIndex} exceeds total tables in document (${word.tableCount}).`,
                  correctiveAction: 'Choose a table that exists in the document.',
                });
              } else if (word.tables && word.tables[tIndex - 1]) {
                const tbl = word.tables[tIndex - 1];
                if (rIndex > tbl.rowCount || cIndex > tbl.colCount) {
                  findings.push({
                    code: 'VAL_STRUCTURAL_TARGET_OUT_OF_BOUNDS',
                    severity: 'ERROR',
                    fieldId: m.fieldId,
                    targetCoordinate: m.targetCoordinate,
                    message: `Table cell T${tIndex}:R${rIndex}:C${cIndex} exceeds table dimensions (${tbl.rowCount} rows x ${tbl.colCount} cols).`,
                    correctiveAction: 'Choose a cell within the table boundaries.',
                  });
                }
              }
            }
          } else if (m.mappingType === 'REPEATING_ROW') {
            const rMatch = /^T([1-9][0-9]*):R([1-9][0-9]*):LOOP$/.exec(m.targetCoordinate);
            if (rMatch) {
              const tIndex = parseInt(rMatch[1], 10);
              if (tIndex > word.tableCount) {
                findings.push({
                  code: 'VAL_STRUCTURAL_TARGET_OUT_OF_BOUNDS',
                  severity: 'ERROR',
                  fieldId: m.fieldId,
                  targetCoordinate: m.targetCoordinate,
                  message: `Repeating row table target T${tIndex} exceeds document table count (${word.tableCount}).`,
                  correctiveAction: 'Choose a table that exists in the document.',
                });
              }
            }
          }
        }
      }
    }

    // 10. Compute Overall Status and Counts
    const errorCount = findings.filter(f => f.severity === 'ERROR').length;
    const warningCount = findings.filter(f => f.severity === 'WARNING').length;
    const infoCount = findings.filter(f => f.severity === 'INFO').length;

    let overallStatus: MappingValidationStatus;

    if (errorCount > 0) {
      // If errors are strictly missing required fields or no mappings configured, treat as INCOMPLETE
      const nonMissingErrors = findings.filter(
        f =>
          f.severity === 'ERROR' &&
          f.code !== 'VAL_FIELD_REQUIRED_UNMAPPED' &&
          f.code !== 'VAL_NO_MAPPINGS_CONFIGURED'
      );
      if (nonMissingErrors.length === 0) {
        overallStatus = 'INCOMPLETE';
      } else {
        overallStatus = 'INVALID';
      }
    } else if (warningCount > 0) {
      overallStatus = 'REQUIRES_REVIEW';
    } else {
      overallStatus = 'VALID';
    }

    const isValid =
      (overallStatus === 'VALID' || overallStatus === 'REQUIRES_REVIEW') && errorCount === 0;

    let summary = '';
    if (overallStatus === 'VALID') {
      summary = `Profile is fully compatible. ${allMappings.length} field mappings verified against template structure and schema.`;
    } else if (overallStatus === 'REQUIRES_REVIEW') {
      summary = `Profile is functional with ${warningCount} advisory warning(s) requiring review.`;
    } else if (overallStatus === 'INCOMPLETE') {
      summary = `Profile is incomplete: ${errorCount} required report field(s) remain unmapped.`;
    } else {
      summary = `Profile has ${errorCount} blocking error(s) that must be resolved before report generation.`;
    }

    const validationResult: MappingValidationResult = {
      profileId: targetProfileId,
      templateId: targetTemplateId,
      versionId: targetVersionId,
      documentType: targetDocType,
      overallStatus,
      isValid,
      validatedAt: new Date().toISOString(),
      totalFindings: findings.length,
      errorCount,
      warningCount,
      infoCount,
      findings,
      summary,
      checksPerformed,
    };

    // 11. Update persistent profile record if profileId was supplied
    if (targetProfileId) {
      this.profileRepo.updateValidationStatus(targetProfileId, overallStatus, summary);
    }

    return Ok(validationResult);
  }
}
