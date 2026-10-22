/**
 * OpsReport Studio — Excel Report Generation Engine: Data Injection & Multi-Station Service (Step 28)
 *
 * Implements Step 27 & Step 28 of the approved 45-step roadmap:
 * - Session and form data resolution using stable field identifiers
 * - Authoritative station sequence resolution (snapshots, payload, canonical registry)
 * - Category, template, version, and mapping consistency validation
 * - Bounded write-plan construction with coordinate collision detection
 * - Repeating-row generation for TABLE_COLUMN mappings across multiple ordered stations
 * - Status-field enumeration validation against approved allowed-value dictionary (DIC-OPSREPORT-001)
 * - Remarks and station-level text validation with Unicode preservation
 * - Formula-injection immunity (all text stored strictly as shared strings)
 * - Row capacity and structural footer conflict detection before workbook mutation
 * - Safe candidate-file mutation in isolated Generation Workspace (%LOCALAPPDATA%\OpsReportStudio\Workspace\)
 * - Post-write candidate verification via Open XML validation and cell re-reading
 * - Atomic promotion of verified candidate to active working artifact
 * - Workspace lifecycle transition (PREPARED -> IN_USE) with updated SHA-256 and size
 * - Absolute master-template immutability invariant (INV-DAT-006: 0-byte variance check)
 * - Full atomic rollback on error with operation-owned cleanup
 *
 * @module storage/generation/excel-data-injection-service
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import PizZip from 'pizzip';
import type {
  InjectExcelDataOptions,
  ExcelDataInjectionResult,
  CellWriteOperation,
  GenerationWorkspaceRecord,
} from '../../shared/types/generation.ts';
import type { ExcelFieldMappingRecord } from '../../shared/types/excel-mapping.ts';
import { StationId, toStationId } from '../../shared/types/identifiers.ts';
import { VaultManager } from '../vault/vault-manager.ts';
import { SessionRepository } from '../database/repositories/session-repository.ts';
import { TemplateMetadataRepository } from '../database/repositories/template-metadata-repository.ts';
import { GenerationWorkspaceRepository } from '../database/repositories/generation-workspace-repository.ts';
import { StationRepository } from '../database/repositories/station-repository.ts';
import {
  ExcelMappingRepository,
  CELL_ADDRESS_REGEX,
  COLUMN_REF_REGEX,
} from '../database/repositories/excel-mapping-repository.ts';
import { MappingProfileRepository } from '../database/repositories/mapping-profile-repository.ts';
import { WorksheetXmlEditor, type CellWriteTarget } from './worksheet-xml-editor.ts';
import { WorkbookPreservationVerifier } from './workbook-preservation-verifier.ts';
import { parseCellAddress } from '../vault/template-inspector.ts';
import { validateDocumentFile } from '../vault/document-validator.ts';
import {
  validateInternalIdentifier,
  assertNoNullBytes,
  assertPathInsideRoot,
  assertTargetNotInsideVault,
} from '../vault/path-security.ts';
import {
  getFieldDefinition,
  isApprovedField,
  type ReportFieldDefinition,
} from '../../shared/constants/report-fields.ts';
import { Result, Ok, Err } from '../../shared/types/result.ts';
import { AppError } from '../../shared/errors/app-error.ts';
import { ErrorCode } from '../../shared/errors/error-codes.ts';

/**
 * Authoritative allowed enumeration choices defined in DIC-OPSREPORT-001.
 * Used for strict status validation during data injection.
 */
export const APPROVED_FIELD_ENUMERATIONS: Readonly<Record<string, readonly string[]>> = {
  'FLD-COM-SHIFT': ['Morning', 'Day', 'Night', 'Shift 1', 'Shift 2', 'Shift 3'],
  'FLD-SLT-STATUS': ['All Operational', 'Defective Fixtures', 'Flickering', 'Power Failure'],
  'FLD-FAN-MODE': ['Auto', 'Manual Local', 'Manual Remote', 'Isolated/Off'],
  'FLD-FAN-STATUS': [
    'Normal Running',
    'Standby Ready',
    'Tripped / Overload',
    'Vibration Fault',
    'Out of Service',
  ],
  'FLD-FAN-DAMPER': ['Open', 'Closed', 'Modulating', 'Failed'],
  'FLD-POL-STATUS': [
    'Functional',
    'Dark / Bulb Out',
    'Flickering',
    'Dayburning',
    'Physical Damage',
  ],
  'FLD-EXT-TYPE': ['ABC Dry Powder', 'CO2 Carbon Dioxide', 'AFFF Foam', 'Water', 'Wet Chemical'],
  'FLD-EXT-PRESSURE': [
    'Green / Normal',
    'Red Undercharged / Discharged',
    'Red Overcharged',
    'No Gauge / CO2 Weight Check',
  ],
  'FLD-PIL-CONDITION': [
    'Sound / Clean',
    'Hairline Cracks',
    'Spalling / Exposed Rebar',
    'Surface Impact Damage',
    'Rust / Paint Peeling',
  ],
  'FLD-PIL-GUARD': ['Intact', 'Dented / Scratched', 'Missing / Detached', 'Not Applicable'],
  'FLD-FNC-TYPE': [
    'Chain-link with Barbed Wire',
    'Palisade Steel',
    'Weldmesh Anti-climb',
    'Concrete Wall',
  ],
  'FLD-FNC-INTEGRITY': [
    'Intact / Secure',
    'Cut / Fabric Breached',
    'Sagging / Loose Wire',
    'Corroded / Rusted',
    'Burrowed Under / Gap',
  ],
  'FLD-FNC-GATE': [
    'Closed & Padlocked',
    'Open Authorized',
    'Lock Damaged',
    'Gate Unlatched / Insecure',
  ],
  'FLD-FNC-VEG': ['Clear', 'Minor Brush', 'Severe Encroachment / Wire Loaded'],
  'FLD-INC-CATEGORY': [
    'Trespassing',
    'Vandalism',
    'Assault',
    'Theft',
    'Gate Breach',
    'Suspicious Activity',
  ],
  'FLD-INC-SEVERITY': ['Low', 'Medium', 'High', 'Critical'],
};

interface ResolvedStationItem {
  stationId: StationId;
  sequenceOrder: number;
  stationNameSnapshot: string;
  stationCodeSnapshot?: string | null;
}

export class ExcelDataInjectionService {
  constructor(
    private readonly sessionRepo: SessionRepository,
    private readonly templateRepo: TemplateMetadataRepository,
    private readonly workspaceRepo: GenerationWorkspaceRepository,
    private readonly excelMappingRepo: ExcelMappingRepository,
    private readonly profileRepo: MappingProfileRepository,
    private readonly vaultManager: VaultManager,
    private readonly stationRepo?: StationRepository
  ) {}

  /**
   * Injects report session data into an isolated Excel generation workspace workbook.
   * Handles both scalar fixed cells and repeating multi-station table columns.
   */
  public injectSessionData(
    options: InjectExcelDataOptions
  ): Result<ExcelDataInjectionResult, AppError> {
    let candidatePath: string | null = null;

    try {
      // -----------------------------------------------------------------------
      // 1. Validate Input Identifiers
      // -----------------------------------------------------------------------
      assertNoNullBytes(options.workspaceId);
      assertNoNullBytes(options.sessionId);
      if (options.profileId) {
        assertNoNullBytes(options.profileId);
      }

      if (!validateInternalIdentifier(options.workspaceId)) {
        return Err(
          new AppError({
            code: ErrorCode.VALIDATION_FAILED,
            userMessage: `Invalid workspace identifier format "${options.workspaceId}".`,
            isOperational: true,
          })
        );
      }

      if (!validateInternalIdentifier(options.sessionId)) {
        return Err(
          new AppError({
            code: ErrorCode.VALIDATION_FAILED,
            userMessage: `Invalid session identifier format "${options.sessionId}".`,
            isOperational: true,
          })
        );
      }

      // -----------------------------------------------------------------------
      // 2. Resolve Authoritative Report Session & Payload
      // -----------------------------------------------------------------------
      const sessionRes = this.sessionRepo.getSessionById(options.sessionId);
      if (!sessionRes.ok) {
        return sessionRes;
      }
      if (!sessionRes.value) {
        return Err(
          new AppError({
            code: ErrorCode.DRAFT_NOT_FOUND,
            userMessage: `Report session "${options.sessionId}" was not found in the persistence store.`,
            isOperational: true,
          })
        );
      }

      const sessionDetail = sessionRes.value;
      const session = sessionDetail.session;

      if (session.status === 'CANCELLED') {
        return Err(
          new AppError({
            code: ErrorCode.VALIDATION_FAILED,
            userMessage: `Report session "${options.sessionId}" is marked CANCELLED and cannot undergo document generation.`,
            isOperational: true,
          })
        );
      }

      // Extract session payload dictionary
      const rawData = options.overrideFormData ?? sessionDetail.parsedPayload?.data ?? {};
      if (typeof rawData !== 'object' || rawData === null) {
        return Err(
          new AppError({
            code: ErrorCode.VALIDATION_FAILED,
            userMessage: `Report session "${options.sessionId}" payload is malformed or not a valid object.`,
            isOperational: true,
          })
        );
      }
      const sessionData = rawData as Record<string, unknown>;

      // -----------------------------------------------------------------------
      // 3. Resolve Generation Workspace Record & Storage Containment
      // -----------------------------------------------------------------------
      const wsRes = this.workspaceRepo.getWorkspaceById(options.workspaceId);
      if (!wsRes.ok) {
        return wsRes;
      }
      if (!wsRes.value) {
        return Err(
          new AppError({
            code: ErrorCode.GENERATION_FAILED,
            userMessage: `Generation workspace "${options.workspaceId}" was not found.`,
            isOperational: true,
          })
        );
      }

      const workspace = wsRes.value;
      const workingFilePath = workspace.absolutePath;

      // Assert physical file exists and is contained within Workspace/
      if (!fs.existsSync(workingFilePath)) {
        return Err(
          new AppError({
            code: ErrorCode.GENERATION_FAILED,
            userMessage: `Working workbook file for workspace "${options.workspaceId}" is missing from disk at "${workingFilePath}".`,
            isOperational: true,
          })
        );
      }

      assertPathInsideRoot(workingFilePath, this.vaultManager.workspaceDir);
      assertTargetNotInsideVault(workingFilePath, this.vaultManager.templatesDir);

      // -----------------------------------------------------------------------
      // 4. Validate Session, Workspace & Template Consistency
      // -----------------------------------------------------------------------
      if (session.templateId && session.templateId !== workspace.templateId) {
        return Err(
          new AppError({
            code: ErrorCode.VALIDATION_FAILED,
            userMessage: `Report session references template "${session.templateId}", but workspace was created for template "${workspace.templateId}".`,
            isOperational: true,
          })
        );
      }

      // Resolve and verify master template baseline integrity (0-byte variance precondition)
      const tplRes = this.templateRepo.getTemplateById(workspace.templateId);
      if (!tplRes.ok || !tplRes.value) {
        return Err(
          new AppError({
            code: ErrorCode.TEMPLATE_NOT_FOUND,
            userMessage: `Master template "${workspace.templateId}" referenced by workspace is missing from registry.`,
            isOperational: true,
          })
        );
      }

      const verRes = this.templateRepo.getVersionById(workspace.versionId);
      if (!verRes.ok || !verRes.value) {
        return Err(
          new AppError({
            code: ErrorCode.TEMPLATE_NOT_FOUND,
            userMessage: `Template version "${workspace.versionId}" referenced by workspace is missing from registry.`,
            isOperational: true,
          })
        );
      }

      const masterVersion = verRes.value;
      const vaultPathRes = this.vaultManager.resolveTemplateFileVaultPath(masterVersion.file_name);
      if (!vaultPathRes.ok) {
        return vaultPathRes;
      }
      const masterPath = vaultPathRes.value;

      if (!fs.existsSync(masterPath)) {
        return Err(
          new AppError({
            code: ErrorCode.FILE_NOT_FOUND,
            userMessage: `Master template file "${masterVersion.file_name}" is missing from Vault.`,
            isOperational: true,
          })
        );
      }

      // Record pre-operation master hash to enforce INV-DAT-006
      const preMasterBuf = fs.readFileSync(masterPath);
      const preMasterHash = crypto.createHash('sha256').update(preMasterBuf).digest('hex');
      if (masterVersion.sha256_hash && preMasterHash !== masterVersion.sha256_hash) {
        return Err(
          new AppError({
            code: ErrorCode.TEMPLATE_INTEGRITY_COMPROMISED,
            userMessage: `Master template file in Vault fails integrity verification before data injection.`,
            isOperational: true,
          })
        );
      }

      // -----------------------------------------------------------------------
      // 5. Retrieve Mapping Configuration (Profile or Direct)
      // -----------------------------------------------------------------------
      let mappings: ExcelFieldMappingRecord[] = [];

      if (options.profileId) {
        const profileRes = this.profileRepo.getProfile(options.profileId);
        if (!profileRes.ok) {
          return profileRes;
        }
        if (!profileRes.value) {
          return Err(
            new AppError({
              code: ErrorCode.MAPPING_PROFILE_NOT_FOUND,
              userMessage: `Mapping profile "${options.profileId}" was not found.`,
              isOperational: true,
            })
          );
        }

        const profile = profileRes.value;
        if (profile.documentType !== 'EXCEL_XLSX') {
          return Err(
            new AppError({
              code: ErrorCode.VALIDATION_FAILED,
              userMessage: `Mapping profile "${options.profileId}" is configured for Word documents, not Excel.`,
              isOperational: true,
            })
          );
        }

        if (profile.templateId !== workspace.templateId) {
          return Err(
            new AppError({
              code: ErrorCode.VALIDATION_FAILED,
              userMessage: `Mapping profile "${options.profileId}" belongs to template "${profile.templateId}", not "${workspace.templateId}".`,
              isOperational: true,
            })
          );
        }

        mappings = profile.excelMappings ?? [];
      } else {
        const directMappingsRes = this.excelMappingRepo.getMappings(
          workspace.templateId,
          workspace.versionId
        );
        if (directMappingsRes.ok) {
          mappings = directMappingsRes.value;
        } else {
          const allProfilesRes = this.profileRepo.listProfiles({
            templateId: workspace.templateId,
            versionId: workspace.versionId,
            status: 'ACTIVE',
          });
          if (allProfilesRes.ok && allProfilesRes.value.length > 0) {
            const firstActive = allProfilesRes.value[0];
            const activeProfileRes = this.profileRepo.getProfile(firstActive.profileId);
            if (activeProfileRes.ok && activeProfileRes.value?.excelMappings) {
              mappings = activeProfileRes.value.excelMappings;
            }
          }
        }
      }

      if (mappings.length === 0) {
        return Err(
          new AppError({
            code: ErrorCode.VALIDATION_FAILED,
            userMessage: `No Excel field mappings found for template "${workspace.templateId}" (version ${workspace.versionId}). Please configure field mappings in the Mapping Wizard first.`,
            isOperational: true,
          })
        );
      }

      // -----------------------------------------------------------------------
      // 6. Resolve Station Sequence & Station Ordering (Step 28)
      // -----------------------------------------------------------------------
      let orderedStations: ResolvedStationItem[] = [];

      // Priority 1: Frozen station snapshots from report_session_stations (DEC-025)
      if (sessionDetail.stations && sessionDetail.stations.length > 0) {
        orderedStations = sessionDetail.stations.map(stn => ({
          stationId: stn.stationId,
          sequenceOrder: stn.sequenceOrder,
          stationNameSnapshot: stn.stationNameSnapshot,
          stationCodeSnapshot: stn.stationCodeSnapshot,
        }));
      }

      // Priority 2: Session payload data (data.stations or overrideFormData.stations)
      if (orderedStations.length === 0 && Array.isArray(sessionData.stations)) {
        orderedStations = (sessionData.stations as any[]).map((item, idx) => {
          let sId: string;
          let sName: string | undefined;
          let sCode: string | null = null;
          let sOrder: number | undefined;

          if (typeof item === 'string') {
            sId = item;
          } else {
            sId = item.stationId ?? item.id ?? `STN-${idx + 1}`;
            sName = item.stationName ?? item.name ?? item.stationNameSnapshot;
            sCode = item.stationCode ?? item.code ?? item.stationCodeSnapshot ?? null;
            if (typeof item.sequenceOrder === 'number') {
              sOrder = item.sequenceOrder;
            }
          }

          // If stationRepo is available, look up canonical metadata & display_order
          if (this.stationRepo) {
            const canonicalRes = this.stationRepo.getStationById(toStationId(String(sId)));
            if (canonicalRes.ok && canonicalRes.value) {
              const rec = canonicalRes.value;
              sName = sName ?? rec.station_name;
              sCode = sCode ?? rec.station_code;
              sOrder = sOrder ?? rec.display_order;
            }
          }

          return {
            stationId: toStationId(String(sId)),
            sequenceOrder: typeof sOrder === 'number' ? sOrder : idx + 1,
            stationNameSnapshot: String(sName ?? sId),
            stationCodeSnapshot: sCode ? String(sCode) : null,
          };
        });
      }

      // Validate station references: check for duplicate station IDs in the sequence
      const seenStationIds = new Set<string>();
      for (const stn of orderedStations) {
        const sKey = String(stn.stationId);
        if (seenStationIds.has(sKey)) {
          return Err(
            new AppError({
              code: ErrorCode.VALIDATION_FAILED,
              userMessage: `Duplicate station assignment detected for station ID "${stn.stationId}". Each station must appear at most once in a report session.`,
              isOperational: true,
            })
          );
        }
        seenStationIds.add(sKey);
      }

      // Sort deterministically by sequenceOrder ASC
      orderedStations.sort((a, b) => a.sequenceOrder - b.sequenceOrder);

      // -----------------------------------------------------------------------
      // 7. Construct & Validate Deterministic Write Plan
      // -----------------------------------------------------------------------
      const plannedWrites: CellWriteOperation[] = [];
      const deferredWrites: CellWriteOperation[] = [];
      const seenTargets = new Map<string, string>(); // key: "sheetname!coordinate" -> fieldId

      const fixedMappings = mappings.filter(m => m.mappingType === 'FIXED_CELL');
      const tableColumnMappings = mappings.filter(m => m.mappingType === 'TABLE_COLUMN');

      // 7a. Process FIXED_CELL Mappings
      for (const mapping of fixedMappings) {
        if (!CELL_ADDRESS_REGEX.test(mapping.targetCoordinate)) {
          return Err(
            new AppError({
              code: ErrorCode.VALIDATION_FAILED,
              userMessage: `Mapping for field "${mapping.fieldLabel}" has invalid coordinate "${mapping.targetCoordinate}". Expected e.g. "B2", "AA10".`,
              isOperational: true,
            })
          );
        }

        const targetKey = `${mapping.worksheetName.toLowerCase()}!${mapping.targetCoordinate.toUpperCase()}`;
        if (seenTargets.has(targetKey)) {
          const existingField = seenTargets.get(targetKey)!;
          return Err(
            new AppError({
              code: ErrorCode.VALIDATION_FAILED,
              userMessage: `Mapping conflict detected: Field "${mapping.fieldId}" and field "${existingField}" both target cell "${mapping.targetCoordinate}" on sheet "${mapping.worksheetName}".`,
              isOperational: true,
            })
          );
        }
        seenTargets.set(targetKey, mapping.fieldId);

        const fieldDef: ReportFieldDefinition | undefined = isApprovedField(mapping.fieldId)
          ? getFieldDefinition(mapping.fieldId)
          : undefined;

        let rawVal: unknown = sessionData[mapping.fieldId];
        if (rawVal === undefined && fieldDef) {
          rawVal = sessionData[fieldDef.canonicalName];
        }

        const isAbsent = rawVal === undefined || rawVal === null || rawVal === '';

        if (isAbsent && fieldDef?.isRequired) {
          return Err(
            new AppError({
              code: ErrorCode.VALIDATION_FAILED,
              userMessage: `Required report field "${mapping.fieldLabel}" (${mapping.fieldId}) is missing or empty in session "${options.sessionId}".`,
              isOperational: true,
            })
          );
        }

        let resolvedValue: string | number | boolean | null = null;
        const dataTypeStr: string = fieldDef?.dataType ?? 'String';

        if (!isAbsent) {
          if (fieldDef?.dataType === 'Integer') {
            if (typeof rawVal === 'number') {
              resolvedValue = Math.round(rawVal);
            } else {
              const parsed = parseInt(String(rawVal).trim(), 10);
              if (isNaN(parsed)) {
                if (fieldDef.isRequired) {
                  return Err(
                    new AppError({
                      code: ErrorCode.FIELD_TYPE_MISMATCH,
                      userMessage: `Field "${mapping.fieldLabel}" expected Integer, received non-numeric string "${String(rawVal)}".`,
                      isOperational: true,
                    })
                  );
                }
                resolvedValue = null;
              } else {
                resolvedValue = parsed;
              }
            }
          } else if (fieldDef?.dataType === 'Boolean') {
            resolvedValue = Boolean(rawVal);
          } else {
            resolvedValue = String(rawVal);
          }
        }

        plannedWrites.push({
          fieldId: mapping.fieldId,
          fieldLabel: mapping.fieldLabel,
          mappingType: 'FIXED_CELL',
          worksheetName: mapping.worksheetName,
          targetCoordinate: mapping.targetCoordinate.toUpperCase(),
          value: resolvedValue,
          rawValue: rawVal,
          dataType: dataTypeStr,
          status: 'PLANNED',
        });
      }

      // 7b. Process TABLE_COLUMN Mappings (Multi-Station Repeating Rows)
      const tableMappingsBySheet = new Map<string, ExcelFieldMappingRecord[]>();

      if (tableColumnMappings.length > 0) {
        if (orderedStations.length === 0) {
          // If no stations exist, track as deferred
          for (const mapping of tableColumnMappings) {
            deferredWrites.push({
              fieldId: mapping.fieldId,
              fieldLabel: mapping.fieldLabel,
              mappingType: 'TABLE_COLUMN',
              worksheetName: mapping.worksheetName,
              targetCoordinate: mapping.targetCoordinate.toUpperCase(),
              value: null,
              rawValue: null,
              status: 'DEFERRED',
              note: 'No station records found in session for tabular column mapping (Step 28 row expansion requires station records).',
            });
          }
        } else {
          // Group table column mappings by worksheet
          for (const mapping of tableColumnMappings) {
            let list = tableMappingsBySheet.get(mapping.worksheetName);
            if (!list) {
              list = [];
              tableMappingsBySheet.set(mapping.worksheetName, list);
            }
            list.push(mapping);
          }

          for (const [sheetName, sheetTableMappings] of tableMappingsBySheet.entries()) {
            // Check for duplicate column assignments on this worksheet
            const seenSheetColumns = new Map<string, string>();
            for (const mapping of sheetTableMappings) {
              const normCol = mapping.targetCoordinate.toUpperCase().trim();
              if (!COLUMN_REF_REGEX.test(normCol)) {
                return Err(
                  new AppError({
                    code: ErrorCode.VALIDATION_FAILED,
                    userMessage: `Mapping for field "${mapping.fieldLabel}" has invalid column coordinate "${mapping.targetCoordinate}". Expected column letter e.g. "A", "B", "AA".`,
                    isOperational: true,
                  })
                );
              }
              if (seenSheetColumns.has(normCol)) {
                const existingField = seenSheetColumns.get(normCol)!;
                return Err(
                  new AppError({
                    code: ErrorCode.MAPPING_INCOMPATIBLE,
                    userMessage: `Conflict detected: Destination column "${normCol}" on sheet "${sheetName}" is assigned to both field "${mapping.fieldId}" and field "${existingField}".`,
                    isOperational: true,
                  })
                );
              }
              seenSheetColumns.set(normCol, mapping.fieldId);
            }

            // Determine starting data row from headerRowNumber (defaults to row 2 if header is 1)
            let headerRow = 1;
            for (const m of sheetTableMappings) {
              if (typeof m.headerRowNumber === 'number' && m.headerRowNumber >= 1) {
                headerRow = m.headerRowNumber;
                break;
              }
            }
            const startRow = headerRow + 1;

            // Generate repeated rows for each ordered station
            for (let stnIdx = 0; stnIdx < orderedStations.length; stnIdx++) {
              const stn = orderedStations[stnIdx];
              const targetRow = startRow + stnIdx;

              for (const mapping of sheetTableMappings) {
                const normCol = mapping.targetCoordinate.toUpperCase().trim();
                const targetCell = `${normCol}${targetRow}`;
                const targetKey = `${sheetName.toLowerCase()}!${targetCell}`;

                // Assert no collision with fixed cell or earlier planned cell
                if (seenTargets.has(targetKey)) {
                  const existingField = seenTargets.get(targetKey)!;
                  return Err(
                    new AppError({
                      code: ErrorCode.VALIDATION_FAILED,
                      userMessage: `Mapping conflict detected: Field "${mapping.fieldId}" and field "${existingField}" both target cell "${targetCell}" on sheet "${sheetName}".`,
                      isOperational: true,
                    })
                  );
                }
                seenTargets.set(targetKey, mapping.fieldId);

                const fieldDef: ReportFieldDefinition | undefined = isApprovedField(mapping.fieldId)
                  ? getFieldDefinition(mapping.fieldId)
                  : undefined;

                // Extract raw value for this station
                const rawVal = this.extractStationFieldValue(
                  stn,
                  stnIdx,
                  mapping.fieldId,
                  fieldDef?.canonicalName ?? '',
                  sessionData
                );

                const isAbsent = rawVal === undefined || rawVal === null || rawVal === '';

                if (isAbsent && fieldDef?.isRequired) {
                  return Err(
                    new AppError({
                      code: ErrorCode.VALIDATION_FAILED,
                      userMessage: `Required report field "${mapping.fieldLabel}" (${mapping.fieldId}) is missing or empty for station "${stn.stationNameSnapshot}".`,
                      isOperational: true,
                    })
                  );
                }

                let resolvedValue: string | number | boolean | null = null;
                const dataTypeStr: string = fieldDef?.dataType ?? 'String';

                if (!isAbsent) {
                  // Controlled type conversions and status validation
                  if (fieldDef?.dataType === 'Enumeration') {
                    const allowedValues = APPROVED_FIELD_ENUMERATIONS[mapping.fieldId];
                    if (allowedValues && allowedValues.length > 0) {
                      const trimmedInput = String(rawVal).trim();
                      const canonicalMatch = allowedValues.find(
                        a => a.toLowerCase() === trimmedInput.toLowerCase()
                      );
                      if (!canonicalMatch) {
                        return Err(
                          new AppError({
                            code: ErrorCode.VALIDATION_FAILED,
                            userMessage: `Invalid status value "${trimmedInput}" for field "${mapping.fieldLabel}" (${mapping.fieldId}) at station "${stn.stationNameSnapshot}". Allowed values: ${allowedValues.join(', ')}.`,
                            isOperational: true,
                          })
                        );
                      }
                      resolvedValue = canonicalMatch;
                    } else {
                      resolvedValue = String(rawVal);
                    }
                  } else if (fieldDef?.dataType === 'Integer') {
                    if (typeof rawVal === 'number') {
                      resolvedValue = Math.round(rawVal);
                    } else {
                      const parsed = parseInt(String(rawVal).trim(), 10);
                      if (isNaN(parsed)) {
                        return Err(
                          new AppError({
                            code: ErrorCode.FIELD_TYPE_MISMATCH,
                            userMessage: `Field "${mapping.fieldLabel}" for station "${stn.stationNameSnapshot}" expected Integer, received non-numeric string "${String(rawVal)}".`,
                            isOperational: true,
                          })
                        );
                      }
                      resolvedValue = parsed;
                    }

                    // For defect counts or quantities, reject negative values
                    if (
                      (mapping.fieldId.includes('DEFECT') ||
                        mapping.fieldId.includes('QTY') ||
                        mapping.fieldId.includes('TOTAL')) &&
                      resolvedValue < 0
                    ) {
                      return Err(
                        new AppError({
                          code: ErrorCode.VALIDATION_FAILED,
                          userMessage: `Quantity for field "${mapping.fieldLabel}" at station "${stn.stationNameSnapshot}" cannot be negative (received ${resolvedValue}).`,
                          isOperational: true,
                        })
                      );
                    }
                  } else if (fieldDef?.dataType === 'Boolean') {
                    if (typeof rawVal === 'boolean') {
                      resolvedValue = rawVal;
                    } else {
                      const s = String(rawVal).trim().toLowerCase();
                      resolvedValue = s === 'true' || s === '1';
                    }
                  } else {
                    // String, Date, Time, DateTime, StationReference
                    resolvedValue = String(rawVal);
                  }
                }

                plannedWrites.push({
                  fieldId: mapping.fieldId,
                  fieldLabel: mapping.fieldLabel,
                  mappingType: 'TABLE_COLUMN',
                  worksheetName: sheetName,
                  targetCoordinate: targetCell,
                  value: resolvedValue,
                  rawValue: rawVal,
                  dataType: dataTypeStr,
                  status: 'PLANNED',
                  stationId: stn.stationId,
                  stationName: stn.stationNameSnapshot,
                  sequenceOrder: stn.sequenceOrder,
                  rowIndex: targetRow,
                });
              }
            }
          }
        }
      }

      if (plannedWrites.length === 0 && deferredWrites.length === 0) {
        return Err(
          new AppError({
            code: ErrorCode.VALIDATION_FAILED,
            userMessage: `No executable mappings found for injection.`,
            isOperational: true,
          })
        );
      }

      // -----------------------------------------------------------------------
      // 8. Prepare Isolated Candidate Copy in Generation Workspace
      // -----------------------------------------------------------------------
      const candidateFileName = `candidate_${Date.now()}_${crypto.randomUUID().slice(0, 8)}.xlsx`;
      candidatePath = path.join(this.vaultManager.workspaceDir, candidateFileName);

      // Byte-preserving copy from working artifact to candidate
      fs.copyFileSync(workingFilePath, candidatePath);

      // -----------------------------------------------------------------------
      // 9. Open XML Mutation via WorksheetXmlEditor & PizZip
      // -----------------------------------------------------------------------
      const candidateBytes = fs.readFileSync(candidatePath);
      let zip: PizZip;
      try {
        zip = new PizZip(candidateBytes);
      } catch (err) {
        throw new AppError({
          code: ErrorCode.TEMPLATE_MALFORMED,
          userMessage: `Failed to open working workbook as Open XML archive.`,
          cause: err,
          isOperational: true,
        });
      }

      // Read existing shared strings table
      const { strings: sharedStrings, stringMap: sharedStringsMap } =
        WorksheetXmlEditor.readSharedStrings(zip);

      // Step 29: Capture Baseline Structural Snapshot
      const baselineSnapshot = WorkbookPreservationVerifier.captureSnapshot(zip);

      // Step 29: Merged-Cell Target & Conflict Safety Validation
      const targetedSheetNames = new Set(plannedWrites.map(w => w.worksheetName));
      for (const sheetName of targetedSheetNames) {
        const sheetPath = WorksheetXmlEditor.resolveWorksheetPath(zip, sheetName);
        if (!sheetPath) continue;

        const mergedRanges = WorksheetXmlEditor.extractMergedCellRanges(zip, sheetPath);
        if (mergedRanges.length === 0) continue;

        // Build covered-cells and anchor-cells lookup
        const coveredMap = new Map<string, { rangeRef: string; anchorCell: string }>();
        const anchorMap = new Map<string, string>(); // anchorCell -> rangeRef
        for (const mr of mergedRanges) {
          anchorMap.set(mr.anchorCell.toUpperCase(), mr.ref);
          for (const cov of mr.coveredCells) {
            coveredMap.set(cov.toUpperCase(), { rangeRef: mr.ref, anchorCell: mr.anchorCell });
          }
        }

        // Check if repeated station rows intersect multi-row merged ranges
        if (orderedStations.length > 0 && tableColumnMappings.length > 0) {
          const sheetTableMappings = tableMappingsBySheet.get(sheetName);
          if (sheetTableMappings && sheetTableMappings.length > 0) {
            let headerRow = 1;
            for (const m of sheetTableMappings) {
              if (typeof m.headerRowNumber === 'number' && m.headerRowNumber >= 1) {
                headerRow = m.headerRowNumber;
                break;
              }
            }
            const expansionStartRow = headerRow + 1;
            const expansionEndRow = headerRow + orderedStations.length;

            const mappedColIndices = new Set<number>();
            for (const m of sheetTableMappings) {
              const parsed = parseCellAddress(`${m.targetCoordinate.toUpperCase()}1`);
              if (parsed) mappedColIndices.add(parsed.colIndex);
            }

            for (const mr of mergedRanges) {
              if (mr.startRow !== mr.endRow) {
                const rowOverlap = mr.startRow <= expansionEndRow && mr.endRow >= expansionStartRow;
                let colOverlap = false;
                for (let c = mr.startCol; c <= mr.endCol; c++) {
                  if (mappedColIndices.has(c)) {
                    colOverlap = true;
                    break;
                  }
                }

                if (rowOverlap && colOverlap) {
                  throw new AppError({
                    code: ErrorCode.VALIDATION_FAILED,
                    userMessage: `Station row expansion rows ${expansionStartRow}-${expansionEndRow} intersects multi-row merged cell range "${mr.ref}" on sheet "${sheetName}". Repeated row generation across merged cells is unsupported to prevent structural corruption.`,
                    isOperational: true,
                  });
                }
              }
            }
          }
        }

        const writesOnSheet = plannedWrites.filter(w => w.worksheetName === sheetName);
        const mergedRangesTargeted = new Map<string, string>(); // rangeRef -> fieldId

        for (const write of writesOnSheet) {
          const target = write.targetCoordinate.toUpperCase();

          // Reject write if targeting a non-anchor covered cell
          const coveredInfo = coveredMap.get(target);
          if (coveredInfo) {
            throw new AppError({
              code: ErrorCode.VALIDATION_FAILED,
              userMessage: `Target cell "${target}" on sheet "${sheetName}" for field "${write.fieldLabel}" (${write.fieldId}) is a covered cell inside merged range "${coveredInfo.rangeRef}". Writes must target the top-left anchor cell "${coveredInfo.anchorCell}".`,
              isOperational: true,
            });
          }

          // Detect multiple fields targeting the same merged range anchor
          const matchedRangeRef = anchorMap.get(target);
          if (matchedRangeRef) {
            if (mergedRangesTargeted.has(matchedRangeRef)) {
              const existingField = mergedRangesTargeted.get(matchedRangeRef)!;
              throw new AppError({
                code: ErrorCode.VALIDATION_FAILED,
                userMessage: `Conflicting writes detected: Field "${write.fieldId}" and field "${existingField}" both target merged range "${matchedRangeRef}" on sheet "${sheetName}".`,
                isOperational: true,
              });
            }
            mergedRangesTargeted.set(matchedRangeRef, write.fieldId);
          }
        }
      }

      // 9a. Pre-Write Row Capacity & Structural Conflict Check (Step 28)
      if (orderedStations.length > 0 && tableColumnMappings.length > 0) {
        for (const [sheetName, sheetTableMappings] of tableMappingsBySheet.entries()) {
          const sheetPath = WorksheetXmlEditor.resolveWorksheetPath(zip, sheetName);
          if (sheetPath) {
            let headerRow = 1;
            for (const m of sheetTableMappings) {
              if (typeof m.headerRowNumber === 'number' && m.headerRowNumber >= 1) {
                headerRow = m.headerRowNumber;
                break;
              }
            }
            const startRow = headerRow + 1;
            const mappedCols = new Set(
              sheetTableMappings.map(m => m.targetCoordinate.toUpperCase().trim())
            );

            const conflict = WorksheetXmlEditor.inspectRowCapacityConflict(
              zip,
              sheetPath,
              startRow,
              orderedStations.length,
              mappedCols,
              sharedStrings
            );

            if (conflict.hasConflict) {
              throw new AppError({
                code: ErrorCode.VALIDATION_FAILED,
                userMessage: conflict.reason ?? 'Template row capacity conflict detected.',
                isOperational: true,
              });
            }
          }
        }
      }

      // Group planned cell writes by worksheet
      const writesBySheet = new Map<string, CellWriteTarget[]>();
      for (const write of plannedWrites) {
        let sheetWrites = writesBySheet.get(write.worksheetName);
        if (!sheetWrites) {
          sheetWrites = [];
          writesBySheet.set(write.worksheetName, sheetWrites);
        }

        let writeType: CellWriteTarget['type'] = 'blank';
        if (typeof write.value === 'string') {
          writeType = 's';
        } else if (typeof write.value === 'number') {
          writeType = 'n';
        } else if (typeof write.value === 'boolean') {
          writeType = 'b';
        }

        sheetWrites.push({
          cellRef: write.targetCoordinate,
          value: write.value,
          type: writeType,
        });
      }

      // Apply writes per worksheet
      for (const [sheetName, cellTargets] of writesBySheet.entries()) {
        const sheetPath = WorksheetXmlEditor.resolveWorksheetPath(zip, sheetName);
        if (!sheetPath) {
          throw new AppError({
            code: ErrorCode.MAPPING_TARGET_NOT_FOUND,
            userMessage: `Worksheet "${sheetName}" declared in mapping was not found in the working workbook.`,
            isOperational: true,
          });
        }

        // Convert string values into shared string indices
        const processedTargets: CellWriteTarget[] = cellTargets.map(target => {
          if (target.type === 's' && typeof target.value === 'string') {
            const strVal = target.value;
            let idx = sharedStringsMap.get(strVal);
            if (idx === undefined) {
              idx = sharedStrings.length;
              sharedStrings.push(strVal);
              sharedStringsMap.set(strVal, idx);
            }
            return {
              cellRef: target.cellRef,
              value: idx,
              type: 's',
            };
          }
          return target;
        });

        WorksheetXmlEditor.applyCellWrites(zip, sheetPath, processedTargets);
      }

      // Write updated shared strings table if strings exist
      if (sharedStrings.length > 0) {
        WorksheetXmlEditor.writeSharedStrings(zip, sharedStrings);
      }

      // Serialize modified candidate buffer and save to disk
      const updatedCandidateBuf = zip.generate({ type: 'nodebuffer' });
      fs.writeFileSync(candidatePath, updatedCandidateBuf);

      // -----------------------------------------------------------------------
      // 10. Post-Write Verification & Master Immutability Invariant Check
      // -----------------------------------------------------------------------
      // Validate candidate as a compliant Open XML container
      const containerCheck = validateDocumentFile(candidatePath);
      if (!containerCheck.ok) {
        throw containerCheck.error;
      }

      // Re-read candidate to verify written cell values
      const verifyZip = new PizZip(fs.readFileSync(candidatePath));
      const verifySst = WorksheetXmlEditor.readSharedStrings(verifyZip).strings;

      for (const write of plannedWrites) {
        const sheetPath = WorksheetXmlEditor.resolveWorksheetPath(verifyZip, write.worksheetName);
        if (!sheetPath) continue;
        const readCell = WorksheetXmlEditor.readCellRaw(
          verifyZip,
          sheetPath,
          write.targetCoordinate,
          verifySst
        );

        if (write.value !== null && write.value !== undefined && write.value !== '') {
          if (!readCell || readCell.value === null) {
            throw new AppError({
              code: ErrorCode.GENERATION_FAILED,
              userMessage: `Verification failed: cell "${write.targetCoordinate}" on sheet "${write.worksheetName}" was not written successfully.`,
              isOperational: true,
            });
          }
        }
      }

      // Step 29: Structural Preservation Verification (Candidate vs Baseline)
      const candidateSnapshot = WorkbookPreservationVerifier.captureSnapshot(verifyZip);
      const plannedTargets = plannedWrites.map(w => ({
        cellRef: w.targetCoordinate,
        sheetName: w.worksheetName,
      }));
      const preservationReport = WorkbookPreservationVerifier.verifyPreservation(
        baselineSnapshot,
        candidateSnapshot,
        plannedTargets
      );

      if (!preservationReport.isPreserved) {
        const blockingFindings = preservationReport.findings.filter(f => f.severity === 'BLOCKING');
        const errorMsg = blockingFindings.map(f => f.message).join(' ');
        throw new AppError({
          code: ErrorCode.VALIDATION_FAILED,
          userMessage: `Candidate workbook failed structural integrity verification: ${errorMsg}`,
          details: { findings: preservationReport.findings },
          isOperational: true,
        });
      }

      // Check Master Immutability Invariant (0-byte delta on master template file)
      const postMasterBuf = fs.readFileSync(masterPath);
      const postMasterHash = crypto.createHash('sha256').update(postMasterBuf).digest('hex');
      if (preMasterHash !== postMasterHash) {
        throw new Error(
          'CRITICAL INVARIANT VIOLATION: Source master template in vault was mutated during data injection!'
        );
      }

      // -----------------------------------------------------------------------
      // 11. Safe Promotion to Active Working Artifact
      // -----------------------------------------------------------------------
      fs.copyFileSync(candidatePath, workingFilePath);

      // Cleanup candidate file
      if (fs.existsSync(candidatePath)) {
        try {
          fs.unlinkSync(candidatePath);
        } catch {
          // safe ignore
        }
      }
      candidatePath = null;

      // Compute new hash and size of the updated working file
      const updatedWorkingBuf = fs.readFileSync(workingFilePath);
      const updatedHash = crypto.createHash('sha256').update(updatedWorkingBuf).digest('hex');
      const updatedSize = updatedWorkingBuf.length;

      // Update generation workspace record in database
      let updatedWsRecord: GenerationWorkspaceRecord = {
        ...workspace,
        sha256Hash: updatedHash,
        fileSizeBytes: updatedSize,
        status: 'IN_USE',
        updatedAt: new Date().toISOString(),
      };

      const updateWsRes = this.workspaceRepo.updateWorkspaceFile(workspace.workspaceId, {
        sha256Hash: updatedHash,
        fileSizeBytes: updatedSize,
        status: 'IN_USE',
      });

      if (updateWsRes.ok) {
        updatedWsRecord = updateWsRes.value;
      }

      // Mark executed writes as WRITTEN
      const executedWrites: CellWriteOperation[] = plannedWrites.map(w => ({
        ...w,
        status: 'WRITTEN',
      }));

      const fixedWritten = executedWrites.filter(w => w.mappingType === 'FIXED_CELL').length;
      const tableWritten = executedWrites.filter(w => w.mappingType === 'TABLE_COLUMN').length;

      return Ok({
        workspace: updatedWsRecord,
        sessionId: session.sessionId,
        templateId: workspace.templateId,
        versionId: workspace.versionId,
        profileId: options.profileId,
        totalMappingsEvaluated: mappings.length,
        fixedCellsWrittenCount: fixedWritten,
        tableColumnsDeferredCount: deferredWrites.length,
        tableColumnsWrittenCount: tableWritten,
        stationRowsGeneratedCount: tableWritten > 0 ? orderedStations.length : 0,
        stationsEvaluatedCount: orderedStations.length,
        executedWrites,
        deferredWrites,
        injectedAt: new Date().toISOString(),
        isVerified: true,
        masterUntouched: true,
        structuralIntegrityReport: preservationReport,
      });
    } catch (err) {
      // Safe cleanup of candidate file on error
      if (candidatePath && fs.existsSync(candidatePath)) {
        try {
          fs.unlinkSync(candidatePath);
        } catch {
          // safe ignore
        }
      }

      if (err instanceof AppError) {
        return Err(err);
      }
      return Err(
        new AppError({
          code: ErrorCode.GENERATION_FAILED,
          userMessage: `Failed to inject data into Excel workbook: ${err instanceof Error ? err.message : String(err)}`,
          details: { developerMessage: String(err) },
          cause: err,
          isOperational: true,
        })
      );
    }
  }

  /**
   * Resolves field value for a specific station entry from session payload.
   */
  private extractStationFieldValue(
    stn: ResolvedStationItem,
    _stnIndex: number,
    fieldId: string,
    canonicalName: string,
    sessionData: Record<string, unknown>
  ): unknown {
    // 1. Authoritative station identity fields
    if (fieldId === 'FLD-COM-STATION' || canonicalName === 'station_name') {
      return stn.stationNameSnapshot;
    }
    if (canonicalName === 'station_code') {
      return stn.stationCodeSnapshot ?? null;
    }
    if (canonicalName === 'row_number' || canonicalName === 'sequence_order') {
      return stn.sequenceOrder;
    }

    // 2. Check sessionData.stations array
    if (Array.isArray(sessionData.stations)) {
      const matching = (sessionData.stations as any[]).find(
        item =>
          typeof item === 'object' &&
          item !== null &&
          (String(item.stationId) === String(stn.stationId) ||
            String(item.id) === String(stn.stationId) ||
            item.stationNameSnapshot === stn.stationNameSnapshot)
      );
      if (matching) {
        if (matching[fieldId] !== undefined) return matching[fieldId];
        if (canonicalName && matching[canonicalName] !== undefined) return matching[canonicalName];
      }
    }

    // 3. Check sessionData.stations object/map
    if (
      typeof sessionData.stations === 'object' &&
      sessionData.stations !== null &&
      !Array.isArray(sessionData.stations)
    ) {
      const stnObj = (sessionData.stations as Record<string, any>)[String(stn.stationId)];
      if (stnObj && typeof stnObj === 'object') {
        if (stnObj[fieldId] !== undefined) return stnObj[fieldId];
        if (canonicalName && stnObj[canonicalName] !== undefined) return stnObj[canonicalName];
      }
    }

    // 4. Check sessionData.stationData or sessionData.station_data
    const container = (sessionData.stationData ?? sessionData.station_data) as any;
    if (container && typeof container === 'object') {
      if (Array.isArray(container)) {
        const matching = container.find(
          (item: any) =>
            item &&
            (String(item.stationId) === String(stn.stationId) ||
              String(item.id) === String(stn.stationId))
        );
        if (matching) {
          if (matching[fieldId] !== undefined) return matching[fieldId];
          if (canonicalName && matching[canonicalName] !== undefined)
            return matching[canonicalName];
        }
      } else {
        const stnObj = container[String(stn.stationId)];
        if (stnObj && typeof stnObj === 'object') {
          if (stnObj[fieldId] !== undefined) return stnObj[fieldId];
          if (canonicalName && stnObj[canonicalName] !== undefined) return stnObj[canonicalName];
        }
      }
    }

    // 5. Check direct key sessionData[stationId]
    const directObj = sessionData[String(stn.stationId)] as any;
    if (directObj && typeof directObj === 'object') {
      if (directObj[fieldId] !== undefined) return directObj[fieldId];
      if (canonicalName && directObj[canonicalName] !== undefined) return directObj[canonicalName];
    }

    // 6. Remarks fallback
    if (fieldId === 'FLD-COM-REMARKS' || canonicalName === 'general_remarks') {
      return (
        sessionData['FLD-COM-REMARKS'] ?? sessionData.general_remarks ?? sessionData.remarks ?? null
      );
    }

    // 7. General sessionData lookup as fallback
    if (sessionData[fieldId] !== undefined) return sessionData[fieldId];
    if (canonicalName && sessionData[canonicalName] !== undefined)
      return sessionData[canonicalName];

    return undefined;
  }
}
