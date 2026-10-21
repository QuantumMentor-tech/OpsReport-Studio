/**
 * OpsReport Studio — Template Client Service
 *
 * Provides a typed client interface for template metadata operations in the renderer.
 * Delegates to the Electron Preload IPC bridge (`window.opsreport.templates`) when running
 * in the desktop shell, and provides an in-memory client fallback for test and preview environments.
 *
 * @module renderer/services/template-client
 */

import type {
  TemplateMetadataRecord,
  CreateTemplateMetadataInput,
  UpdateTemplateMetadataInput,
  TemplateStatus,
  TemplateFileSelection,
  ImportTemplateOptions,
  TemplateImportResult,
  TemplateVersionRecord,
  CloneMasterTemplateOptions,
  CloneMasterTemplateResult,
  TemplateIntegrityCheckResult,
  TemplateInspectionResult,
  InspectTemplateOptions,
  ReplaceTemplateOptions,
  ReplaceTemplateResult,
  TemplateHealthRecord,
  ExcelFieldMappingRecord,
  ExcelTemplateMappingConfig,
  SaveExcelMappingsInput,
  WordFieldMappingRecord,
  WordTemplateMappingConfig,
  SaveWordMappingsInput,
  MappingProfileRecord,
  MappingProfileWithDetails,
  CreateMappingProfileInput,
  UpdateMappingProfileInput,
  MappingValidationResult,
  Result,
  SerializableError,
  OpsReportBridgeAPI,
} from '../../shared/types.ts';
import {
  toTemplateId,
  toTemplateVersionId,
  toReportCategoryId,
} from '../../shared/types/identifiers.ts';
import { ErrorCode } from '../../shared/errors/error-codes.ts';

declare global {
  interface Window {
    opsreport?: OpsReportBridgeAPI;
  }
}

function getOpsReportBridge(): OpsReportBridgeAPI | undefined {
  if (typeof globalThis !== 'undefined') {
    const g = globalThis as unknown as {
      opsreport?: OpsReportBridgeAPI;
      window?: { opsreport?: OpsReportBridgeAPI };
    };
    return g.opsreport ?? g.window?.opsreport;
  }
  return undefined;
}

function makeError(code: ErrorCode, userMessage: string): SerializableError {
  return {
    code,
    userMessage,
    isOperational: true,
    timestamp: new Date().toISOString(),
  };
}

export interface ITemplateClient {
  getAll(options?: {
    categoryId?: string;
    status?: TemplateStatus;
  }): Promise<Result<TemplateMetadataRecord[], SerializableError>>;
  getById(templateId: string): Promise<Result<TemplateMetadataRecord | null, SerializableError>>;
  getByCategory(categoryId: string): Promise<Result<TemplateMetadataRecord[], SerializableError>>;
  create(
    input: CreateTemplateMetadataInput
  ): Promise<Result<TemplateMetadataRecord, SerializableError>>;
  update(
    templateId: string,
    input: UpdateTemplateMetadataInput
  ): Promise<Result<TemplateMetadataRecord, SerializableError>>;
  setStatus(
    templateId: string,
    status: TemplateStatus
  ): Promise<Result<TemplateMetadataRecord, SerializableError>>;
  delete(templateId: string): Promise<Result<boolean, SerializableError>>;
  getCount(options?: {
    categoryId?: string;
    status?: TemplateStatus;
  }): Promise<Result<number, SerializableError>>;
  selectFile(): Promise<Result<TemplateFileSelection | null, SerializableError>>;
  importTemplate(
    options: ImportTemplateOptions
  ): Promise<Result<TemplateImportResult, SerializableError>>;
  getVersions(templateId: string): Promise<Result<TemplateVersionRecord[], SerializableError>>;
  getVersionById(
    versionId: string
  ): Promise<Result<TemplateVersionRecord | null, SerializableError>>;
  getActiveVersion(
    templateId: string
  ): Promise<Result<TemplateVersionRecord | null, SerializableError>>;
  setActiveVersion(
    templateId: string,
    versionId: string
  ): Promise<Result<TemplateVersionRecord, SerializableError>>;
  cloneMaster(
    options: CloneMasterTemplateOptions
  ): Promise<Result<CloneMasterTemplateResult, SerializableError>>;
  verifyIntegrity(
    versionId: string
  ): Promise<Result<TemplateIntegrityCheckResult, SerializableError>>;
  inspectTemplate(
    options: InspectTemplateOptions
  ): Promise<Result<TemplateInspectionResult, SerializableError>>;
  replaceTemplate(
    options: ReplaceTemplateOptions
  ): Promise<Result<ReplaceTemplateResult, SerializableError>>;
  checkHealth(templateId: string): Promise<Result<TemplateHealthRecord, SerializableError>>;
  checkAllHealth(): Promise<Result<TemplateHealthRecord[], SerializableError>>;
  getDependencyCount(
    templateId: string
  ): Promise<Result<{ sessionCount: number }, SerializableError>>;
  getExcelMappings(
    templateId: string,
    versionId: string,
    worksheetName?: string
  ): Promise<Result<ExcelFieldMappingRecord[], SerializableError>>;
  saveExcelMappings(
    input: SaveExcelMappingsInput
  ): Promise<Result<ExcelTemplateMappingConfig, SerializableError>>;
  deleteExcelMappings(
    templateId: string,
    versionId: string,
    worksheetName?: string
  ): Promise<Result<boolean, SerializableError>>;
  getWordMappings(
    templateId: string,
    versionId: string
  ): Promise<Result<WordFieldMappingRecord[], SerializableError>>;
  saveWordMappings(
    input: SaveWordMappingsInput
  ): Promise<Result<WordTemplateMappingConfig, SerializableError>>;
  deleteWordMappings(
    templateId: string,
    versionId: string
  ): Promise<Result<boolean, SerializableError>>;
  listProfiles(filter?: {
    categoryId?: string;
    templateId?: string;
    versionId?: string;
    status?: string;
  }): Promise<Result<MappingProfileWithDetails[], SerializableError>>;
  getProfile(
    profileId: string
  ): Promise<Result<MappingProfileWithDetails | null, SerializableError>>;
  createProfile(
    input: CreateMappingProfileInput
  ): Promise<Result<MappingProfileRecord, SerializableError>>;
  updateProfile(
    profileId: string,
    updates: UpdateMappingProfileInput
  ): Promise<Result<MappingProfileRecord, SerializableError>>;
  deleteProfile(profileId: string): Promise<Result<boolean, SerializableError>>;
  duplicateProfile(
    profileId: string,
    newProfileName: string
  ): Promise<Result<MappingProfileWithDetails, SerializableError>>;
  validateProfile(input: {
    profileId?: string;
    templateId: string;
    versionId: string;
    categoryId?: string;
    documentType?: string;
  }): Promise<Result<MappingValidationResult, SerializableError>>;
}

export class ElectronTemplateClient implements ITemplateClient {
  public async selectFile(): Promise<Result<TemplateFileSelection | null, SerializableError>> {
    const bridge = getOpsReportBridge();
    if (!bridge?.templates) {
      return {
        ok: false,
        error: makeError(ErrorCode.PERSISTENCE_FAILED, 'Desktop bridge not connected.'),
      };
    }
    return bridge.templates.selectFile();
  }

  public async importTemplate(
    options: ImportTemplateOptions
  ): Promise<Result<TemplateImportResult, SerializableError>> {
    const bridge = getOpsReportBridge();
    if (!bridge?.templates) {
      return {
        ok: false,
        error: makeError(ErrorCode.PERSISTENCE_FAILED, 'Desktop bridge not connected.'),
      };
    }
    return bridge.templates.importTemplate(options);
  }

  public async getAll(options?: {
    categoryId?: string;
    status?: TemplateStatus;
  }): Promise<Result<TemplateMetadataRecord[], SerializableError>> {
    const bridge = getOpsReportBridge();
    if (!bridge?.templates) {
      return {
        ok: false,
        error: makeError(ErrorCode.PERSISTENCE_FAILED, 'Desktop bridge not connected.'),
      };
    }
    return bridge.templates.getAll(options);
  }

  public async getById(
    templateId: string
  ): Promise<Result<TemplateMetadataRecord | null, SerializableError>> {
    const bridge = getOpsReportBridge();
    if (!bridge?.templates) {
      return {
        ok: false,
        error: makeError(ErrorCode.PERSISTENCE_FAILED, 'Desktop bridge not connected.'),
      };
    }
    return bridge.templates.getById(templateId);
  }

  public async getByCategory(
    categoryId: string
  ): Promise<Result<TemplateMetadataRecord[], SerializableError>> {
    const bridge = getOpsReportBridge();
    if (!bridge?.templates) {
      return {
        ok: false,
        error: makeError(ErrorCode.PERSISTENCE_FAILED, 'Desktop bridge not connected.'),
      };
    }
    return bridge.templates.getByCategory(categoryId);
  }

  public async create(
    input: CreateTemplateMetadataInput
  ): Promise<Result<TemplateMetadataRecord, SerializableError>> {
    const bridge = getOpsReportBridge();
    if (!bridge?.templates) {
      return {
        ok: false,
        error: makeError(ErrorCode.PERSISTENCE_FAILED, 'Desktop bridge not connected.'),
      };
    }
    return bridge.templates.create(input);
  }

  public async update(
    templateId: string,
    input: UpdateTemplateMetadataInput
  ): Promise<Result<TemplateMetadataRecord, SerializableError>> {
    const bridge = getOpsReportBridge();
    if (!bridge?.templates) {
      return {
        ok: false,
        error: makeError(ErrorCode.PERSISTENCE_FAILED, 'Desktop bridge not connected.'),
      };
    }
    return bridge.templates.update(templateId, input);
  }

  public async setStatus(
    templateId: string,
    status: TemplateStatus
  ): Promise<Result<TemplateMetadataRecord, SerializableError>> {
    const bridge = getOpsReportBridge();
    if (!bridge?.templates) {
      return {
        ok: false,
        error: makeError(ErrorCode.PERSISTENCE_FAILED, 'Desktop bridge not connected.'),
      };
    }
    return bridge.templates.setStatus(templateId, status);
  }

  public async delete(templateId: string): Promise<Result<boolean, SerializableError>> {
    const bridge = getOpsReportBridge();
    if (!bridge?.templates) {
      return {
        ok: false,
        error: makeError(ErrorCode.PERSISTENCE_FAILED, 'Desktop bridge not connected.'),
      };
    }
    return bridge.templates.delete(templateId);
  }

  public async getCount(options?: {
    categoryId?: string;
    status?: TemplateStatus;
  }): Promise<Result<number, SerializableError>> {
    const bridge = getOpsReportBridge();
    if (!bridge?.templates) {
      return {
        ok: false,
        error: makeError(ErrorCode.PERSISTENCE_FAILED, 'Desktop bridge not connected.'),
      };
    }
    return bridge.templates.getCount(options);
  }

  public async getVersions(
    templateId: string
  ): Promise<Result<TemplateVersionRecord[], SerializableError>> {
    const bridge = getOpsReportBridge();
    if (!bridge?.templates) {
      return {
        ok: false,
        error: makeError(ErrorCode.PERSISTENCE_FAILED, 'Desktop bridge not connected.'),
      };
    }
    return bridge.templates.getVersions(templateId);
  }

  public async getVersionById(
    versionId: string
  ): Promise<Result<TemplateVersionRecord | null, SerializableError>> {
    const bridge = getOpsReportBridge();
    if (!bridge?.templates) {
      return {
        ok: false,
        error: makeError(ErrorCode.PERSISTENCE_FAILED, 'Desktop bridge not connected.'),
      };
    }
    return bridge.templates.getVersionById(versionId);
  }

  public async getActiveVersion(
    templateId: string
  ): Promise<Result<TemplateVersionRecord | null, SerializableError>> {
    const bridge = getOpsReportBridge();
    if (!bridge?.templates) {
      return {
        ok: false,
        error: makeError(ErrorCode.PERSISTENCE_FAILED, 'Desktop bridge not connected.'),
      };
    }
    return bridge.templates.getActiveVersion(templateId);
  }

  public async setActiveVersion(
    templateId: string,
    versionId: string
  ): Promise<Result<TemplateVersionRecord, SerializableError>> {
    const bridge = getOpsReportBridge();
    if (!bridge?.templates) {
      return {
        ok: false,
        error: makeError(ErrorCode.PERSISTENCE_FAILED, 'Desktop bridge not connected.'),
      };
    }
    return bridge.templates.setActiveVersion(templateId, versionId);
  }

  public async cloneMaster(
    options: CloneMasterTemplateOptions
  ): Promise<Result<CloneMasterTemplateResult, SerializableError>> {
    const bridge = getOpsReportBridge();
    if (!bridge?.templates) {
      return {
        ok: false,
        error: makeError(ErrorCode.PERSISTENCE_FAILED, 'Desktop bridge not connected.'),
      };
    }
    return bridge.templates.cloneMaster(options);
  }

  public async verifyIntegrity(
    versionId: string
  ): Promise<Result<TemplateIntegrityCheckResult, SerializableError>> {
    const bridge = getOpsReportBridge();
    if (!bridge?.templates) {
      return {
        ok: false,
        error: makeError(ErrorCode.PERSISTENCE_FAILED, 'Desktop bridge not connected.'),
      };
    }
    return bridge.templates.verifyIntegrity(versionId);
  }

  public async inspectTemplate(
    options: InspectTemplateOptions
  ): Promise<Result<TemplateInspectionResult, SerializableError>> {
    const bridge = getOpsReportBridge();
    if (!bridge?.templates) {
      return {
        ok: false,
        error: makeError(ErrorCode.PERSISTENCE_FAILED, 'Desktop bridge not connected.'),
      };
    }
    return bridge.templates.inspectTemplate(options);
  }

  public async replaceTemplate(
    options: ReplaceTemplateOptions
  ): Promise<Result<ReplaceTemplateResult, SerializableError>> {
    const bridge = getOpsReportBridge();
    if (!bridge?.templates) {
      return {
        ok: false,
        error: makeError(ErrorCode.PERSISTENCE_FAILED, 'Desktop bridge not connected.'),
      };
    }
    return bridge.templates.replaceTemplate(options);
  }

  public async checkHealth(
    templateId: string
  ): Promise<Result<TemplateHealthRecord, SerializableError>> {
    const bridge = getOpsReportBridge();
    if (!bridge?.templates) {
      return {
        ok: false,
        error: makeError(ErrorCode.PERSISTENCE_FAILED, 'Desktop bridge not connected.'),
      };
    }
    return bridge.templates.checkHealth(templateId);
  }

  public async checkAllHealth(): Promise<Result<TemplateHealthRecord[], SerializableError>> {
    const bridge = getOpsReportBridge();
    if (!bridge?.templates) {
      return {
        ok: false,
        error: makeError(ErrorCode.PERSISTENCE_FAILED, 'Desktop bridge not connected.'),
      };
    }
    return bridge.templates.checkAllHealth();
  }

  public async getDependencyCount(
    templateId: string
  ): Promise<Result<{ sessionCount: number }, SerializableError>> {
    const bridge = getOpsReportBridge();
    if (!bridge?.templates) {
      return {
        ok: false,
        error: makeError(ErrorCode.PERSISTENCE_FAILED, 'Desktop bridge not connected.'),
      };
    }
    return bridge.templates.getDependencyCount(templateId);
  }

  public async getExcelMappings(
    templateId: string,
    versionId: string,
    worksheetName?: string
  ): Promise<Result<ExcelFieldMappingRecord[], SerializableError>> {
    const bridge = getOpsReportBridge();
    if (!bridge?.templates) {
      return {
        ok: false,
        error: makeError(ErrorCode.PERSISTENCE_FAILED, 'Desktop bridge not connected.'),
      };
    }
    return bridge.templates.getExcelMappings(templateId, versionId, worksheetName);
  }

  public async saveExcelMappings(
    input: SaveExcelMappingsInput
  ): Promise<Result<ExcelTemplateMappingConfig, SerializableError>> {
    const bridge = getOpsReportBridge();
    if (!bridge?.templates) {
      return {
        ok: false,
        error: makeError(ErrorCode.PERSISTENCE_FAILED, 'Desktop bridge not connected.'),
      };
    }
    return bridge.templates.saveExcelMappings(input);
  }

  public async deleteExcelMappings(
    templateId: string,
    versionId: string,
    worksheetName?: string
  ): Promise<Result<boolean, SerializableError>> {
    const bridge = getOpsReportBridge();
    if (!bridge?.templates) {
      return {
        ok: false,
        error: makeError(ErrorCode.PERSISTENCE_FAILED, 'Desktop bridge not connected.'),
      };
    }
    return bridge.templates.deleteExcelMappings(templateId, versionId, worksheetName);
  }

  public async getWordMappings(
    templateId: string,
    versionId: string
  ): Promise<Result<WordFieldMappingRecord[], SerializableError>> {
    const bridge = getOpsReportBridge();
    if (!bridge?.templates) {
      return {
        ok: false,
        error: makeError(ErrorCode.PERSISTENCE_FAILED, 'Desktop bridge not connected.'),
      };
    }
    return bridge.templates.getWordMappings(templateId, versionId);
  }

  public async saveWordMappings(
    input: SaveWordMappingsInput
  ): Promise<Result<WordTemplateMappingConfig, SerializableError>> {
    const bridge = getOpsReportBridge();
    if (!bridge?.templates) {
      return {
        ok: false,
        error: makeError(ErrorCode.PERSISTENCE_FAILED, 'Desktop bridge not connected.'),
      };
    }
    return bridge.templates.saveWordMappings(input);
  }

  public async deleteWordMappings(
    templateId: string,
    versionId: string
  ): Promise<Result<boolean, SerializableError>> {
    const bridge = getOpsReportBridge();
    if (!bridge?.templates) {
      return {
        ok: false,
        error: makeError(ErrorCode.PERSISTENCE_FAILED, 'Desktop bridge not connected.'),
      };
    }
    return bridge.templates.deleteWordMappings(templateId, versionId);
  }

  public async listProfiles(filter?: {
    categoryId?: string;
    templateId?: string;
    versionId?: string;
    status?: string;
  }): Promise<Result<MappingProfileWithDetails[], SerializableError>> {
    const bridge = getOpsReportBridge();
    if (!bridge?.templates) {
      return {
        ok: false,
        error: makeError(ErrorCode.PERSISTENCE_FAILED, 'Desktop bridge not connected.'),
      };
    }
    return bridge.templates.listProfiles(filter);
  }

  public async getProfile(
    profileId: string
  ): Promise<Result<MappingProfileWithDetails | null, SerializableError>> {
    const bridge = getOpsReportBridge();
    if (!bridge?.templates) {
      return {
        ok: false,
        error: makeError(ErrorCode.PERSISTENCE_FAILED, 'Desktop bridge not connected.'),
      };
    }
    return bridge.templates.getProfile(profileId);
  }

  public async createProfile(
    input: CreateMappingProfileInput
  ): Promise<Result<MappingProfileRecord, SerializableError>> {
    const bridge = getOpsReportBridge();
    if (!bridge?.templates) {
      return {
        ok: false,
        error: makeError(ErrorCode.PERSISTENCE_FAILED, 'Desktop bridge not connected.'),
      };
    }
    return bridge.templates.createProfile(input);
  }

  public async updateProfile(
    profileId: string,
    updates: UpdateMappingProfileInput
  ): Promise<Result<MappingProfileRecord, SerializableError>> {
    const bridge = getOpsReportBridge();
    if (!bridge?.templates) {
      return {
        ok: false,
        error: makeError(ErrorCode.PERSISTENCE_FAILED, 'Desktop bridge not connected.'),
      };
    }
    return bridge.templates.updateProfile(profileId, updates);
  }

  public async deleteProfile(profileId: string): Promise<Result<boolean, SerializableError>> {
    const bridge = getOpsReportBridge();
    if (!bridge?.templates) {
      return {
        ok: false,
        error: makeError(ErrorCode.PERSISTENCE_FAILED, 'Desktop bridge not connected.'),
      };
    }
    return bridge.templates.deleteProfile(profileId);
  }

  public async duplicateProfile(
    profileId: string,
    newProfileName: string
  ): Promise<Result<MappingProfileWithDetails, SerializableError>> {
    const bridge = getOpsReportBridge();
    if (!bridge?.templates) {
      return {
        ok: false,
        error: makeError(ErrorCode.PERSISTENCE_FAILED, 'Desktop bridge not connected.'),
      };
    }
    return bridge.templates.duplicateProfile(profileId, newProfileName);
  }

  public async validateProfile(input: {
    profileId?: string;
    templateId: string;
    versionId: string;
    categoryId?: string;
    documentType?: string;
  }): Promise<Result<MappingValidationResult, SerializableError>> {
    const bridge = getOpsReportBridge();
    if (!bridge?.templates) {
      return {
        ok: false,
        error: makeError(ErrorCode.PERSISTENCE_FAILED, 'Desktop bridge not connected.'),
      };
    }
    return bridge.templates.validateProfile(input);
  }
}

export class InMemoryTemplateClient implements ITemplateClient {
  private templates: TemplateMetadataRecord[] = [];
  private excelMappings: ExcelFieldMappingRecord[] = [];
  private wordMappings: WordFieldMappingRecord[] = [];

  constructor(initialData?: TemplateMetadataRecord[]) {
    if (initialData) {
      this.templates = [...initialData];
    } else {
      const now = new Date().toISOString();
      this.templates = [
        {
          template_id: toTemplateId('TPL-INCIDENT-STANDARD'),
          template_name: 'Security Incident Report Master',
          category_id: toReportCategoryId('RPT-INCIDENT'),
          document_type: 'WORD_DOCX',
          description:
            'Standard Word template for security incident reporting, patrol event logging, and physical observations.',
          status: 'ACTIVE',
          file_name: 'security_incident_report_master.docx',
          created_at: now,
          updated_at: now,
        },
        {
          template_id: toTemplateId('TPL-STATION-LIGHT-STANDARD'),
          template_name: 'Station Light Inspection Master',
          category_id: toReportCategoryId('RPT-STATION-LIGHT'),
          document_type: 'EXCEL_XLSX',
          description:
            'Multi-station platform and concourse luminaire defect tracking and circuit auditing spreadsheet.',
          status: 'ACTIVE',
          file_name: 'station_light_inspection_master.xlsx',
          created_at: now,
          updated_at: now,
        },
        {
          template_id: toTemplateId('TPL-FAN-STANDARD'),
          template_name: 'Platform Fan Audit Master',
          category_id: toReportCategoryId('RPT-FAN'),
          document_type: 'EXCEL_XLSX',
          description:
            'Platform ventilation, jet fan mechanical state, and air movement operational verification spreadsheet.',
          status: 'ACTIVE',
          file_name: 'platform_fan_audit_master.xlsx',
          created_at: now,
          updated_at: now,
        },
        {
          template_id: toTemplateId('TPL-POLE-LIGHT-STANDARD'),
          template_name: 'Pole Light Inspection Master',
          category_id: toReportCategoryId('RPT-POLE-LIGHT'),
          document_type: 'EXCEL_XLSX',
          description:
            'Perimeter, parking facility, and yard high-mast luminaire illumination inspection template.',
          status: 'ACTIVE',
          file_name: 'pole_light_inspection_master.xlsx',
          created_at: now,
          updated_at: now,
        },
        {
          template_id: toTemplateId('TPL-FIRE-EXTINGUISHER-STANDARD'),
          template_name: 'Fire Extinguisher Inspection Master',
          category_id: toReportCategoryId('RPT-FIRE-EXTINGUISHER'),
          document_type: 'EXCEL_XLSX',
          description:
            'Pressure gauge status, safety seal integrity, certification tags, and placement audit spreadsheet.',
          status: 'ACTIVE',
          file_name: 'fire_extinguisher_inspection_master.xlsx',
          created_at: now,
          updated_at: now,
        },
        {
          template_id: toTemplateId('TPL-PILLAR-STANDARD'),
          template_name: 'Pillar Structural Audit Master',
          category_id: toReportCategoryId('RPT-PILLAR'),
          document_type: 'EXCEL_XLSX',
          description:
            'Structural station pillar physical integrity, asset numbering tags, and clearance check spreadsheet.',
          status: 'ACTIVE',
          file_name: 'pillar_structural_audit_master.xlsx',
          created_at: now,
          updated_at: now,
        },
        {
          template_id: toTemplateId('TPL-FENCE-STANDARD'),
          template_name: 'Perimeter Fence Inspection Master',
          category_id: toReportCategoryId('RPT-FENCE'),
          document_type: 'EXCEL_XLSX',
          description:
            'Perimeter barrier condition, intrusion risk points, and boundary security audit spreadsheet.',
          status: 'ACTIVE',
          file_name: 'perimeter_fence_inspection_master.xlsx',
          created_at: now,
          updated_at: now,
        },
      ];
    }
  }

  public async getAll(options?: {
    categoryId?: string;
    status?: TemplateStatus;
  }): Promise<Result<TemplateMetadataRecord[], SerializableError>> {
    let result = [...this.templates];
    if (options?.categoryId) {
      result = result.filter(t => t.category_id === options.categoryId);
    }
    if (options?.status) {
      result = result.filter(t => t.status === options.status);
    }
    result.sort((a, b) => a.template_name.localeCompare(b.template_name));
    return { ok: true, value: result };
  }

  public async getById(
    templateId: string
  ): Promise<Result<TemplateMetadataRecord | null, SerializableError>> {
    const found = this.templates.find(t => t.template_id === templateId);
    return { ok: true, value: found ?? null };
  }

  public async getByCategory(
    categoryId: string
  ): Promise<Result<TemplateMetadataRecord[], SerializableError>> {
    return this.getAll({ categoryId });
  }

  public async create(
    input: CreateTemplateMetadataInput
  ): Promise<Result<TemplateMetadataRecord, SerializableError>> {
    const trimmed = input.templateName.trim();
    if (!trimmed || trimmed.length > 150) {
      return {
        ok: false,
        error: makeError(
          ErrorCode.VALIDATION_FAILED,
          'Template name must be between 1 and 150 characters.'
        ),
      };
    }

    if (
      this.templates.some(
        t =>
          t.category_id === input.categoryId &&
          t.template_name.toLowerCase() === trimmed.toLowerCase()
      )
    ) {
      return {
        ok: false,
        error: makeError(
          ErrorCode.VALIDATION_FAILED,
          `A template named "${trimmed}" already exists for this category.`
        ),
      };
    }

    const now = new Date().toISOString();
    const slug = trimmed
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 30);
    const id =
      input.templateId ?? toTemplateId(`TPL-${slug}-${Math.floor(Math.random() * 9000 + 1000)}`);

    const record: TemplateMetadataRecord = {
      template_id: id,
      template_name: trimmed,
      category_id: input.categoryId,
      document_type: input.documentType,
      description: input.description?.trim() || null,
      status: input.status ?? 'ACTIVE',
      file_name: input.fileName?.trim() || null,
      created_at: now,
      updated_at: now,
    };

    this.templates.push(record);
    return { ok: true, value: record };
  }

  public async update(
    templateId: string,
    input: UpdateTemplateMetadataInput
  ): Promise<Result<TemplateMetadataRecord, SerializableError>> {
    const idx = this.templates.findIndex(t => t.template_id === templateId);
    if (idx === -1) {
      return {
        ok: false,
        error: makeError(ErrorCode.VALIDATION_FAILED, `Template "${templateId}" not found.`),
      };
    }

    const current = this.templates[idx];
    const categoryId = input.categoryId ?? current.category_id;
    let templateName = current.template_name;

    if (input.templateName !== undefined) {
      const trimmed = input.templateName.trim();
      if (!trimmed || trimmed.length > 150) {
        return {
          ok: false,
          error: makeError(
            ErrorCode.VALIDATION_FAILED,
            'Template name must be between 1 and 150 characters.'
          ),
        };
      }
      if (
        (trimmed.toLowerCase() !== current.template_name.toLowerCase() ||
          categoryId !== current.category_id) &&
        this.templates.some(
          t =>
            t.template_id !== templateId &&
            t.category_id === categoryId &&
            t.template_name.toLowerCase() === trimmed.toLowerCase()
        )
      ) {
        return {
          ok: false,
          error: makeError(
            ErrorCode.VALIDATION_FAILED,
            `A template named "${trimmed}" already exists for this category.`
          ),
        };
      }
      templateName = trimmed;
    }

    const now = new Date().toISOString();
    const updated: TemplateMetadataRecord = {
      ...current,
      template_name: templateName,
      category_id: categoryId,
      document_type: input.documentType ?? current.document_type,
      description:
        input.description !== undefined ? input.description?.trim() || null : current.description,
      status: input.status ?? current.status,
      file_name: input.fileName !== undefined ? input.fileName?.trim() || null : current.file_name,
      updated_at: now,
    };

    this.templates[idx] = updated;
    return { ok: true, value: updated };
  }

  public async setStatus(
    templateId: string,
    status: TemplateStatus
  ): Promise<Result<TemplateMetadataRecord, SerializableError>> {
    return this.update(templateId, { status });
  }

  public async delete(templateId: string): Promise<Result<boolean, SerializableError>> {
    const idx = this.templates.findIndex(t => t.template_id === templateId);
    if (idx === -1) {
      return {
        ok: false,
        error: makeError(ErrorCode.VALIDATION_FAILED, `Template "${templateId}" not found.`),
      };
    }
    this.templates.splice(idx, 1);
    return { ok: true, value: true };
  }

  public async getCount(options?: {
    categoryId?: string;
    status?: TemplateStatus;
  }): Promise<Result<number, SerializableError>> {
    const list = await this.getAll(options);
    return { ok: true, value: list.ok ? list.value.length : 0 };
  }

  public async selectFile(): Promise<Result<TemplateFileSelection | null, SerializableError>> {
    return {
      ok: true,
      value: {
        filePath: 'C:\\mock\\path\\Operational_Template.xlsx',
        fileName: 'Operational_Template.xlsx',
        fileSize: 45000,
      },
    };
  }

  public async importTemplate(
    options: ImportTemplateOptions
  ): Promise<Result<TemplateImportResult, SerializableError>> {
    const ext = options.documentType === 'EXCEL_XLSX' ? '.xlsx' : '.docx';
    const tplId =
      options.templateId ??
      toTemplateId(`TPL-${options.categoryId.replace(/^RPT-/, '')}-${Date.now()}`);
    const now = new Date().toISOString();

    const existingIdx = this.templates.findIndex(t => t.template_id === tplId);
    let record: TemplateMetadataRecord;

    if (existingIdx >= 0) {
      record = {
        ...this.templates[existingIdx],
        template_name: options.templateName,
        category_id: options.categoryId,
        document_type: options.documentType,
        description: options.description ?? null,
        file_name: `${tplId}${ext}`,
        updated_at: now,
      };
      this.templates[existingIdx] = record;
    } else {
      record = {
        template_id: tplId,
        template_name: options.templateName,
        category_id: options.categoryId,
        document_type: options.documentType,
        description: options.description ?? null,
        status: 'ACTIVE',
        file_name: `${tplId}${ext}`,
        created_at: now,
        updated_at: now,
      };
      this.templates.push(record);
    }

    return {
      ok: true,
      value: {
        template: record,
        vaultPath: `/mock/vault/${tplId}${ext}`,
        fileSizeBytes: 45000,
        sha256Hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        importedAt: now,
      },
    };
  }

  public async getVersions(
    templateId: string
  ): Promise<Result<TemplateVersionRecord[], SerializableError>> {
    const tpl = this.templates.find(t => t.template_id === templateId);
    if (!tpl) {
      return { ok: true, value: [] };
    }
    const version: TemplateVersionRecord = {
      version_id: toTemplateVersionId(`VER-${tpl.template_id}-V1`),
      template_id: tpl.template_id,
      version_number: 1,
      file_name: tpl.file_name || `${tpl.template_id}.xlsx`,
      sha256_hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      file_size_bytes: 45000,
      change_summary: 'Initial baseline version',
      is_active: 1,
      created_at: tpl.created_at,
    };
    return { ok: true, value: [version] };
  }

  public async getVersionById(
    versionId: string
  ): Promise<Result<TemplateVersionRecord | null, SerializableError>> {
    for (const tpl of this.templates) {
      const vId = `VER-${tpl.template_id}-V1`;
      if (vId === versionId) {
        return {
          ok: true,
          value: {
            version_id: toTemplateVersionId(vId),
            template_id: tpl.template_id,
            version_number: 1,
            file_name: tpl.file_name || `${tpl.template_id}.xlsx`,
            sha256_hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            file_size_bytes: 45000,
            change_summary: 'Initial baseline version',
            is_active: 1,
            created_at: tpl.created_at,
          },
        };
      }
    }
    return { ok: true, value: null };
  }

  public async getActiveVersion(
    templateId: string
  ): Promise<Result<TemplateVersionRecord | null, SerializableError>> {
    const tpl = this.templates.find(t => t.template_id === templateId);
    if (!tpl) {
      return { ok: true, value: null };
    }
    return {
      ok: true,
      value: {
        version_id: toTemplateVersionId(`VER-${tpl.template_id}-V1`),
        template_id: tpl.template_id,
        version_number: 1,
        file_name: tpl.file_name || `${tpl.template_id}.xlsx`,
        sha256_hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        file_size_bytes: 45000,
        change_summary: 'Initial baseline version',
        is_active: 1,
        created_at: tpl.created_at,
      },
    };
  }

  public async setActiveVersion(
    _templateId: string,
    versionId: string
  ): Promise<Result<TemplateVersionRecord, SerializableError>> {
    const vRes = await this.getVersionById(versionId);
    if (!vRes.ok || !vRes.value) {
      return {
        ok: false,
        error: makeError(ErrorCode.TEMPLATE_NOT_FOUND, `Version "${versionId}" not found.`),
      };
    }
    return { ok: true, value: vRes.value };
  }

  public async cloneMaster(
    options: CloneMasterTemplateOptions
  ): Promise<Result<CloneMasterTemplateResult, SerializableError>> {
    const targetId = options.templateId ?? 'TPL-STATION-LIGHT-STANDARD';
    const vRes = await this.getActiveVersion(targetId);
    if (!vRes.ok || !vRes.value) {
      return {
        ok: false,
        error: makeError(ErrorCode.TEMPLATE_NOT_FOUND, 'Target version not found.'),
      };
    }
    const now = new Date().toISOString();
    return {
      ok: true,
      value: {
        sourceVersion: vRes.value,
        clonedPath: `/mock/scratch/${options.purpose.toLowerCase()}_${targetId}_${Date.now()}.xlsx`,
        fileName: `${options.purpose.toLowerCase()}_${targetId}_${Date.now()}.xlsx`,
        fileSizeBytes: 45000,
        sha256Hash: vRes.value.sha256_hash,
        clonedAt: now,
      },
    };
  }

  public async verifyIntegrity(
    versionId: string
  ): Promise<Result<TemplateIntegrityCheckResult, SerializableError>> {
    const vRes = await this.getVersionById(versionId);
    if (!vRes.ok || !vRes.value) {
      return {
        ok: false,
        error: makeError(ErrorCode.TEMPLATE_NOT_FOUND, `Version "${versionId}" not found.`),
      };
    }
    return {
      ok: true,
      value: {
        versionId: toTemplateVersionId(versionId),
        templateId: vRes.value.template_id,
        versionNumber: vRes.value.version_number,
        expectedHash: vRes.value.sha256_hash,
        actualHash: vRes.value.sha256_hash,
        isIntact: true,
        isReadOnly: true,
        statusMessage: 'Master template version is intact and verified.',
      },
    };
  }

  public async inspectTemplate(
    options: InspectTemplateOptions
  ): Promise<Result<TemplateInspectionResult, SerializableError>> {
    const tpl = this.templates.find(t => t.template_id === options.templateId);
    if (!tpl) {
      return {
        ok: false,
        error: makeError(
          ErrorCode.TEMPLATE_NOT_FOUND,
          `Template "${options.templateId}" not found.`
        ),
      };
    }

    let version: TemplateVersionRecord | null = null;
    if (options.versionId) {
      const vRes = await this.getVersionById(options.versionId);
      version = vRes.ok ? vRes.value : null;
    } else {
      const vRes = await this.getActiveVersion(tpl.template_id);
      version = vRes.ok ? vRes.value : null;
    }

    const versionId = version
      ? version.version_id
      : toTemplateVersionId(`VER-${tpl.template_id}-V1`);
    const versionNumber = version ? version.version_number : 1;
    const sha256Hash = version
      ? version.sha256_hash
      : '0000000000000000000000000000000000000000000000000000000000000000';
    const now = new Date().toISOString();

    const readinessNotes: string[] = [
      'Lightweight inspection preview only. Candidate headers and tokens are suggestions and are NOT saved as persistent mappings.',
    ];
    const unsupportedFeatures: string[] = [];

    let excelPreview: TemplateInspectionResult['excelPreview'] = undefined;
    let wordPreview: TemplateInspectionResult['wordPreview'] = undefined;

    if (tpl.document_type === 'EXCEL_XLSX') {
      const activeSheetName = options.worksheetName ?? 'InspectionData';
      readinessNotes.push('Workbook contains 2 inspectable worksheet(s).');
      excelPreview = {
        sheets: [
          {
            name: 'InspectionData',
            sheetId: 1,
            index: 1,
            state: 'visible',
            dimension: 'A1:D20',
            rowCount: 20,
            colCount: 4,
            hasFormulas: true,
            mergedCellCount: 1,
          },
          {
            name: 'Summary',
            sheetId: 2,
            index: 2,
            state: 'visible',
            dimension: 'A1:B5',
            rowCount: 5,
            colCount: 2,
            hasFormulas: true,
            mergedCellCount: 0,
          },
        ],
        activeSheetPreview: {
          sheetSummary: {
            name: activeSheetName,
            sheetId: 1,
            index: 1,
            state: 'visible',
            dimension: 'A1:D20',
            rowCount: 20,
            colCount: 4,
            hasFormulas: true,
            mergedCellCount: 1,
          },
          candidateHeaderRow: {
            rowNumber: 1,
            headers: [
              { colRef: 'A', text: 'Station Code' },
              { colRef: 'B', text: 'Equipment ID' },
              { colRef: 'C', text: 'Inspection Status' },
              { colRef: 'D', text: 'Reading Value' },
            ],
          },
          previewRows: [
            {
              rowNumber: 1,
              cells: [
                {
                  row: 1,
                  col: 1,
                  colRef: 'A',
                  address: 'A1',
                  value: 'Station Code',
                  rawType: 's',
                  isFormula: false,
                },
                {
                  row: 1,
                  col: 2,
                  colRef: 'B',
                  address: 'B1',
                  value: 'Equipment ID',
                  rawType: 's',
                  isFormula: false,
                },
                {
                  row: 1,
                  col: 3,
                  colRef: 'C',
                  address: 'C1',
                  value: 'Inspection Status',
                  rawType: 's',
                  isFormula: false,
                },
                {
                  row: 1,
                  col: 4,
                  colRef: 'D',
                  address: 'D1',
                  value: 'Reading Value',
                  rawType: 's',
                  isFormula: false,
                },
              ],
            },
            {
              rowNumber: 2,
              cells: [
                {
                  row: 2,
                  col: 1,
                  colRef: 'A',
                  address: 'A2',
                  value: 'STN-001',
                  rawType: 's',
                  isFormula: false,
                },
                {
                  row: 2,
                  col: 2,
                  colRef: 'B',
                  address: 'B2',
                  value: 'EQ-FAN-01',
                  rawType: 's',
                  isFormula: false,
                },
                {
                  row: 2,
                  col: 3,
                  colRef: 'C',
                  address: 'C2',
                  value: 'OPERATIONAL',
                  rawType: 's',
                  isFormula: false,
                },
                {
                  row: 2,
                  col: 4,
                  colRef: 'D',
                  address: 'D2',
                  value: '98.5',
                  rawType: 'n',
                  isFormula: false,
                },
              ],
            },
          ],
          totalRowsInSheet: 20,
          totalColsInSheet: 4,
          isTruncated: false,
        },
      };
    } else {
      readinessNotes.push('Document contains 3 paragraph(s) and 1 table(s).');
      readinessNotes.push(
        'Detected 3 candidate placeholder token(s): {report_date}, {inspector_name}, {shift}.'
      );
      wordPreview = {
        paragraphCount: 3,
        tableCount: 1,
        sectionCount: 1,
        hasHeaders: true,
        hasFooters: true,
        hasImages: false,
        candidateTokens: ['{report_date}', '{inspector_name}', '{shift}'],
        paragraphs: [
          {
            index: 1,
            text: 'Operational Shift Incident Log — Date: {report_date}',
            hasCandidateTokens: true,
            candidateTokens: ['{report_date}'],
          },
          {
            index: 2,
            text: 'Duty Inspector: {inspector_name} | Shift: {shift}',
            hasCandidateTokens: true,
            candidateTokens: ['{inspector_name}', '{shift}'],
          },
          {
            index: 3,
            text: 'The following table itemizes recorded observations across active platforms.',
            hasCandidateTokens: false,
            candidateTokens: [],
          },
        ],
        tables: [
          {
            tableIndex: 1,
            rowCount: 3,
            colCount: 3,
            hasMergedCells: false,
            rows: [
              { rowIndex: 1, cells: ['Station', 'Incident Severity', 'Notes'] },
              { rowIndex: 2, cells: ['Central Station', 'Low', 'Perimeter gate checked.'] },
              { rowIndex: 3, cells: ['North Terminal', 'None', 'Normal operations.'] },
            ],
            isTruncated: false,
          },
        ],
        isTruncated: false,
      };
    }

    return {
      ok: true,
      value: {
        templateId: tpl.template_id,
        templateName: tpl.template_name,
        versionId,
        versionNumber,
        categoryId: tpl.category_id,
        documentType: tpl.document_type,
        fileName: tpl.file_name ?? 'template.bin',
        fileSizeBytes: 24500,
        sha256Hash,
        integrityVerified: true,
        integrityMessage: 'Master template version is intact and verified.',
        inspectedAt: now,
        excelPreview,
        wordPreview,
        readinessNotes,
        unsupportedFeatures,
      },
    };
  }

  public async replaceTemplate(
    options: ReplaceTemplateOptions
  ): Promise<Result<ReplaceTemplateResult, SerializableError>> {
    const tplIdx = this.templates.findIndex(t => t.template_id === options.templateId);
    if (tplIdx === -1) {
      return {
        ok: false,
        error: makeError(
          ErrorCode.TEMPLATE_NOT_FOUND,
          `Template "${options.templateId}" not found.`
        ),
      };
    }

    const tpl = this.templates[tplIdx];
    const prevVersionId = tpl.active_version_id ?? null;
    const nextVerNum = (tpl.total_versions ?? 1) + 1;
    const ext = tpl.document_type === 'EXCEL_XLSX' ? '.xlsx' : '.docx';
    const nextVerId = toTemplateVersionId(`VER-${tpl.template_id}-V${nextVerNum}`);
    const newFileName = `${tpl.template_id}_v${nextVerNum}${ext}`;
    const now = new Date().toISOString();

    const updatedTemplate: TemplateMetadataRecord = {
      ...tpl,
      active_version_id: nextVerId,
      total_versions: nextVerNum,
      file_name: newFileName,
      updated_at: now,
    };
    this.templates[tplIdx] = updatedTemplate;

    const newVersion: TemplateVersionRecord = {
      version_id: nextVerId,
      template_id: tpl.template_id,
      version_number: nextVerNum,
      file_name: newFileName,
      sha256_hash: 'mock_replacement_hash_00000000000000000000000000000000000000000000000000',
      file_size_bytes: 32000,
      change_summary: options.changeSummary ?? 'Replacement master asset',
      is_active: 1,
      created_at: now,
    };

    return {
      ok: true,
      value: {
        template: updatedTemplate,
        newVersion,
        previousVersionId: prevVersionId,
      },
    };
  }

  public async checkHealth(
    templateId: string
  ): Promise<Result<TemplateHealthRecord, SerializableError>> {
    const tpl = this.templates.find(t => t.template_id === templateId);
    if (!tpl) {
      return {
        ok: false,
        error: makeError(ErrorCode.TEMPLATE_NOT_FOUND, `Template "${templateId}" not found.`),
      };
    }

    return {
      ok: true,
      value: {
        templateId: tpl.template_id,
        templateName: tpl.template_name,
        status: 'OK',
        activeVersionId: tpl.active_version_id ?? null,
        versionNumber: tpl.total_versions ?? 1,
        fileName: tpl.file_name ?? null,
        expectedHash: 'mock_sha256_hash_mock_sha256_hash_mock_sha256_hash_mock_sha256_hash_0000',
        actualHash: 'mock_sha256_hash_mock_sha256_hash_mock_sha256_hash_mock_sha256_hash_0000',
        isReadOnly: true,
        message: 'Master template asset is intact, cryptographically verified, and protected.',
        availableHistoricalVersionsCount: 0,
        intactHistoricalVersions: [],
      },
    };
  }

  public async checkAllHealth(): Promise<Result<TemplateHealthRecord[], SerializableError>> {
    const records: TemplateHealthRecord[] = this.templates.map(tpl => ({
      templateId: tpl.template_id,
      templateName: tpl.template_name,
      status: 'OK',
      activeVersionId: tpl.active_version_id ?? null,
      versionNumber: tpl.total_versions ?? 1,
      fileName: tpl.file_name ?? null,
      expectedHash: 'mock_sha256_hash_mock_sha256_hash_mock_sha256_hash_mock_sha256_hash_0000',
      actualHash: 'mock_sha256_hash_mock_sha256_hash_mock_sha256_hash_mock_sha256_hash_0000',
      isReadOnly: true,
      message: 'Master template asset is intact, cryptographically verified, and protected.',
      availableHistoricalVersionsCount: 0,
      intactHistoricalVersions: [],
    }));

    return { ok: true, value: records };
  }

  public async getDependencyCount(
    _templateId: string
  ): Promise<Result<{ sessionCount: number }, SerializableError>> {
    return { ok: true, value: { sessionCount: 0 } };
  }

  public async getExcelMappings(
    templateId: string,
    versionId: string,
    worksheetName?: string
  ): Promise<Result<ExcelFieldMappingRecord[], SerializableError>> {
    let filtered = this.excelMappings.filter(
      m => m.templateId === templateId && m.versionId === versionId
    );
    if (worksheetName) {
      filtered = filtered.filter(m => m.worksheetName === worksheetName);
    }
    return { ok: true, value: filtered };
  }

  public async saveExcelMappings(
    input: SaveExcelMappingsInput
  ): Promise<Result<ExcelTemplateMappingConfig, SerializableError>> {
    // Remove existing for worksheet
    this.excelMappings = this.excelMappings.filter(
      m =>
        !(
          m.templateId === input.templateId &&
          m.versionId === input.versionId &&
          m.worksheetName === input.worksheetName
        )
    );

    const now = new Date().toISOString();
    const newRecords: ExcelFieldMappingRecord[] = input.mappings.map((item, idx) => ({
      mappingId: `MOCK-MAP-${idx + 1}`,
      templateId: input.templateId,
      versionId: input.versionId,
      worksheetName: input.worksheetName,
      headerRowNumber: input.headerRowNumber ?? null,
      mappingType: item.mappingType,
      fieldId: item.fieldId,
      fieldLabel: item.fieldLabel,
      targetCoordinate: item.targetCoordinate.toUpperCase(),
      columnHeader: item.columnHeader ?? null,
      createdAt: now,
      updatedAt: now,
    }));

    this.excelMappings.push(...newRecords);

    return {
      ok: true,
      value: {
        templateId: input.templateId,
        versionId: input.versionId,
        worksheetName: input.worksheetName,
        headerRowNumber: input.headerRowNumber ?? null,
        mappings: newRecords,
      },
    };
  }

  public async deleteExcelMappings(
    templateId: string,
    versionId: string,
    worksheetName?: string
  ): Promise<Result<boolean, SerializableError>> {
    const beforeCount = this.excelMappings.length;
    this.excelMappings = this.excelMappings.filter(m => {
      if (m.templateId === templateId && m.versionId === versionId) {
        if (!worksheetName || m.worksheetName === worksheetName) {
          return false;
        }
      }
      return true;
    });
    return { ok: true, value: this.excelMappings.length < beforeCount };
  }

  public async getWordMappings(
    templateId: string,
    versionId: string
  ): Promise<Result<WordFieldMappingRecord[], SerializableError>> {
    const filtered = this.wordMappings.filter(
      m => m.templateId === templateId && m.versionId === versionId
    );
    return { ok: true, value: filtered };
  }

  public async saveWordMappings(
    input: SaveWordMappingsInput
  ): Promise<Result<WordTemplateMappingConfig, SerializableError>> {
    this.wordMappings = this.wordMappings.filter(
      m => !(m.templateId === input.templateId && m.versionId === input.versionId)
    );

    const now = new Date().toISOString();
    const newRecords: WordFieldMappingRecord[] = input.mappings.map((item, idx) => ({
      mappingId: `MOCK-WMAP-${idx + 1}`,
      templateId: input.templateId,
      versionId: input.versionId,
      mappingType: item.mappingType,
      fieldId: item.fieldId,
      fieldLabel: item.fieldLabel,
      targetCoordinate: item.targetCoordinate,
      placeholderToken: item.placeholderToken ?? null,
      paragraphIndex: item.paragraphIndex ?? null,
      tableIndex: item.tableIndex ?? null,
      rowIndex: item.rowIndex ?? null,
      colIndex: item.colIndex ?? null,
      createdAt: now,
      updatedAt: now,
    }));

    this.wordMappings.push(...newRecords);

    return {
      ok: true,
      value: {
        templateId: input.templateId,
        versionId: input.versionId,
        mappings: newRecords,
      },
    };
  }

  public async deleteWordMappings(
    templateId: string,
    versionId: string
  ): Promise<Result<boolean, SerializableError>> {
    const beforeCount = this.wordMappings.length;
    this.wordMappings = this.wordMappings.filter(
      m => !(m.templateId === templateId && m.versionId === versionId)
    );
    return { ok: true, value: this.wordMappings.length < beforeCount };
  }

  private profiles: MappingProfileWithDetails[] = [];

  public async listProfiles(filter?: {
    categoryId?: string;
    templateId?: string;
    versionId?: string;
    status?: string;
  }): Promise<Result<MappingProfileWithDetails[], SerializableError>> {
    let result = [...this.profiles];
    if (filter?.categoryId) result = result.filter(p => p.categoryId === filter.categoryId);
    if (filter?.templateId) result = result.filter(p => p.templateId === filter.templateId);
    if (filter?.versionId) result = result.filter(p => p.versionId === filter.versionId);
    if (filter?.status) result = result.filter(p => p.status === filter.status);
    return { ok: true, value: result };
  }

  public async getProfile(
    profileId: string
  ): Promise<Result<MappingProfileWithDetails | null, SerializableError>> {
    const found = this.profiles.find(p => p.profileId === profileId);
    return { ok: true, value: found || null };
  }

  public async createProfile(
    input: CreateMappingProfileInput
  ): Promise<Result<MappingProfileRecord, SerializableError>> {
    const now = new Date().toISOString();
    const newProfile: MappingProfileWithDetails = {
      profileId: `PRF-${input.templateId}-MOCK` as any,
      profileName: input.profileName,
      description: input.description || null,
      categoryId: input.categoryId,
      templateId: input.templateId,
      versionId: input.versionId,
      documentType: input.documentType,
      status: input.status || 'ACTIVE',
      validationStatus: 'UNCHECKED',
      lastValidatedAt: null,
      validationSummary: null,
      createdAt: now,
      updatedAt: now,
    };
    this.profiles.push(newProfile);
    return { ok: true, value: newProfile };
  }

  public async updateProfile(
    profileId: string,
    updates: UpdateMappingProfileInput
  ): Promise<Result<MappingProfileRecord, SerializableError>> {
    const idx = this.profiles.findIndex(p => p.profileId === profileId);
    if (idx === -1) {
      return {
        ok: false,
        error: makeError(ErrorCode.MAPPING_PROFILE_NOT_FOUND, 'Profile not found.'),
      };
    }
    const current = this.profiles[idx];
    const updated: MappingProfileWithDetails = {
      ...current,
      profileName: updates.profileName || current.profileName,
      description: updates.description !== undefined ? updates.description : current.description,
      status: updates.status || current.status,
      updatedAt: new Date().toISOString(),
    };
    this.profiles[idx] = updated;
    return { ok: true, value: updated };
  }

  public async deleteProfile(profileId: string): Promise<Result<boolean, SerializableError>> {
    const before = this.profiles.length;
    this.profiles = this.profiles.filter(p => p.profileId !== profileId);
    return { ok: true, value: this.profiles.length < before };
  }

  public async duplicateProfile(
    profileId: string,
    newProfileName: string
  ): Promise<Result<MappingProfileWithDetails, SerializableError>> {
    const source = this.profiles.find(p => p.profileId === profileId);
    if (!source) {
      return {
        ok: false,
        error: makeError(ErrorCode.MAPPING_PROFILE_NOT_FOUND, 'Source profile not found.'),
      };
    }
    const now = new Date().toISOString();
    const cloned: MappingProfileWithDetails = {
      ...source,
      profileId: `PRF-${source.templateId}-CLONE` as any,
      profileName: newProfileName,
      validationStatus: 'UNCHECKED',
      lastValidatedAt: null,
      validationSummary: null,
      createdAt: now,
      updatedAt: now,
    };
    this.profiles.push(cloned);
    return { ok: true, value: cloned };
  }

  public async validateProfile(input: {
    profileId?: string;
    templateId: string;
    versionId: string;
    categoryId?: string;
    documentType?: string;
  }): Promise<Result<MappingValidationResult, SerializableError>> {
    const now = new Date().toISOString();
    return {
      ok: true,
      value: {
        profileId: input.profileId as any,
        templateId: input.templateId as any,
        versionId: input.versionId as any,
        documentType: (input.documentType || 'EXCEL_XLSX') as any,
        overallStatus: 'VALID',
        isValid: true,
        validatedAt: now,
        totalFindings: 0,
        errorCount: 0,
        warningCount: 0,
        infoCount: 0,
        findings: [],
        summary: 'Mock validation completed successfully.',
        checksPerformed: {
          fieldExistence: true,
          categoryApplicability: true,
          requiredFields: true,
          typeCompatibility: true,
          duplicateCollision: true,
          structuralResolution: true,
          assetIntegrity: true,
        },
      },
    };
  }
}

let activeClient: ITemplateClient | null = null;

export function getTemplateClient(): ITemplateClient {
  if (!activeClient) {
    const bridge = getOpsReportBridge();
    if (bridge?.templates) {
      activeClient = new ElectronTemplateClient();
    } else {
      activeClient = new InMemoryTemplateClient();
    }
  }
  return activeClient;
}

export function setTemplateClient(client: ITemplateClient | null): void {
  activeClient = client;
}
