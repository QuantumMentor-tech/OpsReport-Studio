/**
 * OpsReport Studio — Authoritative Excel Report Export, Naming & Final Workbook Validation Service (Step 30)
 *
 * Implements Step 30 of the approved 45-step roadmap:
 * - Deterministic, filesystem-safe filename resolution according to approved conventions (DEC-011)
 * - Filename sanitization (Windows reserved names, invalid characters, traversal prevention, Unicode preservation)
 * - Safe destination validation and non-destructive collision handling (FAIL_IF_EXISTS, INCREMENT_SUFFIX); existing reports are never replaced
 * - Verification of report session, template version, and generation workspace eligibility & freshness
 * - Safe atomic staging in destination directory, avoiding premature exposure of unverified files
 * - Pre-promotion & post-finalization structural and content validation:
 *   - File presence, accessibility, and Open XML compliance
 *   - Step 29 structural preservation verification (formulas, merged cells, images, print layout)
 *   - Content verification: mapped scalar fields and authoritative station sequence
 * - Invariant INV-DAT-006: 0-byte variance verified on source master templates in Vault
 * - Non-destructive rollback: working workspace artifacts and existing final reports are preserved on error
 * - State transition: marks generation workspace COMPLETED and optionally updates report session
 *
 * @module storage/generation/excel-export-service
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import PizZip from 'pizzip';
import type {
  ExportExcelReportOptions,
  ExportExcelReportResult,
  ExportFilenameOptions,
  ExportValidationSummary,
  CollisionPolicy,
} from '../../shared/types/generation.ts';
import type { ExcelFieldMappingRecord } from '../../shared/types/excel-mapping.ts';
import { VaultManager } from '../vault/vault-manager.ts';
import { SessionRepository } from '../database/repositories/session-repository.ts';
import { TemplateMetadataRepository } from '../database/repositories/template-metadata-repository.ts';
import { GenerationWorkspaceRepository } from '../database/repositories/generation-workspace-repository.ts';
import { ExcelMappingRepository } from '../database/repositories/excel-mapping-repository.ts';
import { CategoryRepository } from '../database/repositories/category-repository.ts';
import { getFieldDefinition, isApprovedField } from '../../shared/constants/report-fields.ts';
import { WorksheetXmlEditor } from './worksheet-xml-editor.ts';
import { WorkbookPreservationVerifier } from './workbook-preservation-verifier.ts';
import { validateDocumentFile } from '../vault/document-validator.ts';
import {
  validateInternalIdentifier,
  assertNoNullBytes,
  assertTargetNotInsideVault,
} from '../vault/path-security.ts';
import { Result, Ok, Err } from '../../shared/types/result.ts';
import { AppError } from '../../shared/errors/app-error.ts';
import { ErrorCode } from '../../shared/errors/error-codes.ts';

/**
 * Windows reserved device names (case-insensitive) prohibited as filenames.
 */
const WINDOWS_RESERVED_NAMES = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  'COM1',
  'COM2',
  'COM3',
  'COM4',
  'COM5',
  'COM6',
  'COM7',
  'COM8',
  'COM9',
  'LPT1',
  'LPT2',
  'LPT3',
  'LPT4',
  'LPT5',
  'LPT6',
  'LPT7',
  'LPT8',
  'LPT9',
]);

/**
 * Static resolver for standardized, filesystem-safe report filenames.
 */
export class ExcelFilenameResolver {
  /**
   * Sanitizes an individual filename component:
   * - Strips null bytes
   * - Strips path separators (/ and \) and directory traversal sequences (..)
   * - Replaces illegal Windows characters (< > : " / \ | ? *) with underscores
   * - Replaces control characters (ASCII 0x00-0x1F, 0x7F) with underscores
   * - Collapses multiple underscores
   * - Trims leading and trailing spaces, periods, and underscores
   * - Shields Windows reserved device names
   * - Truncates component length to safe limit
   */
  public static sanitizeComponent(raw: string, maxLength = 80): string {
    if (!raw || typeof raw !== 'string') {
      return '';
    }

    assertNoNullBytes(raw);

    // Strip directory path separators and traversal
    let sanitized = raw.replace(/[/\\]+/g, '_').replace(/\.\.+/g, '_');

    // Replace Windows prohibited characters: < > : " / \ | ? *
    sanitized = sanitized.replace(/[<>:"/\\|?*]/g, '_');

    // Replace control characters (0x00 - 0x1F, 0x7F)
    sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '_');

    // Collapse multiple underscores
    sanitized = sanitized.replace(/_+/g, '_');

    // Trim leading and trailing spaces, dots, and underscores
    sanitized = sanitized.replace(/^[.\s_]+|[.\s_]+$/g, '');

    // Check Windows reserved names
    if (WINDOWS_RESERVED_NAMES.has(sanitized.toUpperCase())) {
      sanitized = `Report_${sanitized}`;
    }

    // Limit length while preserving Unicode
    if (sanitized.length > maxLength) {
      sanitized = sanitized.slice(0, maxLength).replace(/^[.\s_]+|[.\s_]+$/g, '');
    }

    return sanitized;
  }

  /**
   * Resolves a complete, deterministic, and sanitized export filename with .xlsx extension.
   * Approved pattern (DEC-011): [Category]_[Date]_[Station]_[Shift]_[Session].xlsx
   * Components with no value are omitted; an optional customPrefix is prepended.
   */
  public static resolveExportFilename(
    options?: ExportFilenameOptions,
    fallbackBase = 'OpsReport'
  ): string {
    // Case 1: Explicit custom filename provided
    if (options?.customFilename && options.customFilename.trim().length > 0) {
      const rawName = options.customFilename.trim();
      assertNoNullBytes(rawName);

      // Extract basename in case a path was provided
      const baseOnly = path.basename(rawName);

      // Strip repeated .xlsx extension if present to sanitize base name
      let withoutExt = baseOnly;
      while (withoutExt.toLowerCase().endsWith('.xlsx')) {
        withoutExt = withoutExt.slice(0, -5);
      }
      const sanitizedBase = this.sanitizeComponent(withoutExt, 200);
      const safeBase = sanitizedBase.length > 0 ? sanitizedBase : fallbackBase;

      return `${safeBase}.xlsx`;
    }

    // Case 2: Structured component assembly (DEC-011)
    const parts: string[] = [];

    // Optional custom prefix
    if (options?.customPrefix && options.customPrefix.trim().length > 0) {
      const sanitizedPrefix = this.sanitizeComponent(options.customPrefix.trim(), 40);
      if (sanitizedPrefix.length > 0) {
        parts.push(sanitizedPrefix);
      }
    }

    // Category identifier / name
    const categoryPart = options?.categoryCode
      ? this.sanitizeComponent(options.categoryCode, 50)
      : fallbackBase;
    parts.push(categoryPart.length > 0 ? categoryPart : fallbackBase);

    // Report date
    const datePart = options?.reportDate
      ? this.sanitizeComponent(options.reportDate, 20)
      : new Date().toISOString().slice(0, 10);
    parts.push(datePart.length > 0 ? datePart : new Date().toISOString().slice(0, 10));

    // Optional station code or name
    if (options?.stationCodeOrName && options.stationCodeOrName.trim().length > 0) {
      const stnPart = this.sanitizeComponent(options.stationCodeOrName.trim(), 40);
      if (stnPart.length > 0) {
        parts.push(stnPart);
      }
    }

    // Optional shift
    if (options?.shift && options.shift.trim().length > 0) {
      const shiftPart = this.sanitizeComponent(options.shift.trim(), 20);
      if (shiftPart.length > 0) {
        parts.push(shiftPart);
      }
    }

    // Optional session or sequence ID
    if (options?.sessionOrSequenceId && options.sessionOrSequenceId.trim().length > 0) {
      const seqPart = this.sanitizeComponent(options.sessionOrSequenceId.trim(), 30);
      if (seqPart.length > 0) {
        parts.push(seqPart);
      }
    }

    let combined = parts.join('_');
    if (combined.length === 0) {
      combined = `${fallbackBase}_${new Date().toISOString().slice(0, 10)}`;
    }

    // Enforce overall filename length limit (240 chars + .xlsx <= 245 chars)
    if (combined.length > 240) {
      combined = combined.slice(0, 240).replace(/^[.\s_]+|[.\s_]+$/g, '');
    }

    return `${combined}.xlsx`;
  }

  /**
   * Resolves destination collisions according to the specified policy.
   * Returns the exact filename to use (may include numeric suffix), or an AppError.
   */
  public static resolveCollision(
    targetDir: string,
    desiredFilename: string,
    policy: CollisionPolicy
  ): Result<string, AppError> {
    const targetPath = path.join(targetDir, desiredFilename);

    if (!fs.existsSync(targetPath)) {
      return Ok(desiredFilename);
    }

    // Collision detected
    if (policy === 'FAIL_IF_EXISTS') {
      return Err(
        new AppError({
          code: ErrorCode.OUTPUT_DESTINATION_COLLISION,
          userMessage: `A report file named "${desiredFilename}" already exists in the destination folder.`,
          isOperational: true,
        })
      );
    }

    // INCREMENT_SUFFIX: Search for first unused numeric suffix (_1, _2, ...)
    const baseWithoutExt = desiredFilename.replace(/\.xlsx$/i, '');
    for (let i = 1; i <= 9999; i++) {
      const candidateName = `${baseWithoutExt}_${i}.xlsx`;
      const candidatePath = path.join(targetDir, candidateName);
      if (!fs.existsSync(candidatePath)) {
        return Ok(candidateName);
      }
    }

    return Err(
      new AppError({
        code: ErrorCode.OUTPUT_DESTINATION_COLLISION,
        userMessage: `Could not allocate an unused filename for "${desiredFilename}" after 9999 suffix attempts.`,
        isOperational: true,
      })
    );
  }
}

/**
 * Service orchestrating final Excel report export, validation, and lifecycle transition.
 */
export class ExcelExportService {
  private readonly vaultManager: VaultManager;

  constructor(
    private readonly templateRepo: TemplateMetadataRepository,
    vaultManager?: VaultManager,
    private readonly sessionRepo?: SessionRepository,
    private readonly workspaceRepo?: GenerationWorkspaceRepository,
    private readonly excelMappingRepo?: ExcelMappingRepository,
    private readonly categoryRepo?: CategoryRepository
  ) {
    this.vaultManager = vaultManager ?? VaultManager.getInstance();
  }

  /**
   * Finalizes, validates, and exports an Excel report session to its approved destination.
   */
  public exportReport(
    options: ExportExcelReportOptions
  ): Result<ExportExcelReportResult, AppError> {
    let stagingPath: string | null = null;
    // Set once this operation exclusively created the final file; cleared when the export is fully verified.
    let promotedPath: string | null = null;

    try {
      // -----------------------------------------------------------------------
      // 1. Validate Input Identifiers
      // -----------------------------------------------------------------------
      if (!options.sessionId || !validateInternalIdentifier(options.sessionId)) {
        return Err(
          new AppError({
            code: ErrorCode.VALIDATION_FAILED,
            userMessage: `Invalid report session identifier: "${options.sessionId}".`,
            isOperational: true,
          })
        );
      }

      if (options.workspaceId && !validateInternalIdentifier(options.workspaceId)) {
        return Err(
          new AppError({
            code: ErrorCode.VALIDATION_FAILED,
            userMessage: `Invalid workspace identifier: "${options.workspaceId}".`,
            isOperational: true,
          })
        );
      }

      if (!this.sessionRepo) {
        return Err(
          new AppError({
            code: ErrorCode.MISSING_REQUIRED_CONFIG,
            userMessage: 'Session repository is required for report export.',
            isOperational: true,
          })
        );
      }

      if (!this.workspaceRepo) {
        return Err(
          new AppError({
            code: ErrorCode.MISSING_REQUIRED_CONFIG,
            userMessage: 'Generation workspace repository is required for report export.',
            isOperational: true,
          })
        );
      }

      // -----------------------------------------------------------------------
      // 2. Resolve Report Session & Authoritative State
      // -----------------------------------------------------------------------
      const sessionResult = this.sessionRepo.getSessionById(options.sessionId);
      if (!sessionResult.ok) {
        return sessionResult;
      }
      if (!sessionResult.value) {
        return Err(
          new AppError({
            code: ErrorCode.DRAFT_NOT_FOUND,
            userMessage: `Report session "${options.sessionId}" was not found.`,
            isOperational: true,
          })
        );
      }

      const sessionDetail = sessionResult.value;
      const { session, stations, parsedPayload } = sessionDetail;

      if (session.status === 'CANCELLED') {
        return Err(
          new AppError({
            code: ErrorCode.VALIDATION_FAILED,
            userMessage: `Cannot export cancelled report session "${options.sessionId}".`,
            isOperational: true,
          })
        );
      }

      // -----------------------------------------------------------------------
      // 3. Resolve & Verify Generation Workspace Artifact
      // -----------------------------------------------------------------------
      let workspaceRecord = null;
      if (options.workspaceId) {
        const wsRes = this.workspaceRepo.getWorkspaceById(options.workspaceId);
        if (!wsRes.ok) return wsRes;
        workspaceRecord = wsRes.value;

        if (workspaceRecord && workspaceRecord.sessionId !== options.sessionId) {
          return Err(
            new AppError({
              code: ErrorCode.VALIDATION_FAILED,
              userMessage: `Workspace "${options.workspaceId}" belongs to session "${workspaceRecord.sessionId}", not requested session "${options.sessionId}".`,
              isOperational: true,
            })
          );
        }
      } else {
        const wsRes = this.workspaceRepo.getActiveWorkspaceBySessionId(options.sessionId);
        if (!wsRes.ok) return wsRes;
        workspaceRecord = wsRes.value;
      }

      if (!workspaceRecord) {
        return Err(
          new AppError({
            code: ErrorCode.FILE_NOT_FOUND,
            userMessage: `No active generation workspace found for report session "${options.sessionId}".`,
            isOperational: true,
          })
        );
      }

      if (workspaceRecord.status === 'DISCARDED') {
        return Err(
          new AppError({
            code: ErrorCode.VALIDATION_FAILED,
            userMessage: `Generation workspace "${workspaceRecord.workspaceId}" is marked DISCARDED and cannot be exported.`,
            isOperational: true,
          })
        );
      }

      if (workspaceRecord.documentType !== 'EXCEL_XLSX') {
        return Err(
          new AppError({
            code: ErrorCode.TEMPLATE_UNSUPPORTED_FORMAT,
            userMessage: `Generation workspace contains format "${workspaceRecord.documentType}", expected "EXCEL_XLSX".`,
            isOperational: true,
          })
        );
      }

      // Freshness: reject a workbook generated before the session was last modified.
      // Compared at 1-second granularity (SQLite workspace timestamps have no sub-second part).
      const sessionMs = Math.floor(parseTimestampMs(session.updatedAt) / 1000);
      const workspaceMs = Math.floor(parseTimestampMs(workspaceRecord.updatedAt) / 1000);
      if (Number.isFinite(sessionMs) && Number.isFinite(workspaceMs) && sessionMs > workspaceMs) {
        return Err(
          new AppError({
            code: ErrorCode.VALIDATION_FAILED,
            userMessage:
              'The generated workbook is outdated: report data changed after it was generated. Regenerate the workbook before exporting.',
            isOperational: true,
          })
        );
      }

      // Verify physical presence and SHA-256 integrity of working artifact
      if (!fs.existsSync(workspaceRecord.absolutePath)) {
        return Err(
          new AppError({
            code: ErrorCode.FILE_NOT_FOUND,
            userMessage: `Working workbook file is missing from Workspace directory: "${workspaceRecord.fileName}".`,
            isOperational: true,
          })
        );
      }

      const workingFileBuf = fs.readFileSync(workspaceRecord.absolutePath);
      const computedWorkingHash = crypto.createHash('sha256').update(workingFileBuf).digest('hex');

      if (computedWorkingHash !== workspaceRecord.sha256Hash) {
        return Err(
          new AppError({
            code: ErrorCode.TEMPLATE_INTEGRITY_COMPROMISED,
            userMessage: `Working workbook failed cryptographic integrity check. The artifact may have been corrupted or modified externally.`,
            isOperational: true,
          })
        );
      }

      // -----------------------------------------------------------------------
      // 4. Resolve Destination Directory & Vault Safety Boundary
      // -----------------------------------------------------------------------
      const targetDir = options.destinationDir
        ? path.resolve(options.destinationDir)
        : this.vaultManager.reportsDir;

      assertNoNullBytes(targetDir);

      // Verify target directory is not inside Master Template Vault (INV-DAT-006)
      assertTargetNotInsideVault(
        path.join(targetDir, 'sentinel.xlsx'),
        this.vaultManager.templatesDir
      );

      if (!fs.existsSync(targetDir)) {
        try {
          fs.mkdirSync(targetDir, { recursive: true });
        } catch (dirErr) {
          return Err(
            new AppError({
              code: ErrorCode.FILE_ACCESS_DENIED,
              userMessage: `Failed to create destination directory: "${targetDir}".`,
              cause: dirErr,
              isOperational: true,
            })
          );
        }
      }

      // Check writable permission on target directory
      try {
        fs.accessSync(targetDir, fs.constants.W_OK);
      } catch (accessErr) {
        return Err(
          new AppError({
            code: ErrorCode.FILE_ACCESS_DENIED,
            userMessage: `Destination directory is not writable: "${targetDir}".`,
            cause: accessErr,
            isOperational: true,
          })
        );
      }

      // -----------------------------------------------------------------------
      // 5. Resolve Filename & Collision Handling (DEC-011, NFR-REL-03)
      // -----------------------------------------------------------------------
      let categoryCode = session.categoryId as string;
      if (this.categoryRepo) {
        const catRes = this.categoryRepo.getCategoryById(session.categoryId);
        if (catRes.ok && catRes.value) {
          categoryCode = catRes.value.display_name;
        }
      }

      const payloadData = (parsedPayload?.data ?? {}) as Record<string, unknown>;
      const reportDate =
        options.namingOptions?.reportDate ??
        (typeof payloadData['FLD-COM-DATE'] === 'string'
          ? (payloadData['FLD-COM-DATE'] as string)
          : session.createdAt.slice(0, 10));

      const shift =
        options.namingOptions?.shift ??
        (typeof payloadData['FLD-COM-SHIFT'] === 'string'
          ? (payloadData['FLD-COM-SHIFT'] as string)
          : undefined);

      const resolvedNamingOptions: ExportFilenameOptions = {
        categoryCode: options.namingOptions?.categoryCode ?? categoryCode,
        reportDate,
        stationCodeOrName: options.namingOptions?.stationCodeOrName,
        shift,
        sessionOrSequenceId:
          options.namingOptions?.sessionOrSequenceId ?? session.sessionId.slice(-8),
        customFilename: options.namingOptions?.customFilename,
        customPrefix: options.namingOptions?.customPrefix,
      };

      const desiredFilename = ExcelFilenameResolver.resolveExportFilename(resolvedNamingOptions);
      const collisionPolicy = options.collisionPolicy ?? 'INCREMENT_SUFFIX';

      const collisionRes = ExcelFilenameResolver.resolveCollision(
        targetDir,
        desiredFilename,
        collisionPolicy
      );
      if (!collisionRes.ok) {
        return collisionRes;
      }

      let finalFileName = collisionRes.value;
      let finalPath = path.join(targetDir, finalFileName);

      // Verify resolved path does not target vault
      assertTargetNotInsideVault(finalPath, this.vaultManager.templatesDir);

      // -----------------------------------------------------------------------
      // 6. Pre-Export Master Template Invariant Check (INV-DAT-006)
      // -----------------------------------------------------------------------
      const templateMetaRes = this.templateRepo.getTemplateById(workspaceRecord.templateId);
      if (!templateMetaRes.ok || !templateMetaRes.value) {
        return Err(
          new AppError({
            code: ErrorCode.TEMPLATE_NOT_FOUND,
            userMessage: `Source template "${workspaceRecord.templateId}" not found in template registry.`,
            isOperational: true,
          })
        );
      }

      const versionRes = this.templateRepo.getVersionById(workspaceRecord.versionId);
      if (!versionRes.ok || !versionRes.value) {
        return Err(
          new AppError({
            code: ErrorCode.TEMPLATE_NOT_FOUND,
            userMessage: `Source template version "${workspaceRecord.versionId}" not found in template registry.`,
            isOperational: true,
          })
        );
      }
      const sourceVersion = versionRes.value;

      const masterPathRes = this.vaultManager.resolveTemplateFileVaultPath(sourceVersion.file_name);
      if (!masterPathRes.ok) {
        return masterPathRes;
      }
      const masterPath = masterPathRes.value;

      if (!fs.existsSync(masterPath)) {
        return Err(
          new AppError({
            code: ErrorCode.FILE_NOT_FOUND,
            userMessage: `Physical master template file is missing from Vault: "${masterPath}".`,
            isOperational: true,
          })
        );
      }

      const preMasterBuf = fs.readFileSync(masterPath);
      const preMasterHash = crypto.createHash('sha256').update(preMasterBuf).digest('hex');

      // -----------------------------------------------------------------------
      // 7. Atomic Staging in Destination Directory
      // -----------------------------------------------------------------------
      const stagingFileName = `.export_staging_${Date.now()}_${crypto.randomUUID().slice(0, 8)}.xlsx`;
      stagingPath = path.join(targetDir, stagingFileName);

      try {
        fs.copyFileSync(workspaceRecord.absolutePath, stagingPath);
      } catch (copyErr) {
        return Err(
          new AppError({
            code: ErrorCode.GENERATION_FAILED,
            userMessage: 'Failed to stage report workbook at destination.',
            cause: copyErr,
            isOperational: true,
          })
        );
      }

      // -----------------------------------------------------------------------
      // 8. Staged Workbook Validation (Open XML, Preservation, Report Content)
      // -----------------------------------------------------------------------
      const stagedStat = fs.statSync(stagingPath);
      if (stagedStat.size === 0) {
        return Err(
          new AppError({
            code: ErrorCode.GENERATION_FAILED,
            userMessage: 'Export staging file was created empty (0 bytes).',
            isOperational: true,
          })
        );
      }

      // 8a. Open XML MIME & package structure validation
      const validateDocRes = validateDocumentFile(stagingPath, '.xlsx');
      if (!validateDocRes.ok || !validateDocRes.value.isValid) {
        return Err(
          new AppError({
            code: ErrorCode.TEMPLATE_MALFORMED,
            userMessage: `Staged export file failed Open XML archive validation: ${validateDocRes.ok ? validateDocRes.value.issues.join('; ') : 'Corrupt package.'}`,
            isOperational: true,
          })
        );
      }

      // 8b. Reopen staged workbook via PizZip
      const stagedBuf = fs.readFileSync(stagingPath);
      let stagedZip: PizZip;
      try {
        stagedZip = new PizZip(stagedBuf);
      } catch (zipErr) {
        return Err(
          new AppError({
            code: ErrorCode.TEMPLATE_MALFORMED,
            userMessage: 'Failed to reopen staged export workbook for validation.',
            cause: zipErr,
            isOperational: true,
          })
        );
      }

      const sheetNames = WorksheetXmlEditor.getWorksheetNames(stagedZip);
      if (sheetNames.length === 0) {
        return Err(
          new AppError({
            code: ErrorCode.VALIDATION_FAILED,
            userMessage: 'Finalized workbook contains no worksheets.',
            isOperational: true,
          })
        );
      }

      // 8c. Step 29 Structural Preservation Verification against Master Template
      let preservationReport = undefined;
      const masterZip = new PizZip(preMasterBuf);
      const baselineSnapshot = WorkbookPreservationVerifier.captureSnapshot(masterZip);
      const candidateSnapshot = WorkbookPreservationVerifier.captureSnapshot(stagedZip);

      // Collect planned write targets from template mappings
      let plannedTargets: { cellRef: string; sheetName?: string }[] = [];
      let templateMappings: ExcelFieldMappingRecord[] = [];
      if (this.excelMappingRepo) {
        const mappingsRes = this.excelMappingRepo.getMappings(
          workspaceRecord.templateId,
          workspaceRecord.versionId
        );
        if (mappingsRes.ok) {
          templateMappings = mappingsRes.value;
          plannedTargets = templateMappings.map(m => ({
            cellRef: m.targetCoordinate,
            sheetName: m.worksheetName,
          }));
        }
      }

      preservationReport = WorkbookPreservationVerifier.verifyPreservation(
        baselineSnapshot,
        candidateSnapshot,
        plannedTargets
      );

      if (!preservationReport.isPreserved) {
        const blocking = preservationReport.findings
          .filter(f => f.severity === 'BLOCKING')
          .map(f => f.message)
          .join('; ');
        return Err(
          new AppError({
            code: ErrorCode.VALIDATION_FAILED,
            userMessage: `Exported workbook failed structural preservation verification: ${blocking}`,
            details: { findings: preservationReport.findings },
            isOperational: true,
          })
        );
      }

      // 8d. Content & Data Verification (unless explicitly bypassed)
      let scalarFieldsVerifiedCount = 0;
      let stationRowsVerifiedCount = 0;
      const verifiedStationOrder: string[] = [];

      if (!options.skipContentValidation && templateMappings.length > 0) {
        const sharedStrings = WorksheetXmlEditor.readSharedStrings(stagedZip).strings;

        // Verify mapped scalar fields
        for (const mapping of templateMappings) {
          if (mapping.mappingType === 'FIXED_CELL') {
            const rawVal = payloadData[mapping.fieldId];
            if (rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== '') {
              const sheetPath = WorksheetXmlEditor.resolveWorksheetPath(
                stagedZip,
                mapping.worksheetName
              );
              if (sheetPath) {
                const cellRead = WorksheetXmlEditor.readCellRaw(
                  stagedZip,
                  sheetPath,
                  mapping.targetCoordinate,
                  sharedStrings
                );

                if (!cellRead || cellRead.value === null || cellRead.value === undefined) {
                  return Err(
                    new AppError({
                      code: ErrorCode.GENERATION_FAILED,
                      userMessage: `Final workbook content verification failed: expected value for field "${mapping.fieldLabel}" (${mapping.fieldId}) was not found at cell ${mapping.targetCoordinate} on sheet "${mapping.worksheetName}".`,
                      isOperational: true,
                    })
                  );
                }
                scalarFieldsVerifiedCount++;
              }
            }
          }
        }

        // Verify station rows: exact station identity and exact row order against the session.
        const tableMappings = templateMappings.filter(m => m.mappingType === 'TABLE_COLUMN');
        if (tableMappings.length > 0 && stations.length > 0) {
          const headerRowNumber = tableMappings[0].headerRowNumber ?? 1;
          const targetSheet = tableMappings[0].worksheetName;
          const sheetMappings = tableMappings.filter(m => m.worksheetName === targetSheet);
          const sheetPath = WorksheetXmlEditor.resolveWorksheetPath(stagedZip, targetSheet);
          if (!sheetPath) {
            return Err(
              new AppError({
                code: ErrorCode.GENERATION_FAILED,
                userMessage: `Final workbook content verification failed: station worksheet "${targetSheet}" was not found.`,
                isOperational: true,
              })
            );
          }

          // Authoritative order: the frozen session station snapshots by sequence order.
          const orderedStations = [...stations].sort((a, b) => a.sequenceOrder - b.sequenceOrder);
          const payloadStations = Array.isArray(payloadData.stations)
            ? (payloadData.stations as unknown[])
            : [];

          for (let i = 0; i < orderedStations.length; i++) {
            const stn = orderedStations[i];
            const rowNumber = headerRowNumber + 1 + i;
            const payloadRec = payloadStations.find(
              (item): item is Record<string, unknown> =>
                typeof item === 'object' &&
                item !== null &&
                String((item as Record<string, unknown>).stationId) === String(stn.stationId)
            );
            let comparedCells = 0;

            for (const mapping of sheetMappings) {
              const canonicalName = isApprovedField(mapping.fieldId)
                ? (getFieldDefinition(mapping.fieldId)?.canonicalName ?? '')
                : '';

              let expected: unknown;
              if (mapping.fieldId === 'FLD-COM-STATION' || canonicalName === 'station_name') {
                expected = stn.stationNameSnapshot;
              } else if (canonicalName === 'station_code') {
                expected = stn.stationCodeSnapshot ?? undefined;
              } else if (canonicalName === 'row_number' || canonicalName === 'sequence_order') {
                expected = stn.sequenceOrder;
              } else if (payloadRec) {
                expected = payloadRec[mapping.fieldId] ?? payloadRec[canonicalName];
              }
              // Only strings and numbers are compared; other source types have no
              // unambiguous cell representation.
              if (typeof expected !== 'string' && typeof expected !== 'number') continue;
              if (expected === '') continue;

              const cellRef = `${mapping.targetCoordinate.toUpperCase()}${rowNumber}`;
              const cell = WorksheetXmlEditor.readCellRaw(
                stagedZip,
                sheetPath,
                cellRef,
                sharedStrings
              );
              if (!cell || cell.value === null || String(cell.value) !== String(expected)) {
                return Err(
                  new AppError({
                    code: ErrorCode.GENERATION_FAILED,
                    userMessage: `Final workbook content verification failed: row ${rowNumber} (sequence ${stn.sequenceOrder}, station ID "${stn.stationId}") does not match the session data for field "${mapping.fieldLabel}" (${mapping.fieldId}) at cell ${cellRef}.`,
                    isOperational: true,
                  })
                );
              }
              comparedCells++;
            }

            if (comparedCells === 0) {
              return Err(
                new AppError({
                  code: ErrorCode.GENERATION_FAILED,
                  userMessage: `Final workbook content verification failed: row ${rowNumber} for station ID "${stn.stationId}" has no mapped column that can be verified against the session.`,
                  isOperational: true,
                })
              );
            }
            verifiedStationOrder.push(String(stn.stationId));
            stationRowsVerifiedCount++;
          }
        }
      }

      // -----------------------------------------------------------------------
      // 9. Master Template Immutability Check Before Promotion (INV-DAT-006)
      // -----------------------------------------------------------------------
      const postMasterBuf = fs.readFileSync(masterPath);
      const postMasterHash = crypto.createHash('sha256').update(postMasterBuf).digest('hex');
      if (preMasterHash !== postMasterHash) {
        throw new Error(
          'CRITICAL SECURITY & INTEGRITY VIOLATION: Master template in Vault was mutated during export!'
        );
      }

      // -----------------------------------------------------------------------
      // 10. No-Clobber Promotion to Final Destination Path
      //     COPYFILE_EXCL makes creation exclusive: an existing file (including one created
      //     by a concurrent export after the earlier existence check) is never overwritten.
      //     This is copy-then-delete, not an atomic rename.
      // -----------------------------------------------------------------------
      for (let attempt = 0; ; attempt++) {
        try {
          fs.copyFileSync(stagingPath, finalPath, fs.constants.COPYFILE_EXCL);
          promotedPath = finalPath;
          break;
        } catch (promoteErr) {
          const errCode = (promoteErr as NodeJS.ErrnoException).code;
          if (errCode === 'EEXIST') {
            if (collisionPolicy === 'INCREMENT_SUFFIX' && attempt < 100) {
              const retryRes = ExcelFilenameResolver.resolveCollision(
                targetDir,
                desiredFilename,
                'INCREMENT_SUFFIX'
              );
              if (!retryRes.ok) return retryRes;
              finalFileName = retryRes.value;
              finalPath = path.join(targetDir, finalFileName);
              assertTargetNotInsideVault(finalPath, this.vaultManager.templatesDir);
              continue;
            }
            return Err(
              new AppError({
                code: ErrorCode.OUTPUT_DESTINATION_COLLISION,
                userMessage: `A report file named "${finalFileName}" was created at the destination during export. The existing file was not modified.`,
                cause: promoteErr,
                isOperational: true,
              })
            );
          }
          // Only a mid-write failure can leave a partial file that this operation created.
          // For permission/lock errors the destination may belong to someone else: never touch it.
          if ((errCode === 'ENOSPC' || errCode === 'EIO') && fs.existsSync(finalPath)) {
            promotedPath = finalPath;
          }
          return Err(
            new AppError({
              code:
                errCode === 'EACCES' || errCode === 'EPERM' || errCode === 'EBUSY'
                  ? ErrorCode.FILE_ACCESS_DENIED
                  : errCode === 'ENOSPC'
                    ? ErrorCode.DISK_SPACE_EXHAUSTED
                    : ErrorCode.GENERATION_FAILED,
              userMessage: `Failed to promote staged report to final destination: "${finalFileName}".`,
              cause: promoteErr,
              isOperational: true,
            })
          );
        }
      }

      try {
        fs.unlinkSync(stagingPath);
        stagingPath = null;
      } catch {
        // Staging cleanup failure is reported via warnings below; the final file is unaffected.
      }

      // -----------------------------------------------------------------------
      // 11. Final Verification on Actual Final Output Path (On Disk)
      // -----------------------------------------------------------------------
      if (!fs.existsSync(finalPath)) {
        return Err(
          new AppError({
            code: ErrorCode.FILE_NOT_FOUND,
            userMessage: `Final export file does not exist at destination: "${finalPath}".`,
            isOperational: true,
          })
        );
      }

      const finalStat = fs.statSync(finalPath);
      const finalBuf = fs.readFileSync(finalPath);
      const finalHash = crypto.createHash('sha256').update(finalBuf).digest('hex');

      // Identity check: the final file must be byte-identical to the verified staged candidate
      const stagedHash = crypto.createHash('sha256').update(stagedBuf).digest('hex');
      if (finalHash !== stagedHash) {
        return Err(
          new AppError({
            code: ErrorCode.GENERATION_FAILED,
            userMessage:
              'The exported file does not match the verified candidate (it may have been modified during export).',
            isOperational: true,
          })
        );
      }

      // Re-validate final file on disk
      const finalDocValidate = validateDocumentFile(finalPath, '.xlsx');
      if (!finalDocValidate.ok || !finalDocValidate.value.isValid) {
        return Err(
          new AppError({
            code: ErrorCode.TEMPLATE_MALFORMED,
            userMessage: `Final export file on disk failed Open XML integrity verification.`,
            isOperational: true,
          })
        );
      }

      // The final file is now verified; from here on it must never be deleted.
      promotedPath = null;

      // -----------------------------------------------------------------------
      // 12. State Transition & Persistence (failures reported, never hidden)
      // -----------------------------------------------------------------------
      const warnings: string[] = [];
      if (stagingPath) {
        warnings.push(`Temporary staging file could not be removed: ${path.basename(stagingPath)}`);
      }

      const wsStatusRes = this.workspaceRepo.updateWorkspaceStatus(
        workspaceRecord.workspaceId,
        'COMPLETED'
      );
      if (!wsStatusRes.ok) {
        warnings.push(
          `The report file was saved, but the workspace status could not be updated: ${wsStatusRes.error.userMessage}`
        );
      }

      if (options.markSessionCompleted && session.status !== 'COMPLETED') {
        const sessionUpdateRes = this.sessionRepo.updateSessionDraft(session.sessionId, {
          status: 'COMPLETED',
        });
        if (!sessionUpdateRes.ok) {
          warnings.push(
            `The report file was saved, but the session could not be marked completed: ${sessionUpdateRes.error.userMessage}`
          );
        }
      }

      // -----------------------------------------------------------------------
      // 13. Construct and Return Success Result
      // -----------------------------------------------------------------------
      const validationSummary: ExportValidationSummary = {
        fileExists: true,
        fileSizeBytes: finalStat.size,
        sha256Hash: finalHash,
        isOpenXmlCompliant: true,
        sheetsVerified: sheetNames,
        scalarFieldsVerifiedCount,
        stationRowsVerifiedCount,
        verifiedStationOrder,
        preservationReport,
        masterUntouched: true,
      };

      const result: ExportExcelReportResult = {
        finalPath,
        fileName: finalFileName,
        fileSizeBytes: finalStat.size,
        sha256Hash: finalHash,
        sessionId: session.sessionId,
        workspaceId: workspaceRecord.workspaceId,
        templateId: workspaceRecord.templateId,
        versionId: workspaceRecord.versionId,
        exportedAt: new Date().toISOString(),
        persistenceComplete: warnings.length === 0,
        warnings,
        validationSummary,
      };

      return Ok(result);
    } catch (err) {
      if (err instanceof AppError) {
        return Err(err);
      }

      return Err(
        new AppError({
          code: ErrorCode.GENERATION_FAILED,
          userMessage: 'An unexpected error occurred during Excel report export.',
          details: { developerMessage: err instanceof Error ? err.message : String(err) },
          cause: err,
          isOperational: true,
        })
      );
    } finally {
      // Delete ONLY files this operation created. A verified final report is never removed here
      // (promotedPath is cleared once verification passes); an unverified promoted file is.
      for (const owned of [stagingPath, promotedPath]) {
        if (owned && fs.existsSync(owned)) {
          try {
            fs.unlinkSync(owned);
          } catch {
            // Cleanup failure leaves an operation-owned temp file; surfaced via warnings when possible.
          }
        }
      }
    }
  }
}

/**
 * Parses an ISO 8601 timestamp or a SQLite 'YYYY-MM-DD HH:MM:SS' (UTC) timestamp to epoch ms.
 */
function parseTimestampMs(value: string): number {
  const iso = /Z|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value.replace(' ', 'T')}Z`;
  return Date.parse(iso);
}
