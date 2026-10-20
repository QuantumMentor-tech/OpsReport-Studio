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
  Result,
  SerializableError,
  OpsReportBridgeAPI,
} from '../../shared/types.ts';
import { toTemplateId, toReportCategoryId } from '../../shared/types/identifiers.ts';
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
}

export class InMemoryTemplateClient implements ITemplateClient {
  private templates: TemplateMetadataRecord[] = [];

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
