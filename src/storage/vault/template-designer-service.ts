/**
 * OpsReport Studio — Template Designer & Compilation Service (Step 25)
 *
 * Coordinates in-app template validation, Open XML compilation, staging,
 * file validation, and safe registration into the template vault:
 * - Validates in-app design models against authoritative field catalog and structural rules
 * - Compiles design definitions to genuine Open XML (.xlsx / .docx) buffers
 * - Staged compilation in isolated scratch sandbox preventing vault corruption
 * - Deep verification of compiled files using document-validator
 * - Atomically registers new templates or creates version N+1 on existing templates
 * - Generates synchronized mapping profiles when field slots are defined
 *
 * @module storage/vault/template-designer-service
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import type {
  TemplateDesignDefinition,
  ExcelWorkbookDesign,
  WordDocumentDesign,
  DesignerValidationResult,
  DesignerDiagnostic,
  CompileAndRegisterInput,
  CompileAndRegisterResult,
} from '../../shared/types/template-designer.ts';
import {
  toTemplateId,
  toReportCategoryId,
  toTemplateVersionId,
} from '../../shared/types/identifiers.ts';
import type { TemplateId, TemplateVersionId } from '../../shared/types/identifiers.ts';
import { Result, Ok, Err } from '../../shared/types/result.ts';
import { AppError } from '../../shared/errors/app-error.ts';
import { ErrorCode } from '../../shared/errors/error-codes.ts';
import { VaultManager } from './vault-manager.ts';
import { validateDocumentFile } from './document-validator.ts';
import { ExcelTemplateBuilder } from './excel-template-builder.ts';
import { WordTemplateBuilder } from './word-template-builder.ts';
import { TemplateImporter } from './template-importer.ts';
import { TemplateMetadataRepository } from '../database/repositories/template-metadata-repository.ts';
import { CategoryRepository } from '../database/repositories/category-repository.ts';
import { MappingProfileRepository } from '../database/repositories/mapping-profile-repository.ts';
import { ExcelMappingRepository } from '../database/repositories/excel-mapping-repository.ts';
import { WordMappingRepository } from '../database/repositories/word-mapping-repository.ts';
import { TemplateDesignerRepository } from '../database/repositories/template-designer-repository.ts';
import { isApprovedField, getFieldDefinition } from '../../shared/constants/report-fields.ts';
import { CELL_ADDRESS_REGEX } from '../database/repositories/excel-mapping-repository.ts';
import { WORD_PLACEHOLDER_REGEX } from '../database/repositories/word-mapping-repository.ts';

export class TemplateDesignerService {
  private readonly vaultManager: VaultManager;
  private readonly templateImporter: TemplateImporter;
  private readonly templateRepo: TemplateMetadataRepository;
  private readonly categoryRepo: CategoryRepository;
  private readonly mappingProfileRepo: MappingProfileRepository;
  private readonly excelMappingRepo: ExcelMappingRepository;
  private readonly wordMappingRepo: WordMappingRepository;
  private readonly designerRepo: TemplateDesignerRepository;

  constructor(
    db: Database.Database,
    vaultManager?: VaultManager,
    templateImporter?: TemplateImporter,
    templateRepo?: TemplateMetadataRepository,
    categoryRepo?: CategoryRepository,
    mappingProfileRepo?: MappingProfileRepository,
    excelMappingRepo?: ExcelMappingRepository,
    wordMappingRepo?: WordMappingRepository,
    designerRepo?: TemplateDesignerRepository
  ) {
    this.vaultManager = vaultManager ?? VaultManager.getInstance();
    this.templateRepo = templateRepo ?? new TemplateMetadataRepository(db);
    this.categoryRepo = categoryRepo ?? new CategoryRepository(db);
    this.templateImporter =
      templateImporter ??
      new TemplateImporter(db, this.vaultManager, this.templateRepo, this.categoryRepo);
    this.mappingProfileRepo = mappingProfileRepo ?? new MappingProfileRepository(db);
    this.excelMappingRepo = excelMappingRepo ?? new ExcelMappingRepository(db);
    this.wordMappingRepo = wordMappingRepo ?? new WordMappingRepository(db);
    this.designerRepo = designerRepo ?? new TemplateDesignerRepository(db);
  }

  /**
   * Validates a template design definition before compilation.
   * Checks element structure, cell coordinates, placeholder tokens,
   * approved field existence, and category applicability.
   */
  public validateDesign(
    definition: TemplateDesignDefinition,
    categoryId?: string
  ): DesignerValidationResult {
    const diagnostics: DesignerDiagnostic[] = [];

    if (!definition) {
      return {
        isValid: false,
        diagnostics: [
          {
            severity: 'ERROR',
            code: 'DESIGN_EMPTY',
            message: 'Template design definition is empty.',
          },
        ],
        errorCount: 1,
        warningCount: 0,
      };
    }

    if (definition.format === 'EXCEL_WORKBOOK') {
      const wb = definition as ExcelWorkbookDesign;
      if (!wb.worksheets || wb.worksheets.length === 0) {
        diagnostics.push({
          severity: 'ERROR',
          code: 'NO_WORKSHEETS',
          message: 'Workbook must contain at least one worksheet.',
        });
      } else {
        const sheetNames = new Set<string>();
        for (const sheet of wb.worksheets) {
          const sName = sheet.name?.trim();
          if (!sName) {
            diagnostics.push({
              severity: 'ERROR',
              code: 'EMPTY_SHEET_NAME',
              message: 'Worksheet name cannot be empty.',
            });
          } else if (sName.length > 31) {
            diagnostics.push({
              severity: 'ERROR',
              code: 'SHEET_NAME_TOO_LONG',
              message: `Worksheet name "${sName}" exceeds 31 characters.`,
            });
          } else if (/[\\/*?[\]:]/.test(sName)) {
            diagnostics.push({
              severity: 'ERROR',
              code: 'FORBIDDEN_SHEET_CHARS',
              message: `Worksheet name "${sName}" contains forbidden characters (\\ / * ? [ ] :).`,
            });
          } else if (sheetNames.has(sName.toLowerCase())) {
            diagnostics.push({
              severity: 'ERROR',
              code: 'DUPLICATE_SHEET_NAME',
              message: `Duplicate worksheet name "${sName}".`,
            });
          } else {
            sheetNames.add(sName.toLowerCase());
          }

          // Check coordinates and field slots
          const targetCoords = new Set<string>();
          for (const cell of sheet.cells || []) {
            if (!CELL_ADDRESS_REGEX.test(cell.coordinate)) {
              diagnostics.push({
                severity: 'ERROR',
                code: 'INVALID_COORDINATE',
                message: `Invalid cell coordinate "${cell.coordinate}". Expected format e.g. "A1", "B2".`,
                location: `${sheet.name}:${cell.coordinate}`,
              });
            } else if (targetCoords.has(cell.coordinate)) {
              diagnostics.push({
                severity: 'ERROR',
                code: 'COORDINATE_COLLISION',
                message: `Duplicate cell coordinate "${cell.coordinate}" defined multiple times in sheet "${sheet.name}".`,
                location: `${sheet.name}:${cell.coordinate}`,
              });
            } else {
              targetCoords.add(cell.coordinate);
            }

            if (cell.fieldSlot) {
              const { fieldId } = cell.fieldSlot;
              if (!isApprovedField(fieldId)) {
                diagnostics.push({
                  severity: 'ERROR',
                  code: 'UNKNOWN_FIELD',
                  message: `Field ID "${fieldId}" does not exist in authoritative catalog (DIC-OPSREPORT-001).`,
                  location: `${sheet.name}:${cell.coordinate}`,
                });
              } else if (categoryId) {
                const def = getFieldDefinition(fieldId);
                if (def && def.categoryId !== 'ALL' && def.categoryId !== categoryId) {
                  diagnostics.push({
                    severity: 'ERROR',
                    code: 'CATEGORY_MISMATCH',
                    message: `Field "${fieldId}" is defined for category "${def.categoryId}", not target category "${categoryId}".`,
                    location: `${sheet.name}:${cell.coordinate}`,
                  });
                }
              }
            }
          }
        }
      }
    } else if (definition.format === 'WORD_DOCUMENT') {
      const doc = definition as WordDocumentDesign;
      if (!doc.elements || doc.elements.length === 0) {
        diagnostics.push({
          severity: 'ERROR',
          code: 'NO_ELEMENTS',
          message: 'Word document must contain at least one content element.',
        });
      } else {
        const seenTokens = new Set<string>();
        doc.elements.forEach((el, idx) => {
          const loc = `Element #${idx + 1} (${el.type})`;
          if (el.type === 'HEADING') {
            if (!el.heading || !el.heading.text || el.heading.text.trim().length === 0) {
              diagnostics.push({
                severity: 'ERROR',
                code: 'EMPTY_HEADING',
                message: 'Heading text cannot be empty.',
                location: loc,
              });
            }
          } else if (el.type === 'PARAGRAPH') {
            if (el.paragraph?.fieldSlot) {
              const { fieldId, placeholderToken } = el.paragraph.fieldSlot;
              if (!WORD_PLACEHOLDER_REGEX.test(placeholderToken)) {
                diagnostics.push({
                  severity: 'ERROR',
                  code: 'INVALID_TOKEN_SYNTAX',
                  message: `Placeholder token "${placeholderToken}" must conform to {token} syntax.`,
                  location: loc,
                });
              } else if (seenTokens.has(placeholderToken)) {
                diagnostics.push({
                  severity: 'WARNING',
                  code: 'DUPLICATE_TOKEN',
                  message: `Placeholder token "${placeholderToken}" appears multiple times in the document.`,
                  location: loc,
                });
              } else {
                seenTokens.add(placeholderToken);
              }

              if (!isApprovedField(fieldId)) {
                diagnostics.push({
                  severity: 'ERROR',
                  code: 'UNKNOWN_FIELD',
                  message: `Field ID "${fieldId}" does not exist in authoritative catalog (DIC-OPSREPORT-001).`,
                  location: loc,
                });
              } else if (categoryId) {
                const def = getFieldDefinition(fieldId);
                if (def && def.categoryId !== 'ALL' && def.categoryId !== categoryId) {
                  diagnostics.push({
                    severity: 'ERROR',
                    code: 'CATEGORY_MISMATCH',
                    message: `Field "${fieldId}" is defined for category "${def.categoryId}", not target category "${categoryId}".`,
                    location: loc,
                  });
                }
              }
            }
          } else if (el.type === 'TABLE') {
            if (!el.table || !el.table.rows || el.table.rows.length === 0) {
              diagnostics.push({
                severity: 'ERROR',
                code: 'EMPTY_TABLE',
                message: 'Table must contain at least one row.',
                location: loc,
              });
            } else {
              if (el.table.repeatingLoopToken) {
                if (!WORD_PLACEHOLDER_REGEX.test(el.table.repeatingLoopToken)) {
                  diagnostics.push({
                    severity: 'ERROR',
                    code: 'INVALID_LOOP_TOKEN',
                    message: `Table repeating loop token "${el.table.repeatingLoopToken}" is invalid.`,
                    location: loc,
                  });
                }
              }

              el.table.rows.forEach((row, rIdx) => {
                row.cells.forEach((cell, cIdx) => {
                  if (cell.fieldSlot) {
                    const { fieldId, placeholderToken } = cell.fieldSlot;
                    const cellLoc = `${loc} [R${rIdx + 1}:C${cIdx + 1}]`;
                    if (!WORD_PLACEHOLDER_REGEX.test(placeholderToken)) {
                      diagnostics.push({
                        severity: 'ERROR',
                        code: 'INVALID_TOKEN_SYNTAX',
                        message: `Cell placeholder token "${placeholderToken}" must conform to {token} syntax.`,
                        location: cellLoc,
                      });
                    }
                    if (!isApprovedField(fieldId)) {
                      diagnostics.push({
                        severity: 'ERROR',
                        code: 'UNKNOWN_FIELD',
                        message: `Field ID "${fieldId}" does not exist in authoritative catalog (DIC-OPSREPORT-001).`,
                        location: cellLoc,
                      });
                    } else if (categoryId) {
                      const def = getFieldDefinition(fieldId);
                      if (def && def.categoryId !== 'ALL' && def.categoryId !== categoryId) {
                        diagnostics.push({
                          severity: 'ERROR',
                          code: 'CATEGORY_MISMATCH',
                          message: `Field "${fieldId}" is defined for category "${def.categoryId}", not target category "${categoryId}".`,
                          location: cellLoc,
                        });
                      }
                    }
                  }
                });
              });
            }
          }
        });
      }
    } else {
      diagnostics.push({
        severity: 'ERROR',
        code: 'UNSUPPORTED_FORMAT',
        message: `Unsupported design format: "${(definition as { format?: string }).format}".`,
      });
    }

    const errorCount = diagnostics.filter(d => d.severity === 'ERROR').length;
    const warningCount = diagnostics.filter(d => d.severity === 'WARNING').length;

    return {
      isValid: errorCount === 0,
      diagnostics,
      errorCount,
      warningCount,
    };
  }

  /**
   * Compiles an in-app design definition into an Open XML buffer.
   */
  public compileToBuffer(definition: TemplateDesignDefinition): Result<Buffer, AppError> {
    if (definition.format === 'EXCEL_WORKBOOK') {
      return ExcelTemplateBuilder.buildWorkbook(definition as ExcelWorkbookDesign);
    }
    if (definition.format === 'WORD_DOCUMENT') {
      return WordTemplateBuilder.buildDocument(definition as WordDocumentDesign);
    }
    return Err(
      new AppError({
        code: ErrorCode.VALIDATION_FAILED,
        userMessage: `Unknown design format "${(definition as { format?: string }).format}".`,
        isOperational: true,
      })
    );
  }

  /**
   * Complete compilation, staging, validation, and registration pipeline:
   * 1. Validates design definition
   * 2. Compiles to Open XML buffer
   * 3. Writes to unique staging file in scratch sandbox
   * 4. Validates staging file format
   * 5. Promotes and registers via TemplateImporter (new template or version N+1)
   * 6. Automatically establishes default mapping profile if field slots were designed
   * 7. Cleans up staging file safely
   */
  public async compileAndRegister(
    input: CompileAndRegisterInput
  ): Promise<Result<CompileAndRegisterResult, AppError>> {
    // Stage 1: Validate design model
    const valResult = this.validateDesign(input.designDefinition, input.categoryId);
    if (!valResult.isValid) {
      const firstError = valResult.diagnostics.find(d => d.severity === 'ERROR');
      return Err(
        new AppError({
          code: ErrorCode.VALIDATION_FAILED,
          userMessage: `Design validation failed: ${firstError?.message ?? 'Validation errors detected.'}`,
          details: { diagnostics: valResult.diagnostics },
          isOperational: true,
        })
      );
    }

    // Stage 2: Compile to in-memory Open XML buffer
    const bufRes = this.compileToBuffer(input.designDefinition);
    if (!bufRes.ok) {
      return bufRes;
    }
    const buffer = bufRes.value;

    // Stage 3: Write to isolated staging path
    const ext = input.documentType === 'EXCEL_WORKBOOK' ? '.xlsx' : '.docx';
    const stagingFileName = `designer_staged_${crypto.randomUUID()}${ext}`;
    const stagingFilePath = path.join(this.vaultManager.scratchDir, stagingFileName);

    try {
      fs.writeFileSync(stagingFilePath, buffer);
    } catch (err) {
      return Err(
        new AppError({
          code: ErrorCode.FILE_ACCESS_DENIED,
          userMessage: 'Failed to write compiled document to staging location.',
          details: { error: String(err) },
          cause: err,
        })
      );
    }

    try {
      // Stage 4: Run authoritative container and format validator
      const docValRes = validateDocumentFile(stagingFilePath, ext);
      if (!docValRes.ok) {
        return docValRes;
      }

      let registeredTemplateId: TemplateId;
      let registeredVersionId: TemplateVersionId;
      let registeredVersionNumber: number;

      // Stage 5: Register through TemplateImporter
      const docFormat = input.documentType === 'EXCEL_WORKBOOK' ? 'EXCEL_XLSX' : 'WORD_DOCX';

      const importRes = await this.templateImporter.importTemplate({
        sourceFilePath: stagingFilePath,
        templateName: input.name,
        categoryId: toReportCategoryId(input.categoryId),
        documentType: docFormat,
        description: input.description,
        templateId: input.targetTemplateId ? toTemplateId(input.targetTemplateId) : undefined,
      });
      if (!importRes.ok) {
        return importRes;
      }
      registeredTemplateId = importRes.value.template.template_id;
      registeredVersionId =
        importRes.value.template.active_version_id ??
        toTemplateVersionId(`VER-${registeredTemplateId}-V1`);
      registeredVersionNumber = importRes.value.template.total_versions ?? 1;

      // Stage 6: Automatically create default mapping profile if field slots exist
      let createdProfileId: string | undefined;
      const shouldCreateMapping = input.createMappingProfile !== false;

      if (shouldCreateMapping) {
        const profileName = input.profileName?.trim() || `${input.name} Default Mappings`;
        const profileDocType = input.documentType === 'EXCEL_WORKBOOK' ? 'EXCEL_XLSX' : 'WORD_DOCX';

        const profileRes = this.mappingProfileRepo.createProfile({
          profileName,
          description: `Auto-generated from template design for "${input.name}"`,
          categoryId: toReportCategoryId(input.categoryId),
          templateId: registeredTemplateId,
          versionId: registeredVersionId,
          documentType: profileDocType,
          status: 'ACTIVE',
        });

        if (profileRes.ok) {
          createdProfileId = profileRes.value.profileId;

          if (input.documentType === 'EXCEL_WORKBOOK') {
            const wb = input.designDefinition as ExcelWorkbookDesign;
            for (const sheet of wb.worksheets) {
              const mappingsToSave = sheet.cells
                .filter(c => c.fieldSlot)
                .map(c => {
                  const isRepeating = c.fieldSlot!.isRepeating ?? false;
                  return {
                    worksheetName: sheet.name,
                    headerRowNumber: sheet.headerRowIndex,
                    mappingType: (isRepeating ? 'TABLE_COLUMN' : 'FIXED_CELL') as
                      'FIXED_CELL' | 'TABLE_COLUMN',
                    fieldId: c.fieldSlot!.fieldId,
                    fieldLabel: c.fieldSlot!.fieldLabel,
                    targetCoordinate: isRepeating
                      ? c.coordinate.replace(/[0-9]/g, '')
                      : c.coordinate,
                    columnHeader: isRepeating ? c.text : undefined,
                    isRequired: false,
                  };
                });

              if (mappingsToSave.length > 0) {
                this.excelMappingRepo.saveMappings({
                  templateId: registeredTemplateId,
                  versionId: registeredVersionId,
                  worksheetName: sheet.name,
                  headerRowNumber: sheet.headerRowIndex,
                  mappings: mappingsToSave,
                });
              }
            }
          } else if (input.documentType === 'WORD_DOCUMENT') {
            const doc = input.designDefinition as WordDocumentDesign;
            const wordMappingsToSave: Array<{
              mappingType: 'PLACEHOLDER' | 'PARAGRAPH' | 'TABLE_CELL' | 'REPEATING_ROW';
              fieldId: string;
              fieldLabel: string;
              targetCoordinate: string;
              targetDescription?: string;
              isRequired?: boolean;
            }> = [];

            doc.elements.forEach(el => {
              if (el.type === 'PARAGRAPH' && el.paragraph?.fieldSlot) {
                wordMappingsToSave.push({
                  mappingType: 'PLACEHOLDER',
                  fieldId: el.paragraph.fieldSlot.fieldId,
                  fieldLabel: el.paragraph.fieldSlot.fieldLabel,
                  targetCoordinate: el.paragraph.fieldSlot.placeholderToken,
                  targetDescription: `Placeholder in paragraph`,
                  isRequired: false,
                });
              } else if (el.type === 'TABLE' && el.table) {
                el.table.rows.forEach((row, rIdx) => {
                  row.cells.forEach((cell, cIdx) => {
                    if (cell.fieldSlot) {
                      wordMappingsToSave.push({
                        mappingType: 'PLACEHOLDER',
                        fieldId: cell.fieldSlot.fieldId,
                        fieldLabel: cell.fieldSlot.fieldLabel,
                        targetCoordinate: cell.fieldSlot.placeholderToken,
                        targetDescription: `Table Cell R${rIdx + 1}:C${cIdx + 1}`,
                        isRequired: false,
                      });
                    }
                  });
                });
              }
            });

            if (wordMappingsToSave.length > 0) {
              this.wordMappingRepo.saveMappings({
                templateId: registeredTemplateId,
                versionId: registeredVersionId,
                mappings: wordMappingsToSave,
              });
            }
          }
        }
      }

      // Stage 7: Update draft if draftId supplied
      if (input.draftId) {
        this.designerRepo.updateDraft(input.draftId, {
          targetTemplateId: registeredTemplateId,
        });
      }

      return Ok({
        templateId: registeredTemplateId,
        versionId: registeredVersionId,
        versionNumber: registeredVersionNumber,
        profileId: createdProfileId,
        message: `Template "${input.name}" compiled and registered successfully (v${registeredVersionNumber}).`,
      });
    } finally {
      // Guaranteed cleanup of staging file
      try {
        if (fs.existsSync(stagingFilePath)) {
          fs.unlinkSync(stagingFilePath);
        }
      } catch {
        // Safe cleanup ignore
      }
    }
  }
}
