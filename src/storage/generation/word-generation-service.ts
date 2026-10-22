/**
 * OpsReport Studio — Word Generation Service (Step 31)
 *
 * Controlled generation operation for Word reports:
 *   source validation -> mapping plan (pre-mutation) -> replacement -> candidate save
 *   -> reopen -> completeness/preservation checks -> promotion -> persistence.
 *
 * Scope: mapped `{token}` placeholders in ordinary main-body paragraphs outside tables.
 * Tables, headers, footers and other regions are detected and block false success; they are
 * extended in Step 32.
 *
 * Invariants:
 * - The master template is read-only; its SHA-256 is verified before and after.
 * - All mutation happens in an operation-owned candidate; the previous working artifact is
 *   untouched until the candidate passes every blocking check.
 * - Diagnostics never contain report values.
 *
 * @module storage/generation/word-generation-service
 */

import fs from 'node:fs';
import crypto from 'node:crypto';
import PizZip from 'pizzip';
import type {
  GenerateWordDocumentOptions,
  WordGenerationIssue,
  WordGenerationResult,
  WordPlannedReplacement,
} from '../../shared/types/word-generation.ts';
import type { WordFieldMappingRecord } from '../../shared/types/word-mapping.ts';
import { VaultManager } from '../vault/vault-manager.ts';
import { SessionRepository } from '../database/repositories/session-repository.ts';
import { TemplateMetadataRepository } from '../database/repositories/template-metadata-repository.ts';
import { GenerationWorkspaceRepository } from '../database/repositories/generation-workspace-repository.ts';
import { WordMappingRepository } from '../database/repositories/word-mapping-repository.ts';
import { MappingProfileRepository } from '../database/repositories/mapping-profile-repository.ts';
import { validateDocumentFile } from '../vault/document-validator.ts';
import {
  validateInternalIdentifier,
  assertNoNullBytes,
  assertPathInsideRoot,
  assertTargetNotInsideVault,
} from '../vault/path-security.ts';
import { getFieldDefinition, isApprovedField } from '../../shared/constants/report-fields.ts';
import { APPROVED_FIELD_ENUMERATIONS } from './excel-data-injection-service.ts';
import {
  WordXmlError,
  expectedParagraphText,
  paragraphText,
  parseWordPart,
  replaceBodyPlaceholders,
  scanWordPackage,
  validateReplacementText,
  isSupportedBodyParagraph,
  type WordPackageScan,
} from './word-placeholder-engine.ts';
import {
  extractTables,
  replaceTableCellPlaceholders,
  replaceTableCellCoordinate,
  expandRepeatingRows,
  type RepeatingRecordItem,
} from './word-table-engine.ts';
import { processHeadersAndFooters } from './word-header-footer-engine.ts';
import { Result, Ok, Err } from '../../shared/types/result.ts';
import { AppError } from '../../shared/errors/app-error.ts';
import { ErrorCode } from '../../shared/errors/error-codes.ts';

type ResolvedValue = { ok: true; text: string } | { ok: false; issue: WordGenerationIssue };

function sha256(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function normalizeToken(coordinate: string): string {
  const t = coordinate.trim();
  return t.startsWith('{') ? t : `{${t}}`;
}

export class WordGenerationService {
  constructor(
    private readonly sessionRepo: SessionRepository,
    private readonly templateRepo: TemplateMetadataRepository,
    private readonly workspaceRepo: GenerationWorkspaceRepository,
    private readonly wordMappingRepo: WordMappingRepository,
    private readonly profileRepo: MappingProfileRepository,
    private readonly vaultManager: VaultManager
  ) {}

  public generateWordDocument(
    options: GenerateWordDocumentOptions
  ): Result<WordGenerationResult, AppError> {
    let candidatePath: string | null = null;

    try {
      // ---- 1. Identifiers --------------------------------------------------------------
      assertNoNullBytes(options.workspaceId);
      assertNoNullBytes(options.sessionId);
      if (!validateInternalIdentifier(options.workspaceId)) {
        return this.err(ErrorCode.VALIDATION_FAILED, 'Invalid workspace identifier format.');
      }
      if (!validateInternalIdentifier(options.sessionId)) {
        return this.err(ErrorCode.VALIDATION_FAILED, 'Invalid session identifier format.');
      }

      // ---- 2. Session ------------------------------------------------------------------
      const sessionRes = this.sessionRepo.getSessionById(options.sessionId);
      if (!sessionRes.ok) return sessionRes;
      if (!sessionRes.value) {
        return this.err(
          ErrorCode.DRAFT_NOT_FOUND,
          `Report session "${options.sessionId}" was not found.`
        );
      }
      const session = sessionRes.value.session;
      if (session.status === 'CANCELLED') {
        return this.err(
          ErrorCode.VALIDATION_FAILED,
          `Report session "${options.sessionId}" is CANCELLED and cannot undergo document generation.`
        );
      }
      const rawData = options.overrideFormData ?? sessionRes.value.parsedPayload?.data ?? {};
      if (typeof rawData !== 'object' || rawData === null || Array.isArray(rawData)) {
        return this.err(ErrorCode.VALIDATION_FAILED, 'Report session payload is malformed.');
      }
      const sessionData = rawData as Record<string, unknown>;

      // ---- 3. Workspace ----------------------------------------------------------------
      const wsRes = this.workspaceRepo.getWorkspaceById(options.workspaceId);
      if (!wsRes.ok) return wsRes;
      const workspace = wsRes.value;
      if (!workspace) {
        return this.err(
          ErrorCode.GENERATION_FAILED,
          `Generation workspace "${options.workspaceId}" was not found.`
        );
      }
      if (workspace.documentType !== 'WORD_DOCX') {
        return this.err(
          ErrorCode.TEMPLATE_UNSUPPORTED_FORMAT,
          'The workspace does not hold a Word (.docx) working copy.'
        );
      }
      if (workspace.status !== 'PREPARED') {
        return this.err(
          ErrorCode.GENERATION_FAILED,
          `Workspace is ${workspace.status}; a Word document can only be generated from a pristine PREPARED clone. Prepare a new workspace.`
        );
      }
      if (workspace.sessionId && workspace.sessionId !== options.sessionId) {
        return this.err(
          ErrorCode.VALIDATION_FAILED,
          'The workspace belongs to a different report session.'
        );
      }
      if (session.templateId && session.templateId !== workspace.templateId) {
        return this.err(
          ErrorCode.VALIDATION_FAILED,
          `Report session references template "${session.templateId}", but the workspace was created for "${workspace.templateId}".`
        );
      }
      const workingPath = workspace.absolutePath;
      assertPathInsideRoot(workingPath, this.vaultManager.workspaceDir);
      assertTargetNotInsideVault(workingPath, this.vaultManager.templatesDir);
      if (!workingPath.toLowerCase().endsWith('.docx')) {
        return this.err(ErrorCode.TEMPLATE_UNSUPPORTED_FORMAT, 'Working copy is not a .docx file.');
      }
      if (!fs.existsSync(workingPath)) {
        return this.err(
          ErrorCode.GENERATION_FAILED,
          'The working document for this workspace is missing from disk.'
        );
      }

      // ---- 4. Template provenance & master integrity ----------------------------------------------
      const tplRes = this.templateRepo.getTemplateById(workspace.templateId);
      if (!tplRes.ok) return tplRes;
      const template = tplRes.value;
      if (!template) {
        return this.err(
          ErrorCode.TEMPLATE_NOT_FOUND,
          'Master template is missing from the registry.'
        );
      }
      if (template.document_type !== 'WORD_DOCX') {
        return this.err(
          ErrorCode.TEMPLATE_UNSUPPORTED_FORMAT,
          'Registered template is not a Word template.'
        );
      }
      const verRes = this.templateRepo.getVersionById(workspace.versionId);
      if (!verRes.ok) return verRes;
      const version = verRes.value;
      if (!version || version.template_id !== workspace.templateId) {
        return this.err(
          ErrorCode.TEMPLATE_NOT_FOUND,
          'The template version referenced by the workspace is unknown.'
        );
      }
      const masterPathRes = this.vaultManager.resolveTemplateFileVaultPath(version.file_name);
      if (!masterPathRes.ok) return masterPathRes;
      const masterPath = masterPathRes.value;
      if (!fs.existsSync(masterPath)) {
        return this.err(
          ErrorCode.FILE_NOT_FOUND,
          'Master template file is missing from the vault.'
        );
      }
      const preMasterHash = sha256(fs.readFileSync(masterPath));
      if (version.sha256_hash !== '0'.repeat(64) && preMasterHash !== version.sha256_hash) {
        return this.err(
          ErrorCode.TEMPLATE_INTEGRITY_COMPROMISED,
          'Master template fails integrity verification before generation.'
        );
      }
      const workingBytes = fs.readFileSync(workingPath);
      const workingHash = sha256(workingBytes);
      if (workingHash !== workspace.sha256Hash.toLowerCase() || workingHash !== preMasterHash) {
        return this.err(
          ErrorCode.TEMPLATE_INTEGRITY_COMPROMISED,
          'The working copy no longer matches the pristine master template clone.'
        );
      }

      // ---- 5. Mapping configuration --------------------------------------------------------------
      let mappings: WordFieldMappingRecord[] = [];
      if (options.profileId) {
        const profRes = this.profileRepo.getProfile(options.profileId);
        if (!profRes.ok) return profRes;
        const profile = profRes.value;
        if (!profile) {
          return this.err(
            ErrorCode.MAPPING_PROFILE_NOT_FOUND,
            `Mapping profile "${options.profileId}" was not found.`
          );
        }
        if (profile.documentType !== 'WORD_DOCX') {
          return this.err(
            ErrorCode.VALIDATION_FAILED,
            'The mapping profile is not configured for Word documents.'
          );
        }
        if (
          profile.templateId !== workspace.templateId ||
          profile.versionId !== workspace.versionId
        ) {
          return this.err(
            ErrorCode.MAPPING_INCOMPATIBLE,
            'The mapping profile does not belong to the workspace template version.'
          );
        }
        mappings = profile.wordMappings ?? [];
      } else {
        const mapRes = this.wordMappingRepo.getMappings(workspace.templateId, workspace.versionId);
        if (!mapRes.ok) return mapRes;
        mappings = mapRes.value;
      }
      if (mappings.length === 0) {
        return this.err(
          ErrorCode.VALIDATION_FAILED,
          `No Word field mappings found for template "${workspace.templateId}" (version ${workspace.versionId}). Configure mappings first.`
        );
      }

      // ---- 6. Open working copy & scan (single indexed pass) ---------------------------------
      const containerCheck = validateDocumentFile(workingPath, '.docx');
      if (!containerCheck.ok) return containerCheck;
      if (!containerCheck.value.isValid) {
        return this.err(
          ErrorCode.TEMPLATE_MALFORMED,
          'The working Word document failed package validation.'
        );
      }
      let scan: WordPackageScan;
      let sourceZip: PizZip;
      try {
        sourceZip = new PizZip(workingBytes);
        scan = scanWordPackage(sourceZip);
      } catch (e) {
        return this.xmlFailure(e, 'SOURCE_TEMPLATE');
      }

      // Build repeating record collection for repeating rows (Step 32)
      let repeatingRecords: RepeatingRecordItem[] = [];
      const sessionStations = sessionRes.value.stations;
      if (sessionStations && sessionStations.length > 0) {
        repeatingRecords = sessionStations.map(stn => {
          let extra: Record<string, unknown> = {};
          if (Array.isArray(sessionData.stations)) {
            const found = (sessionData.stations as any[]).find(
              s => s && (s.stationId === stn.stationId || s.stationName === stn.stationNameSnapshot)
            );
            if (found && typeof found === 'object') extra = found;
          }
          return {
            stationId: stn.stationId,
            stationName: stn.stationNameSnapshot,
            sequenceOrder: stn.sequenceOrder,
            ...extra,
          };
        });
      } else if (Array.isArray(sessionData.stations)) {
        repeatingRecords = (sessionData.stations as any[]).map((item, idx) => ({
          stationId: item?.stationId ?? item?.id ?? `STN-${idx + 1}`,
          stationName: item?.stationName ?? item?.name ?? `Station ${idx + 1}`,
          sequenceOrder: item?.sequenceOrder ?? item?.order ?? idx + 1,
          ...(typeof item === 'object' && item !== null ? item : {}),
        }));
      } else if (Array.isArray(sessionData.records)) {
        repeatingRecords = (sessionData.records as any[]).map((item, idx) => ({
          sequenceOrder: idx + 1,
          ...(typeof item === 'object' && item !== null ? item : {}),
        }));
      }
      repeatingRecords.sort((a, b) => (a.sequenceOrder ?? 0) - (b.sequenceOrder ?? 0));

      // ---- 7. Replacement plan (validated before any mutation) -----------------------------------
      const { plan, values, issues } = this.buildPlan(
        mappings,
        sessionData,
        scan,
        template.category_id,
        options.allowUnmappedTokens === true,
        repeatingRecords
      );
      const errors = issues.filter(i => i.severity === 'error');
      const warnings = issues.filter(i => i.severity === 'warning');
      if (errors.length > 0) {
        return this.planFailure(errors);
      }

      // ---- 8. Mutate in memory, save an operation-owned candidate --------------------------------
      let newXml = scan.bodyPart.xml;
      let totalReplacementsApplied = 0;

      // 8a. Replace main-body placeholders
      try {
        const r = replaceBodyPlaceholders(scan.bodyPart, values);
        newXml = r.xml;
        for (const cnt of r.counts.values()) totalReplacementsApplied += cnt;
      } catch (e) {
        return this.xmlFailure(e, 'REPLACEMENT');
      }

      // 8b. Replace table-cell placeholders (tokens inside table cells)
      try {
        const tr = replaceTableCellPlaceholders(newXml, values);
        newXml = tr.xml;
        for (const cnt of tr.counts.values()) totalReplacementsApplied += cnt;
      } catch (e) {
        return this.xmlFailure(e, 'REPLACEMENT');
      }

      // 8c. Replace fixed table cell coordinates (TABLE_CELL)
      const tableCellPlans = plan.filter(p => p.mappingType === 'TABLE_CELL');
      for (const tcPlan of tableCellPlans) {
        if (tcPlan.tableIndex && tcPlan.rowIndex && tcPlan.colIndex) {
          const val = values.get(tcPlan.targetCoordinate ?? tcPlan.token) ?? values.get(tcPlan.fieldId) ?? '';
          newXml = replaceTableCellCoordinate(
            newXml,
            tcPlan.tableIndex,
            tcPlan.rowIndex,
            tcPlan.colIndex,
            val
          );
          totalReplacementsApplied += 1;
        }
      }

      // 8d. Expand repeating rows (REPEATING_ROW)
      let tableRowsGenerated = 0;
      const repeatingPlans = plan.filter(p => p.mappingType === 'REPEATING_ROW');
      for (const repPlan of repeatingPlans) {
        if (repPlan.tableIndex && repPlan.rowIndex) {
          const expRes = expandRepeatingRows(newXml, {
            tableIndex: repPlan.tableIndex,
            prototypeRowIndex: repPlan.rowIndex,
            records: repeatingRecords,
            fieldValues: values,
          });
          newXml = expRes.xml;
          tableRowsGenerated += repeatingRecords.length;
        }
      }

      // 8e. Header & footer placeholder replacements
      const outZip = new PizZip(workingBytes);
      outZip.file('word/document.xml', newXml);
      try {
        const hfRes = processHeadersAndFooters(outZip, values);
        for (const cnt of hfRes.counts.values()) totalReplacementsApplied += cnt;
      } catch (e) {
        return this.xmlFailure(e, 'REPLACEMENT');
      }

      const outBuf = outZip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });

      const candidateName = `word_candidate_${Date.now()}_${crypto.randomUUID().slice(0, 8)}.docx`;
      const candRes = this.vaultManager.resolveWorkspacePath(candidateName);
      if (!candRes.ok) return candRes;
      candidatePath = candRes.value;
      assertPathInsideRoot(candidatePath, this.vaultManager.workspaceDir);
      assertTargetNotInsideVault(candidatePath, this.vaultManager.templatesDir);
      try {
        // 'wx' never overwrites an existing artifact.
        fs.writeFileSync(candidatePath, outBuf, { flag: 'wx' });
      } catch (e) {
        const owned =
          fs.existsSync(candidatePath) && !(e as NodeJS.ErrnoException).code?.includes('EEXIST');
        if (!owned) candidatePath = null;
        return this.err(
          ErrorCode.FILE_ACCESS_DENIED,
          'The candidate Word document could not be saved. The existing working document was left unchanged.',
          { stage: 'CANDIDATE_SAVE', developerMessage: String(e) }
        );
      }

      // ---- 9. Reopen & verify ------------------------------------------------------
      const verifyIssues = this.verifyCandidate(
        candidatePath,
        scan,
        values,
        sourceZip,
        plan,
        repeatingRecords
      );
      if (verifyIssues.length > 0) {
        return this.planFailure(verifyIssues);
      }

      const postMasterHash = sha256(fs.readFileSync(masterPath));
      if (postMasterHash !== preMasterHash) {
        return this.err(
          ErrorCode.TEMPLATE_READONLY_VIOLATION,
          'CRITICAL INVARIANT VIOLATION: Master template bytes changed during generation.',
          { stage: 'ACCEPTANCE' },
          false
        );
      }

      // ---- 10. Promote the verified candidate, then persist ---------------------------------
      const candidateBytes = fs.readFileSync(candidatePath);
      const candidateHash = sha256(candidateBytes);
      try {
        fs.renameSync(candidatePath, workingPath);
        candidatePath = null;
      } catch (e) {
        return this.err(
          ErrorCode.FILE_ACCESS_DENIED,
          'The verified candidate could not be promoted. The existing working document was left unchanged.',
          { stage: 'ACCEPTANCE', developerMessage: String(e) }
        );
      }

      const promotedHash = sha256(fs.readFileSync(workingPath));
      const persisted =
        promotedHash === candidateHash
          ? this.workspaceRepo.updateWorkspaceFile(workspace.workspaceId, {
              sha256Hash: candidateHash,
              fileSizeBytes: candidateBytes.length,
              status: 'IN_USE',
            })
          : Err(
              new AppError({
                code: ErrorCode.GENERATION_FAILED,
                userMessage: 'The promoted document does not match the validated candidate.',
                isOperational: true,
              })
            );
      if (!persisted.ok) {
        // Filesystem and database are not atomic: restore the previous working bytes truthfully.
        let restored = false;
        try {
          const tmp = `${workingPath}.restore_${crypto.randomUUID().slice(0, 8)}`;
          fs.writeFileSync(tmp, workingBytes, { flag: 'wx' });
          fs.renameSync(tmp, workingPath);
          restored = true;
        } catch {
          restored = false;
        }
        return this.err(
          ErrorCode.PERSISTENCE_FAILED,
          restored
            ? 'The document was generated but could not be recorded. The previous working document was restored.'
            : 'The document was generated but could not be recorded, and the previous working document could not be restored automatically.',
          { stage: 'ACCEPTANCE', previousDocumentRestored: restored }
        );
      }

      return Ok({
        workspace: persisted.value,
        plan,
        replacementsApplied: totalReplacementsApplied,
        tableRowsGenerated,
        warnings,
        masterUntouched: true,
        candidateAccepted: true,
        sha256Hash: candidateHash,
      });
    } catch (e) {
      if (e instanceof AppError) return Err(e);
      return this.err(
        ErrorCode.GENERATION_FAILED,
        'Word document generation failed unexpectedly. No document was accepted.',
        { developerMessage: String(e) }
      );
    } finally {
      // Only the operation-owned candidate is ever cleaned up.
      if (candidatePath) {
        try {
          if (fs.existsSync(candidatePath)) fs.unlinkSync(candidatePath);
        } catch {
          // Cleanup failure is non-fatal; the orphan lives only in the Workspace directory.
        }
      }
    }
  }

  // -------------------------------------------------------------------------------------
  // Planning
  // -------------------------------------------------------------------------------------

  private buildPlan(
    mappings: readonly WordFieldMappingRecord[],
    data: Record<string, unknown>,
    scan: WordPackageScan,
    categoryId: string,
    allowUnmapped: boolean,
    _repeatingRecords: readonly RepeatingRecordItem[]
  ): {
    plan: WordPlannedReplacement[];
    values: Map<string, string>;
    issues: WordGenerationIssue[];
  } {
    const issues: WordGenerationIssue[] = [];
    const plan: WordPlannedReplacement[] = [];
    const values = new Map<string, string>();
    const byLowerToken = new Map<string, WordFieldMappingRecord[]>();
    const mappedTokens = new Set<string>();
    const tables = extractTables(scan.bodyPart.xml);

    const push = (
      code: WordGenerationIssue['code'],
      severity: 'error' | 'warning',
      message: string,
      m?: WordFieldMappingRecord,
      token?: string,
      location?: WordGenerationIssue['location']
    ): void => {
      issues.push({
        stage: 'MAPPING_PLAN',
        code,
        severity,
        message,
        fieldId: m?.fieldId,
        token,
        location,
      });
    };

    for (const m of mappings) {
      const def = isApprovedField(m.fieldId) ? getFieldDefinition(m.fieldId) : undefined;
      const required = def?.isRequired ?? true;

      // In Step 32: PLACEHOLDER, TABLE_CELL, and REPEATING_ROW are supported.
      if (
        m.mappingType !== 'PLACEHOLDER' &&
        m.mappingType !== 'TABLE_CELL' &&
        m.mappingType !== 'REPEATING_ROW'
      ) {
        push(
          'UNSUPPORTED_MAPPING_TYPE',
          'error',
          `Mapping type ${m.mappingType} for field "${m.fieldId}" is not supported.`,
          m
        );
        continue;
      }

      if (m.mappingType === 'TABLE_CELL') {
        const match = m.targetCoordinate.trim().match(/^T([1-9][0-9]*):R([1-9][0-9]*):C([1-9][0-9]*)$/i);
        if (!match) {
          push('AMBIGUOUS_MAPPING', 'error', 'Invalid table cell coordinate format.', m, m.targetCoordinate);
          continue;
        }
        const tableIndex = parseInt(match[1], 10);
        const rowIndex = parseInt(match[2], 10);
        const colIndex = parseInt(match[3], 10);

        const targetTbl = tables.find(t => t.tableIndex === tableIndex);
        if (!targetTbl) {
          push('MISSING_TARGET_TABLE', 'error', `Target table T${tableIndex} was not found in the template.`, m, m.targetCoordinate);
          continue;
        }
        const targetRow = targetTbl.rows.find(r => r.rowIndex === rowIndex);
        if (!targetRow) {
          push('MISSING_MAPPED_CELL', 'error', `Target row R${rowIndex} was not found in table T${tableIndex}.`, m, m.targetCoordinate);
          continue;
        }
        const targetCell = targetRow.cells.find(c => c.colIndex === colIndex);
        if (!targetCell) {
          push('MISSING_MAPPED_CELL', 'error', `Target cell C${colIndex} was not found in row R${rowIndex} of table T${tableIndex}.`, m, m.targetCoordinate);
          continue;
        }

        if (!isApprovedField(m.fieldId)) {
          push('UNAUTHORIZED_FIELD', 'error', `Field "${m.fieldId}" is not an approved report field.`, m, m.targetCoordinate);
          continue;
        }
        const fDef = getFieldDefinition(m.fieldId)!;
        if (fDef.categoryId !== 'ALL' && fDef.categoryId !== categoryId) {
          push('UNAUTHORIZED_FIELD', 'error', `Field "${m.fieldId}" does not belong to the template's report category.`, m, m.targetCoordinate);
          continue;
        }
        if (fDef.repetitionModel === 'REPEATING') {
          push('REPEATING_FIELD_UNSUPPORTED', fDef.isRequired ? 'error' : 'warning', `Repeating field "${m.fieldId}" cannot be mapped to a single table cell.`, m, m.targetCoordinate);
          continue;
        }

        const resolved = this.resolveValue(m, fDef.dataType, fDef.isRequired, data);
        if (!resolved.ok) {
          issues.push(resolved.issue);
          continue;
        }
        values.set(m.targetCoordinate, resolved.text);
        values.set(m.fieldId, resolved.text);
        plan.push({
          fieldId: m.fieldId,
          fieldLabel: m.fieldLabel,
          token: m.targetCoordinate,
          isRequired: fDef.isRequired,
          expectedOccurrences: 1,
          isRepeated: false,
          mappingType: 'TABLE_CELL',
          targetCoordinate: m.targetCoordinate,
          tableIndex,
          rowIndex,
          colIndex,
        });
        continue;
      }

      if (m.mappingType === 'REPEATING_ROW') {
        const match = m.targetCoordinate.trim().match(/^T([1-9][0-9]*):R([1-9][0-9]*):(LOOP|LOOP_ROW|\{[a-zA-Z0-9_#/-]+\})$/i);
        if (!match) {
          push('AMBIGUOUS_MAPPING', 'error', 'Invalid repeating row coordinate format.', m, m.targetCoordinate);
          continue;
        }
        const tableIndex = parseInt(match[1], 10);
        const rowIndex = parseInt(match[2], 10);

        const targetTbl = tables.find(t => t.tableIndex === tableIndex);
        if (!targetTbl) {
          push('MISSING_TARGET_TABLE', 'error', `Target table T${tableIndex} for repeating row was not found in the template.`, m, m.targetCoordinate);
          continue;
        }
        const targetRow = targetTbl.rows.find(r => r.rowIndex === rowIndex);
        if (!targetRow) {
          push('INVALID_REPEATABLE_ROW_CONFIG', 'error', `Target prototype row R${rowIndex} was not found in table T${tableIndex}.`, m, m.targetCoordinate);
          continue;
        }

        if (!isApprovedField(m.fieldId)) {
          push('UNAUTHORIZED_FIELD', 'error', `Field "${m.fieldId}" is not an approved report field.`, m, m.targetCoordinate);
          continue;
        }
        const fDef = getFieldDefinition(m.fieldId)!;
        if (fDef.categoryId !== 'ALL' && fDef.categoryId !== categoryId) {
          push('UNAUTHORIZED_FIELD', 'error', `Field "${m.fieldId}" does not belong to the template's report category.`, m, m.targetCoordinate);
          continue;
        }

        plan.push({
          fieldId: m.fieldId,
          fieldLabel: m.fieldLabel,
          token: m.targetCoordinate,
          isRequired: fDef.isRequired,
          expectedOccurrences: 1,
          isRepeated: true,
          mappingType: 'REPEATING_ROW',
          targetCoordinate: m.targetCoordinate,
          tableIndex,
          rowIndex,
        });
        continue;
      }

      // Placeholder mapping
      const token = normalizeToken(m.placeholderToken ?? m.targetCoordinate);
      const key = token.toLowerCase();
      byLowerToken.set(key, [...(byLowerToken.get(key) ?? []), m]);
    }

    for (const group of byLowerToken.values()) {
      if (group.length > 1) {
        for (const m of group) {
          push(
            'AMBIGUOUS_MAPPING',
            'error',
            `Placeholder is mapped to more than one field (${group.length} mappings).`,
            m,
            normalizeToken(m.placeholderToken ?? m.targetCoordinate)
          );
        }
        continue;
      }
      const m = group[0];
      const token = normalizeToken(m.placeholderToken ?? m.targetCoordinate);
      mappedTokens.add(token);

      if (!isApprovedField(m.fieldId)) {
        push(
          'UNAUTHORIZED_FIELD',
          'error',
          `Field "${m.fieldId}" is not an approved report field.`,
          m,
          token
        );
        continue;
      }
      const def = getFieldDefinition(m.fieldId)!;
      if (def.categoryId !== 'ALL' && def.categoryId !== categoryId) {
        push(
          'UNAUTHORIZED_FIELD',
          'error',
          `Field "${m.fieldId}" does not belong to the template's report category.`,
          m,
          token
        );
        continue;
      }

      // Step 32: Supported locations are BODY, TABLE, HEADER, FOOTER
      const bodyCount = scan.bodyTokenCounts.get(token) ?? 0;
      const tableCount = scan.tableTokenCounts.get(token) ?? 0;
      const headerCount = scan.headerTokenCounts.get(token) ?? 0;
      const footerCount = scan.footerTokenCounts.get(token) ?? 0;
      const totalCount = bodyCount + tableCount + headerCount + footerCount;

      if (def.repetitionModel === 'REPEATING' && bodyCount > 0 && totalCount === bodyCount) {
        push(
          'REPEATING_FIELD_UNSUPPORTED',
          def.isRequired ? 'error' : 'warning',
          `Repeating field "${m.fieldId}" cannot be mapped to a single body placeholder.`,
          m,
          token
        );
        continue;
      }

      // Check truly unsupported locations (TEXT_BOX, UNSAFE_PARAGRAPH, FOOTNOTE, ENDNOTE, COMMENT)
      const elsewhere = scan.unsupported.filter(
        u => u.token === token && u.location !== 'TABLE' && u.location !== 'HEADER' && u.location !== 'FOOTER'
      );
      const sev = def.isRequired ? 'error' : 'warning';
      for (const u of elsewhere) {
        push(
          u.location === 'UNSAFE_PARAGRAPH'
            ? 'PLACEHOLDER_UNSAFE_CONSTRUCT'
            : 'PLACEHOLDER_UNSUPPORTED_LOCATION',
          sev,
          `Placeholder occurs ${u.count} time(s) in an unsupported location (${u.location}); it would remain unresolved.`,
          m,
          token,
          u.location
        );
      }
      if (totalCount === 0) {
        if (elsewhere.length === 0) {
          push(
            'PLACEHOLDER_NOT_FOUND',
            sev,
            `Mapped placeholder was not found in the template.`,
            m,
            token
          );
        }
        continue;
      }

      const resolved = this.resolveValue(m, def.dataType, def.isRequired, data);
      if (!resolved.ok) {
        issues.push(resolved.issue);
        continue;
      }
      values.set(token, resolved.text);
      plan.push({
        fieldId: m.fieldId,
        fieldLabel: m.fieldLabel,
        token,
        isRequired: def.isRequired,
        expectedOccurrences: totalCount,
        isRepeated: totalCount > 1,
        mappingType: 'PLACEHOLDER',
      });
    }

    const repeatingPlans = plan.filter(p => p.mappingType === 'REPEATING_ROW');
    const knownRepeatingTokens = new Set([
      '{station_name}',
      '{station_id}',
      '{station}',
      '{id}',
      '{status}',
      '{remarks}',
      '{sequence_order}',
      '{row_num}',
      '{seq}',
      '{fixture_status}',
      '{light_zone}',
      '{operational_status}',
    ]);

    const checkUnknown = (
      tokenMap: ReadonlyMap<string, number>,
      location: WordGenerationIssue['location']
    ) => {
      for (const token of tokenMap.keys()) {
        if (!mappedTokens.has(token) && !byLowerToken.has(token.toLowerCase())) {
          if (
            location === 'TABLE' &&
            repeatingPlans.length > 0 &&
            knownRepeatingTokens.has(token.toLowerCase())
          ) {
            continue;
          }
          push(
            'UNKNOWN_PLACEHOLDER',
            allowUnmapped ? 'warning' : 'error',
            `The template ${location?.toLowerCase()} contains a placeholder with no approved mapping.`,
            undefined,
            token,
            location
          );
        }
      }
    };

    checkUnknown(scan.bodyTokenCounts, 'BODY');
    checkUnknown(scan.tableTokenCounts, 'TABLE');
    checkUnknown(scan.headerTokenCounts, 'HEADER');
    checkUnknown(scan.footerTokenCounts, 'FOOTER');

    return { plan, values, issues };
  }

  /**
   * Missing/null is distinct from '', 0 and false. A required field whose value is '' is
   * treated as missing (same convention as the Excel pipeline); an optional '' is valid empty text.
   */
  private resolveValue(
    m: WordFieldMappingRecord,
    dataType: string,
    isRequired: boolean,
    data: Record<string, unknown>
  ): ResolvedValue {
    const def = getFieldDefinition(m.fieldId)!;
    let raw: unknown = data[m.fieldId];
    if (raw === undefined) raw = data[def.canonicalName];
    const issue = (
      code: WordGenerationIssue['code'],
      severity: 'error' | 'warning',
      message: string
    ): ResolvedValue => ({
      ok: false,
      issue: {
        stage: 'MAPPING_PLAN',
        code,
        severity,
        message,
        fieldId: m.fieldId,
        token: m.placeholderToken ?? undefined,
      },
    });

    if (raw === undefined || raw === null || (raw === '' && isRequired)) {
      return isRequired
        ? issue(
            'MISSING_REQUIRED_VALUE',
            'error',
            `Required field "${m.fieldId}" has no value in the session.`
          )
        : { ok: true, text: '' };
    }

    let text: string;
    switch (dataType) {
      case 'Integer': {
        const n =
          typeof raw === 'number'
            ? raw
            : typeof raw === 'string' && /^-?\d+$/.test(raw.trim())
              ? Number(raw.trim())
              : NaN;
        if (!Number.isInteger(n)) {
          return issue('INVALID_VALUE_TYPE', 'error', `Field "${m.fieldId}" expected an integer.`);
        }
        text = String(n);
        break;
      }
      case 'Boolean':
        if (typeof raw !== 'boolean') {
          return issue('INVALID_VALUE_TYPE', 'error', `Field "${m.fieldId}" expected a boolean.`);
        }
        text = raw ? 'true' : 'false';
        break;
      default:
        if (typeof raw !== 'string') {
          return issue('INVALID_VALUE_TYPE', 'error', `Field "${m.fieldId}" expected text.`);
        }
        text = raw;
    }

    if (dataType === 'Enumeration') {
      const allowed = APPROVED_FIELD_ENUMERATIONS[m.fieldId];
      if (allowed && !allowed.includes(text)) {
        return issue(
          'INVALID_VALUE_TYPE',
          'error',
          `Field "${m.fieldId}" is not an approved enumeration value.`
        );
      }
    }
    const bad = validateReplacementText(text);
    if (bad) {
      return issue('INVALID_VALUE_CONTENT', 'error', `Field "${m.fieldId}" value ${bad}.`);
    }
    return { ok: true, text };
  }

  // -------------------------------------------------------------------------------------
  // Verification
  // -------------------------------------------------------------------------------------

  private verifyCandidate(
    candidatePath: string,
    source: WordPackageScan,
    values: ReadonlyMap<string, string>,
    sourceZip: PizZip,
    plan: readonly WordPlannedReplacement[],
    repeatingRecords: readonly RepeatingRecordItem[]
  ): WordGenerationIssue[] {
    const bad = (
      stage: WordGenerationIssue['stage'],
      code: WordGenerationIssue['code'],
      message: string
    ): WordGenerationIssue[] => [{ stage, code, severity: 'error', message }];

    const containerCheck = validateDocumentFile(candidatePath, '.docx');
    if (!containerCheck.ok || !containerCheck.value.isValid) {
      return bad('REOPEN', 'STRUCTURE_MISMATCH', 'The saved candidate failed package validation.');
    }

    let zip: PizZip;
    let reopened: ReturnType<typeof parseWordPart>;
    try {
      zip = new PizZip(fs.readFileSync(candidatePath));
      const docFile = zip.file('word/document.xml');
      if (!docFile)
        return bad('REOPEN', 'STRUCTURE_MISMATCH', 'Candidate has no main document part.');
      reopened = parseWordPart(docFile.asText());
    } catch {
      return bad('REOPEN', 'STRUCTURE_MISMATCH', 'The saved candidate could not be reopened.');
    }

    // Every non-document, non-header/footer package entry must be preserved exactly.
    const srcNames = Object.keys(sourceZip.files).sort();
    const outNames = Object.keys(zip.files).sort();
    if (srcNames.join('\n') !== outNames.join('\n')) {
      return bad(
        'COMPLETENESS',
        'PRESERVATION_MISMATCH',
        'Package entries differ from the source template.'
      );
    }
    const isModifiablePart = (name: string): boolean =>
      name === 'word/document.xml' || /^word\/(header|footer)\d*\.xml$/i.test(name);

    for (const name of srcNames) {
      if (isModifiablePart(name) || sourceZip.files[name].dir) continue;
      const a = sourceZip.file(name)!.asNodeBuffer();
      const b = zip.file(name)!.asNodeBuffer();
      if (!a.equals(b)) {
        return bad(
          'COMPLETENESS',
          'PRESERVATION_MISMATCH',
          `Package part "${name}" changed unexpectedly.`
        );
      }
    }

    // Expected-change model for body paragraphs:
    const origBodyParas = source.bodyPart.paragraphs.filter(p => !p.inTable);
    const candidateBodyParas = reopened.paragraphs.filter(p => !p.inTable);
    if (candidateBodyParas.length !== origBodyParas.length) {
      return bad(
        'COMPLETENESS',
        'STRUCTURE_MISMATCH',
        'Body paragraph count changed during generation.'
      );
    }
    for (let i = 0; i < origBodyParas.length; i++) {
      const want = isSupportedBodyParagraph(origBodyParas[i])
        ? expectedParagraphText(origBodyParas[i], values)
        : paragraphText(origBodyParas[i]);
      const got = paragraphText(candidateBodyParas[i]);
      if (want !== got) {
        const unresolved = [...values.keys()].some(t => got.includes(t) && !want.includes(t));
        return bad(
          'COMPLETENESS',
          unresolved ? 'UNRESOLVED_PLACEHOLDER' : 'CONTENT_MISMATCH',
          `Paragraph ${i + 1} does not match the expected result after replacement.`
        );
      }
    }

    // Expected-change model for tables:
    const sourceTables = extractTables(source.bodyPart.xml);
    const candidateTables = extractTables(zip.file('word/document.xml')!.asText());
    if (sourceTables.length !== candidateTables.length) {
      return bad(
        'COMPLETENESS',
        'STRUCTURE_MISMATCH',
        'Table count changed during generation.'
      );
    }

    for (let i = 0; i < sourceTables.length; i++) {
      const srcTbl = sourceTables[i];
      const candTbl = candidateTables[i];
      const repPlan = plan.find(
        p => p.mappingType === 'REPEATING_ROW' && p.tableIndex === srcTbl.tableIndex
      );

      if (repPlan) {
        const expectedRowCount = srcTbl.rows.length - 1 + repeatingRecords.length;
        if (candTbl.rows.length !== expectedRowCount) {
          return bad(
            'COMPLETENESS',
            'STRUCTURE_MISMATCH',
            `Repeating row count mismatch in Table ${srcTbl.tableIndex}: expected ${expectedRowCount} rows, got ${candTbl.rows.length}.`
          );
        }
        const rowIndex = repPlan.rowIndex ?? 1;
        // Verify non-repeating rows preserved (header row)
        if (rowIndex > 1 && candTbl.rows.length > 0) {
          const srcHeader = srcTbl.rows[0].cells.map(c => c.text).join(' ');
          const candHeader = candTbl.rows[0].cells.map(c => c.text).join(' ');
          if (srcHeader !== candHeader) {
            return bad(
              'COMPLETENESS',
              'CONTENT_MISMATCH',
              `Header row in Table ${srcTbl.tableIndex} was not preserved.`
            );
          }
        }
        // Verify station records order in repeated rows
        if (repeatingRecords.length > 0) {
          for (let rIdx = 0; rIdx < repeatingRecords.length; rIdx++) {
            const rowInCand = candTbl.rows[rowIndex - 1 + rIdx];
            const rec = repeatingRecords[rIdx];
            const rowText = rowInCand?.cells.map(c => c.text).join(' ') ?? '';
            if (rec.stationName && !rowText.includes(rec.stationName)) {
              return bad(
                'COMPLETENESS',
                'CONTENT_MISMATCH',
                `Row ${rowIndex + rIdx} does not contain station "${rec.stationName}" in sequence order.`
              );
            }
          }
        }
      } else {
        // Table without repeating rows: row count must be identical
        if (candTbl.rows.length !== srcTbl.rows.length) {
          return bad(
            'COMPLETENESS',
            'STRUCTURE_MISMATCH',
            `Row count changed in non-repeating Table ${srcTbl.tableIndex}.`
          );
        }
      }

      // Verify TABLE_CELL replacements
      const cellPlans = plan.filter(
        p => p.mappingType === 'TABLE_CELL' && p.tableIndex === srcTbl.tableIndex
      );
      for (const cp of cellPlans) {
        if (cp.rowIndex && cp.colIndex) {
          const row = candTbl.rows.find(r => r.rowIndex === cp.rowIndex);
          const cell = row?.cells.find(c => c.colIndex === cp.colIndex);
          const expectedVal = values.get(cp.targetCoordinate ?? cp.token) ?? values.get(cp.fieldId) ?? '';
          if (cell && !cell.text.includes(expectedVal)) {
            return bad(
              'COMPLETENESS',
              'CONTENT_MISMATCH',
              `Cell T${cp.tableIndex}:R${cp.rowIndex}:C${cp.colIndex} does not match expected value.`
            );
          }
        }
      }
    }

    // Rescan package: check for unresolved required tokens
    try {
      const post = scanWordPackage(zip);
      for (const [token] of values) {
        let allowed = 0;
        for (const p of origBodyParas) {
          if (!isSupportedBodyParagraph(p)) continue;
          const exp = expectedParagraphText(p, values);
          allowed += exp.split(token).length - 1;
        }
        if ((post.bodyTokenCounts.get(token) ?? 0) > allowed) {
          return bad(
            'COMPLETENESS',
            'UNRESOLVED_PLACEHOLDER',
            'A mapped placeholder remains unresolved in the document body.'
          );
        }
      }
    } catch {
      return bad('REOPEN', 'STRUCTURE_MISMATCH', 'The saved candidate could not be rescanned.');
    }
    return [];
  }

  // -------------------------------------------------------------------------------------
  // Error helpers
  // -------------------------------------------------------------------------------------

  private err(
    code: ErrorCode,
    userMessage: string,
    details?: Record<string, unknown>,
    isOperational = true
  ): Result<never, AppError> {
    return Err(new AppError({ code, userMessage, details, isOperational }));
  }

  private planFailure(issues: readonly WordGenerationIssue[]): Result<never, AppError> {
    const first = issues[0];
    const code =
      first.stage === 'MAPPING_PLAN'
        ? first.code === 'UNAUTHORIZED_FIELD' || first.code === 'AMBIGUOUS_MAPPING'
          ? ErrorCode.MAPPING_INCOMPATIBLE
          : first.code === 'INVALID_VALUE_TYPE'
            ? ErrorCode.FIELD_TYPE_MISMATCH
            : ErrorCode.VALIDATION_FAILED
        : ErrorCode.GENERATION_FAILED;
    const label = first.stage === 'MAPPING_PLAN' ? 'Word mapping plan' : 'Word candidate';
    return Err(
      new AppError({
        code,
        userMessage: `${label} validation failed with ${issues.length} issue(s). First: ${first.message} No document was generated.`,
        details: { stage: first.stage, issues },
        isOperational: true,
      })
    );
  }


  private xmlFailure(e: unknown, stage: WordGenerationIssue['stage']): Result<never, AppError> {
    const unsupported = e instanceof WordXmlError && e.kind === 'UNSUPPORTED';
    return Err(
      new AppError({
        code: unsupported ? ErrorCode.TEMPLATE_UNSUPPORTED_FORMAT : ErrorCode.TEMPLATE_MALFORMED,
        userMessage: unsupported
          ? 'The Word template uses a construct that cannot be processed safely. No document was generated.'
          : 'The Word template could not be parsed. No document was generated.',
        details: { stage, developerMessage: e instanceof Error ? e.message : String(e) },
        isOperational: true,
        cause: e,
      })
    );
  }
}
